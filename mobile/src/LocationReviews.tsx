import React, { useCallback, useRef, useState } from "react";
import { Linking, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { Card, Field, Pair } from "./design";
import { MotionButton as Button, SuccessNotice } from "./motion";
import { Text } from "./ui";
import { useStyles } from "./styles";
import * as api from "./api";
import type { Shop } from "./types";
import { shopMapUrl } from "./shopDiscovery";

export function LocationReviews() {
  const s = useStyles();
  const [shops, setShops] = useState<Shop[]>([]);
  const [reason, setReason] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState("");
  const lock = useRef(false);
  const generation = useRef(0);

  const load = useCallback(async () => {
    const request = ++generation.current;
    const current = api.captureSession();
    setLoading(true);
    setError("");
    try {
      const next = await api.request<Shop[]>("/admin/location-requests");
      if (current() && request === generation.current) setShops(next);
    } catch (e) {
      if (current() && request === generation.current)
        setError(
          e instanceof Error ? e.message : "Couldn’t load location requests.",
        );
    } finally {
      if (current() && request === generation.current) setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
      return () => {
        generation.current++;
      };
    }, [load]),
  );

  async function decide(shop: Shop, decision: "approved" | "rejected") {
    const request = shop.locationRequest;
    if (lock.current || !request) return;
    lock.current = true;
    setAction(request.requestId + ":" + decision);
    setMessage("");
    setError("");
    const current = api.captureSession();
    try {
      await api.request(`/admin/shops/${shop._id}/location-decision`, {
        method: "POST",
        body: JSON.stringify({
          requestId: request.requestId,
          decision,
          reason: reason[request.requestId]?.trim() || "",
        }),
      });
      if (!current()) return;
      setShops((list) =>
        list.filter(
          (item) => item.locationRequest?.requestId !== request.requestId,
        ),
      );
      setMessage(
        decision === "approved"
          ? shop.name +
              "’s location was approved. Customers will see the updated pin."
          : shop.name +
              "’s request was rejected. The current pin stays visible.",
      );
      await load();
    } catch (e) {
      if (current()) {
        if ((e as { status?: number }).status === 409) await load();
        setError(e instanceof Error ? e.message : "Unable to review location.");
      }
    } finally {
      lock.current = false;
      if (current()) setAction("");
    }
  }

  return (
    <View style={{ gap: 14 }}>
      <View style={[s.between, { flexWrap: "wrap" }]}>
        <Text style={s.fieldLabel}>
          {loading
            ? "Loading location requests…"
            : shops.length
              ? `${shops.length} pending location change${shops.length === 1 ? "" : "s"}`
              : error
                ? "Location requests"
                : "No pending location changes."}
        </Text>
        <Button
          title="Refresh"
          secondary
          loading={loading}
          disabled={!!action}
          onPress={() => void load()}
        />
      </View>
      {!!message && <SuccessNotice>{message}</SuccessNotice>}
      {!!error && (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      )}
      {shops.map((shop) => {
        const request = shop.locationRequest!;
        const draft = reason[request.requestId] || "";
        return (
          <Card key={request.requestId}>
            <Text style={s.cardTitle}>{shop.name}</Text>
            <Text style={s.small}>
              Requested {new Date(request.requestedAt).toLocaleString()}
            </Text>
            <Pair
              label="Current location"
              value={shop.locationAddress || shop.address}
            />
            <Button
              title="View current location"
              secondary
              onPress={() => {
                void Linking.openURL(shopMapUrl(shop)).catch(() =>
                  setError("Couldn’t open Maps."),
                );
              }}
            />
            <View style={s.rule} />
            <Pair label="Proposed location" value={request.address} />
            <Text style={s.small}>
              {request.coordinates.latitude.toFixed(6)},{" "}
              {request.coordinates.longitude.toFixed(6)}
            </Text>
            <Button
              title="View proposed location"
              secondary
              onPress={() => {
                void Linking.openURL(
                  shopMapUrl({ ...shop, coordinates: request.coordinates }),
                ).catch(() => setError("Couldn’t open Maps."));
              }}
            />
            <View style={s.rule} />
            <Field
              label="Review reason (required for rejection)"
              value={draft}
              onChangeText={(value) =>
                setReason((previous) => ({
                  ...previous,
                  [request.requestId]: value,
                }))
              }
              editable={!action && !loading}
              maxLength={500}
              multiline
            />
            <Text style={s.small}>
              Approval updates the public storefront pin and address. The
              registered business address stays on file.
            </Text>
            <Button
              title="Approve location change"
              loading={action === request.requestId + ":approved"}
              disabled={!!action || loading}
              onPress={() => void decide(shop, "approved")}
            />
            <Button
              title="Reject location change"
              secondary
              loading={action === request.requestId + ":rejected"}
              disabled={!!action || loading || !draft.trim()}
              onPress={() => void decide(shop, "rejected")}
            />
          </Card>
        );
      })}
    </View>
  );
}
