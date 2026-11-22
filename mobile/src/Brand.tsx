import React from "react";
import { Image } from "expo-image";
import { useAppearance } from "./Appearance";

// Original artwork exported from page 11 of the team's Canva design.
const artwork = {
  full: require("../assets/brand/logo-full.png"),
  icon: require("../assets/brand/icon.png"),
  reversed: require("../assets/brand/icon-reversed.png"),
};
const ratios = { full: 136 / 385, icon: 659 / 640, reversed: 1 };

export function Brand({
  variant = "icon",
  width = 40,
}: {
  variant?: keyof typeof artwork;
  width?: number;
}) {
  const { scheme, colors } = useAppearance();
  return (
    <Image
      source={artwork[variant]}
      style={{ width, height: width * ratios[variant], flexShrink: 0 }}
      contentFit="contain"
      tintColor={
        scheme === "dark" && variant !== "reversed" ? colors.primary : undefined
      }
      accessible
      alt="PaPrint"
      accessibilityLabel="PaPrint"
      accessibilityIgnoresInvertColors
    />
  );
}
