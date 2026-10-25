import React, {
  createContext,
  useCallback,
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
import type { Account, Order, Shop } from "./types";
import { latestWorkspace } from "./ownerForm";
import { tabDraftCache } from "./draftCache";
import {
  defaults,
  emptyDraft,
  completeDraft,
  StaleSessionError,
  type Draft,
} from "./customerFlow";
export { defaults } from "./customerFlow";
function useAppState() {
  const [user, storeUser] = useState<Account | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [error, setError] = useState("");
  const [refreshError, setRefreshError] = useState("");
  const [loading, setLoading] = useState(false);
  const [shops, setShops] = useState<Shop[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [workspace, storeWorkspace] = useState<Shop | null>(null);
  const setWorkspace = useCallback(
    (next: React.SetStateAction<Shop | null>) => {
      storeWorkspace((previous) =>
        latestWorkspace(
          previous,
          typeof next === "function" ? next(previous) : next,
        ),
      );
    },
    [],
  );
  const [ownerOrders, setOwnerOrders] = useState<Order[]>([]);
  const [maxUploadBytes, setMaxUploadBytes] = useState(3 * 1024 * 1024);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [notificationMessage, setNotificationMessage] = useState("");
  const polling = useRef(false);
  const refreshRevision = useRef(0);
  const userRef = useRef(user);
  const bookmarkQueue = useRef<Promise<void>>(Promise.resolve());
  const seen = useRef(new Set<string>());
  const setUser = useCallback(
    (next: Account | null) => {
      if (
        userRef.current?.id !== next?.id ||
        userRef.current?.accountType !== next?.accountType
      ) {
        if (userRef.current)
          tabDraftCache.clear(userRef.current.id, api.baseUrl);
        if (next) tabDraftCache.clear(next.id, api.baseUrl);
        refreshRevision.current++;
        polling.current = false;
        setLoading(false);
        setShops([]);
        setOrders([]);
        setOwnerOrders([]);
        setWorkspace(null);
        setDraft(emptyDraft());
        setNotificationMessage("");
        seen.current.clear();
        setError("");
        setRefreshError("");
      }
      userRef.current = next;
      storeUser(next);
    },
    [setWorkspace],
  );
  useEffect(() => {
    let active = true;
    api
      .restoreAccount()
      .then((u) => {
        if (active) {
          const recovered = u
            ? tabDraftCache.read(u.id, api.baseUrl)
            : emptyDraft();
          setUser(u);
          setDraft(recovered);
        }
      })
      .catch((e) => {
        if (active && !(e instanceof StaleSessionError)) setError(e.message);
      })
      .finally(() => {
        if (active) setRestoring(false);
      });
    const off = api.onSessionExpired(() => {
      setUser(null);
      setError("Your session ended. Please log in again.");
    });
    return () => {
      active = false;
      off();
    };
  }, [setUser]);
  useEffect(() => {
    if (!restoring && user && userRef.current?.id === user.id)
      tabDraftCache.write(user.id, api.baseUrl, draft);
  }, [draft, user, restoring]);
  async function refresh(force = false, background = false) {
    const currentUser = userRef.current;
    if (
      !currentUser ||
      currentUser.accountType === "admin" ||
      (polling.current && !force)
    )
      return;
    polling.current = true;
    if (!background) setLoading(true);
    const revision = ++refreshRevision.current;
    const sessionCurrent = api.captureSession();
    const current = () =>
      sessionCurrent() &&
      userRef.current?.id === currentUser.id &&
      revision === refreshRevision.current;
    try {
      const [list, history, config] = await Promise.all([
        api.request<Shop[]>("/shops"),
        api.request<Order[]>("/orders"),
        api.request<{ maxUploadBytes: number }>("/config"),
      ]);
      if (!current()) return;
      setShops(list);
      setOrders(history);
      setMaxUploadBytes(config.maxUploadBytes);
      if (currentUser.accountType === "owner") {
        const shop = await api.request<Shop | null>("/workspace");
        if (!current()) return;
        setWorkspace(shop);
        const queue = shop
          ? await api.request<Order[]>("/workspace/orders")
          : [];
        if (!current()) return;
        setOwnerOrders(queue);
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
        if (!current()) return;
        for (const o of history.filter(
          (o) => o.readyAt && !stored.has(o._id) && !seen.current.has(o._id),
        )) {
          if (!current()) return;
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
        if (!current()) return;
        await AsyncStorage.setItem(
          "paprint.notified." + currentUser.id,
          JSON.stringify([...stored]),
        );
      }
      if (current()) setRefreshError("");
    } catch (e) {
      if (current() && !(e instanceof StaleSessionError))
        setRefreshError(
          e instanceof Error ? e.message : "Could not refresh your orders.",
        );
    } finally {
      if (revision === refreshRevision.current) {
        polling.current = false;
        setLoading(false);
      }
    }
  }
  useEffect(() => {
    if (!user || user.accountType === "admin") return;
    const update = () => {
      if (AppState.currentState === "active") void refresh(false, true);
    };
    const initial = setTimeout(() => {
      void refresh();
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
    setUser(null);
    await api.signOut();
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
    const current = api.captureSession();
    const previousSaved = userRef.current?.savedShops || [];
    const next = await api.request<Account>("/auth/me", {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    if (current()) {
      setUser(next);
      if (data.savedShops)
        setShops((shops) =>
          shops.map((shop) => ({
            ...shop,
            savedCount: Math.max(
              0,
              (shop.savedCount || 0) +
                Number(next.savedShops.includes(shop._id)) -
                Number(previousSaved.includes(shop._id)),
            ),
          })),
        );
    }
  }
  function toggleBookmark(shopId: string) {
    const current = api.captureSession();
    const next = bookmarkQueue.current
      .catch(() => {})
      .then(async () => {
        if (!current()) throw new StaleSessionError();
        const saved = userRef.current?.savedShops || [];
        await updateProfile({
          savedShops: saved.includes(shopId)
            ? saved.filter((id) => id !== shopId)
            : [...saved, shopId],
        });
        if (current()) await refresh(true, true);
      });
    bookmarkQueue.current = next;
    return next;
  }
  function completeBooking(order: Order, requestKey: string) {
    setOrders((previous) => [
      order,
      ...previous.filter((item) => item._id !== order._id),
    ]);
    setDraft((current) => completeDraft(current, requestKey));
  }
  async function enableNotifications() {
    const current = api.captureSession();
    if (Platform.OS === "web") {
      setNotificationMessage(
        "Pickup updates appear in Orders. Phone alerts are available in the mobile app.",
      );
      return;
    }
    const N = await import("expo-notifications");
    if (!current()) return;
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
      if (!current()) return;
      setNotificationMessage(
        "Alerts are disabled. Your pickup updates are still available in Orders.",
      );
      return;
    }
    if (!current()) return;
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
    if (!current()) return;
    await api.request("/device", {
      method: "POST",
      body: JSON.stringify({ pushToken }),
    });
    setNotificationMessage("Pickup alerts enabled.");
  }
  // Context callbacks retained by an old screen must not write into a new account.
  function scopedSetter<T>(setter: React.Dispatch<React.SetStateAction<T>>) {
    const current = api.captureSession();
    const accountId = user?.id;
    const active = () => current() && userRef.current?.id === accountId;
    return (next: React.SetStateAction<T>) => {
      if (!active()) return;
      setter((previous) =>
        active()
          ? typeof next === "function"
            ? (next as (value: T) => T)(previous)
            : next
          : previous,
      );
    };
  }
  const bookingCurrent = api.captureSession();
  const bookingAccount = user?.id;
  return {
    user,
    setUser,
    restoring,
    error,
    setError: scopedSetter(setError),
    refreshError,
    loading,
    shops,
    orders,
    setOrders: scopedSetter(setOrders),
    workspace,
    setWorkspace: scopedSetter(setWorkspace),
    ownerOrders,
    setOwnerOrders: scopedSetter(setOwnerOrders),
    refresh,
    maxUploadBytes,
    draft,
    setDraft: scopedSetter(setDraft),
    begin,
    completeBooking: (order: Order, key: string) => {
      if (bookingCurrent() && userRef.current?.id === bookingAccount)
        completeBooking(order, key);
    },
    signOut,
    updateProfile,
    toggleBookmark,
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
