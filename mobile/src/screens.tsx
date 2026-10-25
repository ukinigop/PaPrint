import {
  canEndOrder,
  isActiveOrder,
  isTerminalOrder,
  isCancelledOrRejected,
  paymentLabel,
} from "./orderStatus";
import { EndOrderPanel, OrderOutcome } from "./OrderOutcome";
import { Admin } from "./Admin";
import { Brand } from "./Brand";
import React, { useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
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
  MotionCardPressable,
  MotionReveal,
  DisclosureChevron,
  SuccessNotice,
  UploadProgress,
} from "./motion";
import { AccountLoading, AccountScreen } from "./AccountScreen";
import { useApp } from "./state";
import * as api from "./api";
import type { Order, Shop } from "./types";
import { Workspace } from "./Workspace";
import { StaleSessionError, uploadBatch, placeBooking } from "./customerFlow";
import { phoneDigits, validPhone } from "./accountValidation";
import { useQuote } from "./useQuote";
import { ShopGallery } from "./ShopGallery";
import {
  sortShops,
  distanceKm,
  shopMapUrl,
  savedShopLabel,
  type Coordinates,
} from "./shopDiscovery";

type Tab = "Print" | "Shops" | "Orders" | "Profile";
const tabs = ["Print", "Shops", "Orders", "Profile"] as const;
const icons = {
  Print: ["home", "homeActive"],
  Shops: ["shops", "shopsActive"],
  Orders: ["orders", "ordersActive"],
  Profile: ["profile", "profileActive"],
} as const;
function Frame({
  title,
  subtitle,
  tab,
  back,
  scrollRef,
  children,
}: {
  title: string;
  subtitle?: string;
  tab?: Tab;
  back?: string;
  scrollRef?: React.RefObject<ScrollView | null>;
  children: React.ReactNode;
}) {
  const app = useApp();
  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView
        style={s.app}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          ref={scrollRef}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={app.loading}
              onRefresh={() => {
                void app.refresh(true);
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
              <Brand width={106} />
              <Text style={{ fontSize: 11, color: colors.primary }}>NAGA</Text>
            </View>
            <Text style={[s.heading, { marginTop: 0, letterSpacing: 0 }]}>
              {title}
            </Text>
            {subtitle && (
              <Text style={[s.body, { color: colors.muted }]}>{subtitle}</Text>
            )}
          </View>
          {app.error ? (
            <View
              accessibilityRole="alert"
              style={[s.error, { flexDirection: "column" }]}
            >
              <Text style={{ color: colors.error }}>{app.error}</Text>
              <LinkText onPress={() => app.setError("")}>Dismiss</LinkText>
            </View>
          ) : null}
          {app.refreshError ? (
            <Card>
              <Text accessibilityRole="alert" style={{ color: colors.error }}>
                {app.refreshError}
              </Text>
              <Text style={s.small}>
                Your last loaded orders are still shown. Refresh to check the
                latest status.
              </Text>
              <Button
                title="Retry refresh"
                secondary
                loading={app.loading}
                onPress={() => void app.refresh(true)}
              />
            </Card>
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
                  router.replace(
                    (t === "Print"
                      ? "/home"
                      : "/" + t.toLowerCase()) as "/home",
                  )
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
      </KeyboardAvoidingView>
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
    const current = api.captureSession();
    try {
      await action();
    } catch (e) {
      if (current() && !(e instanceof StaleSessionError))
        setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return { busy, run };
}
function ShopCard({
  shop,
  compact,
  distance,
}: {
  shop: Shop;
  compact?: boolean;
  distance?: number | null;
}) {
  return (
    <MotionCardPressable
      accessibilityRole="button"
      accessibilityLabel={"View " + shop.name}
      onPress={() =>
        router.push({ pathname: "/shop", params: { id: shop._id } })
      }
    >
      <Card>
        <ShopGallery compact />
        <View style={[s.row, { gap: 12 }]}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={s.cardTitle}>{shop.name}</Text>
            <Text style={s.small}>{shop.locationAddress || shop.address}</Text>
          </View>
        </View>
        <Text style={s.small}>{savedShopLabel(shop.savedCount)}</Text>
        <Text style={s.small}>
          {shop.queue?.ongoing ?? 0} ongoing orders ·{" "}
          {shop.queue?.preparing ?? 0} preparing · {shop.queue?.printing ?? 0}{" "}
          printing
        </Text>
        {distance !== undefined && (
          <Text style={s.small}>
            {distance === null
              ? "Distance unavailable · shop pin not set"
              : `${distance.toFixed(1)} km away · straight-line distance`}
          </Text>
        )}
        {!compact && (
          <>
            <Text style={[s.body, { color: colors.muted }]}>
              B&W from {money(shop.monoRate)} / page · Color from{" "}
              {money(shop.colorRate)}
            </Text>
            <Pill tone={shop.open ? "positive" : "neutral"}>
              {shop.open ? "Open now" : "Closed"}
            </Pill>
          </>
        )}
      </Card>
    </MotionCardPressable>
  );
}
function OrderCard({ order }: { order: Order }) {
  return (
    <MotionCardPressable
      accessibilityRole="button"
      accessibilityLabel={"View order " + orderCode(order._id)}
      onPress={() =>
        router.push({ pathname: "/order", params: { id: order._id } })
      }
    >
      <Card>
        <View style={s.between}>
          <Text style={s.cardTitle}>{orderCode(order._id)}</Text>
          <Pill
            tone={
              order.status === "Ready for pickup"
                ? "positive"
                : order.status === "Rejected"
                  ? "negative"
                  : isTerminalOrder(order)
                    ? "neutral"
                    : "primary"
            }
          >
            {stage(order.status)}
          </Pill>
        </View>
        <Text style={s.body}>{order.shop.name}</Text>
        <Text style={s.small}>
          {order.files[0]?.name || "Documents"}
          {order.files.length > 1 ? ` +${order.files.length - 1} more` : ""}
        </Text>
        <Text style={s.small}>
          {isCancelledOrRejected(order)
            ? "No payment due"
            : order.paymentStatus === "paid"
              ? money(order.amount) + " · Paid"
              : "Pay on pickup · " + money(order.amount) + " due"}
        </Text>
        <Text style={{ color: colors.primary }}>View order →</Text>
      </Card>
    </MotionCardPressable>
  );
}
function Home() {
  const { user, shops, orders, loading } = useApp();
  const active = orders.find(isActiveOrder);
  return (
    <Frame
      title="Print"
      subtitle={
        "Hello, " + user?.name.split(" ")[0] + ". What are we printing?"
      }
      tab="Print"
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
      <Text style={s.sectionTitle}>Naga partners</Text>
      {shops.slice(0, 1).map((shop) => (
        <ShopCard key={shop._id} shop={shop} compact />
      ))}
      {!shops.length && (
        <Text style={s.small}>
          {loading
            ? "Loading partner shops…"
            : "Partner shops will appear here once they are approved."}
        </Text>
      )}
      <LinkText onPress={() => router.push("/shops")}>See all shops →</LinkText>
    </Frame>
  );
}
function Shops() {
  const { shops, loading } = useApp();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All shops");
  const [sort, setSort] = useState("Recommended");
  const [origin, setOrigin] = useState<Coordinates | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationNotice, setLocationNotice] = useState("");
  const locationRequest = useRef(0);
  async function chooseSort(value: string) {
    const request = ++locationRequest.current;
    setSort(value);
    setLocationNotice("");
    setLocating(false);
    if (value !== "Nearby" || origin) return;
    if (!shops.some((shop) => shop.coordinates)) {
      setLocationNotice(
        "Shop map pins aren’t available yet. You can still find each shop using its map button.",
      );
      return;
    }
    setLocating(true);
    try {
      const location = await import("expo-location");
      if (!(await location.requestForegroundPermissionsAsync()).granted)
        throw new Error(
          "Location access is off. Enable it in your browser or device settings, then try Nearby again.",
        );
      const position = await Promise.race([
        location.getCurrentPositionAsync({
          accuracy: location.Accuracy.Balanced,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () =>
              reject(
                new Error("Location took too long. Please try Nearby again."),
              ),
            15000,
          ),
        ),
      ]);
      if (locationRequest.current === request) setOrigin(position.coords);
    } catch (error) {
      if (locationRequest.current === request)
        setLocationNotice(
          error instanceof Error
            ? error.message
            : "Couldn’t find your location. Try again.",
        );
    } finally {
      if (locationRequest.current === request) setLocating(false);
    }
  }
  const result = sortShops(
    shops.filter(
      (s) =>
        (filter !== "Open now" || s.open) &&
        (s.name + " " + (s.locationAddress || s.address))
          .toLowerCase()
          .includes(query.toLowerCase()),
    ),
    sort,
    origin,
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
        values={["All shops", "Open now"]}
        value={filter}
        onChange={setFilter}
      />
      <Text style={s.small}>{result.length} partner shops · Naga City</Text>
      <Segments
        values={["Recommended", "Most Saved", "Nearby"]}
        value={sort}
        onChange={(value) => void chooseSort(value)}
      />
      {sort === "Nearby" && (
        <Text style={s.small}>
          {locating
            ? "Finding your location…"
            : locationNotice ||
              (origin
                ? "Closest shops first. Shops without a map pin appear last."
                : "Use your location to find the closest shops. Your location isn’t saved to your account.")}
        </Text>
      )}
      {result.map((shop) => (
        <ShopCard
          key={shop._id}
          shop={shop}
          distance={
            sort === "Nearby" && origin
              ? distanceKm(origin, shop.coordinates)
              : undefined
          }
        />
      ))}
      {!result.length && (
        <Text style={s.muted}>
          {!shops.length && loading
            ? "Loading partner shops…"
            : !shops.length
              ? "No partner shops are available yet. Please check back soon."
              : filter === "Open now" && !query.trim()
                ? "No shops are open right now. Check All shops for contact details and hours."
                : "No matching shops. Try another name or filter."}
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
        <ShopGallery />
        <Text style={s.cardTitle}>{shop.name}</Text>
        <Text style={s.small}>{savedShopLabel(shop.savedCount)}</Text>
        <Pill>{shop.open ? "Open now" : "Closed"}</Pill>
        <Text style={s.body}>{shop.locationAddress || shop.address}</Text>
        <Pair label="Hours" value={shop.hours || "Contact shop for hours"} />
        <Pair label="Contact" value={shop.contact || "Not listed"} />
      </Card>
      <Card>
        <Text style={s.cardTitle}>Current print queue</Text>
        <Pair label="Ongoing orders" value={String(shop.queue?.ongoing ?? 0)} />
        <Pair label="Preparing" value={String(shop.queue?.preparing ?? 0)} />
        <Pair label="Printing" value={String(shop.queue?.printing ?? 0)} />
        <Pair label="Ready for pickup" value={String(shop.queue?.ready ?? 0)} />
        <Text style={s.small}>
          Updates as the shop progresses orders. Order counts aren’t a wait-time
          estimate; document sizes and printing settings vary.
        </Text>
      </Card>
      <Card>
        <Text style={s.cardTitle}>Services</Text>
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
      {!shop.open && (
        <Text style={s.small}>
          This shop is closed for new bookings. Existing orders can still be
          collected when the shop confirms they are ready. Contact the shop for
          pickup arrangements.
        </Text>
      )}
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
      <Button
        secondary
        title="Where is this shop?"
        onPress={() => {
          void Linking.openURL(shopMapUrl(shop)).catch(() =>
            app.setError("Couldn’t open Maps. Please try again."),
          );
        }}
      />
      <Text style={s.small}>
        Opens Google Maps
        {shop.coordinates
          ? " at the shop’s map pin."
          : " using the shop’s registered address. Confirm the result with the shop if needed."}
      </Text>
    </Frame>
  );
}
function FileCards({ busy = false }: { busy?: boolean }) {
  const { draft, setDraft } = useApp();
  return (
    <>
      {draft.files.map((f) => (
        <Card key={f._id}>
          <View style={s.row}>
            <Art name="file" size={28} />
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              <Text
                style={s.body}
                numberOfLines={2}
                ellipsizeMode="middle"
                accessibilityLabel={f.name}
              >
                {f.name}
              </Text>
              <Text style={s.small}>
                {f.pages} pages · {(f.size / 1024 / 1024).toFixed(2)} MB ·
                Uploaded
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={"Remove " + f.name}
              disabled={busy}
              accessibilityState={{ disabled: busy }}
              onPress={() =>
                setDraft((d) => ({
                  ...d,
                  files: d.files.filter((x) => x._id !== f._id),
                }))
              }
              style={{
                padding: 10,
                minWidth: 44,
                minHeight: 44,
                alignItems: "center",
                justifyContent: "center",
                opacity: busy ? 0.5 : 1,
              }}
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
  const [remaining, setRemaining] = useState<
    DocumentPicker.DocumentPickerAsset[]
  >([]);
  const [uploadError, setUploadError] = useState("");
  const [complete, setComplete] = useState(false);
  if (!app.draft.shop) return <Redirect href="/shops" />;
  async function upload(assets: DocumentPicker.DocumentPickerAsset[]) {
    const current = api.captureSession();
    const key = app.draft.requestKey;
    setComplete(false);
    setUploadError("");
    const result = await uploadBatch(
      assets,
      (asset) => api.uploadFiles([asset]),
      (files) =>
        app.setDraft((d) =>
          d.requestKey === key ? { ...d, files: [...d.files, ...files] } : d,
        ),
      (completed, total) => setProgress({ completed, total }),
      current,
    );
    setRemaining(result.remaining);
    setUploadError(result.error);
    setComplete(!result.remaining.length);
  }
  async function pick() {
    const current = api.captureSession();
    const result = await DocumentPicker.getDocumentAsync({
      type: "application/pdf",
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (!current()) throw new StaleSessionError();
    if (result.canceled) return;
    if (result.assets.length + app.draft.files.length > 5)
      throw new Error("Choose up to 5 PDFs per order.");
    if (result.assets.some((f) => (f.size || 0) > app.maxUploadBytes))
      throw new Error(
        "Each PDF must be " +
          app.maxUploadBytes / 1024 / 1024 +
          " MB or smaller.",
      );
    await upload(result.assets);
  }
  return (
    <Frame
      title="Upload files"
      subtitle="01 / Files → 02 / Options → 03 / Review"
      back="/shops"
    >
      <Card>
        <View style={s.row}>
          <Art name="shop" size={24} />
          <Text style={s.cardTitle}>{app.draft.shop.name}</Text>
        </View>
        <Text style={s.small}>
          {app.draft.shop.locationAddress || app.draft.shop.address}
        </Text>
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
        {busy && progress && <UploadProgress {...progress} />}
      </Card>
      {uploadError && (
        <Card>
          <Text accessibilityRole="alert" style={{ color: colors.error }}>
            {uploadError}
          </Text>
          <Text style={s.body}>
            {remaining.length} file{remaining.length === 1 ? "" : "s"} still
            need uploading. Successfully uploaded files are kept below.
          </Text>
          {remaining.map((asset, index) => (
            <Text
              key={index}
              style={s.small}
              numberOfLines={2}
              accessibilityLabel={asset.name}
            >
              {asset.name}
            </Text>
          ))}
          <Button
            title="Retry remaining files"
            secondary
            loading={busy}
            onPress={() => void run(() => upload(remaining))}
          />
          <Text style={s.small}>
            If a PDF is invalid or too large, choose a corrected file instead.
          </Text>
        </Card>
      )}
      <FileCards busy={busy} />
      <Text style={s.small}>
        PDFs print in the order shown. Page ranges count continuously across
        these files.
      </Text>
      {!!app.draft.files.length && !busy && !remaining.length && (
        <>
          {!busy && !remaining.length && (
            <Pill>{complete ? "Upload complete" : "Uploaded files ready"}</Pill>
          )}
          <Text style={s.small}>
            Review your file before setting print options.
          </Text>
        </>
      )}
      <Button
        title="Continue to options"
        disabled={!app.draft.files.length || busy || remaining.length > 0}
        onPress={() => router.push("/options")}
      />
    </Frame>
  );
}
function Options() {
  const app = useApp(),
    { busy, run } = useAction();
  const quoteBody = JSON.stringify({
    shopId: app.draft.shop?._id,
    fileIds: app.draft.files.map((f) => f._id),
    settings: app.draft.settings,
    requestKey: app.draft.requestKey,
  });
  const quote = useQuote(
    quoteBody,
    !!app.draft.shop && !!app.draft.files.length,
  );
  const rangeError =
    quote.status === "error" && /page|range/i.test(quote.error || "");
  if (!app.draft.shop || !app.draft.files.length)
    return <Redirect href="/upload" />;
  const { settings } = app.draft;
  const change = (data: Partial<typeof settings>) => {
    app.setDraft((d) => ({ ...d, settings: { ...d.settings, ...data } }));
  };
  const field = (label: string, props: TextInputProps) => (
    <Field label={label} {...props} />
  );
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
      {rangeError && (
        <Text accessibilityRole="alert" style={{ color: colors.error }}>
          {quote.error}
        </Text>
      )}
      <Text style={s.small}>Paper size</Text>
      <Segments
        values={["A4", "Letter", "Legal"] as const}
        value={settings.paper}
        onChange={(paper) => change({ paper })}
      />
      <Card>
        <Text style={s.small}>Copies</Text>
        <View style={s.between}>
          <Button
            title="−"
            secondary
            disabled={settings.copies <= 1}
            onPress={() => change({ copies: settings.copies - 1 })}
          />
          <Text style={[s.cardTitle, { flex: 1, textAlign: "center" }]}>
            {settings.copies}
          </Text>
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
        value={
          quote.status === "success" && quote.quote
            ? money(quote.quote.amount)
            : quote.status === "loading"
              ? "Calculating…"
              : "Estimate unavailable"
        }
      />
      {quote.status === "error" && (
        <Card>
          {!rangeError && (
            <Text accessibilityRole="alert" style={{ color: colors.error }}>
              {quote.error}
            </Text>
          )}
          <Button title="Retry estimate" secondary onPress={quote.retry} />
        </Card>
      )}
      <Button
        title="Review order"
        loading={busy}
        disabled={quote.status !== "success"}
        onPress={() =>
          void run(async () => {
            if (!quote.quote || quote.status !== "success") return;
            router.push({
              pathname: "/review",
              params: { amount: String(quote.quote.amount) },
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
  const [reviewedAmount, setReviewedAmount] = useState(Number(amount) || 0);
  const [priceNotice, setPriceNotice] = useState("");
  const [submitted, setSubmitted] = useState("");
  if (!app.draft.shop || !app.draft.files.length)
    return submitted ? (
      <Redirect href={{ pathname: "/order", params: { id: submitted } }} />
    ) : (
      <Redirect href="/shops" />
    );
  const { draft } = app;
  const pages = draft.files.reduce((n, f) => n + f.pages, 0);
  return (
    <Frame
      title="Review order"
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
      <Card tint>
        <Text style={s.cardTitle}>Pay on pickup</Text>
        <Text style={s.body}>
          Pay {money(reviewedAmount)} in cash at the shop when you collect your
          prints. No online payment is needed.
        </Text>
      </Card>
      <Button
        title="Place order · Pay on pickup"
        loading={busy}
        onPress={() => {
          void run(async () => {
            const current = api.captureSession();
            const result = await placeBooking(draft, reviewedAmount, (body) =>
              api.request<Order>("/orders", { method: "POST", body }),
            );
            if (!current()) return;
            if (!result.order) {
              setReviewedAmount(result.amount);
              setPriceNotice(
                "The shop updated its rates. Review the new total and press Place order again to confirm.",
              );
              return;
            }
            const order = result.order;
            setSubmitted(order._id);
            app.completeBooking(order, draft.requestKey);
            void app.refresh();
            router.replace({ pathname: "/order", params: { id: order._id } });
          });
        }}
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
    <Frame title="Orders" subtitle="Track your prints and pickup." tab="Orders">
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
  return (
    <Frame
      title={stage(order.status)}
      subtitle={orderCode(order._id) + " · " + order.shop.name}
      tab="Orders"
      back="/orders"
    >
      {isCancelledOrRejected(order) && <OrderOutcome order={order} />}
      {order.status === "Queued" && (
        <Text style={s.muted}>
          The shop is reviewing your files and print settings.
        </Text>
      )}
      {order.readyAt && order.status === "Ready for pickup" && (
        <Card tint>
          <Text style={s.cardTitle}>Ready for pickup</Text>
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
                : "Pay on pickup"
          }
        />
        <Text style={s.body}>
          {order.shop.name} · {order.shop.locationAddress || order.shop.address}
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
        <Text style={s.cardTitle}>Documents</Text>
        {order.files.map((file) => (
          <Text key={file.upload} style={s.body}>
            {file.name}
          </Text>
        ))}
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
  const app = useApp();
  const { busy: savingDetails, run: saveDetails } = useAction();
  const { busy: savingSettings, run: saveSettings } = useAction();
  const { busy: enablingAlerts, run: enableAlerts } = useAction();
  const { busy: signingOut, run: signOut } = useAction();
  const user = app.user!;
  const [section, setSection] = useState(""),
    [name, setName] = useState(user.name),
    [phone, setPhone] = useState(user.phone || ""),
    [paper, setPaper] = useState(user.defaultPaper),
    [quiet, setQuiet] = useState(user.reducedMotion);
  const [saved, setSaved] = useState("");
  function toggleSection(next: string) {
    const target = section === next ? "" : next;
    setSection(target);
    setSaved("");
  }
  const initials = user.name
    .split(" ")
    .map((x) => x[0])
    .slice(0, 2)
    .join("");
  const sectionContent = (
    <MotionReveal key={section} style={{ gap: 16, paddingVertical: 12 }}>
      {section === "Edit personal details" && (
        <View style={{ gap: 16 }}>
          <Field label="Full name" value={name} onChangeText={setName} />
          <Field
            label="Mobile number"
            value={phone}
            onChangeText={(value) => setPhone(phoneDigits(value))}
            keyboardType="phone-pad"
            maxLength={11}
          />
          <Button
            title="Save details"
            loading={savingDetails}
            onPress={() =>
              void saveDetails(async () => {
                if (!validPhone(phone))
                  throw new Error("Enter an 11-digit mobile number.");
                await app.updateProfile({ name, phone });
                setSaved("Details saved.");
              })
            }
          />
        </View>
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
        <View style={{ gap: 16 }}>
          <Text style={s.body}>
            {Platform.OS === "web"
              ? "Your pickup updates appear in Orders. Phone alerts are available in the PaPrint mobile app."
              : app.notificationMessage ||
                "Your pickup updates appear in Orders. Enable phone alerts to get notified."}
          </Text>
          {Platform.OS !== "web" && (
            <Button
              title="Enable phone alerts"
              secondary
              loading={enablingAlerts}
              onPress={() => void enableAlerts(app.enableNotifications)}
            />
          )}
        </View>
      )}
      {section === "Payment history" && (
        <View style={{ gap: 16 }}>
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
        </View>
      )}
      {section === "Printing preferences" && (
        <View style={{ gap: 16 }}>
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
            loading={savingSettings}
            onPress={() =>
              void saveSettings(async () => {
                await app.updateProfile({
                  defaultPaper: paper,
                  reducedMotion: quiet,
                });
                setSaved("Settings saved.");
              })
            }
          />
        </View>
      )}
      {section === "Help & support" && (
        <View style={{ gap: 16 }}>
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
        </View>
      )}
      {section === "Terms & privacy" && (
        <View style={{ gap: 16 }}>
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
        </View>
      )}
      {saved ? <SuccessNotice>{saved}</SuccessNotice> : null}
    </MotionReveal>
  );
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
        <LinkText onPress={() => toggleSection("Edit personal details")}>
          {section === "Edit personal details"
            ? "Hide personal details ↑"
            : "Edit personal details →"}
        </LinkText>
        {section === "Edit personal details" && sectionContent}
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
          <View key={label} style={{ gap: 8 }}>
            <Pressable
              accessibilityLabel={label}
              accessibilityRole="button"
              accessibilityState={{ expanded: section === label }}
              onPress={() => toggleSection(label)}
              style={[s.between, { minHeight: 44 }]}
            >
              <Text
                style={[s.body, section === label && { color: colors.primary }]}
              >
                {label}
              </Text>
              <DisclosureChevron expanded={section === label} />
            </Pressable>
            {section === label && sectionContent}
          </View>
        ))}
      </Card>

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
        loading={signingOut}
        onPress={() =>
          void signOut(async () => {
            await app.signOut();
            router.replace("/login");
          })
        }
      />
    </Frame>
  );
}
function AccountRoute() {
  const params = useLocalSearchParams<{
    page?: string;
    id?: string;
    amount?: string;
    view?: string;
    status?: string;
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
      <Admin id={params.id || ""} status={params.status} />
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
      return (
        <Redirect
          href={{
            pathname: "/review",
            params: { amount: params.amount || "" },
          }}
        />
      );
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
export default function Screen() {
  const { user } = useApp();
  // Reset account-owned screen state without remounting the navigation stack.
  return (
    <AccountRoute
      key={user ? user.id + ":" + user.accountType : "signed-out"}
    />
  );
}
