// Temperature sources for the simulator. Kept separate from the MQTT wiring so
// the shape of the data can be reasoned about (and tested) on its own.

export const RANDOM_MIN = 20;
export const RANDOM_MAX = 35;

export const TREND_FLOOR = 24;
export const TREND_CEILING = 32;
export const TREND_STEP = 0.5;

// Random mode: an independent draw every publish. Good for exercising the UI,
// useless for anything predictive — there is no trend to extrapolate, so the
// app correctly refuses to estimate a crossing time.
export function randomTemperature(random = Math.random) {
	return Number((random() * (RANDOM_MAX - RANDOM_MIN) + RANDOM_MIN).toFixed(2));
}

/**
 * Default mode: a slow, believable ramp with a little sensor noise on top.
 *
 * Heats from 24 to 32 °C, then cools back down at the same rate, and repeats.
 * A gradual cooldown matters: jumping straight back to 24 would look like a
 * sensor fault and would poison any fit that spans the reset. With a triangle
 * wave the direction reverses smoothly, so the trend and its rate of change
 * stay meaningful the whole time.
 *
 * At 0.5 °C per 5 s publish that is 6 °C/min: threshold 30 °C is reached about
 * a minute after start, which is short enough to demonstrate repeatedly.
 */
export function createTrendReader(options = {}) {
	const {
		floor = TREND_FLOOR,
		ceiling = TREND_CEILING,
		step = TREND_STEP,
		noise = 0.12,
		random = Math.random,
	} = options;

	let value = floor;
	let direction = 1;

	return () => {
		value += direction * step;

		if (value >= ceiling) {
			value = ceiling;
			direction = -1;
		} else if (value <= floor) {
			value = floor;
			direction = 1;
		}

		const jitter = (random() * 2 - 1) * noise;
		return Number((value + jitter).toFixed(2));
	};
}
