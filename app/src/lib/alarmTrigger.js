/**
 * Decides when a threshold breach deserves a notification.
 *
 * Pure and injectable so the policy can be tested without a device: the rules are
 * "notify once per crossing" and "never more often than the cooldown", which is
 * exactly the kind of thing that silently turns into a notification storm if it
 * lives inside a component.
 */
export const DEFAULT_COOLDOWN_MS = 60_000;

export function shouldNotify({
	previous,
	next,
	lastFiredAt = null,
	now = Date.now(),
	cooldownMs = DEFAULT_COOLDOWN_MS,
}) {
	if (next !== "over") return false;
	// Already over on the previous reading: the user has been told. Repeating on
	// every sample would bury the notification in noise.
	if (previous === "over") return false;
	if (lastFiredAt !== null && now - lastFiredAt < cooldownMs) return false;
	return true;
}

export function describeBreach({ temperature, threshold }) {
	const t = Number(temperature);
	const limit = Number(threshold);
	const fmt = (n) => (Number.isFinite(n) ? n.toFixed(1) : "--");

	if (!Number.isFinite(t) || !Number.isFinite(limit)) {
		return {
			title: "Temperature above limit",
			body: "The reading is above the configured threshold.",
		};
	}

	const over = t - limit;
	return {
		title: `Temperature above limit (${fmt(t)}°C)`,
		body: `${fmt(t)}°C is ${fmt(over)}°C above the ${fmt(limit)}°C threshold.`,
	};
}
