import { useCallback, useEffect, useMemo, useState } from "react";
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
import Animated, {
	FadeIn,
	FadeInDown,
	useReducedMotion,
} from "react-native-reanimated";
import { useMqttSensor } from "../hooks/useMqttSensor.js";
import { Api } from "../services/api.js";
import { DataTable } from "../components/DataTable.js";
import { TempOrb } from "../components/TempOrb.js";
import { useLanguage } from "../i18n/LanguageProvider.js";
import { tokens } from "../theme/tokens.js";

const { color, space, radius, shadow } = tokens;

function StatusChip({ connectionState, hasError, onRetry }) {
	const { t } = useLanguage();
	const config = useMemo(() => {
		if (
			hasError ||
			connectionState === "error" ||
			connectionState === "disconnected"
		) {
			return {
				bg: color.dangerBg,
				border: color.dangerBorder,
				text: color.dangerText,
				dot: color.dangerText,
				label: t("monitoring.offline"),
				actionable: true,
			};
		}
		if (connectionState === "reconnecting") {
			return {
				bg: color.warnBg,
				border: color.warnBorder,
				text: color.warnText,
				dot: color.warnText,
				label: t("monitoring.reconnecting"),
				actionable: false,
			};
		}
		return {
			bg: color.successBg,
			border: color.successBorder,
			text: color.successText,
			dot: color.successText,
			label: t("monitoring.connected"),
			actionable: false,
		};
	}, [connectionState, hasError, t]);

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
	const {
		temperature,
		timestamp,
		connectionState,
		error: mqttError,
	} = useMqttSensor();
	const { t, formatNumber, formatDateTime } = useLanguage();
	const [readings, setReadings] = useState([]);
	const [latestThreshold, setLatestThreshold] = useState(null);
	const [loading, setLoading] = useState(false);
	const [refreshing, setRefreshing] = useState(false);
	const [apiError, setApiError] = useState(null);
	const [now, setNow] = useState(null);
	const reduceMotion = useReducedMotion();

	const fetchReadings = useCallback(async () => {
		setLoading(true);
		setApiError(null);
		try {
			const [history, thresholds] = await Promise.all([
				Api.getSensorReadings(),
				Api.getThresholds().catch(() => null),
			]);
			setReadings(history ?? []);
			const latest = Array.isArray(thresholds) ? thresholds[0]?.value : null;
			setLatestThreshold(typeof latest === "number" ? latest : null);
		} catch (err) {
			setApiError(err.message || t("monitoring.errorDefault"));
		} finally {
			setLoading(false);
		}
	}, [t]);

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

	const proximity = useMemo(() => {
		if (
			typeof temperature !== "number" ||
			typeof latestThreshold !== "number"
		) {
			return null;
		}
		let tone = "below threshold";
		let statusWord = t("status.normal");
		let statusColor = color.successText;
		if (temperature >= latestThreshold) {
			tone = "at or above threshold";
			statusWord = t("status.over");
			statusColor = color.dangerText;
		} else if (temperature >= latestThreshold - 2) {
			tone = "near threshold";
			statusWord = t("status.near");
			statusColor = color.warnText;
		}
		return { tone, statusWord, statusColor };
	}, [temperature, latestThreshold, t]);

	// ponytail: Date.now() is impure — "now" lives in state (ticked below)
	// so the freshness memo stays pure and the label refreshes live.
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
						tintColor={color.primary}
					/>
				}
			>
				<Animated.View
					style={styles.card}
					entering={
						reduceMotion
							? FadeIn.duration(150)
							: FadeInDown.duration(tokens.motion.entering)
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
								tint={proximity ? proximity.statusColor : color.text}
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
											{ color: proximity ? proximity.statusColor : color.text },
										]}
										selectable
									>
										{tempLabel}
									</Text>
									<Text
										style={[
											styles.unitText,
											{
												color: proximity ? proximity.statusColor : color.text2,
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
									color={color.text3}
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
								<Ionicons name="time-outline" size={15} color={color.text3} />
								<Text style={styles.metaText}>
									{t("monitoring.lastUpdate", {
										time: formatDateTime(timestamp),
									})}
								</Text>
							</View>
						) : null}
						<View style={styles.metaRow}>
							<Ionicons name="refresh-outline" size={15} color={color.text3} />
							<Text style={styles.metaText}>{freshness}</Text>
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
								color={color.dangerText}
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
							color={color.dangerText}
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
							<Text style={styles.retryText}>{t("monitoring.refresh")}</Text>
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
					emptyMessage={t("monitoring.emptyMessage")}
					emptyActionLabel={t("monitoring.refresh")}
					onEmptyAction={fetchReadings}
				/>
			</ScrollView>
		</View>
	);
}

const styles = StyleSheet.create({
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
		fontSize: tokens.type.section,
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
		minHeight: tokens.hit,
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
