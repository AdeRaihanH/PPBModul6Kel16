import { useEffect, useRef, useState } from "react";
import { describeBreach, shouldNotify } from "../lib/alarmTrigger.js";
import { ensureNotificationsReady, notifyAlarm } from "../services/notifications.js";

/**
 * Fires one local notification per threshold crossing.
 *
 * Honest limitation: this runs on the JS thread, so it can only alert while the
 * app is alive. A true "alert me while the phone is in my pocket with the app
 * closed" needs a server-side push, which is a development build away — see the
 * README. What this does guarantee is that a breach is never silent while the app
 * is open or recently backgrounded.
 */
export function useAlarmNotifications({ status, temperature, threshold }) {
	const [permission, setPermission] = useState("unknown");
	const [lastFiredAt, setLastFiredAt] = useState(null);
	const previousRef = useRef(status?.key ?? "unknown");

	useEffect(() => {
		let cancelled = false;
		ensureNotificationsReady().then((granted) => {
			if (!cancelled) setPermission(granted ? "granted" : "denied");
		});
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		const next = status?.key ?? "unknown";
		const previous = previousRef.current;
		previousRef.current = next;

		if (
			!shouldNotify({
				previous,
				next,
				lastFiredAt,
				now: Date.now(),
			})
		) {
			return;
		}

		setLastFiredAt(Date.now());
		notifyAlarm({
			...describeBreach({ temperature, threshold }),
			temperature,
			threshold,
		});
	}, [status?.key, temperature, threshold, lastFiredAt]);

	return { permission, lastFiredAt };
}
