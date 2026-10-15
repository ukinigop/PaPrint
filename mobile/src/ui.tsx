import React, { createContext, useContext } from "react";
import {
  StyleSheet,
  Text as NativeText,
  TextInput as NativeInput,
  type TextProps,
  type TextInputProps,
} from "react-native";
import { colors, fonts } from "./theme";

export const FontsReady = createContext(false);

export function Text({ style, ...props }: TextProps) {
  const ready = useContext(FontsReady);
  const flat = StyleSheet.flatten(style) || {};
  const weight = Number(flat.fontWeight || 400);
  const family =
    flat.fontFamily ||
    (weight >= 700
      ? fonts.bold
      : weight >= 600
        ? fonts.semibold
        : weight >= 500
          ? fonts.medium
          : fonts.body);
  return (
    <NativeText
      {...props}
      style={[
        { color: colors.ink, fontSize: 14 },
        style,
        ready
          ? { fontFamily: family, fontWeight: "normal" }
          : { fontFamily: undefined },
      ]}
    />
  );
}

export function TextInput({ style, ...props }: TextInputProps) {
  const ready = useContext(FontsReady);
  return (
    <NativeInput
      placeholderTextColor={colors.muted}
      selectionColor={colors.sage}
      {...props}
      style={[style, { fontFamily: ready ? fonts.body : undefined }]}
    />
  );
}
