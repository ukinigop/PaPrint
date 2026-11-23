import React, { useCallback, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import Feather from "@expo/vector-icons/Feather";
import { Card, Field, money, Pair, Pill, Segments } from "./design";
import { Text } from "./ui";
import { MotionButton as Button, SuccessNotice } from "./motion";
import { useStyles } from "./styles";
import { useApp } from "./state";
import * as api from "./api";
import type { Shop } from "./types";
import { Brand } from "./Brand";
import { useAppearance } from "./Appearance";
import { AppearanceSettings } from "./AppearanceSettings";
import { LocationReviews } from "./LocationReviews";
import { shopMapUrl, shopHours } from "./shopDiscovery";

const filters = ["submitted", "approved", "rejected", "draft"] as const;
type RegistrationFilter = (typeof filters)[number];

function RegistrationDocument({
  shopId,
  document,
}: {
  shopId: string;
  document: NonNullable<Shop["documents"]>[number];
}) {
  const s = useStyles();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const locked = useRef(false);
  async function download() {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      await api.openPrivatePdf(
        `/admin/shops/${shopId}/documents/${document._id}`,
        document._id,
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Couldn’t download this document.",
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <Button
        title={"Download " + document.name}
        secondary
        loading={busy}
        onPress={() => void download()}
      />
      {!!error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}
    </>
  );
}

function Registrations({
  filter,
  id,
  wide,
  onDeleted,
}: {
  filter: RegistrationFilter;
  id: string;
  wide: boolean;
  onDeleted: (name: string) => void;
}) {
  const s = useStyles();
  const { colors } = useAppearance();
  const [shops, setShops] = useState<Shop[]>([]);
  const [selected, setSelected] = useState<Shop | null>(null);
  const [draft, setDraft] = useState({ version: 0, reason: "" });
  const version = selected?.submissionVersion || 0;
  const reason = draft.version === version ? draft.reason : "";
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const lock = useRef(false);
  const generation = useRef(0);
  const showList = wide || !id;

  const load = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const [list, detail] = await Promise.all([
        showList
          ? api.request<Shop[]>("/admin/shops?status=" + filter)
          : Promise.resolve([]),
        id ? api.request<Shop>("/admin/shops/" + id) : Promise.resolve(null),
      ]);
      if (request !== generation.current) return;
      setShops(list);
      setSelected(detail);
    } catch (e) {
      if (request === generation.current)
        setError(
          e instanceof Error ? e.message : "Unable to load registrations.",
        );
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, [filter, id, showList]);

  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {
        generation.current++;
      };
    }, [load]),
  );

  async function decide(decision: "approved" | "rejected") {
    if (lock.current || !selected) return;
    lock.current = true;
    setAction(decision);
    setError("");
    setNotice("");
    const current = api.captureSession();
    try {
      const updated = await api.request<Shop>(
        "/admin/shops/" + selected._id + "/decision",
        {
          method: "POST",
          body: JSON.stringify({
            decision,
            reason: reason.trim(),
            submissionVersion: version,
          }),
        },
      );
      if (!current()) return;
      setSelected(updated);
      setShops((list) => list.filter((shop) => shop._id !== updated._id));
      setDraft({ version, reason: "" });
      setNotice(
        decision === "approved"
          ? "Approved. The owner can now open the shop."
          : "Rejected. The owner can correct and resubmit the registration.",
      );
    } catch (e) {
      if (!current()) return;
      if ((e as { status?: number }).status === 409) await load();
      setError(e instanceof Error ? e.message : "Couldn’t save this decision.");
    } finally {
      lock.current = false;
      setAction("");
    }
  }

  async function deleteShop() {
    if (lock.current || !selected) return;
    lock.current = true;
    setAction("delete");
    setError("");
    const current = api.captureSession();
    try {
      await api.request<{ ok: true }>("/admin/shops/" + selected._id, {
        method: "DELETE",
      });
      if (current()) onDeleted(selected.name);
    } catch (e) {
      if (!current()) return;
      if ((e as { status?: number }).status === 404) onDeleted(selected.name);
      else
        setError(e instanceof Error ? e.message : "Couldn’t delete this shop.");
    } finally {
      lock.current = false;
      setAction("");
    }
  }

  return (
    <View style={{ gap: 14 }}>
      {!!id && !wide && (
        <View style={[s.between, { flexWrap: "wrap" }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to registrations"
            accessibilityState={{ disabled: !!action }}
            disabled={!!action}
            onPress={() =>
              router.dismissTo({
                pathname: "/admin",
                params: { status: filter },
              })
            }
            style={[s.row, { minHeight: 44, alignSelf: "flex-start" }]}
          >
            <Feather
              name="arrow-left"
              size={18}
              color={colors.primary}
              accessible={false}
            />
            <Text style={[s.fieldLabel, { color: colors.primary }]}>
              Back to registrations
            </Text>
          </Pressable>
          <Button
            title="Refresh"
            secondary
            disabled={!!action}
            loading={loading}
            onPress={() => void load()}
          />
        </View>
      )}
      {showList && (
        <Segments
          values={filters}
          value={filter}
          disabled={!!action}
          onChange={(status) => {
            if (filter !== status || id)
              router.replace({ pathname: "/admin", params: { status } });
          }}
        />
      )}
      <View
        style={{
          flexDirection: wide && id ? "row" : "column",
          alignItems: "flex-start",
          gap: 18,
        }}
      >
        {showList && (
          <View
            style={
              wide && id
                ? { flex: 1, minWidth: 0, gap: 10 }
                : { width: "100%", gap: 10 }
            }
          >
            <View style={[s.between, { flexWrap: "wrap" }]}>
              <Text style={s.fieldLabel}>
                {loading
                  ? "Loading registrations…"
                  : error && !shops.length
                    ? "Registrations"
                    : `${shops.length} ${filter} registration${shops.length === 1 ? "" : "s"}`}
              </Text>
              <Button
                title="Refresh"
                secondary
                disabled={!!action}
                loading={loading}
                onPress={() => void load()}
              />
            </View>
            {!!shops.length && (
              <Card
                style={{ gap: 0, paddingHorizontal: 14, paddingVertical: 4 }}
              >
                {shops.map((shop, index) => (
                  <Pressable
                    key={shop._id}
                    accessibilityRole="button"
                    accessibilityLabel={`Review registration for ${shop.name}`}
                    accessibilityState={{
                      selected: shop._id === id,
                      disabled: !!action,
                    }}
                    disabled={!!action}
                    onPress={() => {
                      if (id === shop._id) return;
                      const route = {
                        pathname: "/admin" as const,
                        params: { id: shop._id, status: filter },
                      };
                      if (id) router.replace(route);
                      else router.push(route);
                    }}
                    style={({ pressed }) => [
                      s.between,
                      {
                        minHeight: 64,
                        paddingVertical: 10,
                        paddingHorizontal: 6,
                        borderBottomWidth: index < shops.length - 1 ? 1 : 0,
                        borderColor: colors.line,
                        backgroundColor:
                          pressed || shop._id === id
                            ? colors.soft
                            : colors.surface,
                      },
                    ]}
                  >
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={s.fieldLabel}>{shop.name}</Text>
                      <Text style={s.small}>{shop.address}</Text>
                    </View>
                    <Feather
                      name="chevron-right"
                      size={18}
                      color={colors.primary}
                      accessible={false}
                    />
                  </Pressable>
                ))}
              </Card>
            )}
          </View>
        )}
        {!!id && (
          <View
            style={
              wide
                ? { flex: 1.5, minWidth: 0, gap: 12 }
                : { width: "100%", gap: 12 }
            }
          >
            {!!selected && (
              <Card>
                <View style={{ gap: 8 }}>
                  <Pill
                    tone={
                      selected.registrationStatus === "approved"
                        ? "positive"
                        : selected.registrationStatus === "rejected"
                          ? "negative"
                          : "primary"
                    }
                  >
                    {selected.registrationStatus || "approved"}
                  </Pill>
                  <Text accessibilityRole="header" style={s.sectionTitle}>
                    {selected.name}
                  </Text>
                  <Text style={s.body}>{selected.address}</Text>
                </View>
                <Button
                  title="View registration map pin"
                  secondary
                  disabled={!selected.coordinates}
                  onPress={() => {
                    void Linking.openURL(shopMapUrl(selected)).catch(() =>
                      setError("Couldn’t open Maps."),
                    );
                  }}
                />
                {selected.registrationStatus === "submitted" &&
                  !selected.coordinates && (
                    <Text style={s.error}>
                      This registration needs a storefront pin before approval.
                    </Text>
                  )}
                <View style={s.rule} />
                <Pair
                  label="Representative"
                  value={selected.representative || "Not listed"}
                />
                <Pair label="Email" value={selected.email || "Not listed"} />
                <Pair
                  label="Contact"
                  value={selected.contact || "Not listed"}
                />
                <Pair label="Hours" value={shopHours(selected.hours)} />
                <Pair
                  label="B&W / color per page"
                  value={
                    money(selected.monoRate) + " / " + money(selected.colorRate)
                  }
                />
                <View style={s.rule} />
                <Text style={s.cardTitle}>Registration documents</Text>
                {selected.documents?.length ? (
                  selected.documents.map((document) => (
                    <RegistrationDocument
                      key={document._id}
                      shopId={selected._id}
                      document={document}
                    />
                  ))
                ) : (
                  <Text style={s.small}>No documents on file.</Text>
                )}
                {selected.registrationStatus === "submitted" && (
                  <>
                    <View style={s.rule} />
                    <Text style={s.cardTitle}>Review decision</Text>
                    <Field
                      label="Review reason (required for rejection)"
                      value={reason}
                      onChangeText={(text) =>
                        setDraft({ version, reason: text })
                      }
                      editable={!action && !loading}
                      maxLength={1000}
                      multiline
                    />
                    <Text style={s.small}>
                      The owner can open the shop after approval.
                    </Text>
                    <Button
                      title="Approve partner"
                      loading={action === "approved"}
                      disabled={!!action || loading || !selected.coordinates}
                      onPress={() => void decide("approved")}
                    />
                    <Button
                      title="Reject for correction"
                      secondary
                      loading={action === "rejected"}
                      disabled={!!action || loading || !reason.trim()}
                      onPress={() => void decide("rejected")}
                    />
                  </>
                )}
                {!!selected.reviews?.length && (
                  <>
                    <View style={s.rule} />
                    <Text style={s.cardTitle}>Review history</Text>
                    {selected.reviews
                      .slice()
                      .reverse()
                      .map((review, index) => (
                        <View key={index} style={{ gap: 4 }}>
                          <Text style={s.body}>
                            {review.decision} ·{" "}
                            {new Date(review.at).toLocaleString()}
                          </Text>
                          {!!review.reason && (
                            <Text style={s.small}>{review.reason}</Text>
                          )}
                        </View>
                      ))}
                  </>
                )}
                <View style={s.rule} />
                {confirmDelete ? (
                  <>
                    <Text
                      accessibilityRole="header"
                      style={[s.cardTitle, { color: colors.error }]}
                    >
                      Delete {selected.name}?
                    </Text>
                    <Text style={s.body}>
                      Customers will no longer see this shop or book new orders.
                      The owner can still fulfill existing orders.
                    </Text>
                    <Button
                      title="Confirm deletion"
                      loading={action === "delete"}
                      disabled={!!action || loading}
                      onPress={() => void deleteShop()}
                    />
                    <Button
                      title="Keep shop"
                      secondary
                      disabled={!!action}
                      onPress={() => setConfirmDelete(false)}
                    />
                  </>
                ) : (
                  <Button
                    title="Delete shop"
                    secondary
                    disabled={!!action || loading}
                    onPress={() => setConfirmDelete(true)}
                  />
                )}
              </Card>
            )}
            {!wide && loading && (
              <Text style={s.small}>Loading registration…</Text>
            )}
            {!!notice && <SuccessNotice>{notice}</SuccessNotice>}
          </View>
        )}
      </View>
      {!!error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}
    </View>
  );
}

export function Admin({ id, status }: { id: string; status?: string }) {
  const s = useStyles();
  const { colors, scheme } = useAppearance();
  const app = useApp();
  const wide = useWindowDimensions().width >= 960;
  const { view } = useLocalSearchParams<{ view?: string }>();
  const locations = view === "locations";
  const filter = filters.find((value) => value === status) ?? "submitted";
  const detailOnly = !wide && !!id && !locations;
  const [showAppearance, setShowAppearance] = useState(false);
  const [deletedShop, setDeletedShop] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const logoutLock = useRef(false);
  async function logout() {
    if (logoutLock.current) return;
    logoutLock.current = true;
    setLoggingOut(true);
    setLogoutError("");
    try {
      await app.signOut();
      router.replace("/login");
    } catch (e) {
      setLogoutError(e instanceof Error ? e.message : "Unable to log out.");
    } finally {
      logoutLock.current = false;
      setLoggingOut(false);
    }
  }
  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          key={locations ? "locations" : id || "registrations"}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            padding: wide ? 32 : 16,
            flexGrow: 1,
            backgroundColor: colors.canvas,
            gap: 16,
            width: "100%",
            maxWidth: 1120,
            alignSelf: "center",
          }}
        >
          <View style={s.masthead}>
            <View style={s.row}>
              <Brand width={32} />
              <Text style={s.fieldLabel}>Administration</Text>
            </View>
            <View style={[s.row, { gap: 4 }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Appearance"
                accessibilityState={{ expanded: showAppearance }}
                aria-expanded={showAppearance}
                onPress={() => setShowAppearance((shown) => !shown)}
                style={s.iconAction}
              >
                <Feather
                  name={scheme === "dark" ? "sun" : "moon"}
                  color={colors.primary}
                  size={20}
                />
              </Pressable>
              <Button
                title="Log out"
                secondary
                loading={loggingOut}
                onPress={() => void logout()}
              />
            </View>
          </View>
          {showAppearance && (
            <Card>
              <Text style={s.cardTitle}>Appearance</Text>
              <AppearanceSettings />
            </Card>
          )}
          {!!logoutError && (
            <Text accessibilityRole="alert" style={s.error}>
              {logoutError}
            </Text>
          )}
          {!!deletedShop && !id && !locations && (
            <SuccessNotice>{deletedShop} was deleted.</SuccessNotice>
          )}
          {!detailOnly && (
            <>
              <Text accessibilityRole="header" style={s.heading}>
                Partner approvals
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  gap: 16,
                  borderBottomWidth: 1,
                  borderColor: colors.line,
                }}
              >
                {(["Registrations", "Location changes"] as const).map(
                  (label) => {
                    const isLocations = label === "Location changes";
                    const selected = isLocations === locations;
                    return (
                      <Pressable
                        key={label}
                        accessibilityRole="tab"
                        accessibilityState={{ selected }}
                        aria-selected={selected}
                        onPress={() => {
                          if (!selected)
                            router.replace({
                              pathname: "/admin",
                              params: {
                                status: filter,
                                ...(isLocations ? { view: "locations" } : {}),
                              },
                            });
                        }}
                        style={{
                          minHeight: 44,
                          justifyContent: "center",
                          borderBottomWidth: 3,
                          borderColor: selected
                            ? colors.primary
                            : "transparent",
                        }}
                      >
                        <Text
                          style={[
                            s.fieldLabel,
                            { color: selected ? colors.primary : colors.muted },
                          ]}
                        >
                          {label}
                        </Text>
                      </Pressable>
                    );
                  },
                )}
              </View>
            </>
          )}
          {locations ? (
            <LocationReviews />
          ) : (
            <Registrations
              key={filter + ":" + id}
              filter={filter}
              id={id}
              wide={wide}
              onDeleted={(name) => {
                setDeletedShop(name);
                router.setParams({ id: undefined, status: filter });
              }}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
