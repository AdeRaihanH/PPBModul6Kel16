// Temperature sources for the simulator. Kept separate from the MQTT wiring so
// the shape of the data can be reasoned about (and tested) on its own.

export const RANDOM_MIN = 20;
export const RANDOM_MAX = 35;

// Default mode: an independent draw every publish. Good for exercising the UI,
// useless for anything predictive — there is no trend to extrapolate, so the
// app correctly refuses to estimate a crossing time.
export function randomTemperature(random = Math.random) {
	return Number((random() * (RANDOM_MAX - RANDOM_MIN) + RANDOM_MIN).toFixed(2));
}

/**
 * Demo mode: a slow, believable ramp with a little sensor noise on top.
 *
 * Climbs from `start` to `ceiling`, then drops back and climbs again, so a
 * threshold crossing happens repeatedly and can be demonstrated in about a
 * minute. The noise is deliberately small — enough to look like a real sensor,
 * not enough to drown the trend.
 */
export function createTrendReader(options = {}) {
	const {
		start = 24,
		step = 0.35,
		ceiling = 32,
		noise = 0.12,
		random = Math.random,
	} = options;

	let value = start - step;

	return () => {
		value += step;
		if (value > ceiling) value = start;

		const jitter = (random() * 2 - 1) * noise;
		return Number((value + jitter).toFixed(2));
	};
}
