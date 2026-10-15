import { Platform, type ViewStyle } from "react-native";

// Shared tokens from the PaPrint Figma wireframes.
export const colors = {
  sage: "#276A68",
  mint: "#DCEAE7",
  soft: "#DCEAE7",
  canvas: "#E9EEF2",
  background: "#E9EEF2",
  outer: "#E9EEF2",
  success: "#087B57",
  successSurface: "#EDF7F2",
  surface: "#E9EEF2",
  ink: "#233E48",
  muted: "#637A84",
  primary: "#276A68",
  line: "#CCD7DE",
  highlight: "#FFFFFF",
  error: "#A43D3D",
  errorSurface: "#FFF0F0",
};
export const fonts = {
  heading: "Manrope_700Bold",
  title: "Manrope_600SemiBold",
  body: "Manrope_500Medium",
  medium: "Manrope_500Medium",
  semibold: "Manrope_600SemiBold",
  bold: "Manrope_700Bold",
};

// Android supports outer box shadows from API 28, inset from API 29.
const supportsOuter =
  Platform.OS !== "android" || Number(Platform.Version) >= 28;
const supportsInset =
  Platform.OS !== "android" || Number(Platform.Version) >= 29;
export const depth: Record<"raised" | "small" | "inset", ViewStyle> = {
  raised: supportsOuter
    ? {
        boxShadow: [
          { offsetX: 6, offsetY: 6, blurRadius: 14, color: "#9CADBA5C" },
          { offsetX: -6, offsetY: -6, blurRadius: 14, color: "#FFFFFFF2" },
        ],
      }
    : { elevation: 3 },
  small: supportsOuter
    ? {
        boxShadow: [
          { offsetX: 3, offsetY: 3, blurRadius: 7, color: "#D5DBEA99" },
          { offsetX: 0, offsetY: -1, blurRadius: 2, color: "#FFFFFF80" },
        ],
      }
    : { elevation: 2 },
  inset: supportsInset
    ? {
        boxShadow: [
          {
            offsetX: 6,
            offsetY: 6,
            blurRadius: 14,
            color: "#9CADBA5C",
            inset: true,
          },
          {
            offsetX: -6,
            offsetY: -6,
            blurRadius: 14,
            color: "#FFFFFFF2",
            inset: true,
          },
        ],
      }
    : { borderColor: colors.sage, borderWidth: 1 },
};
