// Pure statistics for the Thermal Guard panel. No React, no native imports —
// kept separate so the maths can be exercised on its own.
//
// Deliberately no forecasting here. An earlier version extrapolated a crossing
// time from a fitted line, which produced confident countdowns from data that
// could not support them. What the panel reports now is measured, not predicted:
// how fast the reading is moving, and how much headroom is left.

export const WINDOW_SIZE = 48; // samples kept for the trace (~4 min at 5 s publish)

// How close counts as "near". One degree is about one sensor step here, so the
// warning arrives before the limit is crossed but late enough to mean something.
export const NEAR_MARGIN = 1.0;

// Anomaly detection needs the long window: with only a handful of points one
// outlier drags the fitted line towards itself, inflating the spread it is then
// measured against, so a +11 °C spike scored a harmless 2.5σ. Over the full
// window the same spike scores about 9σ.
export const MIN_ANOMALY_POINTS = 12;
export const ANOMALY_SIGMA = 4;
// Below this the spread is measurement resolution, not signal — dividing by it
// would report an absurd sigma for a perfectly linear trace.
export const MIN_NOISE = 0.01;

export function median(values) {
	if (!values.length) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const mid = sorted.length >> 1;
	return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Median absolute deviation — robust to the outliers we are trying to find,
// unlike a plain standard deviation.
export function mad(values, med = median(values)) {
	if (!values.length || med === null) return null;
	return median(values.map((v) => Math.abs(v - med)));
}

// Least squares on (t, v). `t` must already be relative seconds: epoch seconds
// squared would exceed float64 precision and flatten the slope to noise.
export function linearFit(points) {
	const n = points.length;
	if (n < 2) return null;

	let sumT = 0;
	let sumV = 0;
	for (const p of points) {
		sumT += p.t;
		sumV += p.v;
	}
	const meanT = sumT / n;
	const meanV = sumV / n;

	let sxx = 0;
	let sxy = 0;
	let syy = 0;
	for (const p of points) {
		const dt = p.t - meanT;
		const dv = p.v - meanV;
		sxx += dt * dt;
		sxy += dt * dv;
		syy += dv * dv;
	}
	if (sxx === 0) return null;

	const slope = sxy / sxx;
	const intercept = meanV - slope * meanT;
	const r2 = syy === 0 ? 1 : (sxy * sxy) / (sxx * syy);

	return { slope, intercept, r2: Math.min(1, Math.max(0, r2)) };
}

export function describe(samples) {
	if (!samples.length) return null;
	const values = samples.map((s) => s.v);
	const count = values.length;
	const min = Math.min(...values);
	const max = Math.max(...values);
	const avg = values.reduce((a, b) => a + b, 0) / count;
	const variance = values.reduce((a, b) => a + (b - avg) * (b - avg), 0) / count;
	return {
		count,
		min,
		max,
		avg,
		std: Math.sqrt(variance),
		spanSec: Math.max(0, (samples[count - 1].t - samples[0].t) / 1000),
	};
}

/**
 * Change from the previous reading to the current one, in °C.
 *
 * Deliberately the plain subtraction, not a rate per minute and not an average:
 * 10 °C then 20 °C reads +10, and 20 °C then 15 °C reads -5. That is what the
 * number on screen means, so nothing has to be interpreted or scaled.
 *
 * Returns the two readings alongside the difference so the UI can say what it
 * changed *from*, and null when there is nothing to compare against.
 */
export function stepDelta(samples) {
	if (!Array.isArray(samples) || samples.length < 2) return null;

	const to = samples[samples.length - 1].v;
	const from = samples[samples.length - 2].v;
	if (!Number.isFinite(from) || !Number.isFinite(to)) return null;

	return { delta: to - from, from, to };
}

/**
 * How the current reading sits against the limit: `safe`, `near`, `over`, or
 * `unknown` when either number is missing.
 */
export function proximity(current, threshold, margin = NEAR_MARGIN) {
	if (typeof current !== "number" || typeof threshold !== "number") {
		return { state: "unknown", headroom: null };
	}
	if (!Number.isFinite(current) || !Number.isFinite(threshold)) {
		return { state: "unknown", headroom: null };
	}

	const headroom = threshold - current;
	if (headroom <= 0) return { state: "over", headroom };
	if (headroom <= margin) return { state: "near", headroom };
	return { state: "safe", headroom };
}

// Anomaly = the newest sample sits far from where the fitted trend says it
// should be. Detrending first matters: a healthy ramp is not an outlier.
export function detectAnomaly(samples) {
	const blank = { flag: false, score: 0, residual: 0, robustSigma: 0 };
	if (!Array.isArray(samples) || samples.length < MIN_ANOMALY_POINTS) return blank;

	const t0 = samples[0].t;
	const points = samples.map((s) => ({ t: (s.t - t0) / 1000, v: s.v }));
	const fit = linearFit(points);
	if (!fit) return blank;

	const residuals = points.map((p) => p.v - (fit.intercept + fit.slope * p.t));
	const med = median(residuals);
	const deviation = mad(residuals, med);
	if (!deviation) return blank;

	const robustSigma = 1.4826 * deviation; // MAD → σ for normally distributed noise
	if (robustSigma < MIN_NOISE) return blank;

	const residual = residuals[residuals.length - 1];
	const score = Math.abs(residual - med) / robustSigma;

	return { flag: score > ANOMALY_SIGMA, score, residual, robustSigma };
}
