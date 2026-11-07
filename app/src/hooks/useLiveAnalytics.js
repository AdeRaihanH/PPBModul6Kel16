import { useEffect, useMemo, useRef, useState } from "react";
import {
	TREND_WINDOW,
	WINDOW_SIZE,
	describe,
	detectAnomaly,
	projectCrossing,
} from "../lib/thermalStats.js";

const EMPTY = {
	samples: [],
	stats: null,
	trend: null,
	anomaly: null,
	projection: null,
	status: { key: "waiting", label: "Waiting", tone: "muted" },
	sampleAt: null,
	current: null,
	threshold: null,
};

function deriveStatus(current, threshold, projection, trend) {
	if (typeof current !== "number") {
		return { key: "waiting", label: "Waiting", tone: "muted" };
	}
	if (typeof threshold === "number" && current >= threshold) {
		return { key: "critical", label: "Over limit", tone: "danger" };
	}
	if (projection?.willCross && projection.etaSec !== null && projection.etaSec <= 120) {
		return { key: "imminent", label: "Crossing soon", tone: "danger" };
	}
	if (trend && trend.slopePerMin > 0.15) {
		return { key: "rising", label: "Rising", tone: "warn" };
	}
	if (trend && trend.slopePerMin < -0.15) {
		return { key: "falling", label: "Falling", tone: "success" };
	}
	return { key: "stable", label: "Stable", tone: "success" };
}

/**
 * Accumulates the live MQTT feed into a rolling window and derives the
 * predictive view: trend slope, ETA to threshold, volatility, anomaly score.
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
		// Two different questions, two different windows. The rate and the
		// projection describe what is happening now, so they use the recent tail.
		// The anomaly verdict asks whether one reading is off the trend, which
		// needs the long window: a short one lets the outlier bend the very line
		// it is measured against.
		const recent =
			samples.length > TREND_WINDOW ? samples.slice(-TREND_WINDOW) : samples;
		const stats = describe(samples);
		const anomaly = detectAnomaly(samples);
		const projection = projectCrossing(recent, threshold);

		const trend = projection
			? {
					slopePerMin: projection.slopePerMin,
					confidence: projection.confidence,
				}
			: null;

		return {
			samples,
			stats,
			trend,
			anomaly,
			projection,
			status: deriveStatus(current, threshold, projection, trend),
			sampleAt: samples[samples.length - 1].t,
			current,
			threshold: typeof threshold === "number" ? threshold : null,
		};
	}, [samples, threshold]);
}
