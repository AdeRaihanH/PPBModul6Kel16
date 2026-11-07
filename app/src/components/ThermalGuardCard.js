import { useEffect, useState } from "react";
import { Text, View, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Sparkline } from "./Sparkline.js";
import { formatDuration } from "../lib/thermalStats.js";
import { tokens } from "../theme/tokens.js";

const { color, space, radius, shadow } = tokens;

const TONES = {
	success: {
		bg: color.successBg,
		border: color.successBorder,
		text: color.successText,
	},
	warn: { bg: color.warnBg, border: color.warnBorder, text: color.warnText },
	danger: {
		bg: color.dangerBg,
		border: color.dangerBorder,
		text: color.dangerText,
	},
	muted: { bg: color.surface2, border: color.border, text: color.text3 },
};

const STATUS_ICON = {
	waiting: "ellipsis-horizontal",
	stable: "remove",
	rising: "trending-up",
	falling: "trending-down",
	imminent: "warning",
	critical: "alert-circle",
};

// Ticks once a second so the estimate visibly counts down between MQTT pushes
// instead of jumping every 5 s. Only this node re-renders.
function EtaValue({ etaSec, sampleAt, style }) {
	const [, setTick] = useState(0);
	const active = typeof etaSec === "number" && Number.isFinite(etaSec);

	useEffect(() => {
		if (!active) return undefined;
		const id = setInterval(() => setTick((n) => (n + 1) % 1000), 1000);
		return () => clearInterval(id);
	}, [active, etaSec, sampleAt]);

	if (!active) return <Text style={style}>--</Text>;
	const elapsed = sampleAt ? Math.max(0, (Date.now() - sampleAt) / 1000) : 0;
	return <Text style={style}>{formatDuration(Math.max(0, etaSec - elapsed))}</Text>;
}

function Stat({ label, value, unit, hint, tone = "muted" }) {
	const palette = TONES[tone] ?? TONES.muted;
	// `value` is a plain string for most tiles but a live node for the ETA
	// countdown, so the accessibility label is built from the readable parts only.
	const spokenValue =
		typeof value === "string" || typeof value === "number" ? String(value) : "";
	return (
		<View
			style={[styles.stat, { borderColor: palette.border, backgroundColor: palette.bg }]}
			accessible
			accessibilityLabel={`${label} ${spokenValue}${unit ? ` ${unit}` : ""}${
				hint ? `, ${hint}` : ""
			}`}
		>
			<Text style={styles.statLabel} numberOfLines={1}>
				{label}
			</Text>
			<View style={styles.statValueRow}>
				{typeof value === "string" ? (
					<Text style={[styles.statValue, { color: palette.text }]} numberOfLines={1}>
						{value}
					</Text>
				) : (
					value
				)}
				{unit ? (
					<Text style={[styles.statUnit, { color: palette.text }]}>{unit}</Text>
				) : null}
			</View>
			<Text style={styles.statHint} numberOfLines={1}>
				{hint ?? " "}
			</Text>
		</View>
	);
}

