import React, { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { Text } from "./ui";
import { s } from "./styles";
import { colors } from "./theme";
import { MotionButton as Button, SuccessNotice } from "./motion";
import { PickupDateTime } from "./PickupDateTime";
import {
  canEstimatePickup,
  fromManilaInput,
  toManilaInput,
  pickupTimeLabel,
} from "./pickupEstimate";
import type { Order } from "./types";
import * as api from "./api";

export function OwnerPickupEstimate({
  order,
  onSaved,
  onRefresh,
}: {
  order: Order;
  onSaved: (order: Order) => void;
  onRefresh: () => Promise<unknown>;
}) {
  const [value, setValue] = useState(() =>
    order.estimatedPickupAt ? toManilaInput(order.estimatedPickupAt) : "",
  );
  const [version, setVersion] = useState(order.pickupEstimateVersion || 0);
  const [savedValue, setSavedValue] = useState(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const lock = useRef(false),
    active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const stale = version !== (order.pickupEstimateVersion || 0);
  async function save(clear = false) {
    if (lock.current) return;
    const at = clear ? null : fromManilaInput(value);
    setNotice("");
    if (!clear && (!at || Date.parse(at) <= Date.now())) {
      setError("Choose a pickup date and time in the future.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    const current = api.captureSession();
    try {
      const updated = await api.request<Order>(
        `/workspace/orders/${order._id}/pickup-estimate`,
        {
          method: "PATCH",
          body: JSON.stringify({
            estimatedPickupAt: at,
            expectedVersion: version,
          }),
        },
      );
      if (!active.current || !current()) return;
      const input = updated.estimatedPickupAt
        ? toManilaInput(updated.estimatedPickupAt)
        : "";
      setValue(input);
      setSavedValue(input);
      setVersion(updated.pickupEstimateVersion || 0);
      onSaved(updated);
      setNotice(
        clear
          ? "Pickup estimate removed."
          : "Pickup estimate saved. Customers can now see it.",
      );
      void onRefresh().catch(() => {});
    } catch (cause) {
      if (!active.current || !current()) return;
      if ((cause as { status?: number }).status === 409) {
        await onRefresh().catch(() => {});
        if (active.current && current())
          setError(
            "The order or pickup estimate changed. Review the latest order before saving again.",
          );
      } else
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not save the pickup estimate.",
        );
    } finally {
      lock.current = false;
      if (active.current) setBusy(false);
    }
  }
  return (
    <View style={{ gap: 12 }}>
      <Text style={s.cardTitle}>Pickup estimate</Text>
      <Text style={s.small}>
        {order.estimatedPickupAt
          ? pickupTimeLabel(order.estimatedPickupAt)
          : "No pickup time set yet."}
      </Text>
      {canEstimatePickup(order) && (
        <>
          <PickupDateTime
            value={value}
            disabled={busy || stale}
            onChange={(next) => {
              setValue(next);
              setError("");
              setNotice("");
            }}
          />
          <Text style={s.small}>
            Philippine time · Customers should wait for Ready for pickup before
            collecting.
          </Text>
          {stale && (
            <>
              <Text style={s.small}>
                This estimate was updated elsewhere. Reload it before editing.
              </Text>
              <Button
                secondary
                title="Reload pickup estimate"
                disabled={busy}
                onPress={() => {
                  const latest = order.estimatedPickupAt
                    ? toManilaInput(order.estimatedPickupAt)
                    : "";
                  setValue(latest);
                  setSavedValue(latest);
                  setVersion(order.pickupEstimateVersion || 0);
                  setError("");
                  setNotice("");
                }}
              />
            </>
          )}
          <Button
            title="Save pickup time"
            loading={busy}
            disabled={stale || value === savedValue || !value}
            onPress={() => void save()}
          />
          {order.estimatedPickupAt && (
            <Button
              secondary
              title="Remove pickup estimate"
              disabled={busy || stale}
              onPress={() => void save(true)}
            />
          )}
        </>
      )}
      {error && (
        <Text accessibilityRole="alert" style={{ color: colors.error }}>
          {error}
        </Text>
      )}
      {!!notice && <SuccessNotice>{notice}</SuccessNotice>}
    </View>
  );
}
