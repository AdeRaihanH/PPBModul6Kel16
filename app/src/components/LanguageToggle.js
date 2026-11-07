import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useLanguage } from "../i18n/LanguageProvider.js";
import { useTheme, useThemedStyles } from "../theme/ThemeProvider.js";

const TRACK_WIDTH = 60;
const TRACK_HEIGHT = 30;
const KNOB_SIZE = 24;
const PADDING = 3;
const KNOB_TRAVEL = TRACK_WIDTH - KNOB_SIZE - PADDING * 2;

// Two-state switch: knob on the left = Indonesian, on the right = English.
export function LanguageToggle() {
  const { language, toggleLanguage, t } = useLanguage();
  const theme = useTheme();
  const styles = useThemedStyles(makeStyles);
  const reduceMotion = useReducedMotion();
  const isEnglish = language === "en";
  const offset = useSharedValue(isEnglish ? KNOB_TRAVEL : 0);

  useEffect(() => {
    const next = isEnglish ? KNOB_TRAVEL : 0;
    offset.value = reduceMotion
      ? next
      : withTiming(next, { duration: 220 });
  }, [isEnglish, offset, reduceMotion]);

  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }],
  }));

  return (
    <Pressable
      onPress={toggleLanguage}
      accessibilityRole="switch"
      accessibilityState={{ checked: isEnglish }}
      accessibilityLabel={t("language.label")}
      accessibilityHint={
        isEnglish ? t("language.switchToIndonesian") : t("language.switchToEnglish")
      }
      hitSlop={10}
      style={({ pressed }) => [styles.pressable, pressed && styles.pressed]}
    >
      <View
        style={[
          styles.track,
          {
            backgroundColor: isEnglish ? theme.color.primary : theme.color.surface2,
            borderColor: isEnglish ? theme.color.primary : theme.color.border,
          },
        ]}
      >
        <Text
          style={[
            styles.label,
            styles.labelLeft,
            { color: isEnglish ? theme.color.text3 : theme.color.onPrimary },
          ]}
        >
          ID
        </Text>
        <Text
          style={[
            styles.label,
            styles.labelRight,
            { color: isEnglish ? theme.color.onPrimary : theme.color.text3 },
          ]}
        >
          EN
        </Text>
        <Animated.View style={[styles.knob, knobStyle]} pointerEvents="none" />
      </View>
    </Pressable>
  );
}

const makeStyles = ({ color }) =>
  StyleSheet.create({
    pressable: {
      marginRight: 10,
      minHeight: 44,
      justifyContent: "center",
    },
    pressed: {
      opacity: 0.9,
      transform: [{ scale: 0.97 }],
    },
    track: {
      width: TRACK_WIDTH,
      height: TRACK_HEIGHT,
      borderRadius: 999,
      borderCurve: "continuous",
      padding: PADDING,
      justifyContent: "center",
      borderWidth: 1,
    },
    knob: {
      position: "absolute",
      top: PADDING,
      left: PADDING,
      width: KNOB_SIZE,
      height: KNOB_SIZE,
      borderRadius: KNOB_SIZE / 2,
      backgroundColor: color.surface,
      boxShadow: "0 1px 2px rgba(15,23,42,0.25)",
    },
    label: {
      position: "absolute",
      top: 0,
      bottom: 0,
      width: KNOB_SIZE,
      textAlign: "center",
      textAlignVertical: "center",
      fontSize: 11,
      fontWeight: "700",
      lineHeight: KNOB_SIZE + 2,
    },
    labelLeft: {
      left: PADDING,
    },
    labelRight: {
      right: PADDING,
    },
  });
