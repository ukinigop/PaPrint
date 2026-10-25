import React, { useRef, useState } from "react";
import { View } from "react-native";
import { ShopLocationPicker, type ShopLocation } from "./ShopLocationPicker";
import { MotionButton as Button } from "./motion";
import { Text } from "./ui";
import { s } from "./styles";
import { useApp } from "./state";
import * as api from "./api";
import type { Shop } from "./types";
export function OwnerLocation({ shop }: { shop: Shop }) {
  const app = useApp();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<ShopLocation>({
    address: shop.locationAddress || shop.address,
    coordinates: shop.coordinates || null,
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const lock = useRef(false);
  const pending = shop.locationRequest?.status === "pending";
  async function submit() {
    if (lock.current || !value.coordinates) return;
    lock.current = true;
    setBusy(true);
    setError("");
    const current = api.captureSession();
    try {
      const next = await api.request<Shop>("/workspace/location-request", {
        method: "POST",
        body: JSON.stringify(value),
      });
      if (current()) {
        app.setWorkspace(next);
        setEditing(false);
        await app.refresh(true);
      }
    } catch (e) {
      if (current()) {
        setError(e instanceof Error ? e.message : "Couldn’t submit location.");
        if ((e as { status?: number }).status === 409) await app.refresh(true);
      }
    } finally {
      lock.current = false;
      if (current()) setBusy(false);
    }
  }
  return (
    <View style={{ gap: 12 }}>
      <Text style={s.cardTitle}>Shop location</Text>
      <Text style={s.body}>{shop.locationAddress || shop.address}</Text>
      <Text style={s.small}>
        {shop.coordinates
          ? "Your approved storefront pin is visible to customers."
          : "Add your storefront pin so customers can find your shop."}
      </Text>
      {pending && (
        <Text style={s.body}>
          Awaiting admin approval: {shop.locationRequest!.address}. Customers
          still see your current approved location.
        </Text>
      )}
      {shop.locationRequest?.status === "rejected" && (
        <Text style={s.error}>
          Location change rejected: {shop.locationRequest.reason}
        </Text>
      )}
      {shop.locationRequest?.status === "approved" && (
        <Text style={s.small}>Your latest location change was approved.</Text>
      )}
      {error ? (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      ) : null}
      {!pending && !editing && (
        <Button
          title={
            shop.coordinates
              ? "Request location change"
              : "Set storefront location"
          }
          secondary
          onPress={() => {
            setValue({
              address: shop.locationAddress || shop.address,
              coordinates: shop.coordinates || null,
            });
            setEditing(true);
          }}
        />
      )}
      {!pending && editing && (
        <>
          <ShopLocationPicker value={value} onChange={setValue} />
          <Text style={s.small}>
            This change needs admin approval before customers can see it.
          </Text>
          <Button
            title="Submit location for approval"
            loading={busy}
            disabled={!value.coordinates || value.address.trim().length < 5}
            onPress={() => void submit()}
          />
          <Button
            title="Keep current location"
            secondary
            disabled={busy}
            onPress={() => {
              setEditing(false);
              setError("");
            }}
          />
        </>
      )}
    </View>
  );
}
