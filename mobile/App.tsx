import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { Feather } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as Crypto from "expo-crypto";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as api from "./src/api";
import type { Order, PrintFile, Settings, Shop } from "./src/types";
import { s } from "./src/styles";

type Tab = "Home" | "Shops" | "Orders" | "Profile";
type IconName = React.ComponentProps<typeof Feather>["name"];
const defaults: Settings = {
  paper: "A4",
  color: "Black & white",
  sides: "Single-sided",
  copies: 1,
};
const money = (n: number) => `₱${n.toFixed(2)}`;
const tabs: Record<Tab, IconName> = {
  Home: "home",
  Shops: "printer",
  Orders: "file-text",
  Profile: "user",
};
const statuses: Order["status"][] = [
  "Queued",
  "Printing",
  "Ready for pickup",
  "Collected",
];
const nextStatus: Partial<Record<Order["status"], Order["status"]>> = {
  Queued: "Printing",
  Printing: "Ready for pickup",
  "Ready for pickup": "Collected",
};
const message = (e: unknown) =>
  e instanceof Error ? e.message : "Please try again.";
function Icon({
  name,
  color = "#1F2942",
  size = 20,
}: {
  name: IconName;
  color?: string;
  size?: number;
}) {
  return <Feather name={name} color={color} size={size} />;
}
function Button({
  title,
  onPress,
  disabled,
  secondary,
  loading,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  loading?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        secondary && s.secondaryButton,
        (disabled || loading) && { opacity: 0.45 },
        pressed && { opacity: 0.8 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={secondary ? "#4668F5" : "white"} />
      ) : (
        <Text style={[s.buttonText, secondary && { color: "#4668F5" }]}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}
function Badge({ status }: { status: Order["status"] }) {
  return (
    <View
      style={[
        s.badge,
        status === "Ready for pickup" && { backgroundColor: "#E4F5EC" },
      ]}
    >
      <Text
        style={{
          fontSize: 11,
          fontWeight: "700",
          color: status === "Ready for pickup" ? "#087B57" : "#4668F5",
        }}
      >
        {status}
      </Text>
    </View>
  );
}
function Choice<T extends string>({
  values,
  value,
  onChange,
}: {
  values: readonly T[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={s.wrap}>
      {values.map((v) => (
        <Pressable
          key={v}
          accessibilityRole="radio"
          accessibilityState={{ checked: v === value }}
          onPress={() => onChange(v)}
          style={[s.choice, v === value && s.choiceActive]}
        >
          <Text style={[s.choiceText, v === value && { color: "#4668F5" }]}>
            {v}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
function Empty({
  icon,
  title,
  text,
}: {
  icon: IconName;
  title: string;
  text: string;
}) {
  return (
    <View style={s.empty}>
      <View style={s.uploadIcon}>
        <Icon name={icon} color="#4668F5" size={28} />
      </View>
      <Text style={s.cardTitle}>{title}</Text>
      <Text style={[s.muted, { textAlign: "center", maxWidth: 280 }]}>
        {text}
      </Text>
    </View>
  );
}

function AppContent() {
  const [tab, setTab] = useState<Tab>("Home");
  const [maxUploadBytes, setMaxUploadBytes] = useState(15 * 1024 * 1024);
  const [shops, setShops] = useState<Shop[]>([]),
    [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const [connected, setConnected] = useState(false),
    [server, setServer] = useState(api.baseUrl);
  const [search, setSearch] = useState(""),
    [openOnly, setOpenOnly] = useState(false);
  const [step, setStep] = useState(0),
    [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [files, setFiles] = useState<PrintFile[]>([]),
    [settings, setSettings] = useState<Settings>(defaults);
  const [notes, setNotes] = useState(""),
    [quote, setQuote] = useState<{ amount: number; pages: number } | null>(
      null,
    );
  const [requestKey, setRequestKey] = useState(""),
    [detail, setDetail] = useState<Order | null>(null);
  const [completed, setCompleted] = useState(false),
    [inbox, setInbox] = useState(false);
  const [shopToken, setShopToken] = useState(""),
    [merchant, setMerchant] = useState<Shop | null>(null);
  const [merchantOrders, setMerchantOrders] = useState<Order[]>([]),
    [pin, setPin] = useState("");
  const [loginShop, setLoginShop] = useState<Shop | null>(null),
    [notificationMessage, setNotificationMessage] = useState("");
  const seen = useRef<Set<string>>(new Set()),
    permission = useRef(false),
    polling = useRef(false);
  const actionLock = useRef(false);

  async function notifyReady(list: Order[]) {
    for (const order of list.filter(
      (o) => o.readyAt && !seen.current.has(o._id),
    )) {
      seen.current.add(order._id);
      await AsyncStorage.setItem(
        "paprint.notified",
        JSON.stringify([...seen.current]),
      );
      if (
        permission.current &&
        Platform.OS !== "web" &&
        order.pushState !== "sent"
      ) {
        const N = await import("expo-notifications");
        await N.scheduleNotificationAsync({
          content: {
            title: "Your prints are ready!",
            body: `${order.shop.name} · Pickup code ${order.pickupCode}`,
            data: { orderId: order._id },
          },
          trigger: null,
        }).catch(() => {});
      }
    }
  }
  async function refresh(token = shopToken) {
    if (polling.current) return;
    polling.current = true;
    try {
      const [shopList, orderList, config] = await Promise.all([
        api.request<Shop[]>("/shops"),
        api.request<Order[]>("/orders"),
        api.request<{ maxUploadBytes: number }>("/config"),
      ]);
      setShops(shopList);
      setOrders(orderList);
      setMaxUploadBytes(config.maxUploadBytes);
      await notifyReady(orderList);
      if (token)
        setMerchantOrders(await api.request<Order[]>("/orders", {}, token));
      setConnected(true);
      setError("");
    } finally {
      polling.current = false;
    }
  }
  async function connect(changeServer = false) {
    setLoading(true);
    setError("");
    try {
      if (changeServer) await api.setServer(server.trim());
      else {
        await api.initialize();
        setServer(api.baseUrl);
      }
      seen.current = new Set(
        JSON.parse((await AsyncStorage.getItem("paprint.notified")) || "[]"),
      );
      await api.ensureSession();
      await refresh();
    } catch (e) {
      setError(message(e));
      setConnected(false);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    const timer = setTimeout(() => void connect(), 0);
    return () => clearTimeout(timer);
    // Initialize the saved server/device session once, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (Platform.OS === "web") return;
    let cleanup = () => {};
    let stopped = false;
    void import("expo-notifications")
      .then(async (N) => {
        permission.current = (await N.getPermissionsAsync()).granted;
        N.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: true,
            shouldSetBadge: false,
          }),
        });
        if (stopped) return;
        const listener = N.addNotificationResponseReceivedListener(() => {
          setInbox(true);
          setStep(0);
          setDetail(null);
        });
        cleanup = () => listener.remove();
        if (N.getLastNotificationResponse()) setInbox(true);
      })
      .catch(() => {});
    return () => {
      stopped = true;
      cleanup();
    };
  }, []);
  useEffect(() => {
    if (!connected) return;
    const update = () => void refresh().catch((e) => setError(message(e)));
    const timer = setInterval(() => {
      if (AppState.currentState === "active") update();
    }, 6000);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") update();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
    // The poller changes only when connectivity or merchant identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, shopToken]);
  async function run(action: () => Promise<void>) {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(message(e));
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  }
  async function enableNotifications() {
    if (Platform.OS === "web") {
      setNotificationMessage(
        "Pickup alerts appear in your inbox. Phone alerts are available in the mobile app.",
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
    const granted = await N.requestPermissionsAsync();
    permission.current = granted.granted;
    if (!granted.granted) {
      setNotificationMessage(
        "Phone alerts are disabled. Pickup updates are still in your inbox.",
      );
      return;
    }
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ||
      Constants.easConfig?.projectId;
    if (Constants.executionEnvironment === "storeClient" || !projectId) {
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
    setNotificationMessage("Pickup push notifications enabled.");
  }
  function begin(shop: Shop) {
    if (!shop.open) return;
    setSelectedShop(shop);
    setFiles([]);
    setSettings(defaults);
    setNotes("");
    setQuote(null);
    setStep(1);
    setRequestKey(Crypto.randomUUID());
    setError("");
    setSuccess("");
  }
  const booking = () => ({
    shopId: selectedShop?._id,
    fileIds: files.map((f) => f._id),
    settings,
    notes,
    requestKey,
  });
  async function pickFiles() {
    const result = await DocumentPicker.getDocumentAsync({
      type: "application/pdf",
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    if (result.assets.length + files.length > 5)
      throw new Error("Choose up to 5 PDFs per order.");
    if (result.assets.some((f) => (f.size || 0) > maxUploadBytes))
      throw new Error(
        `Each PDF must be ${maxUploadBytes / 1024 / 1024} MB or smaller.`,
      );
    // One file per request fits serverless payload limits. Keep each success
    // visible if a later file fails, so customers can retry just that file.
    for (const asset of result.assets) {
      const uploaded = await api.uploadFiles([asset]);
      setFiles((previous) => [...previous, ...uploaded]);
    }
  }
  async function review() {
    setQuote(
      await api.request("/quote", {
        method: "POST",
        body: JSON.stringify(booking()),
      }),
    );
    setStep(3);
  }
  async function confirm() {
    const order = await api.request<Order>("/orders", {
      method: "POST",
      body: JSON.stringify(booking()),
    });
    setOrders((previous) => [
      order,
      ...previous.filter((o) => o._id !== order._id),
    ]);
    setStep(0);
    setTab("Orders");
    setCompleted(false);
    setDetail(order);
    setSuccess("Order booked! Your shop can now prepare your prints.");
  }
  async function signInShop() {
    if (!loginShop) throw new Error("Choose your shop first.");
    const result = await api.request<{ token: string; shop: Shop }>(
      "/shop-session",
      { method: "POST", body: JSON.stringify({ pin, shopId: loginShop._id }) },
    );
    setMerchantOrders(await api.request<Order[]>("/orders", {}, result.token));
    setShopToken(result.token);
    setMerchant(result.shop);
    setPin("");
    setDetail(null);
  }
  async function advance(order: Order) {
    const changed = await api.request<Order>(
      `/orders/${order._id}/status`,
      {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus[order.status] }),
      },
      shopToken,
    );
    setMerchantOrders((previous) =>
      previous.map((o) => (o._id === changed._id ? changed : o)),
    );
    if (detail?._id === changed._id) setDetail(changed);
    await refresh();
  }
  const source = shopToken ? merchantOrders : orders;
  const current = detail
    ? source.find((o) => o._id === detail._id) || detail
    : null;
  const readyOrders = orders.filter((o) => o.readyAt),
    active = orders.find((o) => o.status !== "Collected");
  const filtered = shops.filter(
    (shop) =>
      (!openOnly || shop.open) &&
      `${shop.name} ${shop.address}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const title = inbox
    ? "Notifications"
    : current
      ? "Order details"
      : shopToken
        ? merchant?.name || "Shop workspace"
        : step
          ? ["", "Upload your files", "Print it your way", "Review your order"][
              step
            ]
          : {
              Home: "A little less waiting.",
              Shops: "Find your print shop.",
              Orders: "Your printing, tracked.",
              Profile: "Make yourself at home.",
            }[tab];
  function back() {
    setError("");
    setSuccess("");
    if (inbox) setInbox(false);
    else if (current) setDetail(null);
    else if (step) setStep(step - 1);
    else {
      setShopToken("");
      setMerchant(null);
    }
  }
  function shopCard(shop: Shop) {
    return (
      <Pressable
        key={shop._id}
        accessibilityRole="button"
        accessibilityLabel={`${shop.name}, ${shop.open ? "open" : "closed"}`}
        disabled={!shop.open || busy}
        onPress={() => begin(shop)}
        style={({ pressed }) => [
          s.card,
          s.shopCard,
          !shop.open && { opacity: 0.6 },
          pressed && { backgroundColor: "#F2F5FF" },
        ]}
      >
        <View style={[s.shopIcon, { backgroundColor: `${shop.accent}15` }]}>
          <Icon name="printer" size={27} color={shop.accent} />
        </View>
        <View style={{ flex: 1, gap: 5 }}>
          <View style={s.between}>
            <Text style={s.cardTitle}>{shop.name}</Text>
            <View
              style={[
                s.dot,
                { backgroundColor: shop.open ? "#22A376" : "#AAA" },
              ]}
            />
          </View>
          <Text style={s.muted}>{shop.address}</Text>
          <View style={s.row}>
            <Icon name="star" size={13} color="#DBA441" />
            <Text style={s.small}>
              {shop.rating} · {shop.distance} · {shop.estimate}
            </Text>
          </View>
          <Text style={s.rate}>
            From {money(shop.monoRate)} / page{shop.open ? "" : " · Closed"}
          </Text>
        </View>
        <Icon name="chevron-right" size={18} color="#9CA5B8" />
      </Pressable>
    );
  }
  function orderCard(order: Order) {
    return (
      <Pressable
        key={order._id}
        accessibilityRole="button"
        onPress={() => {
          setDetail(order);
          setSuccess("");
        }}
        style={s.card}
      >
        <View style={s.between}>
          <Text style={s.cardTitle}>{order.shop.name}</Text>
          <Badge status={order.status} />
        </View>
        <Text style={[s.muted, { marginTop: 12 }]}>
          {order.files[0]?.name}
          {order.files.length > 1 ? ` +${order.files.length - 1} more` : ""}
        </Text>
        <View style={[s.between, { marginTop: 15 }]}>
          <Text style={s.small}>
            {new Date(order.createdAt).toLocaleDateString()} ·{" "}
            {order.pages * order.settings.copies} pages
          </Text>
          <Text style={s.cardTitle}>{money(order.amount)}</Text>
        </View>
      </Pressable>
    );
  }
  function documents(list: PrintFile[]) {
    return list.map((f) => (
      <View key={f._id} style={s.fileRow}>
        <Icon name="file-text" color="#4668F5" size={18} />
        <Text style={[s.body, { flex: 1 }]}>{f.name}</Text>
        <Text style={s.small}>{f.pages} pages</Text>
      </View>
    ));
  }
  function details(order: Order) {
    return (
      <>
        <View style={s.card}>
          <View style={s.between}>
            <Text style={s.cardTitle}>{order.shop.name}</Text>
            <Badge status={order.status} />
          </View>
          <Text style={[s.muted, { marginTop: 8 }]}>{order.shop.address}</Text>
          <View style={s.timeline}>
            {statuses.map((status, i) => (
              <View key={status} style={s.row}>
                <View
                  style={[
                    s.timelineDot,
                    {
                      backgroundColor:
                        statuses.indexOf(order.status) >= i
                          ? "#4668F5"
                          : "#E3E7F0",
                    },
                  ]}
                />
                <Text style={s.body}>{status}</Text>
              </View>
            ))}
          </View>
        </View>
        <View
          style={[
            s.card,
            { backgroundColor: "#EDF7F2", borderColor: "#D7EADF" },
          ]}
        >
          <Text style={s.eyebrow}>YOUR PICKUP CODE</Text>
          <Text style={s.pickupCode}>{order.pickupCode}</Text>
          <Text style={s.muted}>
            {order.status === "Ready for pickup"
              ? "Your order is ready. Show this code at the shop."
              : order.status === "Collected"
                ? "Thanks for printing with PaPrint."
                : "We’ll let you know when your prints are ready."}
          </Text>
        </View>
        <View style={s.card}>
          <Text style={s.cardTitle}>Documents</Text>
          {order.files.map((f) => (
            <Pressable
              key={f.upload}
              disabled={busy}
              onPress={() =>
                // This lock is read only when the press event runs, never in render.
                // eslint-disable-next-line react-hooks/refs
                void run(() =>
                  api.openPrintFile(order._id, f.upload, shopToken),
                )
              }
              style={s.fileRow}
            >
              <Icon name="file-text" color="#4668F5" />
              <View style={{ flex: 1 }}>
                <Text style={s.body}>{f.name}</Text>
                <Text style={s.muted}>
                  {f.pages} pages · Tap to download PDF
                </Text>
              </View>
              <Icon name="download" size={18} />
            </Pressable>
          ))}
          <View style={s.divider} />
          <Text style={s.body}>
            {order.settings.paper} · {order.settings.color}
          </Text>
          <Text style={s.body}>
            {order.settings.sides} · {order.settings.copies} copies
          </Text>
          {!!order.notes && <Text style={s.muted}>Note: {order.notes}</Text>}
          <View style={s.divider} />
          <View style={s.between}>
            <Text style={s.cardTitle}>Pay at pickup</Text>
            <Text style={s.total}>{money(order.amount)}</Text>
          </View>
        </View>
        {shopToken && nextStatus[order.status] && (
          <Button
            title={
              order.status === "Queued"
                ? "Start printing"
                : order.status === "Printing"
                  ? "Mark ready & notify customer"
                  : "Confirm collected"
            }
            loading={busy}
            // The handler runs after a press; the render helper does not read refs.
            // eslint-disable-next-line react-hooks/refs
            onPress={() => void run(() => advance(order))}
          />
        )}
      </>
    );
  }
  return (
    <SafeAreaView style={s.safe}>
      <StatusBar style="dark" />
      <View style={s.app}>
        <View style={s.header}>
          <View style={s.row}>
            <View style={s.brandIcon}>
              <Icon name="printer" color="white" size={19} />
            </View>
            <Text style={s.brand}>
              PaPrint<Text style={{ color: "#4668F5" }}>.</Text>
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open pickup notifications"
            disabled={busy}
            onPress={() => {
              setInbox(!inbox);
              setStep(0);
              setDetail(null);
            }}
            style={s.bell}
          >
            <Icon name="bell" />
            {orders.some((o) => o.status === "Ready for pickup") && (
              <View style={s.notificationDot} />
            )}
          </Pressable>
        </View>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={s.content}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={() => void run(() => refresh())}
            />
          }
        >
          {(step > 0 || !!current || inbox || !!shopToken) && (
            <Pressable disabled={busy} onPress={back} style={s.back}>
              <Icon name="arrow-left" size={17} color="#68738B" />
              <Text style={s.muted}>
                {shopToken && !current && !inbox
                  ? "Back to customer app"
                  : "Back"}
              </Text>
            </Pressable>
          )}
          <Text style={s.eyebrow}>
            {shopToken ? "SHOP WORKSPACE" : "YOUR PRINT. YOUR CHOICE."}
          </Text>
          <Text style={s.heading}>{title}</Text>
          {!!error && (
            <View accessibilityRole="alert" style={s.error}>
              <Icon name="alert-circle" color="#B44242" />
              <Text style={{ color: "#A43D3D", flex: 1, lineHeight: 21 }}>
                {error}
              </Text>
            </View>
          )}
          {!!success && (
            <View style={s.success}>
              <Text style={{ color: "#087B57", lineHeight: 21 }}>
                {success}
              </Text>
            </View>
          )}
          {!connected ? (
            <View style={s.card}>
              <Text style={s.cardTitle}>
                {loading ? "Connecting to PaPrint…" : "Connect your app"}
              </Text>
              <Text style={[s.muted, { marginVertical: 12 }]}>
                Start the PaPrint server, then enter its address. On a phone,
                use your computer’s Wi-Fi IP address, such as
                http://192.168.1.10:4000.
              </Text>
              <TextInput
                accessibilityLabel="Server address"
                autoCapitalize="none"
                autoCorrect={false}
                value={server}
                onChangeText={setServer}
                style={s.input}
              />
              <Button
                title="Connect"
                loading={loading}
                onPress={() => void connect(true)}
              />
            </View>
          ) : inbox ? (
            <>
              <Text style={s.subtitle}>Updates for your next pickup.</Text>
              {readyOrders.length ? (
                readyOrders.map((o) => (
                  <Pressable
                    key={o._id}
                    style={s.card}
                    onPress={() => {
                      setInbox(false);
                      setDetail(o);
                      setTab("Orders");
                    }}
                  >
                    <View style={s.row}>
                      <Icon name="check-circle" color="#087B57" />
                      <Text style={s.cardTitle}>Your prints are ready!</Text>
                    </View>
                    <Text style={[s.muted, { marginTop: 10 }]}>
                      {o.shop.name} · Pickup code {o.pickupCode}
                    </Text>
                    <Text style={[s.small, { marginTop: 8 }]}>
                      {new Date(o.readyAt!).toLocaleString()}
                    </Text>
                  </Pressable>
                ))
              ) : (
                <Empty
                  icon="bell"
                  title="All quiet for now"
                  text="Your pickup notification will appear here when the shop marks your order ready."
                />
              )}
            </>
          ) : current ? (
            details(current)
          ) : shopToken ? (
            <>
              <Text style={s.subtitle}>
                Prepare orders, then let customers know they’re ready.
              </Text>
              {merchantOrders.length ? (
                merchantOrders.map(orderCard)
              ) : (
                <Empty
                  icon="inbox"
                  title="No orders yet"
                  text="Bookings for this shop will appear here."
                />
              )}
            </>
          ) : step && selectedShop ? (
            <>
              <View style={s.steps}>
                {["Files", "Options", "Review"].map((label, i) => (
                  <View key={label} style={s.stepItem}>
                    <View
                      style={[
                        s.stepCircle,
                        step >= i + 1 && { backgroundColor: "#4668F5" },
                      ]}
                    >
                      <Text
                        style={{
                          color: step >= i + 1 ? "white" : "#8C96A9",
                          fontWeight: "700",
                        }}
                      >
                        {i + 1}
                      </Text>
                    </View>
                    <Text style={s.small}>{label}</Text>
                  </View>
                ))}
              </View>
              <View style={s.selectedShop}>
                <Icon name="printer" color="#4668F5" />
                <View>
                  <Text style={s.cardTitle}>{selectedShop.name}</Text>
                  <Text style={s.muted}>{selectedShop.address}</Text>
                </View>
              </View>
              {step === 1 ? (
                <>
                  <Pressable
                    disabled={busy || files.length >= 5}
                    onPress={() => void run(pickFiles)}
                    style={s.upload}
                  >
                    <View style={s.uploadIcon}>
                      <Icon name="upload-cloud" color="#4668F5" size={32} />
                    </View>
                    <Text style={s.cardTitle}>
                      {busy
                        ? "Uploading your documents…"
                        : "Your next print starts here"}
                    </Text>
                    <Text style={s.muted}>
                      Tap to choose PDFs · Up to 5 files ·{" "}
                      {maxUploadBytes / 1024 / 1024} MB each
                    </Text>
                  </Pressable>
                  {files.map((f) => (
                    <View key={f._id} style={[s.card, s.fileRow]}>
                      <Icon name="file-text" color="#4668F5" />
                      <View style={{ flex: 1 }}>
                        <Text style={s.body}>{f.name}</Text>
                        <Text style={s.muted}>
                          {f.pages} pages · {(f.size / 1024).toFixed(0)} KB
                        </Text>
                      </View>
                      <Pressable
                        disabled={busy}
                        accessibilityLabel={`Remove ${f.name}`}
                        onPress={() =>
                          setFiles(files.filter((file) => file._id !== f._id))
                        }
                      >
                        <Icon name="x" size={18} />
                      </Pressable>
                    </View>
                  ))}
                  <Text style={s.small}>
                    Page counts are read from your PDFs. Password-protected PDFs
                    aren’t supported.
                  </Text>
                  <Button
                    title="Continue to print options"
                    disabled={!files.length}
                    loading={busy}
                    onPress={() => setStep(2)}
                  />
                </>
              ) : step === 2 ? (
                <>
                  <View style={s.card}>
                    <Text style={s.label}>Paper size</Text>
                    <Choice
                      values={["A4", "Letter", "Legal"] as const}
                      value={settings.paper}
                      onChange={(paper) => setSettings({ ...settings, paper })}
                    />
                    <Text style={s.label}>Print color</Text>
                    <Choice
                      values={["Black & white", "Color"] as const}
                      value={settings.color}
                      onChange={(color) => setSettings({ ...settings, color })}
                    />
                    <Text style={s.label}>Print sides</Text>
                    <Choice
                      values={["Single-sided", "Double-sided"] as const}
                      value={settings.sides}
                      onChange={(sides) => setSettings({ ...settings, sides })}
                    />
                    <View style={[s.between, { marginTop: 22 }]}>
                      <Text style={s.cardTitle}>Copies</Text>
                      <View style={s.row}>
                        <Pressable
                          accessibilityLabel="Decrease copies"
                          disabled={settings.copies <= 1}
                          onPress={() =>
                            setSettings({
                              ...settings,
                              copies: settings.copies - 1,
                            })
                          }
                          style={s.counter}
                        >
                          <Icon name="minus" size={16} />
                        </Pressable>
                        <Text style={s.cardTitle}>{settings.copies}</Text>
                        <Pressable
                          accessibilityLabel="Increase copies"
                          disabled={settings.copies >= 100}
                          onPress={() =>
                            setSettings({
                              ...settings,
                              copies: settings.copies + 1,
                            })
                          }
                          style={s.counter}
                        >
                          <Icon name="plus" size={16} />
                        </Pressable>
                      </View>
                    </View>
                    <Text style={[s.small, { marginTop: 18 }]}>
                      Charged per printed page. Double-sided uses fewer sheets;
                      Legal paper adds 25%.
                    </Text>
                  </View>
                  <View style={s.card}>
                    <Text style={s.cardTitle}>
                      Anything the shop should know?
                    </Text>
                    <TextInput
                      accessibilityLabel="Order notes"
                      placeholder="Optional instructions"
                      placeholderTextColor="#9AA3B5"
                      multiline
                      maxLength={500}
                      value={notes}
                      onChangeText={setNotes}
                      style={[
                        s.input,
                        {
                          minHeight: 90,
                          marginTop: 14,
                          textAlignVertical: "top",
                        },
                      ]}
                    />
                  </View>
                  <Button
                    title="Review my order"
                    loading={busy}
                    onPress={() => void run(review)}
                  />
                </>
              ) : (
                <>
                  <View style={s.card}>
                    <Text style={s.cardTitle}>Your documents</Text>
                    {documents(files)}
                    <View style={s.divider} />
                    <Text style={s.body}>
                      {settings.paper} · {settings.color}
                    </Text>
                    <Text style={s.body}>
                      {settings.sides} · {settings.copies} copies
                    </Text>
                    {!!notes && <Text style={s.muted}>{notes}</Text>}
                    <View style={s.divider} />
                    <View style={s.between}>
                      <Text style={s.cardTitle}>
                        Total · {quote!.pages * settings.copies} pages
                      </Text>
                      <Text style={s.total}>{money(quote!.amount)}</Text>
                    </View>
                  </View>
                  <View style={s.notice}>
                    <Icon name="info" color="#4668F5" />
                    <Text style={[s.body, { flex: 1 }]}>
                      Pay at the shop when you collect your prints. We’ll notify
                      you when your order is ready.
                    </Text>
                  </View>
                  <Button
                    title="Confirm printing order"
                    loading={busy}
                    onPress={() => void run(confirm)}
                  />
                </>
              )}
            </>
          ) : tab === "Home" ? (
            <>
              <Text style={s.subtitle}>Send your files. Pick up your day.</Text>
              <Pressable
                onPress={() => {
                  setTab("Shops");
                  setSearch("");
                }}
                style={s.search}
              >
                <Icon name="search" color="#8590A5" />
                <Text style={s.muted}>Find printing shops in Naga…</Text>
              </Pressable>
              {active ? (
                <Pressable
                  onPress={() => {
                    setDetail(active);
                    setTab("Orders");
                  }}
                  style={s.activeCard}
                >
                  <View style={s.between}>
                    <Text style={s.activeEyebrow}>YOUR ACTIVE ORDER</Text>
                    <Text style={s.activeStatus}>{active.status}</Text>
                  </View>
                  <Text style={s.activeTitle}>{active.shop.name}</Text>
                  <Text style={s.activeSubtitle}>{active.files[0]?.name}</Text>
                  <View style={[s.between, { marginTop: 28 }]}>
                    <View style={s.row}>
                      {[0, 1, 2].map((i) => (
                        <View
                          key={i}
                          style={[
                            s.progress,
                            {
                              backgroundColor:
                                i <= statuses.indexOf(active.status)
                                  ? "white"
                                  : "#FFFFFF44",
                            },
                          ]}
                        />
                      ))}
                    </View>
                    <Text style={{ color: "white", fontWeight: "600" }}>
                      Track order →
                    </Text>
                  </View>
                </Pressable>
              ) : (
                <View style={s.welcome}>
                  <View style={s.row}>
                    <Icon name="sun" color="#4668F5" />
                    <Text style={s.cardTitle}>
                      Printing without the extra trip.
                    </Text>
                  </View>
                  <Text style={[s.muted, { marginTop: 10 }]}>
                    Choose a local shop and book your first print in a few
                    simple steps.
                  </Text>
                </View>
              )}
              <View style={s.between}>
                <Text style={s.sectionTitle}>Nearby shops</Text>
                <Pressable onPress={() => setTab("Shops")}>
                  <Text style={s.link}>See all</Text>
                </Pressable>
              </View>
              {shops.slice(0, 3).map(shopCard)}
              <Text style={s.small}>
                Sample partner shops and prices for prototype testing.
              </Text>
            </>
          ) : tab === "Shops" ? (
            <>
              <Text style={s.subtitle}>A local shop for every deadline.</Text>
              <View style={s.search}>
                <Icon name="search" color="#8590A5" />
                <TextInput
                  accessibilityLabel="Search printing shops"
                  placeholder="Search by shop or area"
                  placeholderTextColor="#8590A5"
                  value={search}
                  onChangeText={setSearch}
                  style={s.searchInput}
                />
              </View>
              <Choice
                values={["All shops", "Open now"] as const}
                value={openOnly ? "Open now" : "All shops"}
                onChange={(v) => setOpenOnly(v === "Open now")}
              />
              {filtered.length ? (
                filtered.map(shopCard)
              ) : (
                <Empty
                  icon="search"
                  title="No shops found"
                  text="Try another shop name or area."
                />
              )}
            </>
          ) : tab === "Orders" ? (
            <>
              <Text style={s.subtitle}>
                From the first page to the final pickup.
              </Text>
              <Choice
                values={["Active", "Completed"] as const}
                value={completed ? "Completed" : "Active"}
                onChange={(v) => setCompleted(v === "Completed")}
              />
              {orders.filter((o) => (o.status === "Collected") === completed)
                .length ? (
                orders
                  .filter((o) => (o.status === "Collected") === completed)
                  .map(orderCard)
              ) : (
                <Empty
                  icon="file-text"
                  title={
                    completed
                      ? "No completed orders yet"
                      : "Your next print is waiting"
                  }
                  text={
                    completed
                      ? "Collected orders will appear here."
                      : "Choose a shop to place your first printing order."
                  }
                />
              )}
              {!completed && (
                <Button
                  title="Find a print shop"
                  secondary
                  onPress={() => setTab("Shops")}
                />
              )}
            </>
          ) : (
            <>
              <Text style={s.subtitle}>
                Your printing essentials, all in one place.
              </Text>
              <View style={s.card}>
                <View style={s.row}>
                  <View style={s.avatar}>
                    <Icon name="user" color="#4668F5" size={27} />
                  </View>
                  <View>
                    <Text style={s.cardTitle}>Guest customer</Text>
                    <Text style={s.muted}>Your orders stay on this device</Text>
                  </View>
                </View>
                <Text style={[s.small, { marginTop: 16 }]}>
                  This prototype uses a private device session. Keep this app’s
                  data to retain access to your orders.
                </Text>
              </View>
              <View style={s.card}>
                <Text style={s.cardTitle}>Pickup notifications</Text>
                <Text style={[s.muted, { marginVertical: 12 }]}>
                  {notificationMessage ||
                    "Enable phone alerts, or check your inbox anytime."}
                </Text>
                <Button
                  title="Enable notifications"
                  secondary
                  loading={busy}
                  onPress={() => void run(enableNotifications)}
                />
              </View>
              <View style={s.card}>
                <Text style={s.cardTitle}>Printing shop access</Text>
                <Text style={[s.muted, { marginVertical: 12 }]}>
                  For prototype staff: choose your shop and enter the server’s
                  shop PIN.
                </Text>
                {shops.map((shop) => (
                  <Pressable
                    key={shop._id}
                    onPress={() => setLoginShop(shop)}
                    style={[
                      s.choice,
                      { marginBottom: 8 },
                      loginShop?._id === shop._id && s.choiceActive,
                    ]}
                  >
                    <Text style={s.body}>{shop.name}</Text>
                  </Pressable>
                ))}
                <TextInput
                  accessibilityLabel="Shop access PIN"
                  placeholder="Shop access PIN"
                  placeholderTextColor="#9AA3B5"
                  secureTextEntry
                  value={pin}
                  onChangeText={setPin}
                  style={s.input}
                />
                <Button
                  title="Open shop workspace"
                  loading={busy}
                  disabled={!pin || !loginShop}
                  onPress={() => void run(signInShop)}
                />
              </View>
              <Text style={s.small}>Connected to {api.baseUrl}</Text>
            </>
          )}
        </ScrollView>
        {!step && !shopToken && (
          <View style={s.nav}>
            {(["Home", "Orders", "Shops", "Profile"] as Tab[]).map((item) => (
              <Pressable
                key={item}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === item }}
                disabled={busy}
                onPress={() => {
                  setTab(item);
                  setDetail(null);
                  setInbox(false);
                  setError("");
                  setSuccess("");
                }}
                style={s.navItem}
              >
                <Icon
                  name={tabs[item]}
                  size={22}
                  color={tab === item ? "#4668F5" : "#8D96A8"}
                />
                <Text
                  style={[s.navLabel, tab === item && { color: "#4668F5" }]}
                >
                  {item}
                </Text>
                {tab === item && <View style={s.navDot} />}
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}
