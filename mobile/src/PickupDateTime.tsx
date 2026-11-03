import React, { useState } from "react";
import { Platform, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { MotionButton as Button } from "./motion";
import { fromManilaInput, toManilaInput } from "./pickupEstimate";
export function PickupDateTime({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const [mode, setMode] = useState<"date" | "time" | null>(null);
  const [fallback] = useState(() =>
    toManilaInput(new Date(Date.now() + 30 * 60000).toISOString()),
  );
  const current = value || fallback;
  const date = new Date(fromManilaInput(current) || fromManilaInput(fallback)!);
  return (
    <View style={{ gap: 10 }}>
      <Button
        secondary
        title={
          value
            ? `Date: ${new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" }).format(date)}`
            : "Choose pickup date"
        }
        disabled={disabled}
        onPress={() => setMode("date")}
      />
      <Button
        secondary
        title={
          value
            ? `Time: ${new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit", hour12: true }).format(date)}`
            : "Choose pickup time"
        }
        disabled={disabled}
        onPress={() => setMode("time")}
      />
      {mode && !disabled && (
        <>
          <DateTimePicker
            value={date}
            mode={mode}
            timeZoneName="Asia/Manila"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={(event, selected) => {
              if (Platform.OS !== "ios" || event.type === "dismissed")
                setMode(null);
              if (event.type !== "set" || !selected) return;
              const picked = toManilaInput(selected.toISOString());
              onChange(
                mode === "date"
                  ? picked.slice(0, 10) + current.slice(10)
                  : current.slice(0, 11) + picked.slice(11),
              );
            }}
          />
          {Platform.OS === "ios" && (
            <Button secondary title="Done" onPress={() => setMode(null)} />
          )}
        </>
      )}
    </View>
  );
}
