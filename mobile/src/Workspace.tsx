import {
  canEndOrder,
  isActiveOrder,
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
import { router } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { useApp } from "./state";
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
import { MotionButton as Button, SuccessNotice } from "./motion";
import * as api from "./api";
import type { Order, Shop } from "./types";
import { OwnerFilePrint } from "./OwnerFilePrint";
import { OwnerFileDownload } from "./OwnerFileDownload";
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

const views = [
  "Overview",
  "Orders",
  "Business registration",
  "Shop profile",
  "Settings",
] as const;
export function Workspace({ view, id }: { view: string; id: string }) {
  const app = useApp();
  const wide = useWindowDimensions().width >= 960;
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const lock = useRef(false);
  const shop = app.workspace;
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
  const setAddress = (value: string) => edit("address", value);
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
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("All orders");
  const [rejecting, setRejecting] = useState<{
    id: string;
    reason: string;
  } | null>(null);
  const order = app.ownerOrders.find((o) => o._id === id);
  const registering =
    view === "Business registration" ||
    (view === "Overview" &&
      (!shop || ["draft", "rejected"].includes(shop.registrationStatus || "")));
  const title = order
    ? "Order " + orderCode(order._id)
    : registering
      ? review
        ? "Review registration"
        : "Register your business"
      : view;
  function go(next: string) {
    setError("");
    setNotice("");
    setStep(registrationSteps[0]);
    router.push({ pathname: "/workspace", params: { view: next } });
  }
  async function run(action: () => Promise<unknown>) {
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
  const orderList = app.ownerOrders.filter(
    (o) =>
      (filter === "All orders" || stage(o.status) === filter) &&
      (orderCode(o._id) + " " + o.files.map((f) => f.name).join(" "))
        .toLowerCase()
        .includes(query.toLowerCase()),
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
          backgroundColor: colors.surface,
        }}
      >
        {wide ? (
          <View style={{ width: 232, padding: 28, gap: 28 }}>
            <View style={s.row}>
              <Art name="logo" size={30} />
              <Text
                style={{
                  fontSize: 26,
                  color: colors.primary,
                  fontWeight: "700",
                }}
              >
                PaPrint
              </Text>
            </View>
            <Text style={s.small}>SHOP WORKSPACE</Text>
            {views.map((v) => (
              <Pressable
                key={v}
                accessibilityRole="button"
                onPress={() => go(v)}
                style={{
                  padding: 12,
                  borderRadius: 12,
                  backgroundColor: view === v ? colors.soft : colors.surface,
                  minHeight: 44,
                }}
              >
                <Text
                  style={{ color: view === v ? colors.primary : colors.muted }}
                >
                  {v}
                </Text>
              </Pressable>
            ))}
            <View style={{ flex: 1 }} />
            <Text style={s.cardTitle}>{shop?.name || app.user!.name}</Text>
            <Text style={s.small}>Naga City · Owner account</Text>
            <LinkText onPress={() => router.push("/home")}>
              Customer app →
            </LinkText>
          </View>
        ) : (
          <View style={{ padding: 20, gap: 12 }}>
            <View style={s.between}>
              <View style={s.row}>
                <Art name="logo" size={30} />
                <Text style={s.cardTitle}>Shop workspace</Text>
              </View>
              <LinkText onPress={() => router.push("/home")}>
                Customer app
              </LinkText>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <Segments
                values={views}
                value={
                  views.includes(view as (typeof views)[number])
                    ? (view as (typeof views)[number])
                    : "Overview"
                }
                onChange={go}
              />
            </ScrollView>
          </View>
        )}
        <ScrollView
          keyboardShouldPersistTaps="handled"
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: wide ? 36 : 24, gap: 24 }}
        >
          <View style={s.between}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[s.heading, { marginTop: 0, letterSpacing: 0 }]}>
                {title}
              </Text>
              <Text style={[s.body, { color: colors.muted }]}>
                {registering
                  ? "Set up your shop to start accepting local print orders."
                  : "Manage your queue and keep customers updated."}
              </Text>
            </View>
            {wide && <Pill>Owner account</Pill>}
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
                loading={busy}
                onPress={() => void run(reloadSettings)}
              />
            </Card>
          )}
          {(registering || view === "Shop profile") && dirty && (
            <Text style={s.small}>Unsaved changes</Text>
          )}
          {app.loading && !shop && (
            <Text style={s.muted}>Loading your workspace…</Text>
          )}
          {registering ? (
            <>
              {(!shop ||
                ["draft", "rejected"].includes(
                  shop.registrationStatus || "",
                )) && (
                <Segments
                  values={registrationSteps}
                  value={step}
                  disabled={busy}
                  onChange={(target) => void run(() => changeStep(target))}
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
              ) : shop?.registrationStatus === "approved" ? (
                <Card>
                  <Pill>Approved</Pill>
                  <Text style={s.cardTitle}>Your business is registered</Text>
                  <Button title="Open orders" onPress={() => go("Orders")} />
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
                      loading={busy}
                      disabled={
                        !confirm ||
                        !shop ||
                        shop.documents?.length !== 3 ||
                        form.conflict
                      }
                      onPress={() =>
                        void run(async () => {
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
                        <Field
                          label="Shop address in Naga City"
                          placeholder="Sample Street, Bagumbayan, Naga City"
                          value={address}
                          onChangeText={setAddress}
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
                          title="Save business details"
                          loading={busy}
                          onPress={() => void run(save)}
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
                              loading={busy}
                              onPress={() =>
                                void run(async () => {
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
                          loading={busy}
                          disabled={!shop || (shop.documents?.length || 0) >= 3}
                          onPress={() => void run(documents)}
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
                    loading={busy}
                    disabled={
                      form.conflict ||
                      (step === registrationSteps[1] &&
                        shop?.documents?.length !== 3)
                    }
                    onPress={() =>
                      void run(() =>
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
              <LinkText onPress={() => go("Orders")}>‹ Back to orders</LinkText>
              {isCancelledOrRejected(order) ? (
                <OrderOutcome order={order} />
              ) : null}
              <View
                style={{
                  flexDirection: wide ? "row" : "column",
                  gap: 28,
                  alignItems: "flex-start",
                }}
              >
                <Card style={fieldColumn}>
                  <Text style={s.cardTitle}>Print specifications</Text>
                  {order.status === "Printing" && (
                    <Text style={s.small}>
                      Print file opens your printer settings. Match the booked
                      paper, copies, color and sides. Mark as Done after
                      printing.
                    </Text>
                  )}
                  {Platform.OS === "web" &&
                    order.status === "Queued" &&
                    shop?.registrationStatus === "approved" && (
                      <Text style={s.small}>
                        Choose Start printing to begin the job and unlock the
                        file print controls.
                      </Text>
                    )}
                  {order.files.map((f) => (
                    <View key={order._id + ":" + f.upload} style={{ gap: 10 }}>
                      <Pair label="File" value={f.name} />
                      <OwnerFileDownload
                        orderId={order._id}
                        fileId={f.upload}
                      />
                      {Platform.OS === "web" &&
                        order.status === "Printing" &&
                        shop?.registrationStatus === "approved" &&
                        (filePrintRange(
                          order.files,
                          f.upload,
                          order.settings.pageRange,
                        ) ? (
                          <OwnerFilePrint
                            orderId={order._id}
                            fileId={f.upload}
                            name={f.name}
                            disabled={busy}
                            pages={filePrintRange(
                              order.files,
                              f.upload,
                              order.settings.pageRange,
                            )!}
                          />
                        ) : (
                          <Text style={s.small}>
                            No pages from this file are selected in the booked
                            page range.
                          </Text>
                        ))}
                    </View>
                  ))}
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
                  <Text style={s.cardTitle}>Production status</Text>
                  <Pill>{stage(order.status)}</Pill>
                  {order.notes && <Text style={s.body}>{order.notes}</Text>}
                  {canEndOrder(order) &&
                    shop?.registrationStatus === "approved" &&
                    (rejecting?.id === order._id ? (
                      <EndOrderPanel
                        reject
                        reason={rejecting.reason}
                        onReason={(reason) =>
                          setRejecting({ id: order._id, reason })
                        }
                        busy={busy}
                        onKeep={() => setRejecting(null)}
                        onConfirm={() =>
                          void run(async () => {
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

                  {order.status === "Queued" || order.status === "Printing" ? (
                    <Button
                      title={
                        order.status === "Queued"
                          ? "Start printing"
                          : "Mark as Done"
                      }
                      loading={busy}
                      onPress={() =>
                        void run(() =>
                          advance(
                            order,
                            order.status === "Queued"
                              ? "Printing"
                              : "Ready for pickup",
                          ),
                        )
                      }
                    />
                  ) : null}
                </Card>
                <Card style={wide ? { width: 330 } : { width: "100%" }}>
                  <Text style={s.cardTitle}>Payment</Text>
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
                    <>
                      <Text style={s.cardTitle}>
                        Pickup code: {order.pickupCode}
                      </Text>
                      {order.status === "Ready for pickup" &&
                        order.paymentStatus !== "paid" && (
                          <Button
                            title="Confirm pickup payment"
                            secondary
                            loading={busy}
                            onPress={() =>
                              void run(async () => {
                                const updated = await api.request<Order>(
                                  "/workspace/orders/" + order._id + "/payment",
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
                        )}
                      <Button
                        title="Mark as collected"
                        secondary
                        disabled={
                          order.status !== "Ready for pickup" ||
                          order.paymentStatus !== "paid"
                        }
                        loading={busy}
                        onPress={() =>
                          void run(() => advance(order, "Collected"))
                        }
                      />
                      <Text style={s.small}>
                        Available after status is Done and pickup payment is
                        confirmed.
                      </Text>
                    </>
                  )}
                </Card>
              </View>
            </>
          ) : view === "Orders" || view === "Overview" ? (
            <>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 20 }}>
                {["Preparing", "Printing", "Done"].map((label) => (
                  <Card key={label} style={{ flexGrow: 1, minWidth: 130 }}>
                    <Text style={s.heading}>
                      {String(
                        app.ownerOrders.filter(
                          (o) => isActiveOrder(o) && stage(o.status) === label,
                        ).length,
                      ).padStart(2, "0")}
                    </Text>
                    <Text style={s.body}>{label}</Text>
                  </Card>
                ))}
                <Card style={{ flexGrow: 1, minWidth: 130 }}>
                  <Text style={s.heading}>
                    {money(
                      app.ownerOrders
                        .filter((o) => o.paymentStatus === "paid")
                        .reduce((n, o) => n + o.amount, 0),
                    )}
                  </Text>
                  <Text style={s.body}>Received payments</Text>
                </Card>
              </View>
              {shop?.registrationStatus !== "approved" && (
                <Card>
                  <Pill>
                    {shop?.registrationStatus === "submitted"
                      ? "Under review"
                      : "Registration draft"}
                  </Pill>
                  <Text style={s.body}>
                    Your shop can accept orders after approval.
                  </Text>
                  <LinkText onPress={() => go("Business registration")}>
                    View registration →
                  </LinkText>
                </Card>
              )}
              <Field
                label="Search orders"
                placeholder="Search order or file"
                value={query}
                onChangeText={setQuery}
              />
              <Segments
                values={[
                  "All orders",
                  "Preparing",
                  "Printing",
                  "Done",
                  "Collected",
                  "Cancelled",
                  "Rejected",
                ]}
                value={filter}
                onChange={setFilter}
              />
              <Card>
                {wide && (
                  <View style={s.between}>
                    {["ORDER", "FILE", "PAYMENT", "STATUS", "ACTION"].map(
                      (t) => (
                        <Text key={t} style={[s.small, { flex: 1 }]}>
                          {t}
                        </Text>
                      ),
                    )}
                  </View>
                )}
                {orderList.map((o) => (
                  <Pressable
                    key={o._id}
                    accessibilityRole="button"
                    accessibilityLabel={"View " + orderCode(o._id)}
                    onPress={() =>
                      router.push({
                        pathname: "/workspace",
                        params: { view: "Orders", id: o._id },
                      })
                    }
                    style={{
                      flexDirection: wide ? "row" : "column",
                      gap: 12,
                      paddingVertical: 16,
                      borderBottomWidth: 1,
                      borderColor: colors.line,
                    }}
                  >
                    <Text style={[s.body, wide && { flex: 1 }]}>
                      {orderCode(o._id)}
                    </Text>
                    <Text style={[s.body, wide && { flex: 1 }]}>
                      {o.files[0]?.name}
                    </Text>
                    <Text style={[s.small, wide && { flex: 1 }]}>
                      {money(o.amount)} · {paymentLabel(o)}
                    </Text>
                    <Text style={[s.body, wide && { flex: 1 }]}>
                      {stage(o.status)}
                    </Text>
                    <Text
                      style={[
                        s.body,
                        { color: colors.primary },
                        wide && { flex: 1 },
                      ]}
                    >
                      View order →
                    </Text>
                  </Pressable>
                ))}
                {!orderList.length && (
                  <Text style={[s.muted, { paddingVertical: 24 }]}>
                    No orders here yet. New orders will appear in your queue.
                  </Text>
                )}
              </Card>
              <Text style={s.small}>
                Preparing → Printing → Done. Mark collected after pickup
                payment.
              </Text>
            </>
          ) : view === "Shop profile" ? (
            <Card>
              <Text style={s.cardTitle}>{shop?.name || "Your shop"}</Text>
              <Pair label="Address" value={shop?.address || "Not registered"} />
              <Pair label="Hours" value={shop?.hours || "Not set"} />
              <Pair label="Contact" value={shop?.contact || "Not set"} />
              <Pill>{shop?.registrationStatus || "Not registered"}</Pill>
              {shop?.registrationStatus === "approved" && (
                <>
                  <Text style={s.cardTitle}>Operating settings</Text>
                  <Text style={s.small}>
                    Business identity and registration documents are locked.
                    Closing stops new bookings; existing orders remain
                    available.
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
                  <Button
                    title="Save operating settings"
                    loading={busy}
                    disabled={form.conflict || !dirty}
                    onPress={() =>
                      void run(async () => {
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
                </>
              )}
              <LinkText onPress={() => go("Business registration")}>
                View business registration →
              </LinkText>
            </Card>
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
                loading={busy}
                onPress={() =>
                  void run(async () => {
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
