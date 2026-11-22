import React from "react";
import {
  Pressable,
  View,
  type TextInputProps,
  type ViewStyle,
} from "react-native";
import { Image } from "expo-image";
import { Text, TextInput } from "./ui";
import { useStyles } from "./styles";
import { useAppearance } from "./Appearance";

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
  const { scheme, colors } = useAppearance();
  return (
    <Image
      source={assets[name]}
      style={{ width: width || size, height: height || size }}
      contentFit="contain"
      tintColor={scheme === "dark" ? colors.primary : undefined}
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
  const s = useStyles();
  const { colors } = useAppearance();
  return (
    <View style={[s.card, tint && { backgroundColor: colors.soft }, style]}>
      {children}
    </View>
  );
}
export function Field({
  label,
  accessory,
  inputRef,
  ...props
}: TextInputProps & {
  label: string;
  accessory?: React.ReactNode;
  inputRef?: React.Ref<import("react-native").TextInput>;
}) {
  const s = useStyles();
  const { colors } = useAppearance();
  const [focused, setFocused] = React.useState(false);
  return (
    <View style={{ gap: 8 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      <View style={{ justifyContent: "center" }}>
        <TextInput
          {...props}
          ref={inputRef}
          onFocus={(event) => {
            setFocused(true);
            props.onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            props.onBlur?.(event);
          }}
          accessibilityLabel={label}
          style={[
            s.input,
            { marginBottom: 0 },
            focused && {
              borderColor: colors.primary,
              backgroundColor: colors.inputFocus,
            },
            props.editable === false && { backgroundColor: colors.soft },
            !!accessory && { paddingRight: 52 },
            props.multiline && { minHeight: 96, textAlignVertical: "top" },
            props.style,
          ]}
        />
        {!!accessory && (
          <View style={{ position: "absolute", right: 4 }}>{accessory}</View>
        )}
      </View>
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
  const { colors } = useAppearance();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{ minHeight: 44, justifyContent: "center" }}
    >
      <Text style={{ color: colors.primary, fontSize: 14, fontWeight: "700" }}>
        {children}
      </Text>
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
  const { colors } = useAppearance();
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
        borderRadius: 20,
      }}
    >
      <Text
        style={{
          fontSize: 12,
          lineHeight: 16,
          fontWeight: "700",
          color: palette.text,
        }}
      >
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
  const { colors } = useAppearance();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
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
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: 22,
            borderWidth: 1,
            borderColor: v === value ? colors.primary : colors.inputLine,
            backgroundColor: v === value ? colors.primary : colors.surface,
          }}
        >
          <Text
            style={{
              fontSize: 13,
              fontWeight: "600",
              color: v === value ? colors.highlight : colors.ink,
            }}
          >
            {v.charAt(0).toUpperCase() + v.slice(1)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
export function Pair({ label, value }: { label: string; value: string }) {
  const s = useStyles();
  const { colors } = useAppearance();
  return (
    <View style={[s.between, { alignItems: "flex-start" }]}>
      <Text style={[s.body, { color: colors.muted, flex: 1 }]}>{label}</Text>
      <Text
        style={[s.body, { flex: 1, textAlign: "right", fontWeight: "600" }]}
      >
        {value}
      </Text>
    </View>
  );
}
export const money = (n: number) => "₱" + n.toFixed(2);
export const stage = (status: string) =>
  status === "Queued" ? "Preparing" : status;
export const orderCode = (id: string) => "#PR-" + id.slice(-6).toUpperCase();
