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
import { Api } from "../services/api.js";
import { DataTable } from "../components/DataTable.js";
import { TempOrb } from "../components/TempOrb.js";
import { ThermalGuardCard } from "../components/ThermalGuardCard.js";
import { useLanguage } from "../i18n/LanguageProvider.js";
import { useTheme, useThemedStyles } from "../theme/ThemeProvider.js";

// History ranges. `ms: null` means no lower bound. Labels are translated at
// render time via i18n keys.
const RANGES = [
	{ key: "15m", labelKey: "monitoring.range15m", ms: 15 * 60 * 1000 },
	{ key: "1h", labelKey: "monitoring.range1h", ms: 60 * 60 * 1000 },
	{ key: "6h", labelKey: "monitoring.range6h", ms: 6 * 60 * 60 * 1000 },
	{ key: "all", labelKey: "monitoring.rangeAll", ms: null },
];
const DEFAULT_RANGE = "1h";
const HISTORY_LIMIT = 200;

function StatusChip({ connectionState, hasError, onRetry }) {
	const theme = useTheme();
	const { t } = useLanguage();
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
				label: t("monitoring.offline"),
				actionable: true,
			};
		}
		if (connectionState === "reconnecting" || connectionState === "connecting") {
			return {
				bg: theme.color.warnBg,
				border: theme.color.warnBorder,
				text: theme.color.warnText,
				dot: theme.color.warnText,
				label:
					connectionState === "connecting"
						? t("monitoring.connecting")
						: t("monitoring.reconnecting"),
				actionable: false,
			};
		}
		return {
			bg: theme.color.successBg,
			border: theme.color.successBorder,
			text: theme.color.successText,
			dot: theme.color.successText,
			label: t("monitoring.connected"),
			actionable: false,
		};
	}, [connectionState, hasError, theme, t]);

	const chip = (
		<View
			style={[
				styles.chip,
				{ backgroundColor: config.bg, borderColor: config.border },
			]}
			accessible
			accessibilityLabel={t("monitoring.chipA11y", { status: config.label })}
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
				accessibilityLabel={t("monitoring.retryFeed")}
				accessibilityRole="button"
				accessibilityHint={t("monitoring.retryFeedHint")}
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
	const { t, formatNumber, formatDateTime } = useLanguage();
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
	// ponytail: Date.now() is impure — "now" lives in state (ticked below) so the
	// freshness memo stays pure and the label refreshes live.
	const [now, setNow] = useState(null);
	const reduceMotion = useReducedMotion();

	const analytics = useLiveAnalytics({
		temperature,
		timestamp,
		threshold: latestThreshold,
	});
	const backend = useBackendHealth();

	// Haptic on the crossing itself. This is the only alert the app raises, and it
	// needs no permission: it works the moment the reading crosses the limit.
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
			setApiError(err.message || t("monitoring.errorDefault"));
		} finally {
			setLoading(false);
		}
	}, [rangeKey, t]);

	useFocusEffect(
		useCallback(() => {
			fetchReadings();
		}, [fetchReadings]),
	);

	const onRefresh = useCallback(async () => {
		setRefreshing(true);
		setNow(Date.now());
		try {
			await fetchReadings();
		} finally {
			setRefreshing(false);
		}
	}, [fetchReadings]);

	useEffect(() => {
		let cancelled = false;
		const tick = () => {
			if (!cancelled) setNow(Date.now());
		};
		const first = setTimeout(tick, 0);
		const interval = setInterval(tick, 30_000);
		return () => {
			cancelled = true;
			clearTimeout(first);
			clearInterval(interval);
		};
	}, []);

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
			safe: { statusWord: t("status.normal"), statusColor: theme.color.successText },
			near: { statusWord: t("status.near"), statusColor: theme.color.warnText },
			over: { statusWord: t("status.over"), statusColor: theme.color.dangerText },
		};
		return words[analytics.proximity.state] ?? null;
	}, [temperature, latestThreshold, analytics.proximity.state, theme, t]);

	const freshness = useMemo(() => {
		if (now == null) return "";
		if (!Array.isArray(readings) || readings.length === 0) {
			return t("monitoring.emptyTitle");
		}
		const first = readings[0];
		const d = new Date(first.recorded_at ?? first.timestamp ?? now);
		const s = Number.isNaN(d.getTime())
			? 0
			: Math.max(0, Math.round((now - d.getTime()) / 1000));
		const rel =
			s < 10
				? t("monitoring.justNow")
				: s < 60
					? t("monitoring.secondsAgo", { s })
					: t("monitoring.minutesAgo", { m: Math.floor(s / 60) });
		return t("monitoring.updated", {
			rel,
			count: readings.length,
			unit:
				readings.length === 1
					? t("monitoring.readingOne")
					: t("monitoring.readingOther"),
		});
	}, [readings, now, t]);

	const tempLabel =
		typeof temperature === "number" ? formatNumber(temperature) : "--";

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
						<Text style={styles.eyebrow}>{t("monitoring.eyebrow")}</Text>
						<StatusChip
							connectionState={connectionState}
							hasError={Boolean(mqttError)}
							onRetry={onRefresh}
						/>
					</View>

					<View
						style={styles.orbStage}
						accessible
						accessibilityLabel={t("monitoring.temperatureA11y", {
							value: tempLabel,
							status: proximity ? `, ${proximity.statusWord}` : "",
						})}
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
										°C
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
									{t("monitoring.threshold", {
										value: formatNumber(latestThreshold),
									})}
								</Text>
							</View>
						) : null}
						{timestamp ? (
							<View style={styles.metaRow}>
								<Ionicons name="time-outline" size={15} color={theme.color.text3} />
								<Text style={styles.metaText}>
									{t("monitoring.lastUpdate", { time: formatDateTime(timestamp) })}
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
									? t("monitoring.dbOk", { ms: backend.latencyMs ?? "?" })
									: backend.state === "degraded"
										? t("monitoring.dbUnavailable")
										: backend.state === "unreachable"
											? t("monitoring.backendUnreachable")
											: t("monitoring.backendChecking")}
							</Text>
						</View>
					</View>

					{mqttError ? (
						<View
							style={styles.errorBanner}
							accessible
							accessibilityLiveRegion="polite"
							accessibilityLabel={t("monitoring.feedOfflineA11y", {
								error: mqttError,
							})}
						>
							<Ionicons
								name="cloud-offline-outline"
								size={18}
								color={theme.color.dangerText}
							/>
							<View style={styles.errorBannerTextWrap}>
								<Text style={styles.errorBannerTitle}>
									{t("monitoring.feedOfflineTitle")}
								</Text>
								<Text style={styles.errorBannerText}>{mqttError}</Text>
							</View>
							<Pressable
								onPress={onRefresh}
								accessibilityLabel={t("monitoring.retryFeed")}
								accessibilityRole="button"
								hitSlop={8}
								style={({ pressed }) => [
									styles.retryButton,
									pressed && styles.pressed,
								]}
							>
								<Text style={styles.retryText}>{t("monitoring.retry")}</Text>
							</Pressable>
						</View>
					) : null}
				</Animated.View>

				<ThermalGuardCard analytics={analytics} />

				{apiError && !loading ? (
					<View
						style={styles.errorBanner}
						accessible
						accessibilityLiveRegion="polite"
						accessibilityLabel={t("monitoring.historyErrorA11y", {
							error: apiError,
						})}
					>
						<Ionicons
							name="alert-circle-outline"
							size={18}
							color={theme.color.dangerText}
						/>
						<View style={styles.errorBannerTextWrap}>
							<Text style={styles.errorBannerTitle}>
								{t("monitoring.historyErrorTitle")}
							</Text>
							<Text style={styles.errorBannerText}>{apiError}</Text>
						</View>
						<Pressable
							onPress={fetchReadings}
							accessibilityLabel={t("monitoring.retryHistory")}
							accessibilityRole="button"
							hitSlop={8}
							style={({ pressed }) => [
								styles.retryButton,
								pressed && styles.pressed,
							]}
						>
							<Text style={styles.retryText}>{t("monitoring.retry")}</Text>
						</Pressable>
					</View>
				) : null}

				<View style={styles.sectionHeader}>
					<View style={styles.sectionTitleRow}>
						<Text style={styles.sectionTitle}>
							{t("monitoring.historyTitle")}
						</Text>
						{Array.isArray(readings) && readings.length > 0 ? (
							<View style={styles.countPill}>
								<Text style={styles.countText}>
									{readings.length}{" "}
									{readings.length === 1
										? t("monitoring.readingOne")
										: t("monitoring.readingOther")}
								</Text>
							</View>
						) : null}
					</View>
				</View>

				<View style={styles.rangeRow} accessibilityRole="tablist">
					{RANGES.map((range) => {
						const active = range.key === rangeKey;
						const rangeLabel = t(range.labelKey);
						return (
							<Pressable
								key={range.key}
								onPress={() => setRangeKey(range.key)}
								accessibilityRole="tab"
								accessibilityState={{ selected: active }}
								accessibilityLabel={t("monitoring.rangeA11y", {
									range: rangeLabel,
								})}
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
									{rangeLabel}
								</Text>
							</Pressable>
						);
					})}
				</View>

				<DataTable
					columns={[
						{
							key: "recorded_at",
							title: t("monitoring.columnTimestamp"),
							flex: 1.5,
							// ponytail: same single-line format as threshold history
							render: (value) => (value ? formatDateTime(value) : "--"),
						},
						{
							key: "temperature",
							title: t("monitoring.columnTemp"),
							flex: 0.9,
							numeric: true,
							render: (value) => formatNumber(value),
						},
						{
							key: "threshold_value",
							title: t("monitoring.columnLimit"),
							flex: 0.9,
							numeric: true,
							render: (value) => formatNumber(value),
						},
					]}
					data={readings}
					keyExtractor={(item) => item.id}
					loading={loading && !refreshing}
					emptyTitle={t("monitoring.emptyTitle")}
					emptyMessage={t(
						"monitoring.emptyRangeMessage",
						{
							range: t(
								(RANGES.find((r) => r.key === rangeKey) ?? RANGES[0]).labelKey,
							).toLowerCase(),
						},
					)}
					emptyActionLabel={t("monitoring.refresh")}
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
		backgroundColor: color.bg,
	},
	container: {
		padding: space.lg,
		paddingBottom: space.xxl,
		gap: space.lg,
		backgroundColor: color.bg,
	},
	card: {
		backgroundColor: color.surface,
		padding: space.xl,
		borderRadius: radius.card,
		borderCurve: "continuous",
		gap: space.md,
		borderWidth: 1,
		borderColor: color.border,
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
		color: color.text3,
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
		color: color.text,
		fontVariant: ["tabular-nums"],
	},
	unitText: {
		fontSize: 15,
		fontWeight: "600",
		color: color.text2,
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
		color: color.text2,
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
		color: color.text,
	},
	countPill: {
		backgroundColor: color.surface2,
		borderRadius: radius.pill,
		borderCurve: "continuous",
		paddingVertical: 4,
		paddingHorizontal: 8,
	},
	countText: {
		fontSize: 12,
		fontWeight: "600",
		color: color.text2,
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
		borderColor: color.border,
		backgroundColor: color.surface,
	},
	rangeChipActive: {
		backgroundColor: color.primary,
		borderColor: color.primary,
	},
	rangeChipText: {
		fontSize: 13,
		fontWeight: "600",
		color: color.text2,
	},
	rangeChipTextActive: {
		color: color.onPrimary,
	},
	errorBanner: {
		flexDirection: "row",
		alignItems: "center",
		gap: space.md,
		backgroundColor: color.dangerBg,
		borderWidth: 1,
		borderColor: color.dangerBorder,
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
		color: color.dangerText,
	},
	errorBannerText: {
		fontSize: 13,
		color: color.dangerText,
	},
	retryButton: {
		minHeight: hit,
		justifyContent: "center",
		paddingHorizontal: space.md,
	},
	retryText: {
		fontSize: 14,
		fontWeight: "600",
		color: color.dangerText,
	},
	pressed: {
		opacity: 0.9,
		transform: [{ scale: 0.98 }],
	},
});

