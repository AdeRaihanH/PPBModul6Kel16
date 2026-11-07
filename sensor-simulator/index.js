import mqtt from "mqtt";
import { createTrendReader, randomTemperature } from "./temperature.js";
import { createAlarmQueue } from "./alarmQueue.js";

const BROKER_URL = "mqtt://broker.hivemq.com:1883";
const TOPIC = "ppb/kel16/iot/temperature";
const BACKEND_BASE_URL = "http://localhost:5002";
const PUBLISH_INTERVAL_MS = 5000;
const WRITE_TIMEOUT_MS = 4000;

// Default is the trend feed: it rises and falls like a real sensor, so the app's
// predictive panel has something to project. `--random` restores the old
// independent-noise feed for exercising the UI without a trend.
const useRandom = process.argv.includes("--random");
const nextTemperature = useRandom ? () => randomTemperature() : createTrendReader();

// Alarm writes go through a retrying outbox instead of a bare fetch, so a
// backend restart costs a delay rather than the alarm itself.
const alarms = createAlarmQueue({
	send: async (payload) => {
		const response = await fetch(`${BACKEND_BASE_URL}/api/readings`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
			// Without this a hung backend blocks the queue forever.
			signal: AbortSignal.timeout(WRITE_TIMEOUT_MS),
		});
		if (!response.ok) {
			const text = await response.text();
			throw new Error(`HTTP ${response.status}: ${text}`);
		}
		return response.json();
	},
	onEvent: (event) => {
		if (event.type === "delivered") {
			console.log(
				`Saved alarm ${event.payload?.temperature ?? ""}${
					event.size ? ` · ${event.size} still queued` : ""
				}`,
			);
		}
		if (event.type === "retry") {
			console.warn(
				`Alarm write failed (${event.error}) — retry in ${Math.round(
					event.waitMs / 1000,
				)}s, ${event.size} queued`,
			);
		}
	},
});

// Drains the outbox whenever something becomes due. Cheap: one timer, not one
// per item.
setInterval(() => {
	if (alarms.size > 0) alarms.flush();
}, 1000);

const clientId = `simulator-${Math.random().toString(16).slice(2)}`;
const client = mqtt.connect(BROKER_URL, {
	clientId,
	clean: true,
	reconnectPeriod: 5000,
});

client.on("connect", () => {
	console.log(`MQTT connected as ${clientId}`);
	console.log(
		useRandom
			? "Mode: random (20 → 35 °C) — no trend, so the panel reports Safe/Over only"
			: "Mode: trend (24 → 32 °C, heats then cools) — the rate should swing between rising and falling",
	);
});

client.on("reconnect", () => {
	console.log("Reconnecting to MQTT broker...");
});

client.on("error", (error) => {
	console.error("MQTT error", error.message);
});

async function fetchLatestThreshold() {
	try {
		const response = await fetch(`${BACKEND_BASE_URL}/api/thresholds/latest`);
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		const data = await response.json();
		return data?.value ?? null;
	} catch (error) {
		console.error("Failed to fetch threshold:", error.message);
		return null;
	}
}

async function publishLoop() {
	let latestThreshold = await fetchLatestThreshold();

	setInterval(async () => {
		const temperature = nextTemperature();
		const payload = JSON.stringify({
			temperature,
			timestamp: new Date().toISOString(),
		});

		client.publish(TOPIC, payload, { qos: 0 }, (error) => {
			if (error) {
				console.error("Failed to publish temperature", error.message);
			} else {
				console.log(`Published ${payload} to ${TOPIC}`);
			}
		});

		if (latestThreshold === null || Math.random() < 0.2) {
			latestThreshold = await fetchLatestThreshold();
		}

		if (typeof latestThreshold === "number" && temperature >= latestThreshold) {
			// client_id is minted once, here, and reused by every retry of this
			// reading — that is what lets the backend recognise the duplicate.
			alarms.enqueue({
				client_id: crypto.randomUUID(),
				temperature,
				threshold_value: latestThreshold,
			});
			alarms.flush();
		}
	}, PUBLISH_INTERVAL_MS);
}

publishLoop().catch((error) => {
	console.error("Simulator failed to start:", error.message);
	process.exit(1);
});
