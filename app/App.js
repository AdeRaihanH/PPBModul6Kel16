import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
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
import { assertConfig } from "./src/services/config.js";
import { ThemeProvider, useTheme, useThemeContext } from "./src/theme/ThemeProvider.js";

const Tab = createBottomTabNavigator();

enableScreens(true);

// Header button: one tap flips between light and dark and stops following the
// system, which is what people expect from a single control.
function ThemeToggle() {
	const theme = useTheme();
	const { scheme, toggle } = useThemeContext();
	const next = scheme === "dark" ? "light" : "dark";

	return (
		<Pressable
			onPress={toggle}
			accessibilityRole="button"
			accessibilityLabel={`Switch to ${next} mode`}
			hitSlop={12}
			style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}
		>
			<View
				style={[
					styles.toggleTrack,
					{
						backgroundColor: theme.color.surface2,
						borderColor: theme.color.border,
					},
				]}
			>
				<View
					style={[
						styles.toggleKnob,
						{
							backgroundColor: theme.color.surface,
							transform: [{ translateX: scheme === "dark" ? 18 : 0 }],
						},
					]}
				/>
				<Ionicons
					name="sunny-outline"
					size={11}
					color={scheme === "dark" ? theme.color.text3 : theme.color.warnText}
					style={styles.toggleIcon}
				/>
				<Ionicons
					name="moon-outline"
					size={11}
					color={scheme === "dark" ? theme.color.primary : theme.color.text3}
					style={styles.toggleIcon}
				/>
			</View>
		</Pressable>
	);
}

function AppShell() {
	const theme = useTheme();
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
						headerTitle: "LiveTemp",
						headerTitleAlign: "left",
						headerTintColor: color.text,
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
						headerRight: () => <ThemeToggle />,
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
					<Tab.Screen name="Monitoring" component={MonitoringScreen} />
					<Tab.Screen name="Control" component={ControlScreen} />
				</Tab.Navigator>
			</NavigationContainer>
		</SafeAreaProvider>
	);
}

export default function App() {
	return (
		<ThemeProvider>
			<AppShell />
		</ThemeProvider>
	);
}

const styles = StyleSheet.create({
	toggle: {
		marginRight: 12,
		minHeight: 32,
		justifyContent: "center",
	},
	toggleTrack: {
		width: 44,
		height: 24,
		borderRadius: 999,
		borderWidth: 1,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-around",
		paddingHorizontal: 3,
	},
	toggleKnob: {
		position: "absolute",
		left: 3,
		width: 18,
		height: 18,
		borderRadius: 9,
	},
	toggleIcon: {
		opacity: 0.9,
	},
	pressed: {
		opacity: 0.7,
	},
});
