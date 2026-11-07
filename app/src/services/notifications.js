import { Platform } from "react-native";
import * as Notifications from "expo-notifications";

export const ALARM_CHANNEL_ID = "temperature-alarm";

// While the app is open, a notification still deserves to be seen — otherwise the
// feature would look broken to anyone testing it on the foreground screen.
// `shouldShowBanner` / `shouldShowList` are the SDK 58 names; the older
// `shouldShowAlert` was replaced.
try {
	Notifications.setNotificationHandler({
		handleNotification: async () => ({
			shouldShowBanner: true,
			shouldShowList: true,
			shouldPlaySound: true,
			shouldSetBadge: false,
		}),
	});
} catch {
	// Notifications unavailable in this runtime (e.g. web). The panel still works;
	// only the alert is missing.
}

let readyPromise = null;

/**
 * Creates the Android channel and asks for permission, once per app run.
 *
 * Order matters on Android 13+: the system permission prompt does not appear
 * until at least one channel exists, so creating the channel first is what makes
 * the request possible at all.
 */
export function ensureNotificationsReady() {
	if (!readyPromise) {
		readyPromise = (async () => {
			try {
				if (Platform.OS === "android") {
					await Notifications.setNotificationChannelAsync(ALARM_CHANNEL_ID, {
						name: "Temperature alarms",
						description: "Fires when the reading crosses the configured threshold",
						importance: Notifications.AndroidImportance.HIGH,
						vibrationPattern: [0, 250, 250, 250],
						lightColor: "#B91C1C",
					});
				}

				const current = await Notifications.getPermissionsAsync();
				const provisional =
					current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
				if (current.granted || provisional) return true;

				const asked = await Notifications.requestPermissionsAsync({
					ios: { allowAlert: true, allowBadge: true, allowSound: true },
				});
				return Boolean(asked.granted);
			} catch {
				return false;
			}
		})();
	}

	return readyPromise;
}

/**
 * Shows the alarm immediately. Returns false when permission was refused, so the
 * caller can tell the difference between "notified" and "could not notify".
 */
export async function notifyAlarm({ title, body, temperature, threshold }) {
	const granted = await ensureNotificationsReady();
	if (!granted) return false;

	try {
		await Notifications.scheduleNotificationAsync({
			content: {
				title,
				body,
				sound: true,
				data: { type: "threshold-breach", temperature, threshold },
			},
			// A one-second interval trigger is used on Android only so the channel
			// can be named; `null` would post immediately but to the fallback channel.
			trigger:
				Platform.OS === "android"
					? {
							type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
							seconds: 1,
							channelId: ALARM_CHANNEL_ID,
						}
					: null,
		});
		return true;
	} catch {
		return false;
	}
}
