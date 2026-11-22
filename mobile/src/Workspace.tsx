import {
  canEndOrder,
  isActiveOrder,
  isTerminalOrder,
  isCancelledOrRejected,
  paymentLabel,
} from "./orderStatus";
import { EndOrderPanel, OrderOutcome } from "./OrderOutcome";
import React, { useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { useApp } from "./state";
import { Text } from "./ui";
import { useStyles } from "./styles";
import { useAppearance } from "./Appearance";
import {
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
import { MotionButton as Button, SuccessNotice } from "./motion";
import * as api from "./api";
import type { Order, Shop } from "./types";
import { OwnerFilePrint } from "./OwnerFilePrint";
import { OwnerFileDownload } from "./OwnerFileDownload";
import { Brand } from "./Brand";
import Feather from "@expo/vector-icons/Feather";
import { OwnerPickupEstimate } from "./OwnerPickupEstimate";
import { canEstimatePickup } from "./pickupEstimate";
import { ShopLocationPicker } from "./ShopLocationPicker";
import { OwnerLocation } from "./OwnerLocation";
import { filePrintRange } from "./printing";
import {
  ownerSnapshot,
  ownerDirty,
  reconcileOwnerForm,
  registrationSteps,
  prepareRegistrationStep,
  type OwnerValues,
  type RegistrationStep,
} from "./ownerForm";

const views = ["Orders", "Shop profile", "Settings"] as const;
const viewIcons = {
  Orders: "inbox",
  "Shop profile": "map-pin",
  Settings: "settings",
} as const;
const activeStages = ["Queued", "Printing", "Ready for pickup"] as const;
const historyStages = ["Collected", "Cancelled", "Rejected"] as const;
const queueScopes = ["Active", "History", "All orders"] as const;
type QueueScope = (typeof queueScopes)[number];

export function Workspace({
  view: requestedView,
  id,
}: {
  view: string;
  id: string;
}) {
  const s = useStyles();
  const { colors } = useAppearance();
  const app = useApp();
  const { fromQueue } = useLocalSearchParams<{ fromQueue?: string }>();
  const wide = useWindowDimensions().width >= 960;
  const [pending, setPending] = useState<string | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const busy = pending !== null;
  const lock = useRef(false);
  const shop = app.workspace;
  const approved = shop?.registrationStatus === "approved";
  const shopView = approved ? "Shop profile" : "Business registration";
  const view = id
    ? "Orders"
    : requestedView === "Settings"
      ? "Settings"
      : requestedView === "Orders" || (requestedView === "Overview" && approved)
        ? "Orders"
        : shopView;
  const activeNav = view === "Business registration" ? "Shop profile" : view;
  const navLabel = (v: (typeof views)[number]) =>
    v === "Shop profile" && !approved ? "Registration" : v;
  const [form, setForm] = useState(() => ownerSnapshot(shop, app.user!));
  const [confirm, setConfirm] = useState(false);
  const {
    name,
    representative,
    address,
    contact,
    email,
    hours,
    mono,
    color,
    open,
    latitude,
    longitude,
  } = form.values;
  const dirty = ownerDirty(form);
  const edit = <K extends keyof OwnerValues>(key: K, value: OwnerValues[K]) => {
    setForm((previous) => ({
      ...previous,
      values: { ...previous.values, [key]: value },
    }));
    setConfirm(false);
    setNotice("");
  };
  const setName = (value: string) => edit("name", value);
  const setRepresentative = (value: string) => edit("representative", value);
  const setContact = (value: string) => edit("contact", value);
  const setEmail = (value: string) => edit("email", value);
  const setHours = (value: string) => edit("hours", value);
  const setMono = (value: string) => edit("mono", value);
  const setColor = (value: string) => edit("color", value);
  const setOpen = (value: boolean) => edit("open", value);
  const remoteKey = JSON.stringify(ownerSnapshot(shop, app.user!));
  const [receivedKey, setReceivedKey] = useState(remoteKey);
  if (receivedKey !== remoteKey) {
    setReceivedKey(remoteKey);
    const remote: ReturnType<typeof ownerSnapshot> = JSON.parse(remoteKey);
    if (remote.shopId) {
      setForm(reconcileOwnerForm(form, remote));
      setConfirm(false);
    }
  }
  const [step, setStep] = useState<RegistrationStep>(registrationSteps[0]);
  const review = step === registrationSteps[2];
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<QueueScope>("Active");
  const [statusFilter, setStatusFilter] = useState<Order["status"] | null>(
    null,
  );
  const [rejecting, setRejecting] = useState<{
    id: string;
    reason: string;
  } | null>(null);
  const order = app.ownerOrders.find((o) => o._id === id);
  const registering = view === "Business registration";
  const title = id
    ? "Order " + orderCode(id)
    : registering
      ? shop?.registrationStatus === "submitted"
        ? "Registration status"
        : review
          ? "Review registration"
          : "Register your business"
      : view;
  function go(next: string) {
    setError("");
    setNotice("");
    setStep(registrationSteps[0]);
    router.push({ pathname: "/workspace", params: { view: next } });
  }
  function backToQueue() {
    if (fromQueue === "1" && router.canGoBack()) router.back();
    else router.replace({ pathname: "/workspace", params: { view: "Orders" } });
  }
  async function run(name: string, action: () => Promise<unknown>) {
    if (lock.current) return;
    lock.current = true;
    setPending(name);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      lock.current = false;
      setPending(null);
    }
  }
  async function save() {
    if (form.conflict)
      throw new Error(
        "Your shop details changed in another session. Reload the latest settings before continuing.",
      );
    if (shop && !dirty) return shop;
    const next = await api.request<Shop>("/workspace", {
      method: "PUT",
      body: JSON.stringify({
        name,
        representative,
        address,
        ...(latitude.trim() && longitude.trim()
          ? {
              coordinates: {
                latitude: Number(latitude),
                longitude: Number(longitude),
              },
            }
          : {}),
        contact,
        email,
        hours,
        monoRate: Number(mono),
        colorRate: Number(color),
      }),
    });
    app.setWorkspace(next);
    setForm(ownerSnapshot(next, app.user!));
    setNotice("Business details saved.");
    return next;
  }
  async function changeStep(target: RegistrationStep) {
    setConfirm(false);
    try {
      setStep(await prepareRegistrationStep(target, save));
    } catch (e) {
      setStep(
        (e as { code?: string }).code === "MISSING_REGISTRATION_DOCUMENTS"
          ? registrationSteps[1]
          : registrationSteps[0],
      );
      throw e;
    }
  }
  async function reloadSettings() {
    const latest = await api.request<Shop>("/workspace");
    app.setWorkspace(latest);
    setForm(ownerSnapshot(latest, app.user!));
    setConfirm(false);
    setNotice("Latest settings loaded. Your unsaved edits were discarded.");
  }
  async function documents() {
    if (!shop)
      throw new Error("Save your business details before uploading documents.");
    const result = await DocumentPicker.getDocumentAsync({
      type: "application/pdf",
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    if (result.assets.length + (shop.documents?.length || 0) > 3)
      throw new Error(
        "Upload 3 PDFs: business permit, registration proof and owner identification.",
      );
    for (const asset of result.assets) {
      if ((asset.size || 0) > app.maxUploadBytes)
        throw new Error(
          "Each PDF must be " +
            app.maxUploadBytes / 1024 / 1024 +
            " MB or smaller.",
        );
      const next = await api.uploadFiles<Shop>([asset], "/workspace/documents");
      app.setWorkspace(next);
    }
  }
  async function advance(o: Order, status: string) {
    const updated = await api.request<Order>(
      "/workspace/orders/" + o._id + "/status",
      {
        method: "PATCH",
        body: JSON.stringify({ status }),
      },
    );
    app.setOwnerOrders((previous) =>
      previous.map((item) => (item._id === updated._id ? updated : item)),
    );
  }
  const scopedOrders = app.ownerOrders.filter(
    (o) =>
      scope === "All orders" ||
      (scope === "Active" ? isActiveOrder(o) : isTerminalOrder(o)),
  );
  const search = query.trim().toLowerCase();
  const orderList = scopedOrders.filter(
    (o) =>
      (!statusFilter || o.status === statusFilter) &&
      (orderCode(o._id) + " " + o.files.map((f) => f.name).join(" "))
        .toLowerCase()
        .includes(search),
  );
  const fieldColumn = wide ? { flex: 1 } : { width: "100%" as const };
  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{
          flex: 1,
          width: "100%",
          maxWidth: 1440,
          alignSelf: "center",
          flexDirection: wide ? "row" : "column",
          backgroundColor: colors.canvas,
        }}
      >
        {wide ? (
          <ScrollView
            style={{
              maxWidth: 236,
              width: 236,
              backgroundColor: colors.feature,
            }}
            contentContainerStyle={{ flexGrow: 1, padding: 18, gap: 6 }}
          >
            <View style={[s.row, { paddingVertical: 18, marginBottom: 18 }]}>
              <Brand width={32} variant="reversed" />
              <Text style={[s.fieldLabel, { color: colors.featureInk }]}>
                Shop workspace
              </Text>
            </View>
            {views.map((v) => (
              <Pressable
                key={v}
                accessibilityRole="button"
                onPress={() => {
                  if (id || activeNav !== v) go(v);
                }}
                accessibilityState={{ selected: activeNav === v }}
                style={{
                  padding: 12,
                  borderRadius: 12,
                  backgroundColor:
                    activeNav === v ? colors.mint : "transparent",
                  minHeight: 46,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <Feather
                  name={viewIcons[v]}
                  size={17}
                  color={activeNav === v ? colors.primary : colors.featureMuted}
                />
                <Text
                  style={{
                    color: activeNav === v ? colors.primary : colors.featureInk,
                    fontWeight: activeNav === v ? "700" : "500",
                  }}
                >
                  {navLabel(v)}
                </Text>
              </Pressable>
            ))}
            <View style={{ flex: 1 }} />
            <View
              style={{
                borderTopWidth: 1,
                borderColor: colors.featureLine,
                paddingTop: 18,
                gap: 6,
              }}
            >
              <Text style={[s.cardTitle, { color: colors.featureInk }]}>
                {shop?.name || app.user!.name}
              </Text>
              <Text style={[s.small, { color: colors.featureMuted }]}>
                Naga City · Owner account
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push("/home")}
                style={{ minHeight: 44, justifyContent: "center" }}
              >
                <Text style={{ fontWeight: "700", color: colors.featureInk }}>
                  Customer app →
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        ) : (
          <View
            style={{
              paddingHorizontal: 16,
              paddingVertical: 10,
              gap: 8,
              backgroundColor: colors.surface,
              borderBottomWidth: 1,
              borderColor: colors.line,
            }}
          >
            <View style={s.between}>
              <View style={s.row}>
                <Brand width={30} />
                <Text style={s.fieldLabel}>Shop workspace</Text>
              </View>
              <LinkText onPress={() => router.push("/home")}>
                Customer app
              </LinkText>
            </View>

            <Segments
              values={views.map(navLabel)}
              value={navLabel(activeNav)}
              onChange={(next) => {
                if (id || next !== navLabel(activeNav))
                  go(next === "Registration" ? "Business registration" : next);
              }}
            />
          </View>
        )}
        <ScrollView
          keyboardShouldPersistTaps="handled"
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: wide ? 32 : 16, gap: 18 }}
        >
          {!!id && <LinkText onPress={backToQueue}>‹ Back to orders</LinkText>}
          <View style={[s.between, { flexWrap: "wrap" }]}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text accessibilityRole="header" style={s.heading}>
                {title}
              </Text>
              {!id && view === "Orders" && !!shop?.name && (
                <Text style={s.small}>{shop.name}</Text>
              )}
            </View>
            {!id && view === "Orders" && approved && (
              <Pill tone={shop.open ? "positive" : "neutral"}>
                {shop.open ? "Open for bookings" : "Closed for bookings"}
              </Pill>
            )}
          </View>
          {error || app.error ? (
            <Text accessibilityRole="alert" style={s.error}>
              {error || app.error}
            </Text>
          ) : null}
          {app.refreshError && (
            <Card>
              <Text accessibilityRole="alert" style={{ color: colors.error }}>
                {app.refreshError}
              </Text>
              <Text style={s.small}>
                Showing the last loaded workspace. Refresh before acting on an
                order.
              </Text>
              <Button
                title="Retry refresh"
                secondary
                loading={app.loading}
                onPress={() => void app.refresh(true)}
              />
            </Card>
          )}
          {notice ? <SuccessNotice>{notice}</SuccessNotice> : null}
          {(registering || view === "Shop profile") && form.conflict && (
            <Card>
              <Text accessibilityRole="alert" style={{ color: colors.error }}>
                Your shop settings changed in another session. Your edits are
                kept here, but saving is blocked to protect the newer settings.
              </Text>
              <Text style={s.small}>
                Reloading discards your unsaved edits and loads the latest
                settings.
              </Text>
              <Button
                title="Discard edits and load latest settings"
                secondary
                disabled={busy}
                loading={pending === "reload"}
                onPress={() => void run("reload", reloadSettings)}
              />
            </Card>
          )}
          {(registering || view === "Shop profile") && dirty && (
            <Text style={s.small}>Unsaved changes</Text>
          )}
          {app.loading && !shop && (
            <Text style={s.muted}>Loading your workspace…</Text>
          )}
          {id && !order ? (
            <Text style={s.body}>
              {app.loading
                ? "Loading order…"
                : "This order is unavailable in your workspace."}
            </Text>
          ) : registering ? (
            <>
              {(!shop ||
                ["draft", "rejected"].includes(
                  shop.registrationStatus || "",
                )) && (
                <Segments
                  values={registrationSteps}
                  value={step}
                  disabled={busy}
                  onChange={(target) =>
                    void run("change-step", () => changeStep(target))
                  }
                />
              )}
              {shop?.rejectionReason ? (
                <Card>
                  <Text accessibilityRole="alert" style={s.body}>
                    Changes requested: {shop.rejectionReason}
                  </Text>
                </Card>
              ) : null}
              {shop?.registrationStatus === "submitted" ? (
                <Card>
                  <Pill>Under review</Pill>
                  <Text style={s.cardTitle}>Registration submitted</Text>
                  <Text style={s.body}>
                    Your business details and 3 documents are saved. Your shop
                    becomes visible after approval.
                  </Text>
                  <Text style={s.small}>
                    The PaPrint team will review your registration and
                    documents. Refresh to see the latest decision.
                  </Text>
                </Card>
              ) : review ? (
                <View
                  style={{
                    flexDirection: wide ? "row" : "column",
                    gap: 28,
                    alignItems: "flex-start",
                  }}
                >
                  <Card style={fieldColumn}>
                    <Text style={s.cardTitle}>{shop?.name || name}</Text>
                    <Pill>
                      {shop?.registrationStatus === "rejected"
                        ? "Changes requested"
                        : "Draft"}
                    </Pill>
                    <Pair
                      label="Owner"
                      value={shop?.representative || representative}
                    />
                    <Pair label="Address" value={shop?.address || address} />
                    <Pair
                      label="Storefront pin"
                      value={
                        shop?.coordinates
                          ? `${shop.coordinates.latitude.toFixed(6)}, ${shop.coordinates.longitude.toFixed(6)}`
                          : "Required: go back and choose it on the map"
                      }
                    />
                    <Pair label="Business hours" value={shop?.hours || hours} />
                    <Pair label="Contact" value={shop?.contact || contact} />
                    <Pair label="Business email" value={shop?.email || email} />
                    <Pair
                      label="B&W / color per page"
                      value={
                        money(shop?.monoRate ?? Number(mono)) +
                        " / " +
                        money(shop?.colorRate ?? Number(color))
                      }
                    />
                    <Text style={s.cardTitle}>Documents</Text>
                    {shop?.documents?.map((d) => (
                      <Text key={d._id} style={s.body}>
                        ✓ {d.name}
                      </Text>
                    ))}
                    {!shop?.documents?.length && (
                      <Text style={s.muted}>No documents uploaded.</Text>
                    )}
                    <LinkText onPress={() => setStep(registrationSteps[0])}>
                      Edit registration details →
                    </LinkText>
                  </Card>
                  <Card tint style={wide ? { width: 330 } : { width: "100%" }}>
                    <Text style={s.cardTitle}>Ready for review</Text>
                    <Text style={s.body}>
                      Your shop becomes visible to customers after registration
                      approval.
                    </Text>
                    <Text style={s.small}>
                      Submitted → Under review → Approved
                    </Text>
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: confirm }}
                      aria-checked={confirm}
                      onPress={() => setConfirm(!confirm)}
                      style={{
                        minHeight: 44,
                        flexDirection: "row",
                        gap: 12,
                        alignItems: "center",
                      }}
                    >
                      <Text style={{ color: colors.primary, fontSize: 20 }}>
                        {confirm ? "☑" : "☐"}
                      </Text>
                      <Text style={[s.small, { flex: 1 }]}>
                        I confirm these details and documents are accurate.
                      </Text>
                    </Pressable>
                    <Button
                      title="Submit registration"
                      loading={pending === "submit-registration"}
                      disabled={
                        busy ||
                        !confirm ||
                        !shop ||
                        !shop.coordinates ||
                        shop.documents?.length !== 3 ||
                        form.conflict
                      }
                      onPress={() =>
                        void run("submit-registration", async () => {
                          app.setWorkspace(
                            await api.request<Shop>("/workspace/submit", {
                              method: "POST",
                              body: JSON.stringify({
                                confirm,
                                expectedVersion: form.version,
                              }),
                            }),
                          );
                          setNotice("Registration submitted for review.");
                        })
                      }
                    />
                    <Button
                      title="Back to edit"
                      secondary
                      onPress={() => setStep(registrationSteps[0])}
                    />
                  </Card>
                </View>
              ) : (
                <>
                  <View
                    style={{
                      flexDirection: wide ? "row" : "column",
                      gap: 28,
                      alignItems: "flex-start",
                    }}
                  >
                    {step === registrationSteps[0] && (
                      <Card style={fieldColumn}>
                        <Text style={s.cardTitle}>Business information</Text>
                        <Field
                          label="Registered business name"
                          placeholder="Shop One"
                          value={name}
                          onChangeText={setName}
                        />
                        <Field
                          label="Owner / representative"
                          value={representative}
                          onChangeText={setRepresentative}
                        />
                        <ShopLocationPicker
                          value={{
                            address,
                            coordinates:
                              latitude.trim() && longitude.trim()
                                ? {
                                    latitude: Number(latitude),
                                    longitude: Number(longitude),
                                  }
                                : null,
                          }}
                          onChange={(next) => {
                            setConfirm(false);
                            setNotice("");
                            setForm((previous) => ({
                              ...previous,
                              values: {
                                ...previous.values,
                                address: next.address,
                                latitude: next.coordinates
                                  ? String(next.coordinates.latitude)
                                  : "",
                                longitude: next.coordinates
                                  ? String(next.coordinates.longitude)
                                  : "",
                              },
                            }));
                          }}
                        />
                        <Field
                          label="Contact number"
                          value={contact}
                          onChangeText={setContact}
                          keyboardType="phone-pad"
                        />
                        <Field
                          label="Business email"
                          value={email}
                          onChangeText={setEmail}
                          autoCapitalize="none"
                          keyboardType="email-address"
                        />
                        <Field
                          label="Business hours"
                          value={hours}
                          onChangeText={setHours}
                        />
                        <View style={{ flexDirection: "row", gap: 16 }}>
                          <View style={{ flex: 1 }}>
                            <Field
                              label="B&W / page (₱)"
                              value={mono}
                              onChangeText={setMono}
                              keyboardType="decimal-pad"
                            />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Field
                              label="Color / page (₱)"
                              value={color}
                              onChangeText={setColor}
                              keyboardType="decimal-pad"
                            />
                          </View>
                        </View>
                        <Button
                          title="Save draft"
                          secondary
                          disabled={busy}
                          loading={pending === "save-draft"}
                          onPress={() => void run("save-draft", save)}
                        />
                      </Card>
                    )}
                    {step === registrationSteps[1] && (
                      <Card style={fieldColumn}>
                        <Text style={s.cardTitle}>Registration documents</Text>
                        <Text style={s.small}>
                          Business permit · Registration proof · Owner
                          identification. 3 PDFs,{" "}
                          {app.maxUploadBytes / 1024 / 1024} MB each.
                        </Text>
                        {shop?.documents?.map((d) => (
                          <View key={d._id} style={{ gap: 8 }}>
                            <Text style={s.small}>✓ {d.name}</Text>
                            <Button
                              title={"Remove " + d.name}
                              secondary
                              disabled={busy}
                              loading={pending === "remove-" + d._id}
                              onPress={() =>
                                void run("remove-" + d._id, async () => {
                                  const next = await api.request<Shop>(
                                    "/workspace/documents/" + d._id,
                                    { method: "DELETE" },
                                  );
                                  app.setWorkspace(next);
                                })
                              }
                            />
                          </View>
                        ))}
                        <Button
                          title="Upload documents"
                          secondary
                          loading={pending === "upload-documents"}
                          disabled={
                            busy || !shop || (shop.documents?.length || 0) >= 3
                          }
                          onPress={() =>
                            void run("upload-documents", documents)
                          }
                        />
                      </Card>
                    )}
                  </View>
                  {step === registrationSteps[1] && (
                    <Button
                      title="Back to business details"
                      secondary
                      disabled={busy}
                      onPress={() => setStep(registrationSteps[0])}
                    />
                  )}
                  <Button
                    title={
                      step === registrationSteps[0]
                        ? "Save & continue to documents"
                        : "Continue to review"
                    }
                    loading={pending === "continue-registration"}
                    disabled={
                      busy ||
                      form.conflict ||
                      (step === registrationSteps[1] &&
                        shop?.documents?.length !== 3)
                    }
                    onPress={() =>
                      void run("continue-registration", () =>
                        changeStep(
                          step === registrationSteps[0]
                            ? registrationSteps[1]
                            : registrationSteps[2],
                        ),
                      )
                    }
                  />
                </>
              )}
            </>
          ) : order ? (
            <>
              {isCancelledOrRejected(order) && <OrderOutcome order={order} />}
              <View
                style={{
                  flexDirection: wide
                    ? "row"
                    : order.status === "Ready for pickup"
                      ? "column-reverse"
                      : "column",
                  gap: 16,
                  alignItems: "flex-start",
                }}
              >
                <Card style={fieldColumn}>
                  <View style={[s.between, { flexWrap: "wrap" }]}>
                    <Text style={s.cardTitle}>Print specifications</Text>
                    <Pill>{stage(order.status)}</Pill>
                  </View>
                  <Pair
                    label="Pages / copies"
                    value={
                      order.pages +
                      (order.pages === 1 ? " page · " : " pages · ") +
                      order.settings.copies +
                      (order.settings.copies === 1 ? " copy" : " copies")
                    }
                  />
                  <Pair
                    label="Paper / color"
                    value={order.settings.paper + " · " + order.settings.color}
                  />
                  <Pair
                    label="Sides / finishing"
                    value={
                      order.settings.sides +
                      " · " +
                      (order.settings.finishing || "No binding")
                    }
                  />
                  {order.settings.pageRange && (
                    <Pair label="Page range" value={order.settings.pageRange} />
                  )}

                  {!!order.notes && (
                    <View style={{ gap: 4 }}>
                      <Text style={s.fieldLabel}>Customer notes</Text>
                      <Text style={s.body}>{order.notes}</Text>
                    </View>
                  )}
                  {order.status === "Queued" && approved && (
                    <Button
                      title="Start printing"
                      disabled={busy}
                      loading={pending === "start"}
                      onPress={() =>
                        void run("start", () => advance(order, "Printing"))
                      }
                    />
                  )}
                  <View style={s.rule} />
                  <Text style={s.cardTitle}>Documents</Text>
                  {Platform.OS === "web" && order.status === "Printing" && (
                    <Text style={s.small}>
                      Use the booked paper, copies, color and sides in your
                      printer settings.
                    </Text>
                  )}
                  {order.files.map((f) => {
                    const pages = filePrintRange(
                      order.files,
                      f.upload,
                      order.settings.pageRange,
                    );
                    return (
                      <View
                        key={order._id + ":" + f.upload}
                        style={{ gap: 8, paddingVertical: 6 }}
                      >
                        <Text style={s.fieldLabel}>{f.name}</Text>
                        {Platform.OS === "web" &&
                          order.status === "Printing" &&
                          approved &&
                          (pages ? (
                            <OwnerFilePrint
                              orderId={order._id}
                              fileId={f.upload}
                              name={f.name}
                              disabled={busy}
                              pages={pages}
                            />
                          ) : (
                            <Text style={s.small}>
                              No pages from this file are included in the booked
                              range.
                            </Text>
                          ))}
                        <OwnerFileDownload
                          orderId={order._id}
                          fileId={f.upload}
                        />
                      </View>
                    );
                  })}
                  {order.status === "Printing" && approved && (
                    <Button
                      title="Mark ready for pickup"
                      disabled={busy}
                      loading={pending === "ready"}
                      onPress={() =>
                        void run("ready", () =>
                          advance(order, "Ready for pickup"),
                        )
                      }
                    />
                  )}
                </Card>
                <View
                  style={[
                    wide ? { width: 306 } : { width: "100%" },
                    { gap: 16 },
                  ]}
                >
                  <Card tint={order.status === "Ready for pickup"}>
                    <Text style={s.cardTitle}>
                      {order.status === "Ready for pickup"
                        ? "Collect at the counter"
                        : "Payment"}
                    </Text>
                    <Pair
                      label={
                        isCancelledOrRejected(order)
                          ? "Original quoted total"
                          : "Total"
                      }
                      value={money(order.amount)}
                    />
                    <Pill>{paymentLabel(order)}</Pill>
                    {isActiveOrder(order) && (
                      <Pair label="Pickup code" value={order.pickupCode} />
                    )}
                    {order.status === "Ready for pickup" && (
                      <>
                        {approved &&
                          (order.paymentStatus === "paid" ? (
                            <Button
                              title="Mark as collected"
                              disabled={busy}
                              loading={pending === "collect"}
                              onPress={() =>
                                void run("collect", () =>
                                  advance(order, "Collected"),
                                )
                              }
                            />
                          ) : (
                            <Button
                              title="Confirm pickup payment"
                              disabled={busy}
                              loading={pending === "payment"}
                              onPress={() =>
                                void run("payment", async () => {
                                  const updated = await api.request<Order>(
                                    "/workspace/orders/" +
                                      order._id +
                                      "/payment",
                                    { method: "POST" },
                                  );
                                  app.setOwnerOrders((previous) =>
                                    previous.map((item) =>
                                      item._id === updated._id ? updated : item,
                                    ),
                                  );
                                })
                              }
                            />
                          ))}
                      </>
                    )}
                  </Card>
                  {approved &&
                    !isCancelledOrRejected(order) &&
                    (canEstimatePickup(order) || !!order.estimatedPickupAt) && (
                      <Card>
                        <OwnerPickupEstimate
                          key={order._id}
                          order={order}
                          onSaved={(updated) =>
                            app.setOwnerOrders((list) =>
                              list.map((item) =>
                                item._id === updated._id ? updated : item,
                              ),
                            )
                          }
                          onRefresh={() => app.refresh(true)}
                        />
                      </Card>
                    )}
                  {canEndOrder(order) &&
                    shop?.registrationStatus === "approved" &&
                    (rejecting?.id === order._id ? (
                      <EndOrderPanel
                        reject
                        reason={rejecting.reason}
                        onReason={(reason) =>
                          setRejecting({ id: order._id, reason })
                        }
                        busy={pending === "reject"}
                        onKeep={() => setRejecting(null)}
                        onConfirm={() =>
                          void run("reject", async () => {
                            let updated: Order;
                            try {
                              updated = await api.request<Order>(
                                "/workspace/orders/" + order._id + "/reject",
                                {
                                  method: "POST",
                                  body: JSON.stringify({
                                    reason: rejecting.reason,
                                  }),
                                },
                              );
                            } catch (error) {
                              if (
                                (error as { status?: number }).status === 409
                              ) {
                                setRejecting(null);
                                await app.refresh(true).catch(() => {});
                                throw new Error(
                                  "The order stage changed. Rejection is only available before printing. Review the latest status.",
                                );
                              }
                              throw error;
                            }
                            app.setOwnerOrders((list) =>
                              list.map((item) =>
                                item._id === updated._id ? updated : item,
                              ),
                            );
                            setRejecting(null);
                            void app
                              .refresh(true)
                              .catch((error) => setError(error.message));
                          })
                        }
                      />
                    ) : (
                      <Button
                        title="Reject order"
                        secondary
                        disabled={busy}
                        onPress={() =>
                          setRejecting({ id: order._id, reason: "" })
                        }
                      />
                    ))}
                </View>
              </View>
            </>
          ) : view === "Orders" ? (
            <>
              {!approved && !app.loading && (
                <Card>
                  <Text style={s.body}>
                    {shop?.registrationStatus === "submitted"
                      ? "Your registration is under review."
                      : "Complete your registration to receive print orders."}
                  </Text>
                  <LinkText onPress={() => go("Business registration")}>
                    View registration →
                  </LinkText>
                </Card>
              )}
              <Text style={s.small}>
                {
                  app.ownerOrders.filter(
                    (o) => o.status === "Queued" || o.status === "Printing",
                  ).length
                }{" "}
                ongoing ·{" "}
                {money(
                  app.ownerOrders
                    .filter((o) => o.paymentStatus === "paid")
                    .reduce((n, o) => n + o.amount, 0),
                )}{" "}
                received
              </Text>
              <Segments
                values={queueScopes}
                value={scope}
                onChange={(next) => {
                  setScope(next);
                  setStatusFilter(null);
                }}
              />
              {scope !== "All orders" && (
                <View
                  style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}
                >
                  {(scope === "Active" ? activeStages : historyStages).map(
                    (status) => {
                      const selected = statusFilter === status;
                      const count = scopedOrders.filter(
                        (o) => o.status === status,
                      ).length;
                      return (
                        <Pressable
                          key={status}
                          accessibilityRole="button"
                          accessibilityLabel={
                            stage(status) +
                            ", " +
                            count +
                            (count === 1 ? " order" : " orders")
                          }
                          accessibilityState={{ selected }}
                          aria-pressed={selected}
                          onPress={() =>
                            setStatusFilter(selected ? null : status)
                          }
                          style={({ pressed }) => ({
                            flexGrow: 1,
                            flexBasis: 80,
                            paddingVertical: 8,
                            paddingHorizontal: 8,
                            minHeight: 52,
                            borderRadius: 10,
                            borderColor: selected
                              ? colors.primary
                              : colors.line,
                            borderWidth: 1,
                            backgroundColor:
                              selected || pressed
                                ? colors.soft
                                : colors.surface,
                          })}
                        >
                          <Text style={[s.fieldLabel, { fontSize: 18 }]}>
                            {count}
                          </Text>
                          <Text
                            style={[
                              s.small,
                              {
                                color: selected ? colors.primary : colors.muted,
                              },
                            ]}
                          >
                            {stage(status)}
                          </Text>
                        </Pressable>
                      );
                    },
                  )}
                </View>
              )}
              <Field
                label="Search orders"
                placeholder="Order number or filename"
                value={query}
                onChangeText={setQuery}
              />
              <Card style={{ paddingVertical: 4, gap: 0 }}>
                {wide && (
                  <View
                    style={[
                      s.row,
                      {
                        paddingVertical: 12,
                        borderBottomWidth: 1,
                        borderColor: colors.line,
                      },
                    ]}
                  >
                    {["Order", "Document", "Payment", "Status"].map(
                      (column, index) => (
                        <Text
                          key={column}
                          style={[s.fieldLabel, { flex: index === 1 ? 2 : 1 }]}
                        >
                          {column}
                        </Text>
                      ),
                    )}
                    <View style={{ width: 16 }} />
                  </View>
                )}
                {orderList.map((o, index) => (
                  <Pressable
                    key={o._id}
                    accessibilityRole="button"
                    accessibilityLabel={"View " + orderCode(o._id)}
                    onPress={() =>
                      router.push({
                        pathname: "/workspace",
                        params: { view: "Orders", id: o._id, fromQueue: "1" },
                      })
                    }
                    style={({ pressed }) => ({
                      minHeight: 54,
                      paddingVertical: 12,
                      borderTopWidth: index === 0 ? 0 : 1,
                      borderColor: colors.line,
                      backgroundColor: pressed ? colors.soft : "transparent",
                      gap: 5,
                    })}
                  >
                    {wide ? (
                      <View style={s.row}>
                        <Text style={[s.fieldLabel, { flex: 1 }]}>
                          {orderCode(o._id)}
                        </Text>
                        <Text numberOfLines={2} style={[s.body, { flex: 2 }]}>
                          {o.files[0]?.name}
                          {o.files.length > 1
                            ? " +" + (o.files.length - 1)
                            : ""}
                        </Text>
                        <Text style={[s.small, { flex: 1 }]}>
                          {money(o.amount)} · {paymentLabel(o)}
                        </Text>
                        <View style={{ flex: 1 }}>
                          <Pill
                            tone={
                              o.status === "Ready for pickup"
                                ? "positive"
                                : "neutral"
                            }
                          >
                            {stage(o.status)}
                          </Pill>
                        </View>
                        <Feather
                          name="chevron-right"
                          size={16}
                          color={colors.muted}
                        />
                      </View>
                    ) : (
                      <>
                        <View style={[s.between, { flexWrap: "wrap" }]}>
                          <Text style={s.fieldLabel}>{orderCode(o._id)}</Text>
                          <Pill
                            tone={
                              o.status === "Ready for pickup"
                                ? "positive"
                                : "neutral"
                            }
                          >
                            {stage(o.status)}
                          </Pill>
                        </View>
                        <Text style={s.body} numberOfLines={2}>
                          {o.files[0]?.name}
                          {o.files.length > 1
                            ? " +" + (o.files.length - 1)
                            : ""}
                        </Text>
                        <View style={s.between}>
                          <Text style={s.small}>
                            {money(o.amount)} · {paymentLabel(o)}
                          </Text>
                          <Feather
                            name="chevron-right"
                            size={16}
                            color={colors.muted}
                          />
                        </View>
                      </>
                    )}
                  </Pressable>
                ))}
                {!orderList.length && (
                  <View style={{ paddingVertical: 16, gap: 4 }}>
                    <Text style={s.body}>
                      {app.loading
                        ? "Loading orders…"
                        : search || statusFilter
                          ? "No matching orders"
                          : scope === "Active"
                            ? "No active orders"
                            : scope === "History"
                              ? "No past orders"
                              : "No orders yet"}
                    </Text>
                    {!!(search || statusFilter) && (
                      <LinkText
                        onPress={() => {
                          setQuery("");
                          setStatusFilter(null);
                        }}
                      >
                        Clear filters
                      </LinkText>
                    )}
                  </View>
                )}
              </Card>
            </>
          ) : view === "Shop profile" && shop ? (
            <>
              <Card>
                <Text style={s.cardTitle}>Operating settings</Text>
                <View style={s.between}>
                  <Text style={s.body}>
                    {open ? "Open for bookings" : "Closed for bookings"}
                  </Text>
                  <Switch
                    accessibilityLabel="Open for bookings"
                    value={open}
                    onValueChange={setOpen}
                    disabled={busy}
                  />
                </View>

                <Text style={s.small}>
                  Closing the shop pauses new bookings. You can still fulfill
                  existing orders.
                </Text>
                <Field
                  label="Business hours"
                  value={hours}
                  onChangeText={setHours}
                />
                <Field
                  label="Contact number"
                  value={contact}
                  onChangeText={setContact}
                  keyboardType="phone-pad"
                />
                <Field
                  label="B&W / page (₱)"
                  value={mono}
                  onChangeText={setMono}
                  keyboardType="decimal-pad"
                />
                <Field
                  label="Color / page (₱)"
                  value={color}
                  onChangeText={setColor}
                  keyboardType="decimal-pad"
                />

                <Button
                  title="Save operating settings"
                  loading={pending === "settings"}
                  disabled={busy || form.conflict || !dirty}
                  onPress={() =>
                    void run("settings", async () => {
                      let next: Shop;
                      try {
                        next = await api.request<Shop>(
                          "/workspace/operations",
                          {
                            method: "PATCH",
                            body: JSON.stringify({
                              hours,
                              contact,
                              monoRate: Number(mono),
                              colorRate: Number(color),
                              open,
                              expectedVersion: form.version,
                            }),
                          },
                        );
                      } catch (e) {
                        if ((e as { status?: number }).status === 409) {
                          setForm((previous) => ({
                            ...previous,
                            conflict: true,
                          }));
                          await app.refresh(true);
                        }
                        throw e;
                      }
                      app.setWorkspace(next);
                      setForm(ownerSnapshot(next, app.user!));
                      setNotice("Operating settings saved.");
                      await app.refresh();
                    })
                  }
                />
              </Card>
              <Card>
                <OwnerLocation shop={shop} />
              </Card>
              <Card>
                <View style={[s.between, { flexWrap: "wrap" }]}>
                  <Text style={s.cardTitle}>Business registration</Text>
                  <Pill tone="positive">Approved</Pill>
                </View>
                <Pair label="Registered name" value={shop.name} />
                <Pair label="Registered address" value={shop.address} />
                <Pair
                  label="Representative"
                  value={shop.representative || "Not listed"}
                />
                <Pair
                  label="Registration email"
                  value={shop.email || "Not listed"}
                />
              </Card>
            </>
          ) : (
            <Card>
              <Text style={s.cardTitle}>Workspace settings</Text>
              <Text style={s.body}>
                Your shop is linked to your owner account. Customer files are
                private to their assigned shop.
              </Text>
              <Button
                title="Account & preferences"
                secondary
                onPress={() => router.push("/profile")}
              />
              <Button
                title="Log out"
                secondary
                disabled={busy}
                loading={pending === "logout"}
                onPress={() =>
                  void run("logout", async () => {
                    await app.signOut();
                    router.replace("/login");
                  })
                }
              />
            </Card>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
