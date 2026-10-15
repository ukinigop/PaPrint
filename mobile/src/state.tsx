import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Crypto from "expo-crypto";
import * as api from "./api";
import type { Account, Order, Shop, PrintFile, Settings } from "./types";

export const defaults: Settings = {
  paper: "A4",
  color: "Black & white",
  sides: "Single-sided",
  copies: 1,
  pageRange: "",
  finishing: "No binding",
};
function useAppState() {
  const [user, setUser] = useState<Account | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [shops, setShops] = useState<Shop[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [workspace, setWorkspace] = useState<Shop | null>(null);
  const [ownerOrders, setOwnerOrders] = useState<Order[]>([]);
  const [maxUploadBytes, setMaxUploadBytes] = useState(3 * 1024 * 1024);
  const [draft, setDraft] = useState<{
    shop: Shop | null;
    files: PrintFile[];
    settings: Settings;
    notes: string;
    requestKey: string;
  }>({ shop: null, files: [], settings: defaults, notes: "", requestKey: "" });
  const [notificationMessage, setNotificationMessage] = useState("");
  const polling = useRef(false);
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);
  const seen = useRef(new Set<string>());
  useEffect(() => {
    let active = true;
    api
      .restoreAccount()
      .then((u) => {
        if (active) setUser(u);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setRestoring(false);
      });
    const off = api.onSessionExpired(() => {
      setUser(null);
      setOrders([]);
      setOwnerOrders([]);
      setWorkspace(null);
      setError("Your session ended. Please log in again.");
    });
    return () => {
      active = false;
      off();
    };
  }, []);
  async function refresh() {
    const currentUser = userRef.current;
    if (!currentUser || polling.current) return;
    polling.current = true;
    try {
      const [list, history, config] = await Promise.all([
        api.request<Shop[]>("/shops"),
        api.request<Order[]>("/orders"),
        api.request<{ maxUploadBytes: number }>("/config"),
      ]);
      if (userRef.current?.id !== currentUser.id) return;
      setShops(list);
      setOrders(history);
      setMaxUploadBytes(config.maxUploadBytes);
      if (currentUser.accountType === "owner") {
        const shop = await api.request<Shop | null>("/workspace");
        if (userRef.current?.id !== currentUser.id) return;
        setWorkspace(shop);
        setOwnerOrders(
          shop ? await api.request<Order[]>("/workspace/orders") : [],
        );
      }
      if (Platform.OS !== "web") {
        const N = await import("expo-notifications");
        const permitted = (await N.getPermissionsAsync()).granted;
        const stored = new Set<string>(
          JSON.parse(
            (await AsyncStorage.getItem(
              "paprint.notified." + currentUser.id,
            )) || "[]",
          ),
        );
        for (const o of history.filter(
          (o) => o.readyAt && !stored.has(o._id) && !seen.current.has(o._id),
        )) {
          seen.current.add(o._id);
          stored.add(o._id);
          if (permitted && o.pushState !== "sent")
            await N.scheduleNotificationAsync({
              content: {
                title: "Your prints are ready!",
                body: o.shop.name + " · Pickup code " + o.pickupCode,
                data: { orderId: o._id },
              },
              trigger: null,
            });
        }
        await AsyncStorage.setItem(
          "paprint.notified." + currentUser.id,
          JSON.stringify([...stored]),
        );
      }
      setError("");
    } finally {
      polling.current = false;
    }
  }
  useEffect(() => {
    if (!user) return;
    const update = () => {
      if (AppState.currentState === "active")
        void refresh().catch((e) => setError(e.message));
    };
    const initial = setTimeout(() => {
      setLoading(true);
      void refresh()
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    }, 0);
    const timer = setInterval(update, 8000);
    const sub = AppState.addEventListener("change", update);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
      sub.remove();
    };
    // Refresh follows account identity; data updates do not restart the poller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);
  async function signOut() {
    try {
      await api.signOut();
    } finally {
      setUser(null);
      setOrders([]);
      setWorkspace(null);
      setOwnerOrders([]);
      setError("");
      setDraft({
        shop: null,
        files: [],
        settings: defaults,
        notes: "",
        requestKey: "",
      });
    }
  }
  function begin(shop: Shop) {
    setDraft({
      shop,
      files: [],
      settings: { ...defaults, paper: user?.defaultPaper || "A4" },
      notes: "",
      requestKey: Crypto.randomUUID(),
    });
  }
  async function updateProfile(data: Partial<Account>) {
    const next = await api.request<Account>("/auth/me", {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    setUser(next);
  }
  async function enableNotifications() {
    if (Platform.OS === "web") {
      setNotificationMessage(
        "Pickup updates appear in Orders. Phone alerts are available in the mobile app.",
      );
      return;
    }
    const N = await import("expo-notifications");
    N.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    if (Platform.OS === "android")
      await N.setNotificationChannelAsync("pickup", {
        name: "Pickup notifications",
        importance: N.AndroidImportance.HIGH,
      });
    if (!(await N.requestPermissionsAsync()).granted) {
      setNotificationMessage(
        "Alerts are disabled. Your pickup updates are still available in Orders.",
      );
      return;
    }
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ||
      Constants.easConfig?.projectId;
    if (!projectId || Constants.executionEnvironment === "storeClient") {
      setNotificationMessage(
        "Alerts enabled while the app is open. Background push needs a configured development build.",
      );
      return;
    }
    const pushToken = (await N.getExpoPushTokenAsync({ projectId })).data;
    await api.request("/device", {
      method: "POST",
      body: JSON.stringify({ pushToken }),
    });
    setNotificationMessage("Pickup alerts enabled.");
  }
  return {
    user,
    setUser,
    restoring,
    error,
    setError,
    loading,
    shops,
    orders,
    setOrders,
    workspace,
    setWorkspace,
    ownerOrders,
    setOwnerOrders,
    refresh,
    maxUploadBytes,
    draft,
    setDraft,
    begin,
    signOut,
    updateProfile,
    notificationMessage,
    enableNotifications,
  };
}
type State = ReturnType<typeof useAppState>;
const Context = createContext<State | null>(null);
export function AppProvider({ children }: { children: React.ReactNode }) {
  const state = useAppState();
  return <Context.Provider value={state}>{children}</Context.Provider>;
}
export function useApp() {
  const state = useContext(Context);
  if (!state) throw new Error("AppProvider is missing");
  return state;
}
