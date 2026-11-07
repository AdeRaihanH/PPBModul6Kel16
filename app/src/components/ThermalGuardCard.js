import { Text, View, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Sparkline } from "./Sparkline.js";
import { useTheme, useThemedStyles } from "../theme/ThemeProvider.js";

// Tones depend on the palette, so they are built per render from the theme rather
// than frozen at module load.
function buildTones(color) {
	return {
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
}

const STATUS_ICON = {
	waiting: "ellipsis-horizontal",
	nolimit: "remove-circle-outline",
	safe: "shield-checkmark-outline",
	near: "warning-outline",
	over: "alert-circle",
};

function Stat({ label, value, unit, tone, tones }) {
	const styles = useThemedStyles(makeStyles);
	const palette = tones[tone] ?? tones.muted;
	return (
		<View
			style={[styles.stat, { borderColor: palette.border, backgroundColor: palette.bg }]}
			accessible
			accessibilityLabel={`${label} ${value}${unit ? ` ${unit}` : ""}`}
		>
			<Text style={styles.statLabel} numberOfLines={1}>
				{label}
			</Text>
			<View style={styles.statValueRow}>
				<Text
					style={[styles.statValue, { color: palette.text }]}
					numberOfLines={1}
					adjustsFontSizeToFit
				>
					{value}
				</Text>
				{unit ? (
					<Text style={[styles.statUnit, { color: palette.text }]}>{unit}</Text>
				) : null}
			</View>
		</View>
	);
}

// Plain subtraction, one decimal, always signed. "+10.0" and "-5.0" read exactly
// like the change they describe, with no unit conversion to interpret.
function deltaLabel(delta) {
	if (typeof delta !== "number" || !Number.isFinite(delta)) return "--";
	// Round tiny values to zero: showing "-0.0" for an unchanged reading looks
	// broken rather than flat.
	if (Math.abs(delta) < 0.05) return "0.0";
	return `${delta > 0 ? "+" : ""}${delta.toFixed(1)}`;
}

export function ThermalGuardCard({ analytics }) {
	const theme = useTheme();
	const styles = useThemedStyles(makeStyles);
	const tones = buildTones(theme.color);

	const { samples, stats, step, proximity, status, anomaly, threshold } = analytics;

	const palette = tones[status.tone] ?? tones.muted;

	const delta = step?.delta;
	const rising = typeof delta === "number" && delta > 0.05;
	const falling = typeof delta === "number" && delta < -0.05;
	const rateTone =
		status.key === "over"
			? "danger"
			: proximity?.state === "near"
				? "warn"
				: "muted";

	const headroom = proximity?.headroom;
	const marginValue =
		typeof headroom === "number"
			? proximity.state === "over"
				? `+${Math.abs(headroom).toFixed(1)}`
				: headroom.toFixed(1)
			: "--";
	const marginUnit =
		proximity?.state === "over"
			? "°C over"
			: proximity?.state === "unknown"
				? ""
				: "°C left";

	return (
		<View style={styles.card}>
			<View style={styles.headerRow}>
				<Text style={styles.title}>Thermal Guard</Text>
				<View
					style={[
						styles.statusPill,
						{ backgroundColor: palette.bg, borderColor: palette.border },
					]}
					accessible
					accessibilityLabel={`Status ${status.label}`}
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

			<Sparkline samples={samples} threshold={threshold} tint={palette.text} />

			<View style={styles.statGrid}>
				<Stat
					label="Rate"
					value={deltaLabel(delta)}
					unit="°C"
					tone={rateTone}
					tones={tones}
				/>
				<Stat
					label="Margin"
					value={marginValue}
					unit={marginUnit}
					tone={status.tone}
					tones={tones}
				/>
				<Stat
					label="Peak"
					value={stats ? stats.max.toFixed(1) : "--"}
					unit="°C"
					tone="muted"
					tones={tones}
				/>
			</View>

			{(rising || falling) && status.key !== "waiting" ? (
				<View style={styles.trendRow}>
					<Ionicons
						name={rising ? "trending-up" : "trending-down"}
						size={13}
						color={theme.color.text3}
					/>
					<Text style={styles.trendText}>
						{rising ? "Up" : "Down"} {Math.abs(delta).toFixed(1)} °C from{" "}
						{step.from.toFixed(1)} °C to {step.to.toFixed(1)} °C
					</Text>
				</View>
			) : null}

			{anomaly?.flag ? (
				<View
					style={styles.anomalyBanner}
					accessible
					accessibilityLiveRegion="polite"
					accessibilityLabel={`Sensor anomaly: latest sample is ${anomaly.score.toFixed(
						1,
					)} sigma away from the trend`}
				>
					<Ionicons name="pulse-outline" size={16} color={theme.color.warnText} />
					<Text style={styles.anomalyText}>
						Sensor anomaly — {anomaly.score.toFixed(1)}σ off the trend.
					</Text>
				</View>
			) : null}
		</View>
	);
}

const makeStyles = ({ color, space, radius, shadow, type }) =>
	StyleSheet.create({
		card: {
			backgroundColor: color.surface,
			padding: space.lg,
			borderRadius: radius.card,
			borderCurve: "continuous",
			borderWidth: 1,
			borderColor: color.border,
			boxShadow: shadow.card,
			gap: space.md,
		},
		headerRow: {
			flexDirection: "row",
			alignItems: "center",
			justifyContent: "space-between",
			gap: space.sm,
		},
		title: {
			fontSize: type.section,
			fontWeight: "700",
			color: color.text,
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
			gap: space.sm,
		},
		stat: {
			flex: 1,
			borderWidth: 1,
			borderRadius: radius.input,
			borderCurve: "continuous",
			paddingVertical: 10,
			paddingHorizontal: 10,
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
			gap: 3,
		},
		statValue: {
			fontSize: 18,
			fontWeight: "700",
			fontVariant: ["tabular-nums"],
		},
		statUnit: {
			fontSize: 11,
			fontWeight: "600",
		},
		trendRow: {
			flexDirection: "row",
			alignItems: "center",
			gap: 6,
		},
		trendText: {
			fontSize: 11,
			color: color.text3,
			fontVariant: ["tabular-nums"],
		},
		anomalyBanner: {
			flexDirection: "row",
			alignItems: "center",
			gap: space.sm,
			backgroundColor: color.warnBg,
			borderWidth: 1,
			borderColor: color.warnBorder,
			borderRadius: radius.input,
			borderCurve: "continuous",
			padding: space.sm,
		},
		anomalyText: {
			flex: 1,
			fontSize: 12,
			color: color.warnText,
		},
	});
