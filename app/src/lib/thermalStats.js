// Pure statistics for the predictive panel. No React, no native imports —
// kept separate so the math can be exercised on its own (see scripts/check-thermal-stats.mjs).

export const WINDOW_SIZE = 48; // rolling samples kept for the fit (~4 min at 5 s publish)
export const MIN_FIT_POINTS = 4;
export const MIN_ANOMALY_POINTS = 10;
export const ANOMALY_SIGMA = 4;
export const MIN_CONFIDENCE = 0.3;
export const MAX_ETA_SECONDS = 60 * 60;
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

// Anomaly = the newest sample sits far from where the fitted trend says it
// should be. Detrending first matters: a healthy ramp is not an outlier.
export function detectAnomaly(samples) {
	const blank = { flag: false, score: 0, residual: 0, robustSigma: 0 };
	if (samples.length < MIN_ANOMALY_POINTS) return blank;

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

// Time until the fitted trend reaches `threshold`. Returns null when there is
// not enough signal to say anything honest.
export function projectCrossing(samples, threshold) {
	if (typeof threshold !== "number" || !Number.isFinite(threshold)) return null;
	if (samples.length < MIN_FIT_POINTS) return null;

	const t0 = samples[0].t;
	const points = samples.map((s) => ({ t: (s.t - t0) / 1000, v: s.v }));
	const fit = linearFit(points);
	if (!fit) return null;

	const current = points[points.length - 1].v;
	const slopePerMin = fit.slope * 60;
	const gap = threshold - current;

	if (gap <= 0) {
		return { willCross: true, etaSec: 0, slopePerMin, confidence: fit.r2, crossed: true };
	}
	// Flat or falling: the limit is not being approached.
	if (fit.slope <= 0.0001) {
		return { willCross: false, etaSec: null, slopePerMin, confidence: fit.r2, crossed: false };
	}

	const etaSec = gap / fit.slope;
	const trustworthy =
		fit.r2 >= MIN_CONFIDENCE && etaSec <= MAX_ETA_SECONDS && samples.length >= 8;

	return {
		willCross: trustworthy,
		etaSec: trustworthy ? etaSec : null,
		slopePerMin,
		confidence: fit.r2,
		crossed: false,
	};
}

export function formatDuration(seconds) {
	if (!Number.isFinite(seconds) || seconds < 0) return "--";
	if (seconds < 60) return `${Math.max(0, Math.round(seconds))}s`;
	const totalMinutes = Math.floor(seconds / 60);
	const rest = Math.round(seconds % 60);
	if (totalMinutes < 60) return rest ? `${totalMinutes}m ${rest}s` : `${totalMinutes}m`;
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}
