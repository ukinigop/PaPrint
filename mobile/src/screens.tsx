import {
  canEndOrder,
  isActiveOrder,
  isTerminalOrder,
  isCancelledOrRejected,
  paymentLabel,
} from "./orderStatus";
import { EndOrderPanel, OrderOutcome } from "./OrderOutcome";
import { Admin } from "./Admin";
import React, { useEffect, useRef, useState } from "react";
import {
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  Switch,
  View,
  type TextInputProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { Text } from "./ui";
import { s } from "./styles";
import { colors } from "./theme";
import {
  Art,
  Card,
  Field,
  LinkText,
  money,
  orderCode,
  Pair,
  Pill,
  Segments,
  stage,
} from "./design";
import {
  MotionButton as Button,
  PrintingIndicator,
  UploadProgress,
} from "./motion";
import { AccountLoading, AccountScreen } from "./AccountScreen";
import { useApp } from "./state";
import * as api from "./api";
import type { Order, Shop } from "./types";
import { Workspace } from "./Workspace";

type Tab = "Home" | "Shops" | "Orders" | "Profile";
const tabs = ["Home", "Shops", "Orders", "Profile"] as const;
const icons = {
  Home: ["home", "homeActive"],
  Shops: ["shops", "shopsActive"],
  Orders: ["orders", "ordersActive"],
  Profile: ["profile", "profileActive"],
} as const;
function Frame({
  title,
  subtitle,
  tab,
  back,
  children,
}: {
  title: string;
  subtitle?: string;
  tab?: Tab;
  back?: string;
  children: React.ReactNode;
}) {
  const app = useApp();
  return (
    <SafeAreaView style={s.safe}>
      <View style={s.app}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={app.loading}
              onRefresh={() => {
                void app.refresh().catch((e) => app.setError(e.message));
              }}
            />
          }
          contentContainerStyle={{ padding: 24, gap: 20, paddingBottom: 32 }}
        >
          <View style={{ gap: 8 }}>
            {back && (
              <LinkText onPress={() => router.push(back as "/home")}>
                ‹ Back
              </LinkText>
            )}
            <View style={s.between}>
              <Text style={{ fontSize: 11, color: colors.primary }}>
                PaPrint / NAGA
              </Text>
              <Art name="logo" size={28} />
            </View>
            <Text style={[s.heading, { marginTop: 0, letterSpacing: 0 }]}>
              {title}
            </Text>
            {subtitle && (
              <Text style={[s.body, { color: colors.muted }]}>{subtitle}</Text>
            )}
          </View>
          {app.error ? (
            <View accessibilityRole="alert" style={s.error}>
              <Text style={{ color: colors.error }}>{app.error}</Text>
              <LinkText
                onPress={() => {
                  void app.refresh().catch((e) => app.setError(e.message));
                }}
              >
                Retry
              </LinkText>
            </View>
          ) : null}
          {children}
          {!tab && (
            <Text style={[s.small, { marginTop: 28 }]}>
              Local printing, made simple.
            </Text>
          )}
        </ScrollView>
        {tab && (
          <View
            style={[
              s.nav,
              {
                backgroundColor: colors.surface,
                paddingHorizontal: 8,
                marginHorizontal: 24,
                borderWidth: 0,
              },
            ]}
          >
            {tabs.map((t) => (
              <Pressable
                key={t}
                accessibilityRole="tab"
                accessibilityLabel={t}
                accessibilityState={{ selected: t === tab }}
                onPress={() =>
                  router.replace(("/" + t.toLowerCase()) as "/home")
                }
                style={[
                  s.navItem,
                  { marginHorizontal: 0 },
                  t === tab && s.navActive,
                ]}
              >
                <Art name={icons[t][t === tab ? 1 : 0]} size={20} />
                <Text
                  style={[s.navLabel, t === tab && { color: colors.primary }]}
                >
                  {t}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
function useAction() {
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const { setError } = useApp();
  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return { busy, run };
}
function ShopCard({ shop, compact }: { shop: Shop; compact?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={"View " + shop.name}
      onPress={() =>
        router.push({ pathname: "/shop", params: { id: shop._id } })
      }
    >
      <Card>
        <View style={[s.row, { gap: 12 }]}>
          <View style={[s.shopIcon, { width: 44, height: 44 }]}>
            <Art name="shop" size={24} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={s.cardTitle}>{shop.name}</Text>
            <Text style={s.small}>
              {shop.address} · {shop.distance}
            </Text>
          </View>
        </View>
        {!compact && (
          <>
            <Text style={[s.body, { color: colors.muted }]}>
              B&W from {money(shop.monoRate)} / page · Color from{" "}
              {money(shop.colorRate)}
            </Text>
            <Pill>{shop.open ? "Open now" : "Closed"}</Pill>
          </>
        )}
      </Card>
    </Pressable>
  );
}
function OrderCard({ order }: { order: Order }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={"View order " + orderCode(order._id)}
      onPress={() =>
        router.push({ pathname: "/order", params: { id: order._id } })
      }
    >
      <Card>
        <View style={s.between}>
          <Text style={s.cardTitle}>{orderCode(order._id)}</Text>
          <Pill>{stage(order.status)}</Pill>
        </View>
        <Text style={s.body}>{order.files[0]?.name}</Text>
        <Text style={s.small}>
          {order.shop.name} · {order.pages} pages · {money(order.amount)}
        </Text>
        <Text style={s.small}>
          {isCancelledOrRejected(order)
            ? "No payment due"
            : order.paymentStatus === "paid"
              ? "Paid"
              : "Pay on pickup · " + money(order.amount) + " due"}
        </Text>
        <Text style={{ color: colors.primary }}>View order →</Text>
      </Card>
    </Pressable>
  );
}
function Home() {
  const { user, shops, orders } = useApp();
  const active = orders.find(isActiveOrder);
  return (
    <Frame
      title="Home"
      subtitle={
        "Hello, " + user?.name.split(" ")[0] + ". What are we printing?"
      }
      tab="Home"
    >
      <Card tint>
        <Text style={[s.heading, { marginTop: 0 }]}>
          From file to finished.
        </Text>
        <Text style={[s.body, { color: colors.muted }]}>
          Upload a document and let a nearby shop handle the rest.
        </Text>
        <Button
          title="Start a print order"
          onPress={() => router.push("/shops")}
        />
      </Card>
      <Text style={s.sectionTitle}>Your current order</Text>
      {active ? (
        <OrderCard order={active} />
      ) : (
        <Card>
          <Text style={s.body}>Your next print starts here.</Text>
          <Text style={s.small}>
            Track your order here once you’ve sent it to a shop.
          </Text>
        </Card>
      )}
      <Text style={s.sectionTitle}>Nearby partners</Text>
      {shops.slice(0, 1).map((shop) => (
        <ShopCard key={shop._id} shop={shop} compact />
      ))}
      <LinkText onPress={() => router.push("/shops")}>See all shops →</LinkText>
    </Frame>
  );
}
function Shops() {
  const { shops } = useApp();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All shops");
  const result = shops
    .filter(
      (s) =>
        (filter !== "Open now" || s.open) &&
        (s.name + " " + s.address).toLowerCase().includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      filter === "Nearest"
        ? parseFloat(a.distance) - parseFloat(b.distance)
        : 0,
    );
  return (
    <Frame
      title="Shops"
      subtitle="Find your printing partner in Naga."
      tab="Shops"
    >
      <Field
        label="Find a shop"
        placeholder="Search shops or neighborhood"
        value={query}
        onChangeText={setQuery}
      />
      <Segments
        values={["All shops", "Open now", "Nearest"]}
        value={filter}
        onChange={setFilter}
      />
      <Text style={s.small}>{result.length} partner shops · Naga City</Text>
      {result.map((shop) => (
        <ShopCard key={shop._id} shop={shop} />
      ))}
      {!result.length && (
        <Text style={s.muted}>
          No matching shops. Try another name or filter.
        </Text>
      )}
    </Frame>
  );
}
function ShopDetails({ id }: { id: string }) {
  const app = useApp(),
    { busy, run } = useAction();
  const shop = app.shops.find((s) => s._id === id);
  if (!shop)
    return (
      <Frame title="Shop details" tab="Shops" back="/shops">
        <Text style={s.muted}>
          {app.loading ? "Loading shop…" : "This shop is unavailable."}
        </Text>
      </Frame>
    );
  const saved = app.user?.savedShops?.includes(id);
  return (
    <Frame
      title="Shop details"
      subtitle="A closer look at your print partner."
      tab="Shops"
      back="/shops"
    >
      <Card>
        <Art name="shopLarge" size={38} />
        <Text style={s.cardTitle}>{shop.name}</Text>
        <Pill>{shop.open ? "Open now" : "Closed"}</Pill>
        <Text style={s.body}>{shop.address}</Text>
        <Pair label="Hours" value={shop.hours || "Contact shop for hours"} />
        <Pair label="Contact" value={shop.contact || "Not listed"} />
      </Card>
      <Card>
        <Text style={s.cardTitle}>Printing services</Text>
        <Pair label="Black & white" value={money(shop.monoRate) + " / page"} />
        <Pair label="Full color" value={money(shop.colorRate) + " / page"} />
        <Pair label="Paper sizes" value="A4 · Letter · Legal" />
        <Text style={s.small}>Final price shown at checkout.</Text>
      </Card>
      <Button
        title="Print with this shop"
        disabled={!shop.open}
        onPress={() => {
          app.begin(shop);
          router.push("/upload");
        }}
      />
      <Button
        title={saved ? "Remove from saved shops" : "Save shop"}
        secondary
        loading={busy}
        onPress={() =>
          void run(async () =>
            app.updateProfile({
              savedShops: saved
                ? app.user!.savedShops.filter((s) => s !== id)
                : [...(app.user?.savedShops || []), id],
            }),
          )
        }
      />
      <LinkText
        onPress={() => {
          void Linking.openURL(
            "https://www.google.com/maps/search/?api=1&query=" +
              encodeURIComponent(shop.address),
          );
        }}
      >
        View location ↗
      </LinkText>
    </Frame>
  );
}
function FileCards() {
  const { draft, setDraft } = useApp();
  return (
    <>
      {draft.files.map((f) => (
        <Card key={f._id}>
          <View style={s.row}>
            <Art name="file" size={28} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={s.body}>{f.name}</Text>
              <Text style={s.small}>
                {f.pages} pages · {(f.size / 1024 / 1024).toFixed(2)} MB ·
                Uploaded
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={"Remove " + f.name}
              onPress={() =>
                setDraft((d) => ({
                  ...d,
                  files: d.files.filter((x) => x._id !== f._id),
                }))
              }
              style={{ padding: 10 }}
            >
              <Text style={{ color: colors.muted }}>×</Text>
            </Pressable>
          </View>
        </Card>
      ))}
    </>
  );
}
function Upload() {
  const app = useApp(),
    { busy, run } = useAction();
  const [progress, setProgress] = useState<{
    completed: number;
    total: number;
  } | null>(null);
  if (!app.draft.shop) return <Redirect href="/shops" />;
  async function pick() {
    const result = await DocumentPicker.getDocumentAsync({
      type: "application/pdf",
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    if (result.assets.length + app.draft.files.length > 5)
      throw new Error("Choose up to 5 PDFs per order.");
    if (result.assets.some((f) => (f.size || 0) > app.maxUploadBytes))
      throw new Error(
        "Each PDF must be " +
          app.maxUploadBytes / 1024 / 1024 +
          " MB or smaller.",
      );
    setProgress({ completed: 0, total: result.assets.length });
    try {
      for (const [index, asset] of result.assets.entries()) {
        const files = await api.uploadFiles([asset]);
        app.setDraft((d) => ({ ...d, files: [...d.files, ...files] }));
        setProgress({ completed: index + 1, total: result.assets.length });
      }
    } finally {
      setProgress(null);
    }
  }
  return (
    <Frame
      title="Upload files"
      subtitle="01 / Files → 02 / Options → 03 / Pay"
      back="/shops"
    >
      <Card>
        <View style={s.row}>
          <Art name="shop" size={24} />
          <Text style={s.cardTitle}>{app.draft.shop.name}</Text>
        </View>
        <Text style={s.small}>{app.draft.shop.address}</Text>
      </Card>
      <Card style={{ alignItems: "center", paddingVertical: 28 }}>
        <Art name="upload" size={40} />
        <Text style={s.cardTitle}>Add your documents</Text>
        <Text style={s.small}>
          PDF · up to 5 files · {app.maxUploadBytes / 1024 / 1024} MB each
        </Text>
        <View style={{ alignSelf: "stretch" }}>
          <Button
            title="Choose files"
            secondary
            loading={busy}
            onPress={() => void run(pick)}
          />
        </View>
        {progress && <UploadProgress {...progress} />}
      </Card>
      <FileCards />
      <Text style={s.small}>
        PDFs print in the order shown. Page ranges count continuously across
        these files.
      </Text>
      {!!app.draft.files.length && (
        <>
          <Pill>Upload complete</Pill>
          <Text style={s.small}>
            Review your file before setting print options.
          </Text>
        </>
      )}
      <Button
        title="Continue to options"
        disabled={!app.draft.files.length || busy}
        onPress={() => router.push("/options")}
      />
    </Frame>
  );
}
function Options() {
  const app = useApp(),
    { busy, run } = useAction();
  const [estimate, setEstimate] = useState<number | null>(null);
  const quoteBody = JSON.stringify({
    shopId: app.draft.shop?._id,
    fileIds: app.draft.files.map((f) => f._id),
    settings: app.draft.settings,
    notes: app.draft.notes,
    requestKey: app.draft.requestKey,
  });
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      void api
        .request<{ amount: number }>("/quote", {
          method: "POST",
          body: quoteBody,
        })
        .then((q) => {
          if (active) setEstimate(q.amount);
        })
        .catch(() => {
          if (active) setEstimate(null);
        });
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [quoteBody]);
  if (!app.draft.shop || !app.draft.files.length)
    return <Redirect href="/upload" />;
  const { settings } = app.draft;
  const change = (data: Partial<typeof settings>) => {
    app.setDraft((d) => ({ ...d, settings: { ...d.settings, ...data } }));
    setEstimate(null);
  };
  const field = (label: string, props: TextInputProps) => (
    <Field label={label} {...props} />
  );
  const booking = {
    shopId: app.draft.shop._id,
    fileIds: app.draft.files.map((f) => f._id),
    settings,
    notes: app.draft.notes,
    requestKey: app.draft.requestKey,
  };
  return (
    <Frame
      title="Print options"
      subtitle="02 / Set up your document"
      back="/upload"
    >
      <FileCards />
      {field("Page range", {
        value: settings.pageRange,
        placeholder: "All pages (or 1-3, 5)",
        onChangeText: (pageRange) => change({ pageRange }),
        maxLength: 100,
      })}
      <Text style={s.small}>Number pages across files in upload order.</Text>
      <Text style={s.small}>Paper size</Text>
      <Segments
        values={["A4", "Letter", "Legal"] as const}
        value={settings.paper}
        onChange={(paper) => change({ paper })}
      />
      <Card>
        <Pair label="Copies" value={String(settings.copies)} />
        <View style={s.between}>
          <Button
            title="−"
            secondary
            disabled={settings.copies <= 1}
            onPress={() => change({ copies: settings.copies - 1 })}
          />
          <Text style={s.cardTitle}>{settings.copies}</Text>
          <Button
            title="+"
            secondary
            disabled={settings.copies >= 100}
            onPress={() => change({ copies: settings.copies + 1 })}
          />
        </View>
      </Card>
      <Text style={s.small}>Color mode</Text>
      <Segments
        values={["Black & white", "Color"] as const}
        value={settings.color}
        onChange={(color) => change({ color })}
      />
      <Text style={s.small}>Print sides</Text>
      <Segments
        values={["Single-sided", "Double-sided"] as const}
        value={settings.sides}
        onChange={(sides) => change({ sides })}
      />
      <Field label="Finishing" value="No binding" editable={false} />
      <Field
        label="Notes for the shop (optional)"
        value={app.draft.notes}
        onChangeText={(notes) => app.setDraft((d) => ({ ...d, notes }))}
        multiline
        maxLength={500}
      />
      <Pair
        label="Estimated total"
        value={estimate === null ? "Calculated at review" : money(estimate)}
      />
      <Button
        title="Review order"
        loading={busy}
        onPress={() =>
          void run(async () => {
            const quote = await api.request<{ amount: number }>("/quote", {
              method: "POST",
              body: JSON.stringify(booking),
            });
            setEstimate(quote.amount);
            router.push({
              pathname: "/review",
              params: { amount: String(quote.amount) },
            });
          })
        }
      />
    </Frame>
  );
}
function Review({ amount }: { amount: string }) {
  const app = useApp(),
    { busy, run } = useAction();
  const [payment, setPayment] = useState("Pay on pickup");
  const [reviewedAmount, setReviewedAmount] = useState(Number(amount) || 0);
  const [priceNotice, setPriceNotice] = useState("");
  if (!app.draft.shop || !app.draft.files.length)
    return <Redirect href="/shops" />;
  const { draft } = app;
  const pages = draft.files.reduce((n, f) => n + f.pages, 0);
  return (
    <Frame
      title="Review & pay"
      subtitle="03 / One last check before printing"
      back="/options"
    >
      <Card>
        <Text style={s.cardTitle}>{draft.shop!.name}</Text>
        <Pair label="Documents" value={pages + " pages"} />
        <Pair
          label="Page range"
          value={draft.settings.pageRange || "All pages"}
        />
        <Pair
          label="Print setup"
          value={draft.settings.color + " · " + draft.settings.paper}
        />
        <Pair
          label="Sides / copies"
          value={draft.settings.sides + " · " + draft.settings.copies}
        />
        <View style={{ height: 1, backgroundColor: colors.line }} />
        <Pair label="Total" value={money(reviewedAmount)} />
        <LinkText onPress={() => router.push("/options")}>
          Edit file or print options →
        </LinkText>
      </Card>
      {priceNotice ? (
        <Text accessibilityRole="alert" style={s.body}>
          {priceNotice}
        </Text>
      ) : null}
      <Text style={s.sectionTitle}>Choose payment</Text>
      {["GCash QR", "Pay on pickup"].map((p) => (
        <Pressable
          key={p}
          accessibilityRole="radio"
          accessibilityState={{ checked: payment === p }}
          onPress={() => setPayment(p)}
        >
          <Card tint={payment === p}>
            <Text style={s.cardTitle}>
              {payment === p ? "● " : "○ "}
              {p}
            </Text>
            <Text style={s.small}>
              {p === "GCash QR"
                ? "Preview the QR payment screen. Payments aren’t connected yet."
                : money(reviewedAmount) + " due when collecting your prints."}
            </Text>
          </Card>
        </Pressable>
      ))}
      <Button
        title={
          payment === "GCash QR"
            ? "Continue with GCash"
            : "Place order · Pay on pickup"
        }
        loading={busy}
        onPress={() => {
          if (payment === "GCash QR") {
            router.push({ pathname: "/gcash", params: { amount } });
            return;
          }
          void run(async () => {
            let order: Order;
            try {
              order = await api.request<Order>("/orders", {
                method: "POST",
                body: JSON.stringify({
                  shopId: draft.shop!._id,
                  fileIds: draft.files.map((f) => f._id),
                  settings: draft.settings,
                  notes: draft.notes,
                  requestKey: draft.requestKey,
                  paymentMethod: "pickup",
                  expectedAmount: reviewedAmount,
                }),
              });
            } catch (error) {
              const changed = error as Error & {
                code?: string;
                amount?: number;
              };
              if (
                changed.code === "PRICE_CHANGED" &&
                typeof changed.amount === "number"
              ) {
                setReviewedAmount(changed.amount);
                setPriceNotice(
                  "The shop updated its rates. Review the new total and press Place order again to confirm.",
                );
                return;
              }
              throw error;
            }
            app.setOrders((previous) => [
              order,
              ...previous.filter((o) => o._id !== order._id),
            ]);
            void app.refresh().catch((e) => app.setError(e.message));
            router.replace({ pathname: "/order", params: { id: order._id } });
          });
        }}
      />
    </Frame>
  );
}
function GCash({ amount }: { amount: string }) {
  const { draft } = useApp();
  const [checked, setChecked] = useState(false);
  return (
    <Frame
      title="GCash QR"
      subtitle="Complete payment to submit your order."
      back={"/review?amount=" + encodeURIComponent(amount)}
    >
      <Card style={{ alignItems: "center" }}>
        <Text style={s.cardTitle}>GCash</Text>
        <View
          style={{
            width: 200,
            height: 200,
            borderWidth: 2,
            borderStyle: "dashed",
            borderColor: colors.line,
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
          }}
        >
          <Art name="qrPlaceholder" size={28} />
          <Text style={{ color: colors.muted, fontWeight: "700" }}>
            QR CODE
          </Text>
          <Text style={s.small}>PLACEHOLDER</Text>
        </View>
        <Text style={s.heading}>{money(Number(amount) || 0)}</Text>
        <Text style={s.small}>
          Merchant: {draft.shop?.name || "Your selected shop"}
        </Text>
        <Text style={[s.body, { color: colors.muted, textAlign: "center" }]}>
          GCash checkout is not connected yet. No payment is requested or
          processed.
        </Text>
      </Card>
      <Button title="Check payment status" onPress={() => setChecked(true)} />
      {checked && (
        <Text accessibilityRole="alert" style={s.muted}>
          No payment provider is connected. Choose pay on pickup to place your
          order.
        </Text>
      )}
      <Button
        title="Change payment method"
        secondary
        onPress={() =>
          router.replace({ pathname: "/review", params: { amount } })
        }
      />
    </Frame>
  );
}
function Orders() {
  const { orders } = useApp();
  const [filter, setFilter] = useState("Active");
  const list = orders.filter((o) =>
    filter === "Active" ? isActiveOrder(o) : isTerminalOrder(o),
  );
  return (
    <Frame
      title="Orders"
      subtitle="Every print, from upload to pickup."
      tab="Orders"
    >
      <Segments
        values={["Active", "History"]}
        value={filter}
        onChange={setFilter}
      />
      {list.map((o) => (
        <OrderCard key={o._id} order={o} />
      ))}
      {!list.length && (
        <Card>
          <Text style={s.cardTitle}>
            {filter === "Active" ? "No active orders" : "No order history yet"}
          </Text>
          <Text style={s.muted}>Your print orders will appear here.</Text>
          <LinkText onPress={() => router.push("/shops")}>
            Browse partner shops →
          </LinkText>
        </Card>
      )}
    </Frame>
  );
}
function OrderDetails({ id }: { id: string }) {
  const app = useApp(),
    { busy, run } = useAction();
  const [cancelling, setCancelling] = useState<{
    id: string;
    reason: string;
  } | null>(null);
  const order = app.orders.find((o) => o._id === id);
  if (!order)
    return (
      <Frame title="Order" tab="Orders" back="/orders">
        <Text style={s.muted}>
          {app.loading
            ? "Loading order…"
            : "Order unavailable. Refresh your orders."}
        </Text>
      </Frame>
    );
  const statuses = ["Queued", "Printing", "Ready for pickup"];
  const index = statuses.indexOf(order.status);
  return (
    <Frame
      title={stage(order.status)}
      subtitle={orderCode(order._id) + " · " + order.shop.name}
      tab="Orders"
      back="/orders"
    >
      {isCancelledOrRejected(order) ? (
        <OrderOutcome order={order} />
      ) : (
        <>
          <PrintingIndicator status={order.status} />
          <Card>
            {statuses.map((status, i) => (
              <View key={status} style={[s.row, { gap: 16 }]}>
                <Text
                  style={{
                    color:
                      i <= index || order.status === "Collected"
                        ? colors.primary
                        : colors.muted,
                    fontSize: 20,
                  }}
                >
                  {i <= index || order.status === "Collected" ? "●" : "○"}
                </Text>
                <View style={{ gap: 4 }}>
                  <Text style={s.body}>{stage(status)}</Text>
                  <Text style={s.small}>
                    {order.status === "Collected" || i < index
                      ? "Completed"
                      : i === index
                        ? "Current status"
                        : "Up next"}
                  </Text>
                </View>
              </View>
            ))}
          </Card>
        </>
      )}
      {order.readyAt && !isCancelledOrRejected(order) && (
        <Card tint>
          <Text style={s.cardTitle}>
            {order.status === "Collected" ? "Collected" : "Ready for pickup"}
          </Text>
          <Text style={s.body}>
            Your prints are ready. Show this code at the shop.
          </Text>
          <Text selectable style={s.pickupCode}>
            {order.pickupCode}
          </Text>
        </Card>
      )}
      <Card>
        <Pair
          label="Payment"
          value={
            isCancelledOrRejected(order)
              ? "No payment due"
              : order.paymentStatus === "paid"
                ? "Paid"
                : money(order.amount) + " due on pickup"
          }
        />
        <Text style={s.body}>
          {order.shop.name} · {order.shop.address}
        </Text>
        {order.shop.contact && (
          <LinkText
            onPress={() => {
              void Linking.openURL("tel:" + order.shop.contact);
            }}
          >
            Contact shop
          </LinkText>
        )}
        <Pair
          label="Print setup"
          value={order.settings.paper + " · " + order.settings.color}
        />
        <Pair
          label="Copies / sides"
          value={order.settings.copies + " · " + order.settings.sides}
        />
        {order.settings.pageRange && (
          <Pair label="Page range" value={order.settings.pageRange} />
        )}
        <Pair
          label={
            isCancelledOrRejected(order) ? "Original quoted total" : "Total"
          }
          value={money(order.amount)}
        />
        {order.files.map((f) => (
          <Button
            key={f.upload}
            title={"Download " + f.name}
            secondary
            loading={busy}
            onPress={() =>
              void run(() => api.openPrintFile(order._id, f.upload))
            }
          />
        ))}
      </Card>
      {canEndOrder(order) &&
        (cancelling?.id === order._id ? (
          <EndOrderPanel
            reason={cancelling.reason}
            onReason={(reason) => setCancelling({ id: order._id, reason })}
            busy={busy}
            onKeep={() => setCancelling(null)}
            onConfirm={() =>
              void run(async () => {
                let updated: Order;
                try {
                  updated = await api.request<Order>(
                    "/orders/" + order._id + "/cancel",
                    {
                      method: "POST",
                      body: JSON.stringify({ reason: cancelling.reason }),
                    },
                  );
                } catch (error) {
                  if ((error as { status?: number }).status === 409) {
                    setCancelling(null);
                    await app.refresh(true).catch(() => {});
                    throw new Error(
                      "The order stage changed. Cancellation is only available before printing. Review the latest status.",
                    );
                  }
                  throw error;
                }
                app.setOrders((list) =>
                  list.map((item) =>
                    item._id === updated._id ? updated : item,
                  ),
                );
                setCancelling(null);
                void app
                  .refresh(true)
                  .catch((error) => app.setError(error.message));
              })
            }
          />
        ) : (
          <Button
            title="Cancel order"
            secondary
            disabled={busy}
            onPress={() => setCancelling({ id: order._id, reason: "" })}
          />
        ))}
      {order.status === "Printing" ? (
        <Text style={s.small}>
          Printing has started. Contact the shop if you need help with this
          order.
        </Text>
      ) : null}
    </Frame>
  );
}
function Profile() {
  const app = useApp(),
    { busy, run } = useAction();
  const user = app.user!;
  const [section, setSection] = useState(""),
    [name, setName] = useState(user.name),
    [phone, setPhone] = useState(user.phone || ""),
    [paper, setPaper] = useState(user.defaultPaper),
    [quiet, setQuiet] = useState(user.reducedMotion);
  const [saved, setSaved] = useState("");
  const initials = user.name
    .split(" ")
    .map((x) => x[0])
    .slice(0, 2)
    .join("");
  return (
    <Frame
      title="Profile"
      subtitle="Your account, preferences and support."
      tab="Profile"
    >
      <Card>
        <View style={[s.avatar, { borderRadius: 28 }]}>
          <Text
            style={{ color: colors.primary, fontWeight: "700", fontSize: 18 }}
          >
            {initials}
          </Text>
        </View>
        <Text style={s.cardTitle}>{user.name}</Text>
        <Text style={s.small}>
          {user.email}
          {user.phone ? " · " + user.phone : ""}
        </Text>
        <LinkText
          onPress={() =>
            setSection(
              section === "Edit personal details"
                ? ""
                : "Edit personal details",
            )
          }
        >
          Edit personal details →
        </LinkText>
      </Card>
      <Card>
        {[
          "Saved shops",
          "Notifications",
          "Payment history",
          "Printing preferences",
          "Help & support",
          "Terms & privacy",
        ].map((label) => (
          <Pressable
            key={label}
            accessibilityRole="button"
            accessibilityState={{ expanded: section === label }}
            onPress={() => {
              setSection(section === label ? "" : label);
              setSaved("");
            }}
            style={[s.between, { minHeight: 44 }]}
          >
            <Text style={s.body}>{label}</Text>
            <Text style={{ color: colors.muted }}>›</Text>
          </Pressable>
        ))}
      </Card>
      {section === "Edit personal details" && (
        <Card>
          <Field label="Full name" value={name} onChangeText={setName} />
          <Field
            label="Mobile number"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
          <Button
            title="Save details"
            loading={busy}
            onPress={() =>
              void run(async () => {
                await app.updateProfile({ name, phone });
                setSaved("Details saved.");
              })
            }
          />
        </Card>
      )}
      {section === "Saved shops" && (
        <View style={{ gap: 16 }}>
          {app.shops
            .filter((s) => user.savedShops?.includes(s._id))
            .map((s) => (
              <ShopCard key={s._id} shop={s} compact />
            ))}
          {!user.savedShops?.length && (
            <Text style={s.muted}>
              Save a shop from its details page to find it here.
            </Text>
          )}
        </View>
      )}
      {section === "Notifications" && (
        <Card>
          <Text style={s.body}>
            {app.notificationMessage ||
              "Your pickup updates appear in Orders. Enable phone alerts to get notified."}
          </Text>
          <Button
            title="Enable phone alerts"
            secondary
            loading={busy}
            onPress={() => void run(app.enableNotifications)}
          />
        </Card>
      )}
      {section === "Payment history" && (
        <Card>
          {app.orders.length ? (
            app.orders.map((o) => (
              <Pair
                key={o._id}
                label={orderCode(o._id)}
                value={money(o.amount) + " · " + paymentLabel(o)}
              />
            ))
          ) : (
            <Text style={s.muted}>No payments yet.</Text>
          )}
        </Card>
      )}
      {section === "Printing preferences" && (
        <Card>
          <Text style={s.cardTitle}>Default paper</Text>
          <Segments
            values={["A4", "Letter", "Legal"] as const}
            value={paper}
            onChange={setPaper}
          />
          <View style={s.between}>
            <Text style={s.body}>Reduce motion</Text>
            <Switch
              accessibilityLabel="Reduce motion"
              value={quiet}
              onValueChange={setQuiet}
              trackColor={{ true: colors.primary, false: colors.line }}
            />
          </View>
          <Button
            title="Save settings"
            loading={busy}
            onPress={() =>
              void run(async () => {
                await app.updateProfile({
                  defaultPaper: paper,
                  reducedMotion: quiet,
                });
                setSaved("Settings saved.");
              })
            }
          />
        </Card>
      )}
      {section === "Help & support" && (
        <Card>
          <Text style={s.cardTitle}>Printing with PaPrint</Text>
          <Text style={s.body}>
            Choose a shop, upload an unlocked PDF, set your print options, then
            place an order. Pay the shop when you collect your prints.
          </Text>
          <Text style={s.body}>
            The shop updates Preparing, Printing, and Done. Your pickup code
            appears when your prints are ready.
          </Text>
          <Text style={s.small}>
            For an order issue, use the contact details on your shop’s page.
          </Text>
        </Card>
      )}
      {section === "Terms & privacy" && (
        <Card>
          <Text style={s.cardTitle}>Preview data notice</Text>
          <Text style={s.body}>
            Account details, preferences and orders are stored for this app.
            Your PDFs are private to your account and the assigned shop. Owner
            registration documents are private to that owner.
          </Text>
          <Text style={s.small}>
            This is an MVP preview. Formal service terms, retention rules and
            account deletion support still need to be finalized before public
            launch.
          </Text>
        </Card>
      )}
      {saved ? (
        <Text accessibilityRole="alert" style={{ color: colors.primary }}>
          {saved}
        </Text>
      ) : null}
      {user.accountType === "owner" && (
        <Button
          title="Switch to shop workspace"
          secondary
          onPress={() => router.push("/workspace")}
        />
      )}
      <Button
        title="Log out"
        secondary
        loading={busy}
        onPress={() =>
          void run(async () => {
            await app.signOut();
            router.replace("/login");
          })
        }
      />
    </Frame>
  );
}
export default function Screen() {
  const params = useLocalSearchParams<{
    page?: string;
    id?: string;
    amount?: string;
    view?: string;
  }>();
  const app = useApp();
  const screen = typeof params.page === "string" ? params.page : "home";
  if (app.restoring) return <AccountLoading />;
  if (!app.user)
    return screen === "signup" ? (
      <AccountScreen signup />
    ) : screen === "login" ? (
      <AccountScreen />
    ) : (
      <Redirect href="/login" />
    );
  if (screen === "login" || screen === "signup")
    return (
      <Redirect
        href={
          app.user.accountType === "admin"
            ? "/admin"
            : app.user.accountType === "owner"
              ? "/workspace"
              : "/home"
        }
      />
    );
  if (app.user.accountType === "admin")
    return screen === "admin" ? (
      <Admin id={params.id || ""} />
    ) : (
      <Redirect href="/admin" />
    );
  if (screen === "admin") return <Redirect href="/" />;
  switch (screen) {
    case "home":
      return <Home />;
    case "shops":
      return <Shops />;
    case "shop":
      return <ShopDetails id={params.id || ""} />;
    case "upload":
      return <Upload />;
    case "options":
      return <Options />;
    case "review":
      return <Review amount={params.amount || ""} />;
    case "gcash":
      return <GCash amount={params.amount || ""} />;
    case "orders":
      return <Orders />;
    case "order":
      return <OrderDetails id={params.id || ""} />;
    case "profile":
      return <Profile />;
    case "workspace":
      return app.user.accountType === "owner" ? (
        <Workspace view={params.view || "Overview"} id={params.id || ""} />
      ) : (
        <Redirect href="/profile" />
      );
    default:
      return <Redirect href="/home" />;
  }
}
