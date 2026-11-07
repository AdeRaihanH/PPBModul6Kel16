import { useEffect } from "react";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import Ionicons from "@expo/vector-icons/Ionicons";
import { enableScreens } from "react-native-screens";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { MonitoringScreen } from "./src/screens/MonitoringScreen.js";
import { ControlScreen } from "./src/screens/ControlScreen.js";
import { LanguageToggle } from "./src/components/LanguageToggle.js";
import { LanguageProvider, useLanguage } from "./src/i18n/LanguageProvider.js";
import { assertConfig } from "./src/services/config.js";
import { tokens } from "./src/theme/tokens.js";

const Tab = createBottomTabNavigator();
const { color } = tokens;

enableScreens(true);

function Tabs() {
  const { t } = useLanguage();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: true,
        headerTitle: t("app.name"),
        headerTitleAlign: "left",
        headerTintColor: color.text,
        headerRight: () => <LanguageToggle />,
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
  );
}

export default function App() {
  useEffect(() => {
    assertConfig();
  }, []);

  const theme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: color.bg,
      card: color.surface,
      text: color.text,
      border: color.border,
      primary: color.primary,
    },
  };

  return (
    <SafeAreaProvider>
      <LanguageProvider>
        <NavigationContainer theme={theme}>
          <Tabs />
        </NavigationContainer>
      </LanguageProvider>
    </SafeAreaProvider>
  );
}
