// Design tokens, split into two palettes.
//
// Colours used to be a single frozen object read at module load, which is why
// dark mode needs a different shape: every StyleSheet has to be rebuilt when the
// scheme changes. `createTheme` produces one stable object per scheme, and
// `useThemedStyles` (see ThemeProvider) memoises the StyleSheet per theme.

const space = { sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 };
const radius = { card: 8, input: 8, cta: 12, pill: 999, chip: 999 };
const type = { title: 18, section: 16 };
const motion = { entering: 220 };
const hit = 44;

export const layout = { space, radius, type, motion, hit };

export const palettes = {
	light: {
		bg: "#F8F9FB",
		surface: "#FFFFFF",
		surface2: "#F1F5F9",
		text: "#0F172A",
		text2: "#475569",
		text3: "#64748B",
		border: "#E2E8F0",
		primary: "#2563EB",
		onPrimary: "#FFFFFF",
		successBg: "#DCFCE7",
		successText: "#15803D",
		successBorder: "#BBF7D0",
		warnBg: "#FEF3C7",
		warnText: "#92400E",
		warnBorder: "#FDE68A",
		dangerBg: "#FEE2E2",
		dangerText: "#B91C1C",
		dangerBorder: "#FECACA",
		skeleton: "#E2E8F0",
	},
	// Not the light palette inverted: the tints are desaturated and the text is
	// off-white rather than pure white, which keeps contrast comfortable on OLED
	// without the halo that #FFF on near-black produces.
	dark: {
		bg: "#0B1220",
		surface: "#151F32",
		surface2: "#1E2A40",
		text: "#E8EDF5",
		text2: "#A9B6CB",
		text3: "#7D8CA6",
		border: "#28364F",
		primary: "#5B8DEF",
		onPrimary: "#0B1220",
		successBg: "#102A1D",
		successText: "#6EE7A0",
		successBorder: "#1E4A32",
		warnBg: "#31240B",
		warnText: "#FBBF24",
		warnBorder: "#56410F",
		dangerBg: "#3A1619",
		dangerText: "#FCA5A5",
		dangerBorder: "#5C2428",
		skeleton: "#1E2A40",
	},
};

const shadows = {
	light: "0 1px 2px rgba(15,23,42,0.06), 0 4px 12px rgba(15,23,42,0.06)",
	// A dark card on a dark page needs a darker, softer shadow to read as raised.
	dark: "0 1px 2px rgba(0,0,0,0.45), 0 4px 14px rgba(0,0,0,0.35)",
};

export const SCHEMES = ["light", "dark"];

export function createTheme(scheme) {
	const resolved = palettes[scheme] ? scheme : "light";
	return {
		scheme: resolved,
		color: palettes[resolved],
		shadow: { card: shadows[resolved] },
		space,
		radius,
		type,
		motion,
		hit,
	};
}
