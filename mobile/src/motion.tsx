import React, { createContext, useContext, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  View,
  type PressableProps,
  type ViewStyle,
} from "react-native";
import Animated, {
  cubicBezier,
  useReducedMotion,
} from "react-native-reanimated";
import { Art } from "./design";
import { Text } from "./ui";
import { s } from "./styles";
import { colors } from "./theme";

const revealKeyframes = { from: { opacity: 0 }, to: { opacity: 1 } };

export const MotionPreference = createContext(false);
export function useQuietMotion() {
  const preference = useContext(MotionPreference);
  const system = useReducedMotion();
  return preference || system;
}

// Feedback on the touched card only; no entrance animation on lists or tabs.
export function MotionCardPressable({
  children,
  ...props
}: Omit<PressableProps, "children" | "style"> & {
  children: React.ReactNode;
}) {
  const [pressed, setPressed] = useState(false);
  const quiet = useQuietMotion();
  return (
    <Pressable
      {...props}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      pressRetentionOffset={16}
    >
      <Animated.View
        style={{
          opacity: pressed ? 0.92 : 1,
          transform: [{ scale: pressed && !quiet ? 0.985 : 1 }],
          transitionProperty: ["transform", "opacity"],
          transitionDuration: quiet ? 0 : 120,
          transitionTimingFunction: cubicBezier(0.23, 1, 0.32, 1),
        }}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
}

// Keep layout immediate. Only fade newly opened content; don't animate height.
export function MotionReveal({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  const quiet = useQuietMotion();
  return (
    <Animated.View
      style={[
        style,
        {
          animationName: quiet ? undefined : revealKeyframes,
          animationDuration: 140,
          animationTimingFunction: cubicBezier(0.23, 1, 0.32, 1),
          animationIterationCount: 1,
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

export function DisclosureChevron({ expanded }: { expanded: boolean }) {
  const quiet = useQuietMotion();
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        transform: [{ rotate: expanded ? "90deg" : "0deg" }],
        transitionProperty: "transform",
        transitionDuration: quiet ? 0 : 140,
        transitionTimingFunction: cubicBezier(0.23, 1, 0.32, 1),
      }}
    >
      <Text style={{ color: colors.primary, fontSize: 22, lineHeight: 26 }}>
        ›
      </Text>
    </Animated.View>
  );
}

export function SuccessNotice({ children }: { children: React.ReactNode }) {
  return (
    <MotionReveal>
      <View
        accessibilityRole="alert"
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 10,
          padding: 12,
          borderRadius: 12,
          backgroundColor: colors.successSurface,
          borderWidth: 1,
          borderColor: colors.mint,
        }}
      >
        <Text accessible={false} style={{ color: colors.success }}>
          ✓
        </Text>
        <Text style={[s.body, { color: colors.success, flex: 1 }]}>
          {children}
        </Text>
      </View>
    </MotionReveal>
  );
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
            minWidth: 44,
            paddingVertical: 14,
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
        <Text
          style={[
            s.buttonText,
            { flexShrink: 1, textAlign: "center" },
            secondary && { color: colors.primary },
          ]}
        >
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
        Uploading files · {completed} of {total} complete
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