export function ThermalGuardCard({ analytics }) {
	const {
		samples,
		stats,
		trend,
		projection,
		anomaly,
		status,
		sampleAt,
		current,
		threshold,
	} = analytics;

	const palette = TONES[status.tone] ?? TONES.muted;
	const rising = trend ? trend.slopePerMin > 0 : false;

	const rateTone = !trend
		? "muted"
		: status.key === "critical" || status.key === "imminent"
			? "danger"
			: Math.abs(trend.slopePerMin) > 0.15
				? "warn"
				: "success";

	const etaTone =
		status.key === "critical"
			? "danger"
			: projection?.willCross
				? projection.etaSec <= 120
					? "danger"
					: "warn"
				: "muted";

	const confidencePct = trend ? Math.round(trend.confidence * 100) : null;
	const spanLabel = stats ? formatDuration(stats.spanSec) : null;

	return (
		<View style={styles.card}>
			<View style={styles.headerRow}>
				<View style={styles.headerTextWrap}>
					<Text style={styles.eyebrow}>Thermal guard</Text>
					<Text style={styles.subtitle}>
						Predictive view over the live sensor feed
					</Text>
				</View>
				<View
					style={[
						styles.statusPill,
						{ backgroundColor: palette.bg, borderColor: palette.border },
					]}
					accessible
					accessibilityLabel={`Trend status ${status.label}`}
				>
					<Ionicons
						name={STATUS_ICON[status.key] ?? "ellipse"}
						size={13}
						color={palette.text}
					/>
					<Text style={[styles.statusText, { color: palette.text }]}>
						{status.label}
					</Text>
				</View>
			</View>

			<Sparkline
				samples={samples}
				threshold={threshold}
				projection={projection}
				tint={palette.text}
			/>

			<View style={styles.statGrid}>
				<Stat
					label="Rate"
					value={
						trend
							? `${trend.slopePerMin > 0 ? "+" : ""}${trend.slopePerMin.toFixed(2)}`
							: "--"
					}
					unit="°C/min"
					hint={confidencePct !== null ? `fit R² ${confidencePct}%` : "collecting"}
					tone={rateTone}
				/>
				<Stat
					label="ETA to limit"
					value={
						<EtaValue
							etaSec={projection?.willCross ? projection.etaSec : null}
							sampleAt={sampleAt}
							style={[styles.statValue, { color: TONES[etaTone].text }]}
						/>
					}
					hint={
						projection?.willCross
							? "projected crossing"
							: !projection
								? "collecting"
								: rising
									? "below confidence"
									: "no upward trend"
					}
					tone={etaTone}
				/>
				<Stat
					label="Volatility"
					value={stats ? stats.std.toFixed(2) : "--"}
					unit="°C"
					hint={stats ? `range ${(stats.max - stats.min).toFixed(1)}°C` : "collecting"}
				/>
				<Stat
					label="Window peak"
					value={stats ? stats.max.toFixed(2) : "--"}
					unit="°C"
					hint={stats ? `${stats.count} samples` : "collecting"}
					tone={
						typeof current === "number" && stats && current >= stats.max
							? "warn"
							: "muted"
					}
				/>
			</View>

			{anomaly?.flag ? (
				<View
					style={styles.anomalyBanner}
					accessible
					accessibilityLiveRegion="polite"
					accessibilityLabel={`Sensor anomaly: latest sample is ${anomaly.score.toFixed(
						1,
					)} sigma away from the trend`}
				>
					<Ionicons name="pulse-outline" size={16} color={color.warnText} />
					<Text style={styles.anomalyText}>
						Sensor anomaly — latest sample is {anomaly.score.toFixed(1)}σ off the
						trend (robust MAD). Treat as noise until the next reading confirms it.
					</Text>
				</View>
			) : null}

			<Text style={styles.footer}>
				{stats
					? `${stats.count} live samples · ${spanLabel} window · avg ${stats.avg.toFixed(
							2,
						)}°C`
					: "Waiting for the first sensor readings…"}
			</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	card: {
		backgroundColor: color.surface,
		padding: space.xl,
		borderRadius: radius.card,
		borderCurve: "continuous",
		borderWidth: 1,
		borderColor: color.border,
		boxShadow: shadow.card,
		gap: space.md,
	},
	headerRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		justifyContent: "space-between",
		gap: space.md,
	},
	headerTextWrap: {
		flex: 1,
		gap: 2,
	},
	eyebrow: {
		fontSize: 12,
		fontWeight: "600",
		textTransform: "uppercase",
		letterSpacing: 0.8,
		color: color.text3,
	},
	subtitle: {
		fontSize: 13,
		color: color.text2,
	},
	statusPill: {
		flexDirection: "row",
		alignItems: "center",
		gap: 5,
		paddingVertical: 5,
		paddingHorizontal: 10,
		borderRadius: radius.chip,
		borderCurve: "continuous",
		borderWidth: 1,
	},
	statusText: {
		fontSize: 12,
		fontWeight: "700",
	},
	statGrid: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: space.sm,
	},
	stat: {
		flexGrow: 1,
		flexBasis: "46%",
		borderWidth: 1,
		borderRadius: radius.input,
		borderCurve: "continuous",
		paddingVertical: 10,
		paddingHorizontal: 12,
		gap: 2,
	},
	statLabel: {
		fontSize: 11,
		fontWeight: "600",
		textTransform: "uppercase",
		letterSpacing: 0.6,
		color: color.text3,
	},
	statValueRow: {
		flexDirection: "row",
		alignItems: "baseline",
		gap: 4,
	},
	statValue: {
		fontSize: 19,
		fontWeight: "700",
		fontVariant: ["tabular-nums"],
	},
	statUnit: {
		fontSize: 12,
		fontWeight: "600",
	},
	statHint: {
		fontSize: 11,
		color: color.text3,
		fontVariant: ["tabular-nums"],
	},
	anomalyBanner: {
		flexDirection: "row",
		alignItems: "flex-start",
		gap: space.sm,
		backgroundColor: color.warnBg,
		borderWidth: 1,
		borderColor: color.warnBorder,
		borderRadius: radius.input,
		borderCurve: "continuous",
		padding: space.md,
	},
	anomalyText: {
		flex: 1,
		fontSize: 12,
		lineHeight: 17,
		color: color.warnText,
	},
	footer: {
		fontSize: 11,
		color: color.text3,
		fontVariant: ["tabular-nums"],
	},
});
