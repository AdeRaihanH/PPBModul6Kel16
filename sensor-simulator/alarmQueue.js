// Durable-ish outbox for alarm readings.
//
// The original loop fired one fetch and moved on: if the backend was restarting,
// that alarm was gone forever. An alarm that only exists in a dropped request is
// the one failure this project cannot afford, so writes go through a queue that
// retries with exponential backoff.
//
// Two properties matter:
//   * nothing is dropped — an item leaves the queue only after a confirmed write;
//   * nothing is duplicated — each item carries a client-generated id, and the
//     backend's unique index turns a retry into a no-op. That is what makes
//     retrying safe in the first place.
//
// `send` and `now` are injected so the retry policy can be tested without a
// server, a network, or real time.

export const BASE_DELAY_MS = 1000;
export const MAX_DELAY_MS = 30_000;

export function createAlarmQueue({
	send,
	baseDelayMs = BASE_DELAY_MS,
	maxDelayMs = MAX_DELAY_MS,
	now = () => Date.now(),
	onEvent = () => {},
}) {
	/** @type {Array<{id: string, payload: object, attempts: number, nextAt: number}>} */
	let items = [];
	let flushing = false;

	function backoffFor(attempts) {
		// 1s, 2s, 4s, 8s ... capped, so a long outage does not spin the CPU or
		// hammer a server that is trying to come back up.
		const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** Math.max(0, attempts - 1));
		return delay;
	}

	return {
		get size() {
			return items.length;
		},

		pending() {
			return items.map(({ id, payload, attempts, nextAt }) => ({
				id,
				payload,
				attempts,
				nextAt,
			}));
		},

		/** Queue one reading. `payload.client_id` must already be set. */
		enqueue(payload) {
			const id = payload?.client_id ?? `local-${items.length}-${now()}`;
			items.push({ id, payload, attempts: 0, nextAt: 0 });
			onEvent({ type: "queued", id, size: items.length });
			return id;
		},

		/**
		 * Attempt to deliver everything that is due. Returns how many succeeded.
		 * Ordered: the head must succeed before the tail is tried, so alarms land
		 * in the order they happened.
		 */
		async flush() {
			if (flushing) return 0;
			flushing = true;
			let delivered = 0;

			try {
				while (items.length > 0) {
					const head = items[0];
					if (head.nextAt > now()) break;

					try {
						await send(head.payload);
						items.shift();
						delivered += 1;
						onEvent({
							type: "delivered",
							id: head.id,
							payload: head.payload,
							size: items.length,
						});
					} catch (error) {
						head.attempts += 1;
						head.nextAt = now() + backoffFor(head.attempts);
						onEvent({
							type: "retry",
							id: head.id,
							attempts: head.attempts,
							waitMs: head.nextAt - now(),
							error: error?.message ?? String(error),
							size: items.length,
						});
						break;
					}
				}
			} finally {
				flushing = false;
			}

			return delivered;
		},

		/** Milliseconds until the head may be retried; 0 when nothing is waiting. */
		waitMs() {
			if (items.length === 0) return 0;
			return Math.max(0, items[0].nextAt - now());
		},
	};
}
