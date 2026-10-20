import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Card, Field, money, Pair, Pill, Segments } from "./design";
import { Text } from "./ui";
import { MotionButton as Button } from "./motion";
import { s } from "./styles";
import { useApp } from "./state";
import * as api from "./api";
import type { Shop } from "./types";

export function Admin({ id }: { id: string }) {
  const app = useApp();
  const wide = useWindowDimensions().width >= 960;
  const [filter, setFilter] = useState("submitted");
  const [shops, setShops] = useState<Shop[]>([]);
  const [selected, setSelected] = useState<Shop | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const generation = useRef(0);
  const load = useCallback(async () => {
    const current = ++generation.current;
    setError("");
    setLoading(true);
    try {
      const [list, detail] = await Promise.all([
        api.request<Shop[]>("/admin/shops?status=" + filter),
        id ? api.request<Shop>("/admin/shops/" + id) : Promise.resolve(null),
      ]);
      if (current !== generation.current) return;
      setShops(list);
      setSelected(detail);
      setReason("");
    } catch (e) {
      if (current === generation.current)
        setError(
          e instanceof Error ? e.message : "Unable to load registrations.",
        );
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [filter, id]);
  const invalidate = useCallback(() => {
    generation.current++;
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSelected(null);
      setReason("");
      setNotice("");
      void load();
    }, 0);
    return () => {
      clearTimeout(timer);
      invalidate();
    };
  }, [load, invalidate]);
  async function run(action: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  async function decide(decision: "approved" | "rejected") {
    if (!selected) return;
    const updated = await api.request<Shop>(
      "/admin/shops/" + selected._id + "/decision",
      {
        method: "POST",
        body: JSON.stringify({
          decision,
          reason,
          submissionVersion: selected.submissionVersion || 0,
        }),
      },
    );
    setSelected(updated);
    setShops((list) => list.filter((shop) => shop._id !== updated._id));
    setNotice(
      decision === "approved"
        ? "Approved. The owner can now open the shop."
        : "Rejected. The owner can correct and resubmit the registration.",
    );
  }
  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            padding: wide ? 40 : 20,
            gap: 20,
            width: "100%",
            maxWidth: 1200,
            alignSelf: "center",
          }}
        >
          <Text style={s.heading}>Partner approvals</Text>
          <Text style={s.body}>
            Review Naga partner registrations and their documents.
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            <Button
              title="Refresh"
              secondary
              loading={loading}
              disabled={busy}
              onPress={() => void load()}
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
          </View>
          {error ? (
            <Text accessibilityRole="alert" style={s.error}>
              {error}
            </Text>
          ) : null}
          {notice ? (
            <Text accessibilityRole="alert" style={s.body}>
              {notice}
            </Text>
          ) : null}
          <Segments
            values={["submitted", "approved", "rejected"]}
            value={filter}
            onChange={(value) => {
              setFilter(value);
              router.replace("/admin");
            }}
          />
          <View style={{ flexDirection: wide ? "row" : "column", gap: 24 }}>
            <View style={{ flex: 1, gap: 16 }}>
              {loading ? (
                <Text style={s.body}>Loading registrations…</Text>
              ) : shops.length === 0 ? (
                <Text style={s.body}>No {filter} registrations.</Text>
              ) : null}
              {shops.map((shop) => (
                <Card key={shop._id}>
                  <Text style={s.cardTitle}>{shop.name}</Text>
                  <Text style={s.body}>{shop.address}</Text>
                  <Pill>{shop.registrationStatus || "approved"}</Pill>
                  <Button
                    title="Review registration"
                    secondary
                    disabled={busy}
                    onPress={() =>
                      router.push({
                        pathname: "/admin",
                        params: { id: shop._id },
                      })
                    }
                  />
                </Card>
              ))}
            </View>
            {selected && (
              <Card style={{ flex: 2 }}>
                <Text style={s.cardTitle}>{selected.name}</Text>
                <Pill>{selected.registrationStatus || "approved"}</Pill>
                <Pair
                  label="Representative"
                  value={selected.representative || "Not listed"}
                />
                <Pair label="Address" value={selected.address} />
                <Pair label="Email" value={selected.email || "Not listed"} />
                <Pair
                  label="Contact"
                  value={selected.contact || "Not listed"}
                />
                <Pair label="Hours" value={selected.hours || "Not listed"} />
                <Pair
                  label="B&W / color per page"
                  value={
                    money(selected.monoRate) + " / " + money(selected.colorRate)
                  }
                />
                <Text style={s.cardTitle}>Registration documents</Text>
                {selected.documents?.map((document) => (
                  <Button
                    key={document._id}
                    title={"Download " + document.name}
                    secondary
                    loading={busy}
                    onPress={() =>
                      void run(() =>
                        api.openPrivatePdf(
                          `/admin/shops/${selected._id}/documents/${document._id}`,
                          document._id,
                        ),
                      )
                    }
                  />
                ))}
                {selected.registrationStatus === "submitted" && (
                  <>
                    <Field
                      label="Review reason (required for rejection)"
                      value={reason}
                      onChangeText={setReason}
                      multiline
                    />
                    <Text style={s.small}>
                      Approval keeps the shop closed until its owner opens it.
                    </Text>
                    <Button
                      title="Approve partner"
                      loading={busy}
                      disabled={loading}
                      onPress={() => void run(() => decide("approved"))}
                    />
                    <Button
                      title="Reject for correction"
                      secondary
                      loading={busy}
                      disabled={loading || !reason.trim()}
                      onPress={() => void run(() => decide("rejected"))}
                    />
                  </>
                )}
                {(selected.reviews || []).map((review, index) => (
                  <View key={index} style={{ gap: 4 }}>
                    <Text style={s.body}>
                      {review.decision} · {new Date(review.at).toLocaleString()}
                    </Text>
                    {review.reason ? (
                      <Text style={s.small}>{review.reason}</Text>
                    ) : null}
                  </View>
                ))}
              </Card>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
