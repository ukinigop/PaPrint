import React, { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, View, useWindowDimensions } from "react-native";
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
import { MotionButton as Button } from "./motion";
import * as api from "./api";
import type { Order, Shop } from "./types";

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
  const [name, setName] = useState(shop?.name || ""),
    [representative, setRepresentative] = useState(
      shop?.representative || app.user!.name,
    ),
    [address, setAddress] = useState(shop?.address || ""),
    [contact, setContact] = useState(shop?.contact || app.user!.phone || ""),
    [email, setEmail] = useState(shop?.email || app.user!.email),
    [hours, setHours] = useState(shop?.hours || "8:00 AM – 6:00 PM"),
    [mono, setMono] = useState(String(shop?.monoRate || 2)),
    [color, setColor] = useState(String(shop?.colorRate || 8));
  const hydrated = useRef(shop?._id);
  useEffect(() => {
    if (shop && hydrated.current !== shop._id) {
      hydrated.current = shop._id;
      setName(shop.name);
      setRepresentative(shop.representative || app.user!.name);
      setAddress(shop.address);
      setContact(shop.contact || "");
      setEmail(shop.email || app.user!.email);
      setHours(shop.hours || "8:00 AM – 6:00 PM");
      setMono(String(shop.monoRate));
      setColor(String(shop.colorRate));
    }
  }, [shop, app.user]);
  const [review, setReview] = useState(false),
    [confirm, setConfirm] = useState(false),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("All orders");
  const order = app.ownerOrders.find((o) => o._id === id);
  const registering =
    view === "Business registration" ||
    (view === "Overview" && (!shop || shop.registrationStatus === "draft"));
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
    setReview(false);
    router.push({ pathname: "/workspace", params: { view: next } });
  }
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
  async function save() {
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
    setNotice("Business details saved.");
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
      <View
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
          {notice ? (
            <Text accessibilityRole="alert" style={{ color: colors.primary }}>
              {notice}
            </Text>
          ) : null}
          {app.loading && !shop && (
            <Text style={s.muted}>Loading your workspace…</Text>
          )}
          {registering ? (
            <>
              <Segments
                values={[
                  "01 Business details",
                  "02 Documents",
                  "03 Review & submit",
                ]}
                value={
                  review
                    ? "03 Review & submit"
                    : shop
                      ? "02 Documents"
                      : "01 Business details"
                }
                onChange={(v) => setReview(v === "03 Review & submit")}
              />
              {shop?.registrationStatus === "submitted" ? (
                <Card>
                  <Pill>Under review</Pill>
                  <Text style={s.cardTitle}>Registration submitted</Text>
                  <Text style={s.body}>
                    Your business details and 3 documents are saved. Your shop
                    becomes visible after approval.
                  </Text>
                  <Text style={s.small}>
                    Approval is handled by the PaPrint team. This MVP has no
                    public approval dashboard yet.
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
                    <Pill>Draft</Pill>
                    <Pair
                      label="Owner"
                      value={shop?.representative || representative}
                    />
                    <Pair label="Address" value={shop?.address || address} />
                    <Pair label="Business hours" value={shop?.hours || hours} />
                    <Pair label="Contact" value={shop?.contact || contact} />
                    <Text style={s.cardTitle}>Documents</Text>
                    {shop?.documents?.map((d) => (
                      <Text key={d._id} style={s.body}>
                        ✓ {d.name}
                      </Text>
                    ))}
                    {!shop?.documents?.length && (
                      <Text style={s.muted}>No documents uploaded.</Text>
                    )}
                    <LinkText onPress={() => setReview(false)}>
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
                        !confirm || !shop || shop.documents?.length !== 3
                      }
                      onPress={() =>
                        void run(async () => {
                          app.setWorkspace(
                            await api.request<Shop>("/workspace/submit", {
                              method: "POST",
                              body: JSON.stringify({ confirm }),
                            }),
                          );
                          setNotice("Registration submitted for review.");
                        })
                      }
                    />
                    <Button
                      title="Back to edit"
                      secondary
                      onPress={() => setReview(false)}
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
                    <Card style={wide ? { width: 330 } : { width: "100%" }}>
                      <Text style={s.cardTitle}>Before you submit</Text>
                      <Text style={s.body}>01 Add business details</Text>
                      <Text style={s.body}>02 Upload business documents</Text>
                      <Text style={s.body}>
                        03 Set services and sample rates
                      </Text>
                      <Text style={s.body}>04 Review and submit</Text>
                      <Text style={s.cardTitle}>Registration documents</Text>
                      <Text style={s.small}>
                        Business permit · Registration proof · Owner
                        identification. 3 PDFs,{" "}
                        {app.maxUploadBytes / 1024 / 1024} MB each.
                      </Text>
                      {shop?.documents?.map((d) => (
                        <Text key={d._id} style={s.small}>
                          ✓ {d.name}
                        </Text>
                      ))}
                      <Button
                        title="Upload documents"
                        secondary
                        loading={busy}
                        disabled={!shop || (shop.documents?.length || 0) >= 3}
                        onPress={() => void run(documents)}
                      />
                    </Card>
                  </View>
                  <Button
                    title="Save & continue"
                    loading={busy}
                    onPress={() =>
                      void run(async () => {
                        await save();
                        setReview(true);
                      })
                    }
                  />
                </>
              )}
            </>
          ) : order ? (
            <>
              <LinkText onPress={() => go("Orders")}>‹ Back to orders</LinkText>
              <View
                style={{
                  flexDirection: wide ? "row" : "column",
                  gap: 28,
                  alignItems: "flex-start",
                }}
              >
                <Card style={fieldColumn}>
                  <Text style={s.cardTitle}>Print specifications</Text>
                  {order.files.map((f) => (
                    <View key={f.upload} style={{ gap: 10 }}>
                      <Pair label="File" value={f.name} />
                      <Button
                        title="Preview / download file"
                        secondary
                        loading={busy}
                        onPress={() =>
                          void run(() =>
                            api.openPrintFile(order._id, f.upload, "", true),
                          )
                        }
                      />
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
                  <Pair label="Total" value={money(order.amount)} />
                  <Pill>
                    {order.paymentStatus === "paid"
                      ? "Paid"
                      : "Pay on pickup · Unpaid"}
                  </Pill>
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
                    title={
                      order.status === "Collected"
                        ? "Collected"
                        : "Mark as collected"
                    }
                    secondary
                    disabled={
                      order.status !== "Ready for pickup" ||
                      order.paymentStatus !== "paid"
                    }
                    loading={busy}
                    onPress={() => void run(() => advance(order, "Collected"))}
                  />
                  <Text style={s.small}>
                    Available after status is Done and pickup payment is
                    confirmed.
                  </Text>
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
                        app.ownerOrders.filter((o) => stage(o.status) === label)
                          .length,
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
                      {money(o.amount)} ·{" "}
                      {o.paymentStatus === "paid" ? "Paid" : "On pickup"}
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
      </View>
    </SafeAreaView>
  );
}
