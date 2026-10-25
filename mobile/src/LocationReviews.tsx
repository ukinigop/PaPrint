import React, { useEffect, useRef, useState } from "react";
import { Linking, View } from "react-native";
import { Card, Field, Pair } from "./design";
import { MotionButton as Button } from "./motion";
import { Text } from "./ui";
import { s } from "./styles";
import * as api from "./api";
import type { Shop } from "./types";
import { shopMapUrl } from "./shopDiscovery";
export function LocationReviews() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [reason, setReason] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState("");
  const lock = useRef(false);
  async function load() {
    const current = api.captureSession();
    try {
      const next = await api.request<Shop[]>("/admin/location-requests");
      if (current()) setShops(next);
    } catch (e) {
      if (current())
        setMessage(
          e instanceof Error ? e.message : "Couldn’t load location requests.",
        );
    }
  }
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, []);
  async function decide(shop: Shop, decision: "approved" | "rejected") {
    if (lock.current || !shop.locationRequest) return;
    lock.current = true;
    setBusy(shop._id);
    setMessage("");
    const current = api.captureSession();
    try {
      await api.request(`/admin/shops/${shop._id}/location-decision`, {
        method: "POST",
        body: JSON.stringify({
          requestId: shop.locationRequest.requestId,
          decision,
          reason: reason[shop._id] || "",
        }),
      });
      if (!current()) return;
      setMessage(
        decision === "approved"
          ? "Location approved. Customers will see it on their next refresh."
          : "Location rejected. The current location stays visible.",
      );
      await load();
    } catch (e) {
      if (current()) {
        setMessage(
          e instanceof Error ? e.message : "Unable to review location.",
        );
        await load();
      }
    } finally {
      lock.current = false;
      if (current()) setBusy("");
    }
  }
  return (
    <View style={{ gap: 16 }}>
      <Text style={s.sectionTitle}>Location change approvals</Text>
      <Button
        title="Refresh location requests"
        secondary
        disabled={!!busy}
        onPress={() => void load()}
      />
      {message ? (
        <Text accessibilityRole="alert" style={s.body}>
          {message}
        </Text>
      ) : null}
      {!shops.length && (
        <Text style={s.small}>No pending location changes.</Text>
      )}
      {shops.map((shop) => {
        const request = shop.locationRequest!;
        return (
          <Card key={request.requestId}>
            <Text style={s.cardTitle}>{shop.name}</Text>
            <Pair
              label="Current location"
              value={shop.locationAddress || shop.address}
            />
            <Button
              title="View current location"
              secondary
              disabled={!!busy}
              onPress={() => {
                void Linking.openURL(shopMapUrl(shop)).catch(() =>
                  setMessage("Couldn’t open Maps."),
                );
              }}
            />
            <Pair label="Proposed location" value={request.address} />
            <Text style={s.small}>
              {request.coordinates.latitude.toFixed(6)},{" "}
              {request.coordinates.longitude.toFixed(6)} · Requested{" "}
              {new Date(request.requestedAt).toLocaleString()}
            </Text>
            <Button
              title="View proposed location"
              secondary
              disabled={!!busy}
              onPress={() => {
                void Linking.openURL(
                  shopMapUrl({ ...shop, coordinates: request.coordinates }),
                ).catch(() => setMessage("Couldn’t open Maps."));
              }}
            />
            <Field
              label={`Location review reason for ${shop.name}`}
              value={reason[shop._id] || ""}
              onChangeText={(value) =>
                setReason((previous) => ({ ...previous, [shop._id]: value }))
              }
              maxLength={500}
              multiline
            />
            <Text style={s.small}>
              Approving replaces the public storefront pin and location address.
              The registered business address stays on file.
            </Text>
            <Button
              title="Approve location change"
              loading={busy === shop._id}
              disabled={!!busy}
              onPress={() => void decide(shop, "approved")}
            />
            <Button
              title="Reject location change"
              secondary
              disabled={!!busy || !reason[shop._id]?.trim()}
              onPress={() => void decide(shop, "rejected")}
            />
          </Card>
        );
      })}
    </View>
  );
}
