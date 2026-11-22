import {
  canEndOrder,
  isActiveOrder,
  isTerminalOrder,
  isCancelledOrRejected,
} from "./orderStatus";
import { EndOrderPanel, OrderOutcome } from "./OrderOutcome";
import { Admin } from "./Admin";
import { Brand } from "./Brand";
import Feather from "@expo/vector-icons/Feather";
import { BookingProgress, CityMark, StudioPrint } from "./Studio";
import { UploadFilePreview } from "./UploadFilePreview";
import { pricingSummary } from "./pricingSummary";
import { canEstimatePickup, pickupTimeLabel } from "./pickupEstimate";
import React, { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Redirect, router, useLocalSearchParams, type Href } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { Text } from "./ui";
import { useStyles } from "./styles";
import { useAppearance } from "./Appearance";
import { AppearanceSettings } from "./AppearanceSettings";
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
import { BookmarkButton } from "./BookmarkButton";
import type { CustomerTab as Tab } from "./customerTabs";
import {
  sortShops,
  distanceKm,
  shopMapUrl,
  savedShopLabel,
  shopSummary,
  shopHours,
  type Coordinates,
} from "./shopDiscovery";

function Frame({
  title,
  subtitle,
  tab,
  back,
  backLabel = "Back",
  footer,
  bookingStep,
  scrollRef,
  children,
}: {
  title: string;
  subtitle?: string;
  tab?: Tab;
  back?: Href;
  backLabel?: string;
  footer?: React.ReactNode;
  bookingStep?: React.ComponentProps<typeof BookingProgress>["current"];
  scrollRef?: React.RefObject<ScrollView | null>;
  children: React.ReactNode;
}) {
  const s = useStyles();
  const { colors } = useAppearance();
  const app = useApp();
  const { height } = useWindowDimensions();
  const sticky = !!footer && height >= 520;
  const errorNotice = app.error ? (
    <View accessibilityRole="alert" style={[s.error, { alignItems: "center" }]}>
      <Text style={{ flex: 1, color: colors.error }}>{app.error}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss error"
        style={s.iconAction}
        onPress={() => app.setError("")}
      >
        <Feather name="x" size={18} color={colors.error} />
      </Pressable>
    </View>
  ) : null;
  return (
    <SafeAreaView
      style={s.safe}
      edges={tab ? ["top", "left", "right"] : undefined}
    >
      <KeyboardAvoidingView
        style={s.app}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={app.loading}
              onRefresh={() => {
                void app.refresh(true);
              }}
            />
          }
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 16,
            gap: 18,
            paddingBottom: sticky ? 18 : 28,
          }}
        >
          <View style={s.masthead}>
            {back ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  backLabel === "Back" ? "Go back" : "Back to " + backLabel
                }
                onPress={() => router.dismissTo(back)}
                style={[s.row, { minWidth: 44, minHeight: 44 }]}
              >
                <Feather name="arrow-left" size={19} color={colors.primary} />
                <Text style={s.fieldLabel}>{backLabel}</Text>
              </Pressable>
            ) : (
              <Brand width={34} />
            )}
            <CityMark />
          </View>
          <View style={{ gap: 6 }}>
            <Text accessibilityRole="header" style={s.heading}>
              {title}
            </Text>
            {subtitle && (
              <Text style={[s.body, { color: colors.muted }]}>{subtitle}</Text>
            )}
          </View>
          {bookingStep && <BookingProgress current={bookingStep} />}
          {!footer && errorNotice}
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
          {!!footer && !sticky && (
            <View style={{ gap: 8 }}>
              {errorNotice}
              {footer}
            </View>
          )}
        </ScrollView>
        {sticky && (
          <View style={s.actionFooter}>
            {errorNotice}
            {footer}
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
  distance,
  from,
}: {
  shop: Shop;
  distance?: number | null;
  from?: string;
}) {
  const s = useStyles();
  const { colors } = useAppearance();
  const address = shop.locationAddress || shop.address;
  const status = shop.open ? "Open now" : "Closed";
  const hours = shopHours(shop.hours);
  const ongoing = shop.queue?.ongoing ?? 0;
  const distanceLabel =
    distance === undefined
      ? undefined
      : distance === null
        ? "Distance unavailable"
        : `${distance.toFixed(1)} km away`;
  return (
    <View style={{ position: "relative" }}>
      <MotionCardPressable
        accessibilityRole="button"
        accessibilityLabel={[
          "View " + shop.name,
          address,
          status,
          shopSummary(shop),
          distanceLabel,
        ]
          .filter(Boolean)
          .join(", ")}
        onPress={() =>
          router.push({ pathname: "/shop", params: { id: shop._id, from } })
        }
      >
        <Card style={s.shopCard}>
          <View style={s.shopCardHeader}>
            <View style={s.shopIcon}>
              <Feather
                name="printer"
                size={22}
                color={colors.primary}
                accessible={false}
              />
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={s.cardTitle}>{shop.name}</Text>
              <View style={[s.row, { alignItems: "flex-start", gap: 5 }]}>
                <Feather
                  name="map-pin"
                  size={13}
                  color={colors.accent}
                  accessible={false}
                  style={{ marginTop: 3 }}
                />
                <Text style={[s.small, { flex: 1 }]}>{address}</Text>
              </View>
            </View>
          </View>
          <View style={[s.row, { flexWrap: "wrap", rowGap: 4 }]}>
            <Pill tone={shop.open ? "positive" : "neutral"}>{status}</Pill>
            <Text style={[s.small, { flexShrink: 1 }]}>{hours}</Text>
            {distanceLabel && <Text style={s.small}>{distanceLabel}</Text>}
          </View>
          <View style={s.shopCardFooter}>
            <Text style={[s.small, { flex: 1 }]}>
              {savedShopLabel(shop.savedCount)} · {ongoing}{" "}
              {ongoing === 1 ? "Ongoing Order" : "Ongoing Orders"}
            </Text>
            <View style={s.shopCardArrow}>
              <Feather
                name="arrow-right"
                size={16}
                color={colors.primary}
                accessible={false}
              />
            </View>
          </View>
        </Card>
      </MotionCardPressable>
      <View style={s.shopCardBookmark}>
        <BookmarkButton shopId={shop._id} name={shop.name} />
      </View>
    </View>
  );
}
function OrderCard({
  order,
  from,
}: {
  order: Order;
  from: "home" | "active" | "history";
}) {
  const s = useStyles();
  const { colors } = useAppearance();
  const ready = order.status === "Ready for pickup";
  return (
    <MotionCardPressable
      accessibilityRole="button"
      accessibilityLabel={
        "View order " +
        orderCode(order._id) +
        ", " +
        order.shop.name +
        ", " +
        stage(order.status)
      }
      onPress={() =>
        router.push({ pathname: "/order", params: { id: order._id, from } })
      }
    >
      <Card>
        <View style={[s.between, { flexWrap: "wrap" }]}>
          <View style={s.row}>
            <Feather name="file-text" size={18} color={colors.primary} />
            <Text style={[s.fieldLabel, { letterSpacing: 0.5 }]}>
              {orderCode(order._id)}
            </Text>
          </View>
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
        <View style={{ gap: 3 }}>
          <View style={s.between}>
            <Text style={s.cardTitle}>{order.shop.name}</Text>
            <Feather
              name="chevron-right"
              size={18}
              color={colors.muted}
              accessible={false}
            />
          </View>
          <Text style={s.small} numberOfLines={2}>
            {order.files[0]?.name || "Documents"}
            {order.files.length > 1 ? ` +${order.files.length - 1} more` : ""}
          </Text>
        </View>
        <Text style={s.small}>
          {isCancelledOrRejected(order)
            ? "No payment due"
            : order.paymentStatus === "paid"
              ? money(order.amount) + " · Paid"
              : "Pay on pickup · " + money(order.amount) + " due"}
        </Text>
        {canEstimatePickup(order) && order.estimatedPickupAt && (
          <Text style={[s.small, { color: colors.primary }]}>
            Estimated pickup: {pickupTimeLabel(order.estimatedPickupAt)}
          </Text>
        )}
        {ready && (
          <Text style={[s.fieldLabel, { color: colors.primary }]}>
            Show pickup code →
          </Text>
        )}
      </Card>
    </MotionCardPressable>
  );
}
function Home() {
  const s = useStyles();
  const { colors } = useAppearance();
  const { user, shops, orders, loading, draft } = useApp();
  const activeOrders = orders.filter(isActiveOrder);
  const active =
    activeOrders.find((order) => order.status === "Ready for pickup") ||
    activeOrders[0];
  const resume = !!draft.shop && draft.files.length > 0;
  const partner =
    shops.find((shop) => shop.open && user?.savedShops?.includes(shop._id)) ||
    shops.find((shop) => shop.open) ||
    shops[0];
  const activeSection = active && (
    <View style={{ gap: 8 }}>
      <View style={[s.between, { flexWrap: "wrap" }]}>
        <Text style={s.sectionTitle}>Your current order</Text>
        {activeOrders.length > 1 && (
          <LinkText onPress={() => router.navigate("/orders")}>
            All {activeOrders.length} active →
          </LinkText>
        )}
      </View>
      <OrderCard order={active} from="home" />
    </View>
  );
  return (
    <Frame
      title="Print"
      subtitle={
        "Hello, " + user?.name.split(" ")[0] + ". What are we printing?"
      }
      tab="Print"
    >
      {active?.status === "Ready for pickup" && activeSection}
      <MotionCardPressable
        accessibilityRole="button"
        accessibilityLabel={
          resume ? "Continue print order" : "Start a print order"
        }
        onPress={() =>
          resume ? router.push("/options") : router.navigate("/shops")
        }
      >
        <View
          style={{
            borderRadius: 20,
            overflow: "hidden",
            backgroundColor: colors.feature,
          }}
        >
          <StudioPrint
            style={{
              width: "100%",
              aspectRatio: active || resume ? 3.2 : 2.05,
            }}
          />
          <View
            style={[s.between, { paddingHorizontal: 18, paddingVertical: 16 }]}
          >
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={[s.sectionTitle, { color: colors.featureInk }]}>
                {resume ? "Continue print order" : "Start a print order"}
              </Text>
              <Text style={[s.small, { color: colors.featureMuted }]}>
                {resume
                  ? `${draft.shop?.name} · ${draft.files.length} ${draft.files.length === 1 ? "file" : "files"}`
                  : "Choose a partner shop"}
              </Text>
            </View>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: colors.featureMuted,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Feather name="arrow-up-right" size={21} color={colors.feature} />
            </View>
          </View>
        </View>
      </MotionCardPressable>
      {active?.status !== "Ready for pickup" && activeSection}
      {!active && !resume && partner && (
        <View style={{ gap: 8 }}>
          <View style={s.between}>
            <Text style={s.sectionTitle}>
              {user?.savedShops?.includes(partner._id)
                ? "Bookmarked shop"
                : "Partner shop"}
            </Text>
            <LinkText onPress={() => router.navigate("/shops")}>
              All shops →
            </LinkText>
          </View>
          <ShopCard shop={partner} from="home" />
        </View>
      )}
      {!active && !resume && !shops.length && (
        <Text style={s.small}>
          {loading
            ? "Loading partner shops…"
            : "Partner shops will appear here once they are approved."}
        </Text>
      )}
    </Frame>
  );
}
function Shops({ view }: { view?: string }) {
  const s = useStyles();
  const { colors } = useAppearance();
  const { shops, loading, user } = useApp();
  const [query, setQuery] = useState("");
  const filter =
    view === "bookmarks"
      ? "Bookmarks"
      : view === "all"
        ? "All shops"
        : "Open now";
  const [sorting, setSorting] = useState(false);
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
        (filter !== "Bookmarks" || !!user?.savedShops?.includes(s._id)) &&
        (s.name + " " + (s.locationAddress || s.address))
          .toLowerCase()
          .includes(query.toLowerCase()),
    ),
    sort,
    origin,
  );
  return (
    <Frame title="Shops" tab="Shops">
      <Field
        label="Find a shop"
        placeholder="Search shops or neighborhood"
        value={query}
        onChangeText={setQuery}
      />
      <Segments
        values={["Open now", "All shops", "Bookmarks"]}
        value={filter}
        onChange={(next) =>
          router.setParams({
            view:
              next === "Bookmarks"
                ? "bookmarks"
                : next === "All shops"
                  ? "all"
                  : "open",
          })
        }
      />
      <View style={{ gap: 5 }}>
        <View style={[s.between, { flexWrap: "wrap" }]}>
          <Text accessibilityLiveRegion="polite" style={s.small}>
            {result.length} {result.length === 1 ? "shop" : "shops"}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={"Sort shops, " + sort}
            accessibilityState={{ expanded: sorting }}
            aria-expanded={sorting}
            onPress={() => setSorting(!sorting)}
            style={[s.row, { minHeight: 44, gap: 6 }]}
          >
            <Feather name="sliders" size={15} color={colors.primary} />
            <Text style={s.fieldLabel}>{sort}</Text>
            <Feather
              name={sorting ? "chevron-up" : "chevron-down"}
              size={15}
              color={colors.primary}
            />
          </Pressable>
        </View>
        {sorting && (
          <Segments
            values={["Recommended", "Most Bookmarked", "Nearby"]}
            value={sort}
            onChange={(value) => {
              setSorting(false);
              void chooseSort(value);
            }}
          />
        )}
      </View>
      {sort === "Nearby" && (
        <Text style={s.small}>
          {locating
            ? "Finding your location…"
            : locationNotice ||
              (origin
                ? "Sorted by straight-line distance. Shops without a map pin appear last."
                : "Use your location to find the closest shops. Your location isn’t saved to your account.")}
        </Text>
      )}
      {result.map((shop) => (
        <ShopCard
          key={shop._id}
          shop={shop}
          from={view}
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
              : filter === "Bookmarks" && !query.trim()
                ? "Your bookmarked shops appear here. Tap the bookmark on a shop to save it."
                : filter === "Open now" && !query.trim()
                  ? "No shops are open right now. Check All shops for contact details and hours."
                  : "No matching shops. Try another name or filter."}
        </Text>
      )}
    </Frame>
  );
}
function ShopDetails({ id, from }: { id: string; from?: string }) {
  const s = useStyles();
  const app = useApp();
  const shop = app.shops.find((s) => s._id === id);
  const [switchRequest, setSwitchRequest] = useState("");
  const back =
    from === "home"
      ? "/home"
      : from === "bookmarks" || from === "open" || from === "all"
        ? { pathname: "/shops" as const, params: { view: from } }
        : "/shops";
  if (!shop)
    return (
      <Frame
        title="Shop details"
        tab="Shops"
        back={back}
        backLabel={from === "home" ? "Print" : "Shops"}
      >
        <Text style={s.muted}>
          {app.loading ? "Loading shop…" : "This shop is unavailable."}
        </Text>
      </Frame>
    );
  const sameShop = app.draft.shop?._id === shop._id;
  const hasFiles = app.draft.files.length > 0;
  const transferKey = shop._id + ":" + app.draft.requestKey;
  const switching = hasFiles && !sameShop && switchRequest === transferKey;
  const ongoing = shop.queue?.ongoing ?? 0;
  function startBooking() {
    if (!shop?.open) return;
    if (hasFiles && !sameShop && !switching) {
      setSwitchRequest(transferKey);
      return;
    }
    app.begin(shop, hasFiles);
    setSwitchRequest("");
    router.push(hasFiles ? "/options" : "/upload");
  }
  return (
    <Frame
      title={shop.name}
      tab="Shops"
      back={back}
      backLabel={from === "home" ? "Print" : "Shops"}
      footer={
        <View style={{ gap: 8 }}>
          {switching && shop.open && (
            <Text accessibilityLiveRegion="polite" style={s.body}>
              Move your draft from {app.draft.shop?.name} to {shop.name}? Your
              files and settings carry over. This shop sets the price.
            </Text>
          )}
          {shop.open ? (
            <View style={{ flexDirection: "row", gap: 8 }}>
              {switching && (
                <View style={{ flex: 1 }}>
                  <Button
                    secondary
                    title="Keep current shop"
                    onPress={() => {
                      setSwitchRequest("");
                      router.push("/options");
                    }}
                  />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Button
                  title={
                    switching
                      ? "Move draft here"
                      : sameShop && hasFiles
                        ? "Continue your draft"
                        : "Print with this shop"
                  }
                  onPress={startBooking}
                />
              </View>
            </View>
          ) : (
            <>
              <Text style={s.small}>
                Closed for new bookings. Contact the shop for existing pickups.
              </Text>
              <Button
                secondary
                title="Find an open shop"
                onPress={() =>
                  router.dismissTo({
                    pathname: "/shops",
                    params: { view: "open" },
                  })
                }
              />
            </>
          )}
        </View>
      }
    >
      <View style={{ position: "relative" }}>
        <Card>
          <ShopGallery />
          <View style={[s.between, { flexWrap: "wrap" }]}>
            <Pill tone={shop.open ? "positive" : "neutral"}>
              {shop.open ? "Open now" : "Closed"}
            </Pill>
            <Text style={s.small}>{savedShopLabel(shop.savedCount)}</Text>
          </View>
          <Pair label="Hours" value={shopHours(shop.hours)} />
          <Pair
            label="Print queue"
            value={
              ongoing + (ongoing === 1 ? " ongoing order" : " ongoing orders")
            }
          />
        </Card>
        <View style={{ position: "absolute", top: 28, right: 28 }}>
          <BookmarkButton shopId={shop._id} name={shop.name} />
        </View>
      </View>
      <Card>
        <Text style={s.cardTitle}>Services</Text>
        <Pair label="Black & white" value={money(shop.monoRate) + " / page"} />
        <Pair label="Full color" value={money(shop.colorRate) + " / page"} />
        <Pair label="Paper sizes" value="A4 · Letter · Legal" />
        <Text style={s.small}>Final price shown at checkout.</Text>
      </Card>
      <Card>
        <Text style={s.cardTitle}>Pickup location</Text>
        <Text style={s.body}>{shop.locationAddress || shop.address}</Text>
        <Pair label="Contact" value={shop.contact || "Not listed"} />
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
          {shop.coordinates
            ? "Opens the storefront pin in Google Maps."
            : "Opens an address search in Google Maps. Confirm the location with the shop."}
        </Text>
      </Card>
    </Frame>
  );
}
function fileCount(count: number) {
  return count + (count === 1 ? " file" : " files");
}
function FileRows({ busy = false }: { busy?: boolean }) {
  const s = useStyles();
  const { colors } = useAppearance();
  const { draft, setDraft } = useApp();
  return (
    <>
      {draft.files.map((f, index) => (
        <View
          key={f._id}
          style={[
            s.row,
            {
              paddingVertical: 4,
              borderTopWidth: index ? 1 : 0,
              borderColor: colors.line,
            },
          ]}
        >
          <Feather name="file-text" size={19} color={colors.primary} />
          <UploadFilePreview id={f._id} name={f.name}>
            <Text
              style={s.body}
              numberOfLines={2}
              ellipsizeMode="middle"
              accessibilityLabel={f.name}
            >
              {f.name}
            </Text>
            <Text style={s.small}>
              {f.pages} {f.pages === 1 ? "page" : "pages"} ·{" "}
              {Math.ceil(f.size / 1024).toLocaleString()} KB
            </Text>
          </UploadFilePreview>
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
            <Feather name="x" size={18} color={colors.muted} />
          </Pressable>
        </View>
      ))}
    </>
  );
}
function Upload() {
  const s = useStyles();
  const { colors } = useAppearance();
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
  if (!app.draft.shop) return <Redirect href="/shops" />;
  const count = app.draft.files.length;
  async function upload(assets: DocumentPicker.DocumentPickerAsset[]) {
    const current = api.captureSession();
    const key = app.draft.requestKey;
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
    setProgress(null);
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
      bookingStep="Files"
      back={{ pathname: "/shop", params: { id: app.draft.shop._id } }}
      backLabel="Shop details"
      subtitle={app.draft.shop.name}
      footer={
        count > 0 && !remaining.length ? (
          <Button
            title="Continue to options"
            disabled={busy}
            onPress={() => router.push("/options")}
          />
        ) : undefined
      }
    >
      {count === 0 && (
        <Card
          tint
          style={{
            alignItems: "center",
            paddingVertical: 26,
            borderColor: colors.sage,
            borderStyle: "dashed",
          }}
        >
          <Art name="upload" size={40} />
          <Text style={s.cardTitle}>Select your PDFs</Text>
          <Text style={s.small}>
            PDF · up to 5 files · {app.maxUploadBytes / 1024 / 1024} MB each
          </Text>
          <View style={{ alignSelf: "stretch" }}>
            <Button
              title={
                remaining.length ? "Choose replacement files" : "Choose files"
              }
              disabled={busy}
              onPress={() => void run(pick)}
            />
          </View>
        </Card>
      )}
      {count > 0 && (
        <Card>
          <Text style={s.cardTitle}>{fileCount(count)} selected</Text>
          {count > 1 && (
            <Text style={s.small}>
              Page ranges run across these PDFs in the order shown.
            </Text>
          )}
          <FileRows busy={busy} />
          {count < 5 && (
            <>
              <Button
                title={
                  remaining.length
                    ? "Choose replacement files"
                    : "Add more files"
                }
                secondary
                disabled={busy}
                onPress={() => void run(pick)}
              />
              <Text style={s.small}>
                Up to 5 PDFs · {app.maxUploadBytes / 1024 / 1024} MB each
              </Text>
            </>
          )}
        </Card>
      )}
      {busy && progress && <UploadProgress {...progress} />}
      {uploadError && (
        <Card>
          <Text accessibilityRole="alert" style={{ color: colors.error }}>
            {uploadError}
          </Text>
          <Text style={s.body}>
            {fileCount(remaining.length)}{" "}
            {remaining.length === 1 ? "still needs" : "still need"} uploading.
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
            disabled={busy}
            onPress={() => void run(() => upload(remaining))}
          />
          {count > 0 && (
            <Button
              title={"Continue with " + fileCount(count)}
              disabled={busy}
              onPress={() => {
                setRemaining([]);
                setUploadError("");
                router.push("/options");
              }}
            />
          )}
        </Card>
      )}
    </Frame>
  );
}
function Options() {
  const s = useStyles();
  const { colors } = useAppearance();
  const app = useApp();
  const { settings } = app.draft;
  const [showFiles, setShowFiles] = useState(false);
  const [invalidCopies, setInvalidCopies] = useState<string | null>(null);
  const [rangeMode, setRangeMode] = useState<"All" | "Custom">(() =>
    app.draft.settings.pageRange?.trim() ? "Custom" : "All",
  );
  const [customRange, setCustomRange] = useState(
    app.draft.settings.pageRange || "",
  );
  const customEmpty =
    rangeMode === "Custom" && !app.draft.settings.pageRange?.trim();
  const copiesError = invalidCopies !== null;
  const quoteBody = JSON.stringify({
    shopId: app.draft.shop?._id,
    fileIds: app.draft.files.map((f) => f._id),
    settings: app.draft.settings,
    requestKey: app.draft.requestKey,
  });
  const quote = useQuote(
    quoteBody,
    !!app.draft.shop &&
      !!app.draft.files.length &&
      !customEmpty &&
      !copiesError,
  );
  const rangeError =
    quote.status === "error" && /page|range/i.test(quote.error || "");
  if (!app.draft.shop || !app.draft.files.length)
    return <Redirect href="/upload" />;
  const files = app.draft.files;
  const pages = files.reduce((sum, file) => sum + file.pages, 0);
  const breakdown =
    quote.status === "success" && quote.quote
      ? pricingSummary(quote.quote, settings)
      : null;
  const change = (data: Partial<typeof settings>) => {
    app.setDraft((d) => ({ ...d, settings: { ...d.settings, ...data } }));
  };
  function editCopies(text: string) {
    const value = text.trim();
    const copies = Number(value);
    if (!/^\d+$/.test(value) || copies < 1 || copies > 100) {
      setInvalidCopies(text);
      return;
    }
    setInvalidCopies(null);
    change({ copies });
  }
  const notesHelp =
    "Request double-sided printing, binding, or lamination here. Confirm any extra cost with the shop.";
  return (
    <Frame
      title="Print options"
      bookingStep="Options"
      back="/upload"
      backLabel="Files"
      footer={
        <View style={{ gap: 6 }}>
          {breakdown && (
            <Text style={s.small}>
              {breakdown.title} · {breakdown.equation}
            </Text>
          )}
          <View style={[s.between, { flexWrap: "wrap" }]}>
            <View style={{ flexGrow: 1, gap: 2 }}>
              <Text style={s.small}>Estimated total</Text>
              <Text style={s.cardTitle}>
                {quote.status === "success" && quote.quote
                  ? money(quote.quote.amount)
                  : copiesError
                    ? "Check copies"
                    : customEmpty
                      ? "Choose pages"
                      : quote.status === "loading"
                        ? "Calculating…"
                        : "Unavailable"}
              </Text>
            </View>
            <View style={{ flexGrow: 1 }}>
              <Button
                title="Review order"
                disabled={quote.status !== "success"}
                onPress={() => {
                  if (quote.status === "success" && quote.quote) {
                    router.push({
                      pathname: "/review",
                      params: { amount: String(quote.quote.amount) },
                    });
                  }
                }}
              />
            </View>
          </View>
        </View>
      }
    >
      <Card style={{ paddingVertical: 8 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Selected documents"
          accessibilityState={{ expanded: showFiles }}
          aria-expanded={showFiles}
          onPress={() => setShowFiles(!showFiles)}
          style={[s.between, { minHeight: 44 }]}
        >
          <View style={[s.row, { flex: 1 }]}>
            <Feather name="file-text" size={18} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={s.fieldLabel} numberOfLines={2}>
                {files.length === 1
                  ? files[0].name
                  : fileCount(files.length) + " selected"}
              </Text>
              <Text style={s.small}>
                {pages} {pages === 1 ? "page" : "pages"} in total
              </Text>
            </View>
          </View>
          <DisclosureChevron expanded={showFiles} />
        </Pressable>
        {showFiles && <FileRows />}
      </Card>
      <Card>
        <Text style={s.fieldLabel}>Page range</Text>
        <Segments
          values={["All", "Custom"] as const}
          value={rangeMode}
          onChange={(mode) => {
            setRangeMode(mode);
            change({ pageRange: mode === "All" ? "" : customRange });
          }}
        />
        {rangeMode === "Custom" ? (
          <>
            <Field
              label="Pages to print"
              value={settings.pageRange}
              placeholder="e.g. 1-3, 4-10"
              onChangeText={(pageRange) => {
                setCustomRange(pageRange);
                change({ pageRange });
              }}
              maxLength={100}
            />
            <Text style={s.small}>
              Enter pages or ranges separated by commas. Number pages across
              files in upload order
              {` (1–${pages}).`}
            </Text>
            {customEmpty && (
              <Text style={s.small}>
                Enter a page range to see your estimate.
              </Text>
            )}
          </>
        ) : null}
        {rangeError && (
          <Text accessibilityRole="alert" style={{ color: colors.error }}>
            {quote.error}
          </Text>
        )}
      </Card>
      <Card>
        <Text style={s.fieldLabel}>Paper size</Text>
        <Segments
          values={["A4", "Letter", "Legal"] as const}
          value={settings.paper}
          onChange={(paper) => change({ paper })}
        />
        <View style={s.rule} />
        <Text style={s.fieldLabel}>Color mode</Text>
        <Segments
          values={["Black & white", "Color"] as const}
          value={settings.color}
          onChange={(color) => change({ color })}
        />
        <View style={s.rule} />
        <Field
          label="Copies"
          value={invalidCopies ?? String(settings.copies)}
          onChangeText={editCopies}
          inputMode="numeric"
          selectTextOnFocus
          accessibilityHint="Enter 1 to 100 copies."
          placeholder="1–100"
          style={copiesError ? { borderColor: colors.error } : undefined}
        />
        {copiesError && (
          <Text
            accessibilityRole="alert"
            style={[s.small, { color: colors.error }]}
          >
            Enter a whole number from 1 to 100.
          </Text>
        )}
      </Card>
      <View style={{ gap: 6 }}>
        <Field
          label="Notes for the shop (optional)"
          accessibilityHint={notesHelp}
          value={app.draft.notes}
          onChangeText={(notes) => app.setDraft((d) => ({ ...d, notes }))}
          multiline
          maxLength={500}
        />
        <Text style={s.small}>{notesHelp}</Text>
      </View>

      {quote.status === "error" && (
        <Card>
          {!rangeError && (
            <Text accessibilityRole="alert" style={{ color: colors.error }}>
              {quote.error}
            </Text>
          )}
          <Button title="Retry estimate" secondary onPress={quote.retry} />
          {!rangeError && (
            <LinkText
              onPress={() =>
                router.navigate({
                  pathname: "/shops",
                  params: { view: "open" },
                })
              }
            >
              Choose another shop
            </LinkText>
          )}
        </Card>
      )}
    </Frame>
  );
}
function Review({ amount }: { amount: string }) {
  const s = useStyles();
  const { colors } = useAppearance();
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
  if (!amount.trim() || !Number.isFinite(Number(amount)) || Number(amount) < 0)
    return <Redirect href="/options" />;
  const shop = app.draft.shop;
  async function submit() {
    const current = api.captureSession();
    const result = await placeBooking(draft, reviewedAmount, (body) =>
      api.request<Order>("/orders", { method: "POST", body }),
    );
    if (!current()) return;
    if (!result.order) {
      setReviewedAmount(result.amount);
      setPriceNotice(
        "The shop updated its rates. Check the new total and confirm to place your order.",
      );
      return;
    }
    const order = result.order;
    setSubmitted(order._id);
    app.completeBooking(order, draft.requestKey);
    void app.refresh();
    router.replace({ pathname: "/order", params: { id: order._id } });
  }
  return (
    <Frame
      title="Review order"
      bookingStep="Review"
      back="/options"
      backLabel="Options"
      footer={
        <View style={{ gap: 8 }}>
          {!!priceNotice && (
            <Text accessibilityRole="alert" style={s.body}>
              {priceNotice}
            </Text>
          )}
          <View style={[s.between, { flexWrap: "wrap" }]}>
            <View style={{ flexGrow: 1, gap: 2 }}>
              <Text style={s.small}>Cash due at pickup</Text>
              <Text style={s.cardTitle}>{money(reviewedAmount)}</Text>
            </View>
            <View style={{ flexGrow: 1 }}>
              <Button
                title={priceNotice ? "Confirm new total" : "Place order"}
                loading={busy}
                onPress={() => void run(submit)}
              />
            </View>
          </View>
        </View>
      }
    >
      <Card>
        <View style={s.between}>
          <Text style={s.fieldLabel}>Pickup shop</Text>
          <LinkText
            onPress={() =>
              router.navigate({ pathname: "/shops", params: { view: "open" } })
            }
          >
            Change shop
          </LinkText>
        </View>
        <Text style={s.cardTitle}>{shop.name}</Text>
        <Text style={s.body}>{shop.locationAddress || shop.address}</Text>
      </Card>
      <Card>
        <View style={s.between}>
          <Text style={s.cardTitle}>Documents</Text>
          <LinkText onPress={() => router.dismissTo("/upload")}>
            Edit files
          </LinkText>
        </View>
        {draft.files.map((file) => (
          <View key={file._id} style={s.row}>
            <Feather name="file-text" size={18} color={colors.primary} />
            <Text style={[s.body, { flex: 1 }]}>{file.name}</Text>
            <Text style={s.small}>
              {file.pages} {file.pages === 1 ? "page" : "pages"}
            </Text>
          </View>
        ))}
      </Card>
      <Card>
        <View style={s.between}>
          <Text style={s.cardTitle}>Print settings</Text>
          <LinkText onPress={() => router.dismissTo("/options")}>
            Edit options
          </LinkText>
        </View>
        <Pair
          label="Paper and color"
          value={draft.settings.paper + " · " + draft.settings.color}
        />
        <Pair label="Pages" value={draft.settings.pageRange || "All pages"} />
        <Pair label="Copies" value={String(draft.settings.copies)} />
        {!!draft.notes.trim() && (
          <View style={{ gap: 4 }}>
            <Text style={s.fieldLabel}>Notes for the shop</Text>
            <Text style={s.body}>{draft.notes.trim()}</Text>
          </View>
        )}
      </Card>
    </Frame>
  );
}
function Orders({ view }: { view?: string }) {
  const s = useStyles();
  const { orders, loading } = useApp();
  const filter = view === "history" ? "History" : "Active";
  const list = orders.filter((o) =>
    filter === "Active" ? isActiveOrder(o) : isTerminalOrder(o),
  );
  return (
    <Frame title="Orders" tab="Orders">
      <Segments
        values={["Active", "History"]}
        value={filter}
        onChange={(next) =>
          router.setParams({ view: next === "History" ? "history" : undefined })
        }
      />
      {list.map((o) => (
        <OrderCard
          key={o._id}
          order={o}
          from={filter === "History" ? "history" : "active"}
        />
      ))}
      {!list.length && loading && <Text style={s.small}>Loading orders…</Text>}
      {!list.length && !loading && (
        <Card>
          <Text style={s.cardTitle}>
            {filter === "Active" ? "No active orders" : "No order history yet"}
          </Text>
          <Text style={s.muted}>
            {filter === "Active"
              ? "Choose a shop to start a print order."
              : "Collected, cancelled and rejected orders appear here."}
          </Text>
          {filter === "Active" && (
            <LinkText onPress={() => router.navigate("/shops")}>
              Browse shops →
            </LinkText>
          )}
        </Card>
      )}
    </Frame>
  );
}
function OrderDetails({ id, from }: { id: string; from?: string }) {
  const s = useStyles();
  const back =
    from === "home"
      ? "/home"
      : from === "history"
        ? { pathname: "/orders" as const, params: { view: "history" } }
        : "/orders";
  const backLabel =
    from === "home" ? "Print" : from === "history" ? "History" : "Orders";
  const app = useApp(),
    { busy, run } = useAction();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  const [cancelling, setCancelling] = useState<{
    id: string;
    reason: string;
  } | null>(null);
  const order = app.orders.find((o) => o._id === id);
  if (!order)
    return (
      <Frame title="Order" tab="Orders" back={back} backLabel={backLabel}>
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
      back={back}
      backLabel={backLabel}
    >
      {isCancelledOrRejected(order) && <OrderOutcome order={order} />}
      {order.status === "Queued" && (
        <Text style={s.muted}>
          The shop is reviewing your files and print settings.
        </Text>
      )}
      {order.readyAt && order.status === "Ready for pickup" && (
        <Card tint>
          <Text style={s.cardTitle}>Pickup code</Text>
          <Text style={s.body}>
            Your prints are ready. Show this code at the shop.
          </Text>
          <Text selectable style={s.pickupCode}>
            {order.pickupCode}
          </Text>
        </Card>
      )}
      {canEstimatePickup(order) && (
        <Card tint>
          <Text style={s.cardTitle}>Estimated pickup</Text>
          <Text style={s.body}>
            {order.estimatedPickupAt
              ? pickupTimeLabel(order.estimatedPickupAt)
              : "Waiting for the shop to set a pickup time."}
          </Text>
          <Text style={s.small}>
            {order.estimatedPickupAt &&
            Date.parse(order.estimatedPickupAt) <= now
              ? "This estimate has passed. The shop is still preparing your documents. "
              : ""}
            Times are in Philippine time. Wait for Ready for pickup before
            collecting.
          </Text>
        </Card>
      )}
      <Card>
        <Text style={s.cardTitle}>{order.shop.name}</Text>
        <Text style={s.body}>
          {order.shop.locationAddress || order.shop.address}
        </Text>
        {order.status === "Ready for pickup" && (
          <LinkText
            onPress={() => {
              void Linking.openURL(shopMapUrl(order.shop)).catch(() =>
                app.setError("Couldn’t open Maps. Please try again."),
              );
            }}
          >
            Get pickup directions →
          </LinkText>
        )}
        {order.shop.contact && (
          <LinkText
            onPress={() => {
              void Linking.openURL("tel:" + order.shop.contact).catch(() =>
                app.setError(
                  "Couldn’t open the dialer. The shop number is " +
                    order.shop.contact +
                    ".",
                ),
              );
            }}
          >
            Contact shop
          </LinkText>
        )}
      </Card>
      <Card>
        <Text style={s.cardTitle}>Order summary</Text>
        {order.files.map((file) => (
          <Text key={file.upload} style={s.body}>
            {file.name}
          </Text>
        ))}
        <Pair
          label="Print setup"
          value={order.settings.paper + " · " + order.settings.color}
        />
        <Pair label="Copies" value={String(order.settings.copies)} />
        {order.settings.sides === "Double-sided" && (
          <Pair label="Sides" value={order.settings.sides} />
        )}
        {order.settings.pageRange && (
          <Pair label="Page range" value={order.settings.pageRange} />
        )}
        <Pair
          label={
            isCancelledOrRejected(order)
              ? "Original quoted total"
              : order.paymentStatus === "paid"
                ? "Amount paid"
                : "Due on pickup"
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
  const s = useStyles();
  const { colors } = useAppearance();
  const app = useApp();
  const { busy: savingDetails, run: saveDetails } = useAction();
  const { busy: savingSettings, run: saveSettings } = useAction();
  const { busy: enablingAlerts, run: enableAlerts } = useAction();
  const { busy: signingOut, run: signOut } = useAction();
  const user = app.user!;
  const [section, setSection] = useState(""),
    [name, setName] = useState(user.name),
    [phone, setPhone] = useState(user.phone || ""),
    [paper, setPaper] = useState(user.defaultPaper);
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
            disabled={
              !name.trim() ||
              (name.trim() === user.name && phone === (user.phone || ""))
            }
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

      {section === "Printing preferences" && (
        <View style={{ gap: 16 }}>
          <Text style={s.cardTitle}>Default paper</Text>
          <Segments
            values={["A4", "Letter", "Legal"] as const}
            value={paper}
            onChange={setPaper}
          />
          <Button
            title="Save settings"
            disabled={paper === user.defaultPaper}
            loading={savingSettings}
            onPress={() =>
              void saveSettings(async () => {
                await app.updateProfile({ defaultPaper: paper });
                setSaved("Settings saved.");
              })
            }
          />
        </View>
      )}
      {section === "Appearance" && <AppearanceSettings />}
      {section === "Help & support" && (
        <View style={{ gap: 16 }}>
          <Text style={s.cardTitle}>Printing with PaPrint</Text>
          <Text style={s.body}>
            Choose a shop, upload an unlocked PDF, set your print options, then
            place an order. Pay the shop when you collect your prints.
          </Text>
          <Text style={s.body}>
            Track your order from Preparing to Printing to Ready for pickup.
            Your pickup code appears when your prints are ready.
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
            registration documents are available to the shop owner and
            authorized reviewers.
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
        <View style={[s.row, { gap: 14 }]}>
          <View style={[s.avatar, { borderRadius: 18 }]}>
            <Text
              style={{ color: colors.primary, fontWeight: "700", fontSize: 18 }}
            >
              {initials}
            </Text>
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={s.cardTitle}>{user.name}</Text>
            <Text style={s.small}>
              {user.email}
              {user.phone ? " · " + user.phone : ""}
            </Text>
          </View>
        </View>
        <View style={s.rule} />
        <LinkText onPress={() => toggleSection("Edit personal details")}>
          {section === "Edit personal details"
            ? "Hide personal details ↑"
            : "Edit personal details →"}
        </LinkText>
        {section === "Edit personal details" && sectionContent}
      </Card>
      <Card>
        {(
          [
            ["Appearance", "moon"],
            ["Notifications", "bell"],
            ["Printing preferences", "sliders"],
            ["Help & support", "help-circle"],
            ["Terms & privacy", "shield"],
          ] as const
        ).map(([label, icon]) => (
          <View key={label} style={{ gap: 8 }}>
            <Pressable
              accessibilityLabel={label}
              accessibilityRole="button"
              accessibilityState={{ expanded: section === label }}
              aria-expanded={section === label}
              onPress={() => toggleSection(label)}
              style={[s.between, { minHeight: 44 }]}
            >
              <View style={[s.row, { flex: 1, gap: 12 }]}>
                <Feather name={icon} size={17} color={colors.sage} />
                <Text
                  style={[
                    s.body,
                    { flexShrink: 1 },
                    section === label && { color: colors.primary },
                  ]}
                >
                  {label}
                </Text>
              </View>
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
    from?: string;
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
      return <Shops view={params.view} />;
    case "shop":
      return <ShopDetails id={params.id || ""} from={params.from} />;
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
      return <Orders view={params.view} />;
    case "order":
      return <OrderDetails id={params.id || ""} from={params.from} />;
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
