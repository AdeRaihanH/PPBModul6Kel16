// Scheme resolution as pure functions, so the behaviour can be tested without a
// device, a renderer, or AsyncStorage.
//
// "system" is a real choice, not the absence of one: a user who has picked dark
// on a light phone should be able to hand control back to the OS without
// clearing app data.

export const SCHEME_STORAGE_KEY = "livetemp.theme";

export const PREFERENCES = ["system", "light", "dark"];

export const PREFERENCE_LABEL = {
	system: "System",
	light: "Light",
	dark: "Dark",
};

/**
 * Anything unrecognised — including a missing key, or the string "system" that
 * older builds wrote — means "follow the OS".
 */
export function normalizePreference(value) {
	return value === "light" || value === "dark" ? value : "system";
}

/** What to store for a given preference. `null` is treated as "system". */
export function serializePreference(value) {
	return normalizePreference(value);
}

/** The scheme actually used for rendering. */
export function resolveScheme(preference, systemScheme) {
	const pref = normalizePreference(preference);
	if (pref !== "system") return pref;
	return systemScheme === "dark" ? "dark" : "light";
}

/** The opposite of the scheme on screen, for a single-button toggle. */
export function flipScheme(scheme) {
	return scheme === "dark" ? "light" : "dark";
}
