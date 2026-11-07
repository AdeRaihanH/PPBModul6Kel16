import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Api } from "../services/api.js";
import { DataTable } from "../components/DataTable.js";
import { useLanguage } from "../i18n/LanguageProvider.js";
import { useTheme, useThemeContext, useThemedStyles } from "../theme/ThemeProvider.js";
import { PREFERENCES } from "../theme/scheme.js";

const MIN_THRESHOLD = -50;
const MAX_THRESHOLD = 100;
const HISTORY_PAGE_SIZE = 10;

const PREFERENCE_ICON = {
  system: "phone-portrait-outline",
  light: "sunny-outline",
  dark: "moon-outline",
};

const PREFERENCE_LABEL_KEY = {
  system: "control.prefSystem",
  light: "control.prefLight",
  dark: "control.prefDark",
};

function parseThreshold(text) {
  const normalized = text.trim().replace(",", ".");
  if (normalized === "") return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export function ControlScreen() {
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { t, formatNumber, formatDateTime } = useLanguage();
  const { preference, scheme, setPreference } = useThemeContext();
  const [thresholdText, setThresholdText] = useState("30");
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState({ threshold: false });
  const [submitting, setSubmitting] = useState(false);
  const [history, setHistory] = useState([]);
  const [latestThreshold, setLatestThreshold] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  // ponytail: the page lives in a ref too, so fetchHistory stays referentially
  // stable — a page change must not re-trigger useFocusEffect and double-fetch.
  const pageRef = useRef(1);

  const thresholdRef = useRef(null);
  const noteRef = useRef(null);
  const successTimer = useRef(null);

  useEffect(() => {
    return () => {
      if (successTimer.current) clearTimeout(successTimer.current);
    };
  }, []);

  const fetchHistory = useCallback(
    async (targetPage) => {
      let target = targetPage ?? pageRef.current;
      setLoading(true);
      setError(null);
      try {
        // The table may have shrunk since the page was fetched (a row deleted,
        // say) — clamp back into range instead of showing a page that can never
        // have data.
        let payload;
        for (;;) {
          payload = await Api.getThresholds({
            page: target,
            pageSize: HISTORY_PAGE_SIZE,
          });
          const lastPage = payload?.totalPages ?? 1;
          if (target <= lastPage) break;
          target = lastPage;
          pageRef.current = target;
          setPage(target);
        }

        const latest = await Api.getLatestThreshold();
        setHistory(payload?.data ?? []);
        setTotalPages(payload?.totalPages ?? 1);
        setLatestThreshold(typeof latest?.value === "number" ? latest.value : null);
      } catch (err) {
        setError(err.message || t("control.historyErrorDefault"));
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  const handlePageChange = useCallback(
    (nextPage) => {
      pageRef.current = nextPage;
      setPage(nextPage);
      fetchHistory(nextPage);
    },
    [fetchHistory],
  );

  useFocusEffect(
    useCallback(() => {
      fetchHistory();
    }, [fetchHistory])
  );

  const parsed = useMemo(() => parseThreshold(thresholdText), [thresholdText]);
  const thresholdError = useMemo(() => {
    if (parsed === null) {
      return t("control.rangeError", { min: MIN_THRESHOLD, max: MAX_THRESHOLD });
    }
    if (parsed < MIN_THRESHOLD || parsed > MAX_THRESHOLD) {
      return t("control.rangeError", { min: MIN_THRESHOLD, max: MAX_THRESHOLD });
    }
    return null;
  }, [parsed, t]);

  const showThresholdError = touched.threshold && thresholdError !== null;
  const canSave = !submitting && thresholdError === null;
  const noteCount = `${note.length}/140`;

  const handleSubmit = useCallback(async () => {
    Keyboard.dismiss();
    setTouched((t) => ({ ...t, threshold: true }));
    if (thresholdError !== null) {
      thresholdRef.current?.focus();
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await Api.createThreshold({ value: parsed, note: note.trim() });
      setNote("");
      setShowSuccess(true);
      if (successTimer.current) clearTimeout(successTimer.current);
      successTimer.current = setTimeout(() => setShowSuccess(false), 3000);
      // A new row lands at the top of the list — jump back to page 1 so it is
      // visible right away.
      pageRef.current = 1;
      setPage(1);
      await fetchHistory(1);
    } catch (err) {
      setError(err.message || t("control.errorDefault"));
    } finally {
      setSubmitting(false);
    }
  }, [thresholdError, parsed, note, fetchHistory, t]);

  return (
    <View style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={88}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          <View style={styles.card}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>{t("control.title")}</Text>
              {typeof latestThreshold === "number" ? (
                <View style={styles.currentPill} accessible accessibilityLabel={t("control.currentA11y", { value: formatNumber(latestThreshold) })}>
                  <Ionicons name="speedometer-outline" size={16} color={theme.color.text2} />
                  <Text style={styles.currentText}>
                    {t("control.current", { value: formatNumber(latestThreshold) })}
                  </Text>
                </View>
              ) : null}
            </View>

            {showSuccess ? (
              <View
                style={styles.successBanner}
                accessible
                accessibilityLiveRegion="polite"
                accessibilityLabel={t("control.saved")}
              >
                <Ionicons name="checkmark-circle" size={18} color={theme.color.successText} />
                <Text style={styles.successText}>{t("control.saved")}</Text>
              </View>
            ) : null}

            <View style={styles.field}>
              <Text
                style={styles.label}
                accessibilityLabel={t("control.thresholdA11y")}
              >
                {t("control.thresholdLabel")} <Text style={styles.required}>*</Text>
              </Text>
              <Text style={styles.helper}>{t("control.helper")}</Text>
              <TextInput
                ref={thresholdRef}
                style={[styles.input, showThresholdError && styles.inputError]}
                keyboardType="decimal-pad"
                returnKeyType="next"
                value={thresholdText}
                onChangeText={(next) => {
                  setThresholdText(next);
                  if (showSuccess) setShowSuccess(false);
                }}
                onBlur={() => setTouched((prev) => ({ ...prev, threshold: true }))}
                onSubmitEditing={() => noteRef.current?.focus()}
                accessibilityLabel={t("control.thresholdA11y")}
                accessibilityHint={t("control.rangeHint", {
                  min: MIN_THRESHOLD,
                  max: MAX_THRESHOLD,
                })}
                accessibilityState={{ invalid: showThresholdError }}
                maxLength={8}
                selectTextOnFocus
              />
              {showThresholdError ? (
                <Text style={styles.fieldError} accessibilityRole="alert">
                  {thresholdError}
                </Text>
              ) : null}
            </View>

            <View style={styles.field}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>{t("control.noteLabel")}</Text>
                <Text style={styles.counter}>{noteCount}</Text>
              </View>
              <TextInput
                ref={noteRef}
                style={[styles.input, styles.noteInput]}
                value={note}
                onChangeText={setNote}
                multiline
                numberOfLines={3}
                maxLength={140}
                placeholder={t("control.notePlaceholder")}
                placeholderTextColor={theme.color.text3}
                returnKeyType="done"
                accessibilityLabel={t("control.noteA11y")}
                accessibilityHint={t("control.noteHint")}
                onSubmitEditing={handleSubmit}
              />
            </View>

            {error ? (
              <View
                style={styles.errorBanner}
                accessible
                accessibilityLiveRegion="polite"
                accessibilityLabel={t("control.errorA11y", { message: error })}
              >
                <Ionicons name="alert-circle-outline" size={18} color={theme.color.dangerText} />
                <Text style={styles.errorBannerText}>{error}</Text>
              </View>
            ) : null}

            <Pressable
              style={({ pressed }) => [
                styles.button,
                !canSave && styles.buttonDisabled,
                pressed && canSave && styles.pressed,
              ]}
              onPress={handleSubmit}
              disabled={!canSave}
              accessibilityLabel={t("control.saveA11y")}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSave, busy: submitting }}
              accessibilityHint={t("control.saveHint")}
            >
              {submitting ? (
                <ActivityIndicator color={theme.color.onPrimary} />
              ) : (
                <Text style={styles.buttonText}>{t("control.save")}</Text>
              )}
            </Pressable>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t("control.historyTitle")}</Text>
          </View>
          <DataTable
            columns={[
              {
                key: "created_at",
                title: t("control.columnSavedAt"),
                flex: 1.4,
                render: (value) => (value ? formatDateTime(value) : "--"),
              },
              {
                key: "value",
                title: t("control.columnThreshold"),
                flex: 0.9,
                numeric: true,
                render: (value) => formatNumber(value),
              },
              {
                key: "note",
                title: t("control.columnNote"),
                flex: 1.1,
                render: (value) => value || "—",
              },
            ]}
            data={history}
            keyExtractor={(item) => item.id}
            loading={loading}
            page={page}
            totalPages={totalPages}
            onPageChange={handlePageChange}
            emptyTitle={t("control.emptyTitle")}
            emptyMessage={t("control.emptyMessage")}
          />

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t("control.appearanceTitle")}</Text>
          </View>

          <View style={styles.appearanceCard}>
            <Text style={styles.appearanceHint}>
              {preference === "system"
                ? t("control.followingSystem", {
                    mode: t("control.modeSystem"),
                  })
                : t("control.pinned", {
                    mode: t(PREFERENCE_LABEL_KEY[preference] ?? "control.prefSystem"),
                  })}
            </Text>

            <View style={styles.preferenceRow} accessibilityRole="radiogroup">
              {PREFERENCES.map((key) => {
                const active = preference === key;
                const prefName = t(
                  key === "system"
                    ? "control.prefSystem"
                    : key === "light"
                      ? "control.prefLight"
                      : "control.prefDark",
                );
                return (
                  <Pressable
                    key={key}
                    onPress={() => setPreference(key)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={t("control.prefA11y", { name: prefName })}
                    accessibilityHint={
                      key === "system"
                        ? t("control.prefSystemHint")
                        : t("control.prefExplicitHint", {
                            name: prefName.toLowerCase(),
                          })
                    }
                    hitSlop={6}
                    style={({ pressed }) => [
                      styles.preferenceOption,
                      active && styles.preferenceOptionActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Ionicons
                      name={PREFERENCE_ICON[key]}
                      size={16}
                      color={active ? theme.color.onPrimary : theme.color.text2}
                    />
                    <Text
                      style={[
                        styles.preferenceLabel,
                        active && styles.preferenceLabelActive,
                      ]}
                    >
                      {prefName}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.appearanceFootnote}>
              {t("control.appearanceFootnote", {
                mode: scheme === "dark" ? t("control.modeDark") : t("control.modeLight"),
              })}
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const makeStyles = ({ color, space, radius, shadow, type, hit }) =>
  StyleSheet.create({
  appearanceCard: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.card,
    borderCurve: "continuous",
    padding: space.lg,
    gap: space.md,
    boxShadow: shadow.card,
  },
  appearanceHint: {
    fontSize: 13,
    color: color.text2,
  },
  preferenceRow: {
    flexDirection: "row",
    gap: space.sm,
  },
  preferenceOption: {
    flex: 1,
    minHeight: hit,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.input,
    borderCurve: "continuous",
    backgroundColor: color.surface2,
    paddingVertical: 10,
  },
  preferenceOptionActive: {
    backgroundColor: color.primary,
    borderColor: color.primary,
  },
  preferenceLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: color.text2,
  },
  preferenceLabelActive: {
    color: color.onPrimary,
  },
  appearanceFootnote: {
    fontSize: 12,
    color: color.text3,
  },
  safe: {
    flex: 1,
    backgroundColor: color.bg,
  },
  flex: {
    flex: 1,
  },
  container: {
    padding: space.lg,
    paddingBottom: 32,
    gap: space.lg,
    backgroundColor: color.bg,
  },
  card: {
    backgroundColor: color.surface,
    padding: space.xl,
    borderRadius: radius.card,
    borderCurve: "continuous",
    gap: space.lg,
    borderWidth: 1,
    borderColor: color.border,
    boxShadow: shadow.card,
  },
  title: {
    fontSize: type.title,
    fontWeight: "700",
    color: color.text,
    letterSpacing: -0.5,
  },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: space.sm,
  },
  currentPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    backgroundColor: color.surface2,
    borderRadius: radius.pill,
    borderCurve: "continuous",
    paddingVertical: 6,
    paddingHorizontal: space.md,
  },
  currentText: {
    fontSize: 13,
    fontWeight: "600",
    color: color.text2,
    fontVariant: ["tabular-nums"],
  },
  successBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    backgroundColor: color.successBg,
    borderWidth: 1,
    borderColor: color.successBorder,
    borderRadius: radius.input,
    borderCurve: "continuous",
    padding: space.md,
  },
  successText: {
    fontSize: 14,
    fontWeight: "600",
    color: color.successText,
  },
  field: {
    gap: space.sm,
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: color.text,
  },
  required: {
    color: color.dangerText,
  },
  counter: {
    fontSize: 12,
    color: color.text3,
    fontVariant: ["tabular-nums"],
  },
  helper: {
    fontSize: 13,
    color: color.text2,
  },
  input: {
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.input,
    borderCurve: "continuous",
    paddingVertical: 12,
    paddingHorizontal: 14,
    minHeight: 48,
    fontSize: 17,
    color: color.text,
    backgroundColor: color.surface,
    fontVariant: ["tabular-nums"],
  },
  inputError: {
    borderColor: color.dangerText,
  },
  fieldError: {
    fontSize: 13,
    color: color.dangerText,
  },
  noteInput: {
    minHeight: 64,
    textAlignVertical: "top",
    // ponytail: gap between wrapped lines only — py trimmed via minHeight/padding
    lineHeight: 22,
    paddingVertical: 8,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    backgroundColor: color.dangerBg,
    borderWidth: 1,
    borderColor: color.dangerBorder,
    borderRadius: radius.input,
    borderCurve: "continuous",
    padding: space.md,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 14,
    color: color.dangerText,
  },
  button: {
    minHeight: 52,
    backgroundColor: color.primary,
    borderRadius: radius.cta,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  buttonText: {
    color: color.onPrimary,
    fontWeight: "600",
    fontSize: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    // ponytail: same rhythm as Monitoring history (taller above, tucked below)
    marginTop: space.md,
    marginBottom: -space.sm,
  },
  sectionTitle: {
    fontSize: type.section,
    fontWeight: "700",
    color: color.text,
  },
});

