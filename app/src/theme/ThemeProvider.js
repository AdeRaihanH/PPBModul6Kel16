import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useColorScheme } from "react-native";
import { createTheme } from "./tokens.js";
import {
	SCHEME_STORAGE_KEY,
	flipScheme,
	normalizePreference,
	resolveScheme,
	serializePreference,
} from "./scheme.js";

// AsyncStorage is bundled in Expo Go, but a missing native module must not take
// the whole app down — the theme simply falls back to following the system.
let storage = null;
try {
	storage = require("@react-native-async-storage/async-storage").default;
} catch {
	storage = null;
}

const ThemeContext = createContext(null);

async function readPreference() {
	if (!storage) return "system";
	try {
		const value = await storage.getItem(SCHEME_STORAGE_KEY);
		return normalizePreference(value);
	} catch {
		return "system";
	}
}

async function writePreference(value) {
	if (!storage) return;
	try {
		await storage.setItem(SCHEME_STORAGE_KEY, serializePreference(value));
	} catch {
		// Persisting is a nicety; failing to save must not break the toggle.
	}
}

export function ThemeProvider({ children }) {
	const systemScheme = useColorScheme();
	const [preference, setPreferenceState] = useState("system");
	const [loaded, setLoaded] = useState(false);
	// Mirrors `preference` so callbacks can read the latest value without being
	// re-created on every change.
	const preferenceRef = useRef("system");

	useEffect(() => {
		let cancelled = false;
		readPreference().then((stored) => {
			if (cancelled) return;
			preferenceRef.current = stored;
			setPreferenceState(stored);
			setLoaded(true);
		});
		return () => {
			cancelled = true;
		};
	}, []);

	const scheme = resolveScheme(preference, systemScheme);
	const theme = useMemo(() => createTheme(scheme), [scheme]);

	const setPreference = useCallback((next) => {
		const value = normalizePreference(next);
		preferenceRef.current = value;
		setPreferenceState(value);
		writePreference(value);
	}, []);

	// Header button: flip to the opposite of what is on screen, and keep it. If
	// the app was following the system, this pins an explicit choice — which is
	// what someone tapping a light/dark button expects.
	const toggle = useCallback(() => {
		const current = resolveScheme(preferenceRef.current, systemScheme);
		setPreference(flipScheme(current));
	}, [setPreference, systemScheme]);

	const value = useMemo(
		() => ({
			theme,
			scheme,
			preference,
			loaded,
			followsSystem: preference === "system",
			systemScheme: systemScheme === "dark" ? "dark" : "light",
			setPreference,
			toggle,
		}),
		[theme, scheme, preference, loaded, systemScheme, setPreference, toggle],
	);

	return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeContext() {
	const context = useContext(ThemeContext);
	if (!context) {
		throw new Error("useThemeContext must be used inside a ThemeProvider");
	}
	return context;
}

export function useTheme() {
	return useThemeContext().theme;
}

// StyleSheet objects are created once per (theme, factory) pair and shared, so
// re-rendering a screen does not rebuild its styles.
const styleCache = new WeakMap();

export function useThemedStyles(factory) {
	const theme = useTheme();
	return useMemo(() => {
		let perTheme = styleCache.get(theme);
		if (!perTheme) {
			perTheme = new Map();
			styleCache.set(theme, perTheme);
		}
		let styles = perTheme.get(factory);
		if (!styles) {
			styles = factory(theme);
			perTheme.set(factory, styles);
		}
		return styles;
	}, [theme, factory]);
}
