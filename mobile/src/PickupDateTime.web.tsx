import React from "react";
import { View } from "react-native";
import { Text } from "./ui";
import { s } from "./styles";
import { colors, fonts } from "./theme";
import { toManilaInput } from "./pickupEstimate";
export function PickupDateTime({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={s.small}>Estimated pickup time</Text>
      <input
        type="datetime-local"
        aria-label="Estimated pickup time"
        value={value}
        min={toManilaInput(new Date().toISOString())}
        step={60}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onInput={(event) => onChange(event.currentTarget.value)}
        style={{
          width: "100%",
          boxSizing: "border-box",
          minWidth: 0,
          minHeight: 48,
          padding: 14,
          border: `1px solid ${colors.line}`,
          borderRadius: 16,
          color: colors.ink,
          background: colors.surface,
          fontFamily: fonts.body,
          fontSize: 14,
        }}
      />
    </View>
  );
}
