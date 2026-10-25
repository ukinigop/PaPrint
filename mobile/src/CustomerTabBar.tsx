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
// Only the icon's moving part animates; navigation never waits for it.
const frames = {
  Print: {
    "0%": { transform: [{ translateY: -1.5 }] },
    "45%": { transform: [{ translateY: 1.5 }] },
    "100%": { transform: [{ translateY: 0 }] },
  },
  Shops: {
    "0%": { transform: [{ scaleX: 1 }] },
    "45%": { transform: [{ scaleX: 0.25 }] },
    "100%": { transform: [{ scaleX: 1 }] },
  },
  Orders: {
    "0%": { opacity: 0.4, transform: [{ scale: 0.88 }] },
    "60%": { opacity: 1, transform: [{ scale: 1 }] },
    "100%": { opacity: 1, transform: [{ scale: 1 }] },
  },
  Profile: {
    "0%": { transform: [{ translateY: 0 }] },
    "35%": { transform: [{ translateY: 1 }] },
    "65%": { transform: [{ translateY: -0.3 }] },
    "100%": { transform: [{ translateY: 0 }] },
  },
};
const durations = { Print: 240, Shops: 240, Orders: 200, Profile: 220 };
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
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: 24, height: 24 }}
    >
      <Image
        source={artwork[tab][0]}
        tintColor={color}
        contentFit="contain"
        style={{ width: 24, height: 24 }}
      />
      <Animated.View
        key={event}
        style={{
          position: "absolute",
          width: 24,
          height: 24,
          transformOrigin: tab === "Shops" ? [9, 21, 0] : "center",
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
          style={{ width: 24, height: 24 }}
        />
      </Animated.View>
    </View>
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
              if (selected === tab) return;
              if (!quiet)
                setMotion((previous) => ({
                  quiet,
                  events: {
                    ...previous.events,
                    [tab]: previous.events[tab] + 1,
                  },
                }));
              router.replace(customerTabRoutes[tab]);
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
                  transform: [{ scale: pressed === tab && !quiet ? 0.97 : 1 }],
                  transitionProperty: ["backgroundColor", "transform"],
                  transitionDuration: quiet ? 0 : 120,
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
