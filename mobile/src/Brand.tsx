import React from "react";
import { Image } from "expo-image";

// Original artwork exported from page 11 of the team's Canva design.
const artwork = {
  full: require("../assets/brand/logo-full.png"),
  icon: require("../assets/brand/icon.png"),
  reversed: require("../assets/brand/icon-reversed.png"),
};
const ratios = { full: 136 / 385, icon: 659 / 640, reversed: 1 };

export function Brand({
  variant = "full",
  width = 150,
}: {
  variant?: keyof typeof artwork;
  width?: number;
}) {
  return (
    <Image
      source={artwork[variant]}
      style={{ width, height: width * ratios[variant], flexShrink: 0 }}
      contentFit="contain"
      accessible
      alt="PaPrint"
      accessibilityLabel="PaPrint"
      accessibilityIgnoresInvertColors
    />
  );
}
