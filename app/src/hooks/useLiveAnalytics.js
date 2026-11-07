import { useEffect, useMemo, useRef, useState } from "react";
import {
	WINDOW_SIZE,
	describe,
	detectAnomaly,
	instantRate,
	proximity,
} from "../lib/thermalStats.js";

const EMPTY = {
	samples: [],
	stats: null,
	rate: null,
	proximity: { state: "unknown", headroom: null },
	status: { key: "waiting", label: "Waiting", tone: "muted" },
	anomaly: null,
	current: null,
	threshold: null,
	sampleAt: null,
};

const STATUS_LABEL = {
	safe: { key: "safe", label: "Safe", tone: "success" },
	near: { key: "near", label: "Near limit", tone: "warn" },
	over: { key: "over", label: "Over limit", tone: "danger" },
	unknown: { key: "waiting", label: "Waiting", tone: "muted" },
};

// A live reading with no threshold configured is not "waiting for data" — it is
// "cannot judge". Saying so avoids a status pill that looks stuck.
const NO_LIMIT = { key: "nolimit", label: "No limit", tone: "muted" };

/**
 * Accumulates the live MQTT feed into a rolling window and derives the panel's
 * view: how fast the reading is moving, how much headroom is left, whether the
 * latest sample looks wrong.
 */
export function useLiveAnalytics({ temperature, timestamp, threshold }) {
	const [samples, setSamples] = useState([]);
	const lastStampRef = useRef(null);

	useEffect(() => {
		if (typeof temperature !== "number" || !Number.isFinite(temperature)) return;

		const parsed = timestamp ? Date.parse(timestamp) : Number.NaN;
		const at = Number.isNaN(parsed) ? Date.now() : parsed;
		// The broker can redeliver the same payload; only count distinct samples.
		if (lastStampRef.current === at) return;
		lastStampRef.current = at;

		setSamples((prev) => {
			const next = [...prev, { t: at, v: temperature }];
			return next.length > WINDOW_SIZE ? next.slice(next.length - WINDOW_SIZE) : next;
		});
	}, [temperature, timestamp]);

	return useMemo(() => {
		if (!samples.length) return EMPTY;

		const current = samples[samples.length - 1].v;
		const prox = proximity(current, threshold);

		return {
			samples,
			stats: describe(samples),
			rate: instantRate(samples),
			proximity: prox,
			status:
				prox.state === "unknown" && typeof current === "number"
					? NO_LIMIT
					: (STATUS_LABEL[prox.state] ?? STATUS_LABEL.unknown),
			anomaly: detectAnomaly(samples),
			current,
			threshold: typeof threshold === "number" ? threshold : null,
			sampleAt: samples[samples.length - 1].t,
		};
	}, [samples, threshold]);
}
