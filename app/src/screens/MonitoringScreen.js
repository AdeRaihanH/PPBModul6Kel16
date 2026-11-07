import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	Pressable,
	RefreshControl,
	ScrollView,
	Text,
	View,
	StyleSheet,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import Animated, {
	FadeIn,
	FadeInDown,
	useReducedMotion,
} from "react-native-reanimated";
import { useMqttSensor } from "../hooks/useMqttSensor.js";
import { useLiveAnalytics } from "../hooks/useLiveAnalytics.js";
import { useBackendHealth } from "../hooks/useBackendHealth.js";
import { useAlarmNotifications } from "../hooks/useAlarmNotifications.js";
import { Api } from "../services/api.js";
import { DataTable } from "../components/DataTable.js";
import { TempOrb } from "../components/TempOrb.js";
import { ThermalGuardCard } from "../components/ThermalGuardCard.js";
import { useTheme, useThemedStyles } from "../theme/ThemeProvider.js";

// History ranges. `ms: null` means no lower bound.
const RANGES = [
	{ key: "15m", label: "15 min", ms: 15 * 60 * 1000 },
	{ key: "1h", label: "1 hour", ms: 60 * 60 * 1000 },
	{ key: "6h", label: "6 hours", ms: 6 * 60 * 60 * 1000 },
	{ key: "all", label: "All", ms: null },
];
const DEFAULT_RANGE = "1h";
const HISTORY_LIMIT = 200;

function StatusChip({ connectionState, hasError, onRetry }) {
	const theme = useTheme();
	const styles = useThemedStyles(makeStyles);
	const config = useMemo(() => {
		if (
			hasError ||
			connectionState === "error" ||
			connectionState === "disconnected"
		) {
			return {
				bg: theme.color.dangerBg,
				border: theme.color.dangerBorder,
				text: theme.color.dangerText,
				dot: theme.color.dangerText,
				label: "Offline",
				actionable: true,
			};
		}
		if (connectionState === "reconnecting") {
			return {
				bg: theme.color.warnBg,
				border: theme.color.warnBorder,
				text: theme.color.warnText,
				dot: theme.color.warnText,
				label: "Reconnectingâ€¦",
				actionable: false,
			};
		}
		return {
			bg: theme.color.successBg,
			border: theme.color.successBorder,
			text: theme.color.successText,
			dot: theme.color.successText,
			label: "Connected",
			actionable: false,
		};
	}, [connectionState, hasError, theme]);

	const chip = (
		<View
			style={[
				styles.chip,
				{ backgroundColor: config.bg, borderColor: config.border },
			]}
			accessible
			accessibilityLabel={`Sensor feed ${config.label}`}
			accessibilityRole="text"
		>
			<View style={[styles.dot, { backgroundColor: config.dot }]} />
			<Text style={[styles.chipText, { color: config.text }]}>
				{config.label}
			</Text>
			{config.actionable ? (
				<Ionicons name="refresh" size={14} color={config.text} />
			) : null}
		</View>
	);

	if (config.actionable && onRetry) {
		return (
			<Pressable
				onPress={onRetry}
				accessibilityLabel="Retry sensor feed"
				accessibilityRole="button"
				accessibilityHint="Attempts to reload sensor history"
				hitSlop={8}
				style={({ pressed }) => [pressed && styles.pressed]}
			>
				{chip}
			</Pressable>
		);
	}
	return chip;
}

