import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Platform, useColorScheme } from "react-native";
import { darkColors, lightColors, type Palette } from "./theme";

export const appearanceOptions = ["System", "Light", "Dark"] as const;
type Preference = (typeof appearanceOptions)[number];
type Scheme = "light" | "dark";
const storageKey = "paprint.appearance";

function readPreference(value: string | null): Preference {
  return value === "Light" || value === "Dark" ? value : "System";
}

const AppearanceContext = createContext<{
  preference: Preference;
  setPreference: (next: Preference) => void;
  scheme: Scheme;
  colors: Palette;
}>({
  preference: "System",
  setPreference: () => {},
  scheme: "light",
  colors: lightColors,
});

export function AppearanceProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const system = useColorScheme();
  const selected = useRef(false);
  const [preference, setPreference] = useState<Preference>(() => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      try {
        return readPreference(window.localStorage.getItem(storageKey));
      } catch {
        return "System";
      }
    }
    return "System";
  });
  useEffect(() => {
    if (Platform.OS === "web") return;
    let active = true;
    void AsyncStorage.getItem(storageKey)
      .then((value) => {
        if (active && !selected.current) setPreference(readPreference(value));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const scheme =
    preference === "Dark" || (preference === "System" && system === "dark")
      ? "dark"
      : "light";
  const colors = scheme === "dark" ? darkColors : lightColors;
  useEffect(() => {
    if (Platform.OS === "web" && typeof document !== "undefined") {
      document.documentElement.style.colorScheme = scheme;
      document.documentElement.style.backgroundColor = colors.outer;
    }
  }, [scheme, colors.outer]);

  function select(next: Preference) {
    selected.current = true;
    setPreference(next);
    if (Platform.OS === "web" && typeof window !== "undefined") {
      try {
        window.localStorage.setItem(storageKey, next);
      } catch {
        // The current session can still use the selected appearance.
      }
    } else {
      void AsyncStorage.setItem(storageKey, next).catch(() => {});
    }
  }

  return (
    <AppearanceContext.Provider
      value={{ preference, setPreference: select, scheme, colors }}
    >
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance() {
  return useContext(AppearanceContext);
}
