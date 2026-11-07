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

const STORAGE_KEY = "livetemp.theme";

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
	if (!storage) return null;
	try {
		const value = await storage.getItem(STORAGE_KEY);
		return value === "light" || value === "dark" ? value : null;
	} catch {
		return null;
	}
}

async function writePreference(value) {
	if (!storage) return;
	try {
		await storage.setItem(STORAGE_KEY, value);
	} catch {
		// Persisting is a nicety; failing to save must not break the toggle.
	}
}

export function ThemeProvider({ children }) {
	const systemScheme = useColorScheme();
	// `null` means "follow the system". Stored as a ref too so the toggle can read
	// the latest value without re-creating its callback on every render.
	const [preference, setPreferenceState] = useState(null);
	const preferenceRef = useRef(null);

	useEffect(() => {
		let cancelled = false;
		readPreference().then((stored) => {
			if (cancelled || !stored) return;
			preferenceRef.current = stored;
			setPreferenceState(stored);
		});
		return () => {
			cancelled = true;
		};
	}, []);

	const scheme = preference ?? (systemScheme === "dark" ? "dark" : "light");
	const theme = useMemo(() => createTheme(scheme), [scheme]);

	const setPreference = useCallback((next) => {
		const value = next === "light" || next === "dark" ? next : null;
		preferenceRef.current = value;
		setPreferenceState(value);
		writePreference(value ?? "system");
	}, []);

	// One button, predictable behaviour: flip to the opposite of what is on screen
	// right now, and stop following the system from then on.
	const toggle = useCallback(() => {
		const current = preferenceRef.current ?? (systemScheme === "dark" ? "dark" : "light");
		setPreference(current === "dark" ? "light" : "dark");
	}, [setPreference, systemScheme]);

	const value = useMemo(
		() => ({
			theme,
			scheme,
			preference,
			followsSystem: preference === null,
			setPreference,
			toggle,
		}),
		[theme, scheme, preference, setPreference, toggle],
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
