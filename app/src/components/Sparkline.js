import { useEffect, useMemo, useState } from "react";
import { View, StyleSheet } from "react-native";
import {
	Canvas,
	Circle,
	DashPathEffect,
	LinearGradient,
	Line,
	Path,
	Skia,
	vec,
} from "react-native-skia";
import { useIsFocused } from "@react-navigation/native";
import {
	useDerivedValue,
	useFrameCallback,
	useReducedMotion,
	useSharedValue,
} from "react-native-reanimated";
import { tokens } from "../theme/tokens.js";

const { color } = tokens;

const PAD_X = 8;
const PAD_TOP = 12;
const PAD_BOTTOM = 14;

// Skia 2.x made SkPath immutable: moveTo/lineTo/close live on SkPathBuilder and
// the finished path comes from detach(). Older Skia had a mutable SkPath, so pick
// whichever the installed version provides instead of assuming one.
function startPath() {
	return Skia.PathBuilder?.Make ? Skia.PathBuilder.Make() : Skia.Path.Make();
}

function finishPath(builder) {
	return typeof builder.detach === "function" ? builder.detach() : builder;
}

/**
 * Live temperature trace with the limit drawn as a dashed rule.
 *
 * No projection line: this panel reports what was measured, and a dotted
 * "forecast" would imply a prediction the data does not support.
 */
export function Sparkline({ samples = [], threshold = null, tint = color.primary, height = 136 }) {
	const [width, setWidth] = useState(0);
	const focused = useIsFocused();
	const reduceMotion = useReducedMotion();
	const pulse = useSharedValue(0);

	const geometry = useMemo(() => {
		if (!width || samples.length < 2) return null;

		const values = samples.map((s) => s.v);
		if (typeof threshold === "number") values.push(threshold);

		let lo = Math.min(...values);
		let hi = Math.max(...values);
		if (hi - lo < 1) {
			const mid = (hi + lo) / 2;
			lo = mid - 0.5;
			hi = mid + 0.5;
		}
		const pad = (hi - lo) * 0.14;
		lo -= pad;
		hi += pad;

		const t0 = samples[0].t;
		const tN = samples[samples.length - 1].t;
		const spanT = Math.max(1, tN - t0);

		const plotW = width - PAD_X * 2;
		const plotH = height - PAD_TOP - PAD_BOTTOM;
		const toX = (t) => PAD_X + ((t - t0) / spanT) * plotW;
		const toY = (v) => PAD_TOP + (1 - (v - lo) / (hi - lo)) * plotH;

		// Two independent builders: the area needs the outline plus two closing
		// edges, and an immutable SkPath cannot be mutated after detach().
		const lineBuilder = startPath();
		const areaBuilder = startPath();
		samples.forEach((sample, index) => {
			const x = toX(sample.t);
			const y = toY(sample.v);
			if (index === 0) {
				lineBuilder.moveTo(x, y);
				areaBuilder.moveTo(x, y);
			} else {
				lineBuilder.lineTo(x, y);
				areaBuilder.lineTo(x, y);
			}
		});

		areaBuilder.lineTo(toX(tN), PAD_TOP + plotH);
		areaBuilder.lineTo(toX(t0), PAD_TOP + plotH);
		areaBuilder.close();

		const last = samples[samples.length - 1];

		return {
			line: finishPath(lineBuilder),
			area: finishPath(areaBuilder),
			lastX: toX(last.t),
			lastY: toY(last.v),
			thresholdY: typeof threshold === "number" ? toY(threshold) : null,
		};
	}, [samples, threshold, width, height]);

	const frame = useFrameCallback((info) => {
		"worklet";
		pulse.value = (pulse.value + (info.timeSincePreviousFrame ?? 16) / 1500) % 1;
	});

	useEffect(() => {
		frame.setActive(focused && !reduceMotion && Boolean(geometry));
	}, [focused, reduceMotion, geometry, frame]);

	const ringRadius = useDerivedValue(() => 4 + 11 * pulse.value);
	const ringOpacity = useDerivedValue(() => 0.45 * (1 - pulse.value));

	return (
		<View
			style={[styles.wrap, { height }]}
			onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
			accessible
			accessibilityRole="image"
			accessibilityLabel={
				geometry
					? `Temperature trace over the last ${Math.round(
							(samples[samples.length - 1].t - samples[0].t) / 1000,
						)} seconds`
					: "Temperature trace waiting for samples"
			}
		>
			{geometry ? (
				<Canvas style={{ width, height }}>
					<Path path={geometry.area} style="fill">
						<LinearGradient
							start={vec(0, PAD_TOP)}
							end={vec(0, height - PAD_BOTTOM)}
							colors={[`${tint}38`, `${tint}00`]}
						/>
					</Path>

					<Path
						path={geometry.line}
						style="stroke"
						strokeWidth={2.25}
						color={tint}
						strokeJoin="round"
						strokeCap="round"
					/>

					{geometry.thresholdY !== null ? (
						<Line
							p1={vec(PAD_X, geometry.thresholdY)}
							p2={vec(width - PAD_X, geometry.thresholdY)}
							color={color.dangerBorder}
							strokeWidth={1.5}
							style="stroke"
						>
							<DashPathEffect intervals={[5, 5]} />
						</Line>
					) : null}

					<Circle
						cx={geometry.lastX}
						cy={geometry.lastY}
						r={ringRadius}
						color={tint}
						opacity={ringOpacity}
					/>
					<Circle cx={geometry.lastX} cy={geometry.lastY} r={3.5} color={tint} />
				</Canvas>
			) : (
				<View style={styles.placeholder}>
					<View style={styles.baseline} />
				</View>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: {
		width: "100%",
		justifyContent: "center",
	},
	placeholder: {
		flex: 1,
		justifyContent: "center",
		paddingHorizontal: PAD_X,
	},
	baseline: {
		height: 1,
		backgroundColor: color.border,
	},
});
