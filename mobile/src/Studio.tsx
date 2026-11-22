import React from "react";
import { View, type ImageStyle, type StyleProp } from "react-native";
import { Image } from "expo-image";
import Feather from "@expo/vector-icons/Feather";
import { Text } from "./ui";
import { useStyles } from "./styles";
import { useAppearance } from "./Appearance";

export function StudioPrint({ style }: { style: StyleProp<ImageStyle> }) {
  return (
    <Image
      source={require("../assets/studio/printer.jpg")}
      style={style}
      contentFit="cover"
      accessible={false}
    />
  );
}

export function CityMark() {
  const s = useStyles();
  const { colors } = useAppearance();
  return (
    <View style={[s.row, { gap: 6 }]}>
      <Feather name="map-pin" size={14} color={colors.accent} />
      <Text style={[s.small, { fontWeight: "700", color: colors.ink }]}>
        Naga City
      </Text>
    </View>
  );
}

const steps = ["Files", "Options", "Review"] as const;
export function BookingProgress({
  current,
}: {
  current: (typeof steps)[number];
}) {
  const s = useStyles();
  const { colors } = useAppearance();
  const index = steps.indexOf(current);
  return (
    <View
      accessible
      accessibilityLabel={`Step ${index + 1} of 3, ${current}`}
      style={{ flexDirection: "row", gap: 8 }}
    >
      {steps.map((label, i) => (
        <View key={label} style={{ flex: 1, gap: 6 }}>
          <View
            style={{
              backgroundColor: i <= index ? colors.primary : colors.line,
              height: 3,
              borderRadius: 2,
            }}
          />
          <Text
            style={[
              s.small,
              {
                color: i === index ? colors.ink : colors.muted,
                fontWeight: i === index ? "700" : "500",
              },
            ]}
          >
            {i + 1} · {label}
          </Text>
        </View>
      ))}
    </View>
  );
}