export function MonitoringScreen() {
	const theme = useTheme();
	const styles = useThemedStyles(makeStyles);
	const {
		temperature,
		timestamp,
		connectionState,
		error: mqttError,
	} = useMqttSensor();
	const [readings, setReadings] = useState([]);
	const [latestThreshold, setLatestThreshold] = useState(null);
	const [loading, setLoading] = useState(false);
	const [refreshing, setRefreshing] = useState(false);
	const [apiError, setApiError] = useState(null);
	const [rangeKey, setRangeKey] = useState(DEFAULT_RANGE);
	const reduceMotion = useReducedMotion();

	const analytics = useLiveAnalytics({
		temperature,
		timestamp,
		threshold: latestThreshold,
	});
	const backend = useBackendHealth();
	const alarms = useAlarmNotifications({
		status: analytics.status,
		temperature: analytics.current,
		threshold: analytics.threshold,
	});

	// Haptic on the crossing itself, so the phone reacts even when the app is the
	// thing being looked at and a notification banner would be redundant.
	const wasOverRef = useRef(false);
	useEffect(() => {
		const over = analytics.status.key === "over";
		if (over && !wasOverRef.current) {
			Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(
				() => {},
			);
		}
		wasOverRef.current = over;
	}, [analytics.status.key]);

	const fetchReadings = useCallback(async () => {
		setLoading(true);
		setApiError(null);
		try {
			const range = RANGES.find((r) => r.key === rangeKey) ?? RANGES[0];
			const since = range.ms ? new Date(Date.now() - range.ms).toISOString() : undefined;

			const [history, thresholds] = await Promise.all([
				Api.getSensorReadings({ since, limit: HISTORY_LIMIT }),
				Api.getThresholds({ limit: 1 }).catch(() => null),
			]);
			setReadings(history ?? []);
			const latest = Array.isArray(thresholds) ? thresholds[0]?.value : null;
			setLatestThreshold(typeof latest === "number" ? latest : null);
		} catch (err) {
			setApiError(err.message || "Couldn't load history.");
		} finally {
			setLoading(false);
		}
	}, [rangeKey]);

	useFocusEffect(
		useCallback(() => {
			fetchReadings();
		}, [fetchReadings]),
	);

	const onRefresh = useCallback(async () => {
		setRefreshing(true);
		try {
			await fetchReadings();
		} finally {
			setRefreshing(false);
		}
	}, [fetchReadings]);

	// The orb's label comes from the same proximity state the panel uses, so the
	// two can never disagree about how close the reading is.
	const proximity = useMemo(() => {
		if (
			typeof temperature !== "number" ||
			typeof latestThreshold !== "number"
		) {
			return null;
		}
		const words = {
			safe: { statusWord: "Normal", statusColor: theme.color.successText },
			near: { statusWord: "Near limit", statusColor: theme.color.warnText },
			over: { statusWord: "Over limit", statusColor: theme.color.dangerText },
		};
		return words[analytics.proximity.state] ?? null;
	}, [temperature, latestThreshold, analytics.proximity.state, theme]);

	const freshness = useMemo(() => {
		if (!Array.isArray(readings) || readings.length === 0) {
			return "No readings yet";
		}
		const first = readings[0];
		const t = new Date(first.recorded_at ?? first.timestamp ?? Date.now());
		const s = Number.isNaN(t.getTime())
			? 0
			: Math.max(0, Math.round((Date.now() - t.getTime()) / 1000));
		const rel =
			s < 10 ? "just now" : s < 60 ? `${s}s ago` : `${Math.floor(s / 60)}m ago`;
		return `Updated ${rel} Â· ${readings.length} ${
			readings.length === 1 ? "reading" : "readings"
		}`;
	}, [readings]);

	const tempLabel =
		typeof temperature === "number" ? `${temperature.toFixed(2)}` : "--";

	const beatKey =
		typeof timestamp === "string" && !Number.isNaN(Date.parse(timestamp))
			? Date.parse(timestamp)
			: 0;

	return (
		<View style={styles.safe}>
			<ScrollView
				contentContainerStyle={styles.container}
				contentInsetAdjustmentBehavior="automatic"
				refreshControl={
					<RefreshControl
						refreshing={refreshing}
						onRefresh={onRefresh}
						tintColor={theme.color.primary}
					/>
				}
			>
				<Animated.View
					style={styles.card}
					entering={
						reduceMotion
							? FadeIn.duration(150)
							: FadeInDown.duration(theme.motion.entering)
					}
				>
					<View style={styles.cardTopRow}>
						<Text style={styles.eyebrow}>Live temperature</Text>
						<StatusChip
							connectionState={connectionState}
							hasError={Boolean(mqttError)}
							onRetry={onRefresh}
						/>
					</View>

					<View
						style={styles.orbStage}
						accessible
						accessibilityLabel={`Current temperature ${tempLabel} degrees Celsius${
							proximity ? `, ${proximity.statusWord}` : ""
						}`}
					>
						<View style={styles.orbWrap}>
							<TempOrb
								tint={proximity ? proximity.statusColor : theme.color.text}
								beatKey={beatKey}
								dimmed={
									connectionState !== "connected" &&
									connectionState !== "reconnecting"
								}
								size={320}
							/>
							<View style={styles.orbNumber} pointerEvents="none">
								<View style={styles.orbNumberRow}>
									<Text
										style={[
											styles.temperatureText,
											{ color: proximity ? proximity.statusColor : theme.color.text },
										]}
										selectable
									>
										{tempLabel}
									</Text>
									<Text
										style={[
											styles.unitText,
											{
												color: proximity ? proximity.statusColor : theme.color.text2,
											},
										]}
									>
										Â°C
									</Text>
								</View>
								{proximity ? (
									<Text
										style={[
											styles.statusWord,
											{ color: proximity.statusColor },
										]}
									>
										{proximity.statusWord}
									</Text>
								) : null}
							</View>
						</View>
					</View>

					<View style={styles.metaBlock}>
						{typeof latestThreshold === "number" ? (
							<View style={styles.metaRow}>
								<Ionicons
									name="speedometer-outline"
									size={15}
									color={theme.color.text3}
								/>
								<Text style={styles.metaText}>
									Threshold {latestThreshold.toFixed(2)}Â°C
								</Text>
							</View>
						) : null}
						{timestamp ? (
							<View style={styles.metaRow}>
								<Ionicons name="time-outline" size={15} color={theme.color.text3} />
								<Text style={styles.metaText}>
									Last update {new Date(timestamp).toLocaleString()}
								</Text>
							</View>
						) : null}
						<View style={styles.metaRow}>
							<Ionicons name="refresh-outline" size={15} color={theme.color.text3} />
							<Text style={styles.metaText}>{freshness}</Text>
						</View>
						<View style={styles.metaRow}>
							<Ionicons
								name={
									backend.state === "ok"
										? "server-outline"
										: "cloud-offline-outline"
								}
								size={15}
								color={
									backend.state === "ok"
										? theme.color.text3
										: backend.state === "degraded"
											? theme.color.warnText
											: theme.color.dangerText
								}
							/>
							<Text
								style={[
									styles.metaText,
									backend.state !== "ok" && {
										color:
											backend.state === "degraded"
												? theme.color.warnText
												: theme.color.dangerText,
									},
								]}
							>
								{backend.state === "ok"
									? `Database ok Â· ${backend.latencyMs ?? "?"} ms`
									: backend.state === "degraded"
										? "Database unavailable"
										: backend.state === "unreachable"
											? "Backend unreachable"
											: "Checking backendâ€¦"}
							</Text>
						</View>
					</View>

					{mqttError ? (
						<View
							style={styles.errorBanner}
							accessible
							accessibilityLiveRegion="polite"
							accessibilityLabel={`Sensor feed offline. ${mqttError}`}
						>
							<Ionicons
								name="cloud-offline-outline"
								size={18}
								color={theme.color.dangerText}
							/>
							<View style={styles.errorBannerTextWrap}>
								<Text style={styles.errorBannerTitle}>Sensor feed offline</Text>
								<Text style={styles.errorBannerText}>{mqttError}</Text>
							</View>
							<Pressable
								onPress={onRefresh}
								accessibilityLabel="Retry sensor feed"
								accessibilityRole="button"
								hitSlop={8}
								style={({ pressed }) => [
									styles.retryButton,
									pressed && styles.pressed,
								]}
							>
								<Text style={styles.retryText}>Retry</Text>
							</Pressable>
						</View>
					) : null}
				</Animated.View>

				<ThermalGuardCard analytics={analytics} />

				{alarms.permission === "denied" ? (
					<View style={styles.noticeRow} accessible accessibilityRole="text">
						<Ionicons
							name="notifications-off-outline"
							size={15}
							color={theme.color.text3}
						/>
						<Text style={styles.noticeText}>
							Notifications are off, so a breach only shows on this screen. Allow them
							in system settings to be alerted in the background.
						</Text>
					</View>
				) : null}

				{apiError && !loading ? (
					<View
						style={styles.errorBanner}
						accessible
						accessibilityLiveRegion="polite"
						accessibilityLabel={`Couldn't load history. ${apiError}`}
					>
						<Ionicons
							name="alert-circle-outline"
							size={18}
							color={theme.color.dangerText}
						/>
						<View style={styles.errorBannerTextWrap}>
							<Text style={styles.errorBannerTitle}>Couldn't load history</Text>
							<Text style={styles.errorBannerText}>{apiError}</Text>
						</View>
						<Pressable
							onPress={fetchReadings}
							accessibilityLabel="Retry loading history"
							accessibilityRole="button"
							hitSlop={8}
							style={({ pressed }) => [
								styles.retryButton,
								pressed && styles.pressed,
							]}
						>
							<Text style={styles.retryText}>Retry</Text>
						</Pressable>
					</View>
				) : null}

				<View style={styles.sectionHeader}>
					<View style={styles.sectionTitleRow}>
						<Text style={styles.sectionTitle}>Triggered Alarm History</Text>
						{Array.isArray(readings) && readings.length > 0 ? (
							<View style={styles.countPill}>
								<Text style={styles.countText}>
									{readings.length}{" "}
									{readings.length === 1 ? "reading" : "readings"}
								</Text>
							</View>
						) : null}
					</View>
				</View>

				<View style={styles.rangeRow} accessibilityRole="tablist">
					{RANGES.map((range) => {
						const active = range.key === rangeKey;
						return (
							<Pressable
								key={range.key}
								onPress={() => setRangeKey(range.key)}
								accessibilityRole="tab"
								accessibilityState={{ selected: active }}
								accessibilityLabel={`Show alarms from the last ${range.label}`}
								hitSlop={6}
								style={({ pressed }) => [
									styles.rangeChip,
									active && styles.rangeChipActive,
									pressed && styles.pressed,
								]}
							>
								<Text
									style={[
										styles.rangeChipText,
										active && styles.rangeChipTextActive,
									]}
								>
									{range.label}
								</Text>
							</Pressable>
						);
					})}
				</View>

				<DataTable
					columns={[
						{
							key: "recorded_at",
							title: "Timestamp",
							flex: 1.5,
							// ponytail: same single-line format as threshold history
							render: (value) =>
								value ? new Date(value).toLocaleString() : "--",
						},
						{
							key: "temperature",
							title: "Temp Â°C",
							flex: 0.9,
							numeric: true,
							render: (value) =>
								typeof value === "number" ? Number(value).toFixed(2) : "--",
						},
						{
							key: "threshold_value",
							title: "Limit Â°C",
							flex: 0.9,
							numeric: true,
							render: (value) =>
								typeof value === "number" ? Number(value).toFixed(2) : "--",
						},
					]}
					data={readings}
					keyExtractor={(item) => item.id}
					loading={loading && !refreshing}
					emptyTitle="No readings yet"
					emptyMessage={`No alarms in the last ${
						RANGES.find((r) => r.key === rangeKey)?.label.toLowerCase() ?? "hour"
					}. Pull to refresh, or widen the range.`}
					emptyActionLabel="Refresh"
					onEmptyAction={fetchReadings}
				/>
			</ScrollView>
		</View>
	);
}

