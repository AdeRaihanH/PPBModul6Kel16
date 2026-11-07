import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DEFAULT_LANGUAGE,
  LANGUAGE_STORAGE_KEY,
  formatDateTime,
  formatNumber,
  normalizeLanguage,
  translate,
} from "./strings.js";

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  // Seed with the default so the first frame never renders an undefined language.
  const [language, setLanguage] = useState(DEFAULT_LANGUAGE);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
        const normalized = normalizeLanguage(stored);
        if (!cancelled && normalized) setLanguage(normalized);
      } catch {
        // storage unavailable — keep the default language
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const changeLanguage = useCallback((next) => {
    const normalized = normalizeLanguage(next);
    if (!normalized) return;
    setLanguage(normalized);
    AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, normalized).catch(() => {});
  }, []);

  const toggleLanguage = useCallback(() => {
    changeLanguage(language === "id" ? "en" : "id");
  }, [language, changeLanguage]);

  const value = useMemo(
    () => ({
      language,
      isIndonesian: language === "id",
      setLanguage: changeLanguage,
      toggleLanguage,
      t: (key, vars) => translate(language, key, vars),
      formatNumber: (n, digits) => formatNumber(n, language, digits),
      formatDateTime: (d) => formatDateTime(d, language),
    }),
    [language, changeLanguage, toggleLanguage],
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage must be used inside <LanguageProvider>");
  }
  return ctx;
}
