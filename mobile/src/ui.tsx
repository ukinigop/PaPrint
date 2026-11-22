import React, { createContext, useContext } from "react";
import {
  StyleSheet,
  Text as NativeText,
  TextInput as NativeInput,
  type TextProps,
  type TextInputProps,
} from "react-native";
import { useAppearance } from "./Appearance";
import { fonts } from "./theme";

export const FontsReady = createContext(false);

export function Text({ style, ...props }: TextProps) {
  const { colors } = useAppearance();
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

export function TextInput({
  style,
  ref,
  ...props
}: TextInputProps & { ref?: React.Ref<NativeInput> }) {
  const { colors, scheme } = useAppearance();
  const ready = useContext(FontsReady);
  return (
    <NativeInput
      ref={ref}
      placeholderTextColor={colors.muted}
      selectionColor={colors.sage}
      keyboardAppearance={scheme}
      {...props}
      style={[style, { fontFamily: ready ? fonts.body : undefined }]}
    />
  );
}