const makeStyles = ({ color, space, radius, shadow, type, hit }) =>
	StyleSheet.create({
	safe: {
		flex: 1,
		backgroundColor: theme.color.bg,
	},
	container: {
		padding: space.lg,
		paddingBottom: space.xxl,
		gap: space.lg,
		backgroundColor: theme.color.bg,
	},
	card: {
		backgroundColor: theme.color.surface,
		padding: space.xl,
		borderRadius: radius.card,
		borderCurve: "continuous",
		gap: space.md,
		borderWidth: 1,
		borderColor: theme.color.border,
		boxShadow: shadow.card,
	},
	cardTopRow: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		gap: space.md,
	},
	eyebrow: {
		fontSize: 12,
		fontWeight: "600",
		textTransform: "uppercase",
		letterSpacing: 0.8,
		color: theme.color.text3,
	},
	chip: {
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		paddingVertical: 6,
		paddingHorizontal: 10,
		borderRadius: radius.chip,
		borderCurve: "continuous",
		borderWidth: 1,
	},
	dot: {
		width: 8,
		height: 8,
		borderRadius: 4,
	},
	chipText: {
		fontSize: 12,
		fontWeight: "600",
	},
	orbStage: {
		alignItems: "center",
		gap: space.sm,
		minHeight: 320,
	},
	orbWrap: {
		width: 320,
		height: 320,
		alignSelf: "center",
		position: "relative",
	},
	orbNumber: {
		position: "absolute",
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		flexDirection: "column",
		alignItems: "center",
		justifyContent: "center",
		gap: 2,
	},
	orbNumberRow: {
		flexDirection: "row",
		alignItems: "baseline",
		gap: 6,
	},
	temperatureText: {
		fontSize: 30,
		fontWeight: "700",
		color: theme.color.text,
		fontVariant: ["tabular-nums"],
	},
	unitText: {
		fontSize: 15,
		fontWeight: "600",
		color: theme.color.text2,
	},
	statusWord: {
		fontSize: 13,
		fontWeight: "700",
	},
	metaBlock: {
		gap: space.sm,
		marginTop: space.sm,
	},
	metaRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	metaText: {
		fontSize: 13,
		color: theme.color.text2,
		fontVariant: ["tabular-nums"],
	},
	sectionHeader: {
		flexDirection: "row",
		justifyContent: "space-between",
		alignItems: "center",
		// ponytail: taller break above, table tucked under header
		marginTop: space.md,
		marginBottom: -space.sm,
	},
	sectionTitleRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: space.sm,
	},
	sectionTitle: {
		fontSize: type.section,
		fontWeight: "700",
		color: theme.color.text,
	},
	countPill: {
		backgroundColor: theme.color.surface2,
		borderRadius: radius.pill,
		borderCurve: "continuous",
		paddingVertical: 4,
		paddingHorizontal: 8,
	},
	countText: {
		fontSize: 12,
		fontWeight: "600",
		color: theme.color.text2,
		fontVariant: ["tabular-nums"],
	},
	rangeRow: {
		flexDirection: "row",
		gap: space.sm,
		flexWrap: "wrap",
	},
	rangeChip: {
		minHeight: 34,
		justifyContent: "center",
		paddingHorizontal: space.md,
		borderRadius: radius.chip,
		borderCurve: "continuous",
		borderWidth: 1,
		borderColor: theme.color.border,
		backgroundColor: theme.color.surface,
	},
	rangeChipActive: {
		backgroundColor: theme.color.primary,
		borderColor: theme.color.primary,
	},
	rangeChipText: {
		fontSize: 13,
		fontWeight: "600",
		color: theme.color.text2,
	},
	rangeChipTextActive: {
		color: theme.color.onPrimary,
	},
	noticeRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: space.sm,
		paddingHorizontal: space.sm,
	},
	noticeText: {
		flex: 1,
		fontSize: 12,
		lineHeight: 17,
		color: theme.color.text3,
	},
	errorBanner: {
		flexDirection: "row",
		alignItems: "center",
		gap: space.md,
		backgroundColor: theme.color.dangerBg,
		borderWidth: 1,
		borderColor: theme.color.dangerBorder,
		borderRadius: radius.input,
		borderCurve: "continuous",
		padding: space.md,
	},
	errorBannerTextWrap: {
		flex: 1,
		gap: 2,
	},
	errorBannerTitle: {
		fontSize: 14,
		fontWeight: "600",
		color: theme.color.dangerText,
	},
	errorBannerText: {
		fontSize: 13,
		color: theme.color.dangerText,
	},
	retryButton: {
		minHeight: hit,
		justifyContent: "center",
		paddingHorizontal: space.md,
	},
	retryText: {
		fontSize: 14,
		fontWeight: "600",
		color: theme.color.dangerText,
	},
	pressed: {
		opacity: 0.9,
		transform: [{ scale: 0.98 }],
	},
});

