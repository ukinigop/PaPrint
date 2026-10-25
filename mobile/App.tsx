import React, { useEffect } from "react";
import { Stack, router } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Platform, View } from "react-native";
import { useFonts } from "expo-font";
import { Manrope_500Medium } from "@expo-google-fonts/manrope/500Medium";
import { Manrope_600SemiBold } from "@expo-google-fonts/manrope/600SemiBold";
import { Manrope_700Bold } from "@expo-google-fonts/manrope/700Bold";
import { FontsReady } from "./src/ui";
import { AppProvider, useApp } from "./src/state";
import { MotionPreference } from "./src/motion";
import { AccountLoading } from "./src/AccountScreen";
import { colors } from "./src/theme";
import { CustomerTabBar } from "./src/CustomerTabBar";
function Navigator() {
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
    <MotionPreference.Provider value={user?.reducedMotion || false}>
      <StatusBar style="dark" />
      <View style={{ flex: 1, backgroundColor: colors.surface }}>
        <Stack
          screenOptions={{
            headerShown: false,
            animation: "none",
            contentStyle: { backgroundColor: colors.surface },
          }}
        />
        <CustomerTabBar key={user?.id || "signed-out"} />
      </View>
    </MotionPreference.Provider>
  );
}
export default function App() {
  const [loaded, error] = useFonts({
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
  });
  return (
    <SafeAreaProvider>
      <FontsReady.Provider value={loaded}>
        <AppProvider>
          {loaded || error ? <Navigator /> : <AccountLoading />}
        </AppProvider>
      </FontsReady.Provider>
    </SafeAreaProvider>
  );
}
