import React, { createContext, useContext, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import Animated, {
  cubicBezier,
  useReducedMotion,
} from "react-native-reanimated";
import { Art } from "./design";
import { Text } from "./ui";
import { s } from "./styles";
import { colors } from "./theme";

export const MotionPreference = createContext(false);
export function useQuietMotion() {
  const preference = useContext(MotionPreference);
  const system = useReducedMotion();
  return preference || system;
}
export function MotionButton({
  title,
  onPress,
  disabled,
  secondary,
  loading,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  loading?: boolean;
}) {
  const [pressed, setPressed] = useState(false);
  const quiet = useQuietMotion();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{
        disabled: !!disabled || !!loading,
        busy: !!loading,
      }}
      disabled={disabled || loading}
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      pressRetentionOffset={16}
    >
      <Animated.View
        style={[
          s.button,
          secondary && s.secondaryButton,
          (disabled || loading) && { opacity: 0.5 },
          {
            flexDirection: "row",
            gap: 10,
            transform: [{ scale: pressed && !quiet ? 0.985 : 1 }],
            transitionProperty: "transform",
            transitionDuration: quiet ? 0 : 120,
            transitionTimingFunction: cubicBezier(0.23, 1, 0.32, 1),
          },
        ]}
      >
        {loading && (
          <ActivityIndicator
            color={secondary ? colors.primary : "white"}
            size="small"
          />
        )}
        <Text style={[s.buttonText, secondary && { color: colors.primary }]}>
          {title}
        </Text>
      </Animated.View>
    </Pressable>
  );
}
export function UploadProgress({
  completed,
  total,
}: {
  completed: number;
  total: number;
}) {
  const quiet = useQuietMotion();
  return (
    <View
      style={{ gap: 10, width: "100%" }}
      accessibilityRole="progressbar"
      accessibilityLabel="Files uploaded"
      accessibilityValue={{ min: 0, max: total, now: completed }}
    >
      <Text style={s.muted}>
        {completed} of {total} files uploaded
      </Text>
      <View
        style={{
          height: 6,
          backgroundColor: colors.line,
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        <Animated.View
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: `${total ? (completed / total) * 100 : 0}%`,
            backgroundColor: colors.primary,
            borderRadius: 3,
            transitionProperty: "width",
            transitionDuration: quiet ? 0 : 180,
          }}
        />
      </View>
    </View>
  );
}
export function PrintingIndicator({ status }: { status: string }) {
  const quiet = useQuietMotion();
  const printing = status === "Printing";
  const ready = status === "Ready for pickup" || status === "Collected";
  return (
    <View style={[s.card, { gap: 12 }]}>
      <View style={s.printingIcon}>
        {printing && (
          <Animated.View
            style={[
              s.paperSheet,
              !quiet && {
                animationName: {
                  "0%": { transform: [{ translateY: -7 }], opacity: 0.2 },
                  "35%": { opacity: 1 },
                  "100%": { transform: [{ translateY: 7 }], opacity: 0.2 },
                },
                animationDuration: 1600,
                animationTimingFunction: "linear",
                animationIterationCount: "infinite",
              },
            ]}
          />
        )}
        <Art name={ready ? "check" : "print"} size={40} />
      </View>
      <View style={{ gap: 8 }}>
        <Text style={s.cardTitle}>
          {printing
            ? "Looking good on paper."
            : ready
              ? status === "Collected"
                ? "All picked up"
                : "Ready for pickup"
              : "We’ve got your order."}
        </Text>
        <Text style={s.muted}>
          {printing
            ? "Your document is on the press. Almost there."
            : ready
              ? status === "Collected"
                ? "Collected. Thanks for printing with us."
                : "Bring your pickup code to the shop."
              : "The shop is checking your file and print setup."}
        </Text>
      </View>
    </View>
  );
}
