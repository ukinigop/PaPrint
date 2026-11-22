import React, { useEffect } from "react";
import { Stack, router } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Platform, View } from "react-native";
import { useFonts } from "expo-font";
import { Manrope_500Medium } from "@expo-google-fonts/manrope/500Medium";
import { Manrope_600SemiBold } from "@expo-google-fonts/manrope/600SemiBold";
import { Manrope_700Bold } from "@expo-google-fonts/manrope/700Bold";
import { DMSans_700Bold } from "@expo-google-fonts/dm-sans/700Bold";
import { FontsReady } from "./src/ui";
import { AppProvider, useApp } from "./src/state";
import { AccountLoading } from "./src/AccountScreen";
import { AppearanceProvider, useAppearance } from "./src/Appearance";
import { CustomerTabBar } from "./src/CustomerTabBar";
function Navigator() {
  const { colors } = useAppearance();
  const { user } = useApp();
  useEffect(() => {
    if (Platform.OS === "web") return;
    let stopped = false;
    let remove = () => {};
    void import("expo-notifications").then((N) => {
      if (stopped) return;
      const sub = N.addNotificationResponseReceivedListener(() =>
        router.push("/orders"),
      );
      remove = () => sub.remove();
    });
    return () => {
      stopped = true;
      remove();
    };
  }, []);
  return (
    <View style={{ flex: 1, backgroundColor: colors.outer }}>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "none",
          contentStyle: { backgroundColor: colors.surface },
        }}
      />
      <CustomerTabBar key={user?.id || "signed-out"} />
    </View>
  );
}
function AppContent({ ready }: { ready: boolean }) {
  const { scheme } = useAppearance();
  return (
    <>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      {ready ? <Navigator /> : <AccountLoading />}
    </>
  );
}
export default function App() {
  const [loaded, error] = useFonts({
    DMSans_700Bold,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
  });
  return (
    <SafeAreaProvider>
      <AppearanceProvider>
        <FontsReady.Provider value={loaded}>
          <AppProvider>
            <AppContent ready={loaded || !!error} />
          </AppProvider>
        </FontsReady.Provider>
      </AppearanceProvider>
    </SafeAreaProvider>
  );
}
