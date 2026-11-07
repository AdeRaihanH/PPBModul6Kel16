import { useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import {
	NavigationContainer,
	DarkTheme,
	DefaultTheme,
} from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { StatusBar } from "expo-status-bar";
import Ionicons from "@expo/vector-icons/Ionicons";
import { enableScreens } from "react-native-screens";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { MonitoringScreen } from "./src/screens/MonitoringScreen.js";
import { ControlScreen } from "./src/screens/ControlScreen.js";
import { LanguageToggle } from "./src/components/LanguageToggle.js";
import { LanguageProvider, useLanguage } from "./src/i18n/LanguageProvider.js";
import { assertConfig } from "./src/services/config.js";
import {
	ThemeProvider,
	useTheme,
	useThemeContext,
} from "./src/theme/ThemeProvider.js";

const Tab = createBottomTabNavigator();

enableScreens(true);

// Header button: one tap flips between light and dark. The track is deliberately
// large enough to hit comfortably, and the knob slides so the state is readable at
// a glance without relying on the icons alone.
function ThemeToggle() {
	const theme = useTheme();
	const { t } = useLanguage();
	const { scheme, toggle } = useThemeContext();
	const isDark = scheme === "dark";

	return (
		<Pressable
			onPress={toggle}
			accessibilityRole="switch"
			accessibilityState={{ checked: isDark }}
			accessibilityLabel={`${t("theme.label")} ${isDark ? t("theme.on") : t("theme.off")}`}
			accessibilityHint={isDark ? t("theme.switchToLight") : t("theme.switchToDark")}
			hitSlop={10}
			style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}
		>
			<View
				style={[
					styles.toggleTrack,
					{
						backgroundColor: isDark ? theme.color.primary : theme.color.surface2,
						borderColor: isDark ? theme.color.primary : theme.color.border,
					},
				]}
			>
				<View
					style={[
						styles.toggleKnob,
						{
							backgroundColor: isDark ? theme.color.onPrimary : theme.color.surface,
							transform: [{ translateX: isDark ? 22 : 0 }],
						},
					]}
				/>
				<Ionicons
					name="sunny-outline"
					size={13}
					color={isDark ? theme.color.onPrimary : theme.color.warnText}
					style={styles.toggleIcon}
				/>
				<Ionicons
					name="moon-outline"
					size={13}
					color={isDark ? theme.color.onPrimary : theme.color.text3}
					style={styles.toggleIcon}
				/>
			</View>
		</Pressable>
	);
}

function AppShell() {
	const theme = useTheme();
	const { t } = useLanguage();
	const { color } = theme;

	useEffect(() => {
		assertConfig();
	}, []);

	const base = theme.scheme === "dark" ? DarkTheme : DefaultTheme;
	const navigationTheme = {
		...base,
		colors: {
			...base.colors,
			background: color.bg,
			card: color.surface,
			text: color.text,
			border: color.border,
			primary: color.primary,
			notification: color.dangerText,
		},
	};

	return (
		<SafeAreaProvider>
			{/* Light icons on a dark background, and the reverse. */}
			<StatusBar style={theme.scheme === "dark" ? "light" : "dark"} />
			<NavigationContainer theme={navigationTheme}>
				<Tab.Navigator
					screenOptions={({ route }) => ({
						headerShown: true,
						headerTitle: t("app.name"),
						headerTitleAlign: "left",
						headerTintColor: color.text,
						headerRight: () => (
							<View style={styles.headerToggles}>
								<LanguageToggle />
								<ThemeToggle />
							</View>
						),
						headerStyle: {
							backgroundColor: color.surface,
							borderBottomWidth: 1,
							borderBottomColor: color.border,
						},
						headerTitleStyle: {
							fontWeight: "600",
							fontSize: 17,
							// ponytail: system monospace, no custom font dep
							fontFamily: "monospace",
							letterSpacing: -0.5,
						},
						tabBarActiveTintColor: color.primary,
						tabBarInactiveTintColor: color.text2,
						tabBarLabelStyle: { fontSize: 12, fontWeight: "500" },
						tabBarStyle: {
							backgroundColor: color.surface,
							borderTopWidth: 1,
							borderTopColor: color.border,
						},
						tabBarHideOnKeyboard: true,
						tabBarIcon: ({ color: iconColor }) => {
							const iconName = route.name === "Monitoring" ? "pulse" : "options";
							return <Ionicons name={iconName} size={24} color={iconColor} />;
						},
					})}
				>
					<Tab.Screen
						name="Monitoring"
						component={MonitoringScreen}
						options={{ tabBarLabel: t("tabs.monitoring") }}
					/>
					<Tab.Screen
						name="Control"
						component={ControlScreen}
						options={{ tabBarLabel: t("tabs.control") }}
					/>
				</Tab.Navigator>
			</NavigationContainer>
		</SafeAreaProvider>
	);
}

export default function App() {
	return (
		<LanguageProvider>
			<ThemeProvider>
				<AppShell />
			</ThemeProvider>
		</LanguageProvider>
	);
}

const styles = StyleSheet.create({
	headerToggles: {
		flexDirection: "row",
		alignItems: "center",
		marginRight: 4,
	},
	toggle: {
		marginRight: 12,
		minHeight: 44,
		justifyContent: "center",
	},
	toggleTrack: {
		width: 56,
		height: 30,
		borderRadius: 999,
		borderWidth: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-around",
		paddingHorizontal: 4,
	},
	toggleKnob: {
		position: "absolute",
		left: 4,
		width: 22,
		height: 22,
		borderRadius: 11,
	},
	toggleIcon: {
		opacity: 0.95,
	},
	pressed: {
		opacity: 0.7,
	},
});
