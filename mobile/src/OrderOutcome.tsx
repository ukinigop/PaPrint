import React from "react";
import { Card, Field } from "./design";
import { Text } from "./ui";
import { s } from "./styles";
import { MotionButton as Button, MotionReveal } from "./motion";
import type { Order } from "./types";

export function OrderOutcome({ order }: { order: Order }) {
  return (
    <Card tint>
      <Text style={s.cardTitle}>
        {order.status === "Cancelled" ? "Order cancelled" : "Order rejected"}
      </Text>
      <Text style={s.body}>
        {order.status === "Cancelled"
          ? "The customer cancelled this order before printing."
          : "The shop could not accept this order."}
      </Text>
      {order.outcome?.at ? (
        <Text style={s.small}>
          {new Date(order.outcome.at).toLocaleString()}
        </Text>
      ) : null}
      {order.outcome?.reason ? (
        <Text style={s.body}>{order.outcome.reason}</Text>
      ) : null}
      <Text style={s.body}>No payment due</Text>
    </Card>
  );
}

export function EndOrderPanel({
  reject = false,
  reason,
  onReason,
  busy,
  onKeep,
  onConfirm,
}: {
  reject?: boolean;
  reason: string;
  onReason: (value: string) => void;
  busy: boolean;
  onKeep: () => void;
  onConfirm: () => void;
}) {
  return (
    <MotionReveal>
      <Card>
        <Text style={s.cardTitle}>
          {reject ? "Reject this order?" : "Cancel this order?"}
        </Text>
        <Text style={s.body}>
          {reject
            ? "Explain why you cannot print this order. The customer will see your reason."
            : "This ends the booking before printing. No payment will be due."}
        </Text>
        <Field
          label={reject ? "Rejection reason" : "Cancellation reason (optional)"}
          value={reason}
          onChangeText={onReason}
          maxLength={500}
          multiline
          editable={!busy}
        />
        <Button title="Keep order" secondary disabled={busy} onPress={onKeep} />
        <Button
          title={reject ? "Confirm rejection" : "Confirm cancellation"}
          loading={busy}
          disabled={reject && !reason.trim()}
          onPress={onConfirm}
        />
      </Card>
    </MotionReveal>
  );
}
