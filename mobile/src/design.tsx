import React from "react";
import {
  Pressable,
  View,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { Image } from "expo-image";
import { Text, TextInput } from "./ui";
import { s } from "./styles";
import { colors, depth } from "./theme";

const assets = {
  logo: require("../assets/brand/icon.png"),
  home: require("../assets/figma/dd244.svg"),
  homeActive: require("../assets/figma/02b46.svg"),
  shops: require("../assets/figma/e0a33.svg"),
  shopsActive: require("../assets/figma/6f674.svg"),
  orders: require("../assets/figma/6ea37.svg"),
  ordersActive: require("../assets/figma/d5d95.svg"),
  profile: require("../assets/figma/c23fc.svg"),
  profileActive: require("../assets/figma/6a504.svg"),
  shop: require("../assets/figma/3d86e.svg"),
  shopLarge: require("../assets/figma/e7389.svg"),
  file: require("../assets/figma/6bf51.svg"),
  upload: require("../assets/figma/3eda6.svg"),
  print: require("../assets/figma/475a1.svg"),
  check: require("../assets/figma/57d85.svg"),
  splash: require("../assets/brand/icon-reversed.png"),
  dots: require("../assets/figma/81409.svg"),
};
export function Art({
  name,
  size = 24,
  width,
  height,
}: {
  name: keyof typeof assets;
  size?: number;
  width?: number;
  height?: number;
}) {
  return (
    <Image
      source={assets[name]}
      style={{ width: width || size, height: height || size }}
      contentFit="contain"
      accessibilityIgnoresInvertColors
    />
  );
}
export function Card({
  children,
  tint,
  style,
}: {
  children: React.ReactNode;
  tint?: boolean;
  style?: ViewStyle;
}) {
  return (
    <View style={[s.card, tint && { backgroundColor: colors.soft }, style]}>
      {children}
    </View>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontSize: 11, color: colors.muted, fontWeight: "600" }}>
        {label}
      </Text>
      <TextInput
        {...props}
        accessibilityLabel={label}
        style={[
          s.input,
          { marginBottom: 0, borderWidth: 0, borderRadius: 16 },
          props.multiline && { minHeight: 96, textAlignVertical: "top" },
          props.style,
        ]}
      />
    </View>
  );
}
export function LinkText({
  children,
  onPress,
}: {
  children: React.ReactNode;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{ minHeight: 44, justifyContent: "center" }}
    >
      <Text style={{ color: colors.primary, fontSize: 14 }}>{children}</Text>
    </Pressable>
  );
}
export function Pill({
  children,
  tone = "primary",
}: {
  children: React.ReactNode;
  tone?: "primary" | "positive" | "neutral" | "negative";
}) {
  const palette = {
    primary: { background: colors.soft, text: colors.primary },
    positive: { background: colors.successSurface, text: colors.success },
    neutral: { background: colors.line, text: colors.ink },
    negative: { background: colors.errorSurface, text: colors.error },
  }[tone];
  return (
    <View
      style={{
        alignSelf: "flex-start",
        backgroundColor: palette.background,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 12,
      }}
    >
      <Text style={{ fontSize: 12, lineHeight: 18, color: palette.text }}>
        {children}
      </Text>
    </View>
  );
}
export function Segments<T extends string>({
  values,
  value,
  onChange,
  disabled = false,
}: {
  values: readonly T[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
      {values.map((v) => (
        <Pressable
          key={v}
          accessibilityRole="radio"
          accessibilityState={{ checked: v === value }}
          aria-checked={v === value}
          aria-disabled={disabled}
          disabled={disabled}
          onPress={() => onChange(v)}
          style={{
            minHeight: 44,
            justifyContent: "center",
            padding: 12,
            borderRadius: 12,
            backgroundColor: v === value ? colors.soft : colors.surface,
            ...(v === value ? {} : depth.small),
          }}
        >
          <Text
            style={{
              fontSize: 12,
              color: v === value ? colors.primary : colors.muted,
            }}
          >
            {v}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
export function Pair({ label, value }: { label: string; value: string }) {
  return (
    <View style={[s.between, { alignItems: "flex-start" }]}>
      <Text style={[s.body, { color: colors.muted, flex: 1 }]}>{label}</Text>
      <Text style={[s.body, { flex: 1, textAlign: "right" }]}>{value}</Text>
    </View>
  );
}
export const money = (n: number) => "₱" + n.toFixed(2);
export const stage = (status: string) =>
  ({ Queued: "Preparing", "Ready for pickup": "Done" })[status] || status;
export const orderCode = (id: string) => "#PR-" + id.slice(-6).toUpperCase();
