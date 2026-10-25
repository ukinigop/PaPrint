import React, { useState } from "react";
import { Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, usePathname } from "expo-router";
import { Image } from "expo-image";
import Animated, { cubicBezier } from "react-native-reanimated";
import { Text } from "./ui";
import { s } from "./styles";
import { colors } from "./theme";
import { useQuietMotion } from "./motion";
import { useApp } from "./state";
import {
  customerTabs,
  customerTabRoutes,
  tabForPath,
  type CustomerTab,
} from "./customerTabs";

const artwork = {
  Print: [
    require("../assets/navigation/print-body.svg"),
    require("../assets/navigation/print-paper.svg"),
  ],
  Shops: [
    require("../assets/navigation/shop-body.svg"),
    require("../assets/navigation/shop-door.svg"),
  ],
  Orders: [
    require("../assets/navigation/order-body.svg"),
    require("../assets/navigation/order-check.svg"),
  ],
  Profile: [
    require("../assets/navigation/profile-body.svg"),
    require("../assets/navigation/profile-head.svg"),
  ],
};
// Finite selection feedback, inspired by the supplied BrewedOps animated-icon example.
// Selection gives the whole icon a visible lift while its moving part responds.
// Navigation never waits for the animation, including on repeated taps.
const iconSize = 26;
const pose = (y: number, scale: number, degrees = 0) => ({
  transform: [
    { translateY: y },
    { scale },
    { rotate: `${degrees}deg` as `${number}deg` },
  ],
});
const selectionFrames = {
  Print: {
    "0%": pose(0, 1),
    "20%": pose(-3, 1.12, -5),
    "45%": pose(-3, 1.12, 4),
    "70%": pose(-1, 1.04, -2),
    "100%": pose(0, 1),
  },
  Shops: {
    "0%": pose(0, 1),
    "25%": pose(-3, 1.12),
    "60%": pose(-2, 1.08),
    "100%": pose(0, 1),
  },
  Orders: {
    "0%": pose(0, 1),
    "20%": pose(-4, 1.12, -7),
    "55%": pose(-2, 1.08, 4),
    "100%": pose(0, 1),
  },
  Profile: {
    "0%": pose(0, 1),
    "25%": pose(-3, 1.14),
    "55%": pose(-1, 1.06),
    "100%": pose(0, 1),
  },
};
const frames = {
  Print: {
    "0%": { opacity: 0.65, transform: [{ translateY: -3.5 }] },
    "35%": { opacity: 1, transform: [{ translateY: 4 }] },
    "60%": { opacity: 1, transform: [{ translateY: 4 }] },
    "100%": { transform: [{ translateY: 0 }] },
  },
  Shops: {
    "0%": { transform: [{ scaleX: 1 }] },
    "25%": { transform: [{ scaleX: 0.08 }] },
    "60%": { transform: [{ scaleX: 0.08 }] },
    "100%": { transform: [{ scaleX: 1 }] },
  },
  Orders: {
    "0%": { opacity: 0.15, transform: [{ scale: 0.45 }] },
    "35%": { opacity: 1, transform: [{ scale: 1.3 }] },
    "65%": { opacity: 1, transform: [{ scale: 0.95 }] },
    "100%": { opacity: 1, transform: [{ scale: 1 }] },
  },
  Profile: {
    "0%": { transform: [{ translateY: 0 }] },
    "25%": { transform: [{ translateY: 2.6 }, { scale: 0.92 }] },
    "50%": { transform: [{ translateY: -0.8 }, { scale: 1.05 }] },
    "75%": { transform: [{ translateY: 1 }] },
    "100%": { transform: [{ translateY: 0 }] },
  },
};
const durations = { Print: 560, Shops: 520, Orders: 460, Profile: 500 };
const emptyEvents = () => ({ Print: 0, Shops: 0, Orders: 0, Profile: 0 });
function TabIcon({
  tab,
  selected,
  event,
}: {
  tab: CustomerTab;
  selected: boolean;
  event: number;
}) {
  const color = selected ? colors.primary : colors.muted;
  return (
    <Animated.View
      key={event}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: iconSize,
        height: iconSize,
        animationName: event ? selectionFrames[tab] : undefined,
        animationDuration: durations[tab],
        animationTimingFunction: cubicBezier(0.23, 1, 0.32, 1),
        animationIterationCount: 1,
      }}
    >
      <Image
        source={artwork[tab][0]}
        tintColor={color}
        contentFit="contain"
        style={{ width: iconSize, height: iconSize }}
      />
      <Animated.View
        key={event}
        style={{
          position: "absolute",
          width: iconSize,
          height: iconSize,
          transformOrigin:
            tab === "Shops"
              ? [(iconSize * 9) / 24, (iconSize * 21) / 24, 0]
              : "center",
          animationName: event ? frames[tab] : undefined,
          animationDuration: durations[tab],
          animationTimingFunction: cubicBezier(0.23, 1, 0.32, 1),
          animationIterationCount: 1,
        }}
      >
        <Image
          source={artwork[tab][1]}
          tintColor={color}
          contentFit="contain"
          style={{ width: iconSize, height: iconSize }}
        />
      </Animated.View>
    </Animated.View>
  );
}
export function CustomerTabBar() {
  const { user } = useApp();
  const selected = tabForPath(usePathname());
  const quiet = useQuietMotion();
  const [motion, setMotion] = useState(() => ({
    quiet,
    events: emptyEvents(),
  }));
  const [pressed, setPressed] = useState<CustomerTab | null>(null);
  // Preference changes must not replay old selection animations.
  if (motion.quiet !== quiet) setMotion({ quiet, events: emptyEvents() });
  if (!user || user.accountType === "admin") return null;
  return (
    <SafeAreaView
      edges={["bottom"]}
      style={{
        backgroundColor: colors.surface,
        width: "100%",
        maxWidth: 438,
        alignSelf: "center",
        display: selected ? "flex" : "none",
      }}
    >
      <View
        accessibilityLabel="Customer navigation"
        style={[
          s.nav,
          {
            backgroundColor: colors.surface,
            paddingHorizontal: 8,
            marginHorizontal: 24,
            borderWidth: 0,
          },
        ]}
      >
        {customerTabs.map((tab) => (
          <Pressable
            key={tab}
            accessibilityRole="tab"
            accessibilityLabel={tab}
            accessibilityState={{ selected: selected === tab }}
            aria-selected={selected === tab}
            style={{ flex: 1 }}
            pressRetentionOffset={16}
            onPressIn={() => setPressed(tab)}
            onPressOut={() => setPressed(null)}
            onPress={() => {
              if (!quiet)
                setMotion((previous) => ({
                  quiet,
                  events: {
                    ...previous.events,
                    [tab]: previous.events[tab] + 1,
                  },
                }));
              if (selected !== tab) router.replace(customerTabRoutes[tab]);
            }}
          >
            <Animated.View
              style={[
                s.navItem,
                {
                  flex: 0,
                  marginHorizontal: 0,
                  backgroundColor:
                    selected === tab ? colors.soft : "transparent",
                  transform: [{ scale: pressed === tab && !quiet ? 0.93 : 1 }],
                  transitionProperty: ["backgroundColor", "transform"],
                  transitionDuration: quiet ? 0 : 100,
                  transitionTimingFunction: cubicBezier(0.23, 1, 0.32, 1),
                },
              ]}
            >
              <TabIcon
                tab={tab}
                selected={selected === tab}
                event={motion.events[tab]}
              />
              <Text
                style={[
                  s.navLabel,
                  selected === tab && { color: colors.primary },
                ]}
              >
                {tab}
              </Text>
            </Animated.View>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}
