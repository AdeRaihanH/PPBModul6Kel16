import { useEffect, useRef, useState } from "react";
import { Api } from "../services/api.js";

const UNKNOWN = { state: "unknown", latencyMs: null, dbOk: null };
const POLL_MS = 15000;

/**
 * Watches the other half of the pipeline.
 *
 * The MQTT chip already tells the user whether data is arriving. This tells them
 * whether it can be stored — two different failures that look identical on screen
 * if you only track one. A sensor feed that is live while the database is down is
 * not "working", and saying so is the honest thing to do.
 */
export function useBackendHealth({ intervalMs = POLL_MS } = {}) {
	const [health, setHealth] = useState(UNKNOWN);
	const timerRef = useRef(null);

	useEffect(() => {
		let cancelled = false;

		const check = async () => {
			try {
				const data = await Api.getHealth();
				if (cancelled) return;
				setHealth({
					state: data?.db?.ok ? "ok" : "degraded",
					latencyMs: data?.db?.latencyMs ?? null,
					dbOk: Boolean(data?.db?.ok),
				});
			} catch {
				if (cancelled) return;
				setHealth({ state: "unreachable", latencyMs: null, dbOk: false });
			}

			if (!cancelled) {
				timerRef.current = setTimeout(check, intervalMs);
			}
		};

		check();

		return () => {
			cancelled = true;
			if (timerRef.current) clearTimeout(timerRef.current);
		};
	}, [intervalMs]);

	return health;
}
