import mqtt from "mqtt";

const BROKER_URL = "mqtt://broker.hivemq.com:1883";
const TOPIC = "ppb/kelXX/iot/temperature";
const BACKEND_BASE_URL = "http://localhost:5002";
const PUBLISH_INTERVAL_MS = 5000;

const clientId = `simulator-${Math.random().toString(16).slice(2)}`;
const client = mqtt.connect(BROKER_URL, {
	clientId,
	clean: true,
	reconnectPeriod: 5000,
});

client.on("connect", () => {
	console.log(`MQTT connected as ${clientId}`);
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
		const temperature = Number((Math.random() * 15 + 20).toFixed(2));
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
			try {
				const response = await fetch(`${BACKEND_BASE_URL}/api/readings`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						temperature,
						threshold_value: latestThreshold,
					}),
				});

				if (!response.ok) {
					const text = await response.text();
					throw new Error(`HTTP ${response.status}: ${text}`);
				}

				console.log(
					`Saved triggered reading ${temperature}°C (threshold ${latestThreshold}°C)`,
				);
			} catch (error) {
				console.error("Failed to save triggered reading:", error.message);
			}
		}
	}, PUBLISH_INTERVAL_MS);
}

publishLoop().catch((error) => {
	console.error("Simulator failed to start:", error.message);
	process.exit(1);
});
