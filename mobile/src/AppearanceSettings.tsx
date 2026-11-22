import React from "react";
import { View } from "react-native";
import { appearanceOptions, useAppearance } from "./Appearance";
import { Segments } from "./design";
import { useStyles } from "./styles";
import { Text } from "./ui";

export function AppearanceSettings() {
  const s = useStyles();
  const { preference, setPreference } = useAppearance();
  return (
    <View style={{ gap: 8 }}>
      <Segments
        values={appearanceOptions}
        value={preference}
        onChange={setPreference}
      />
      <Text style={s.small}>
        System follows your device’s appearance. Your choice is saved on this
        device.
      </Text>
    </View>
  );
}
