import { Platform, type ViewStyle } from "react-native";

export const lightColors = {
  sage: "#245D48",
  mint: "#D8E8D3",
  soft: "#EAF0E4",
  canvas: "#F8F7F1",
  background: "#F8F7F1",
  outer: "#EAECE4",
  success: "#245D3D",
  successSurface: "#E4F2DD",
  surface: "#FFFEFA",
  ink: "#192C25",
  muted: "#59675D",
  primary: "#184936",
  line: "#D6DBCF",
  inputLine: "#A2AE9F",
  accent: "#CA4426",
  highlight: "#FFFFFF",
  error: "#9E3027",
  errorSurface: "#FBE8E2",
  inputFocus: "#F6FAF2",
  feature: "#184936",
  featureInk: "#FFFFFF",
  featureMuted: "#D8E8D3",
  featureLine: "#598471",
  shadow: "#102B1E0A",
  smallShadow: "#102B1E12",
};
export type Palette = typeof lightColors;

export const darkColors: Palette = {
  sage: "#A1BAAB",
  mint: "#363A36",
  soft: "#2D2D2B",
  canvas: "#181817",
  background: "#181817",
  outer: "#111110",
  success: "#B6D1BC",
  successSurface: "#26332B",
  surface: "#222221",
  ink: "#F2F1EC",
  muted: "#C1C0B8",
  primary: "#ADC9B9",
  line: "#40403C",
  inputLine: "#797A73",
  accent: "#FFAA91",
  highlight: "#1A2320",
  error: "#FFB6A8",
  errorSurface: "#3E2B29",
  inputFocus: "#2B2D2A",
  feature: "#242423",
  featureInk: "#F2F1EC",
  featureMuted: "#CCCBC3",
  featureLine: "#4E4F49",
  shadow: "#00000024",
  smallShadow: "#00000033",
};
export const customerWidth = 480;
export const fonts = {
  heading: "DMSans_700Bold",
  title: "Manrope_600SemiBold",
  body: "Manrope_500Medium",
  medium: "Manrope_500Medium",
  semibold: "Manrope_600SemiBold",
  bold: "Manrope_700Bold",
};

const softShadow = Platform.OS !== "android" || Number(Platform.Version) >= 28;
export const depths = (
  colors: Palette,
): Record<"raised" | "small" | "inset", ViewStyle> => ({
  raised: softShadow
    ? {
        boxShadow: [
          { offsetX: 0, offsetY: 3, blurRadius: 10, color: colors.shadow },
        ],
      }
    : { elevation: 2 },
  small: softShadow
    ? {
        boxShadow: [
          { offsetX: 0, offsetY: 1, blurRadius: 4, color: colors.smallShadow },
        ],
      }
    : { elevation: 1 },
  inset: {},
});
