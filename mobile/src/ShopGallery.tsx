import React, { useState } from "react";
import { View, Pressable } from "react-native";
import { Image } from "expo-image";
import { Text } from "./ui";
import { useAppearance } from "./Appearance";
const photos = [
  { source: require("../assets/studio/storefront.jpg"), label: "Storefront" },
  { source: require("../assets/studio/counter.jpg"), label: "Pickup counter" },
  {
    source: require("../assets/studio/print-room.jpg"),
    label: "Printing area",
  },
];
export function ShopGallery() {
  const { colors } = useAppearance();
  const [selected, setSelected] = useState(0);
  return (
    <View style={{ gap: 10 }}>
      <View
        style={{
          borderRadius: 12,
          overflow: "hidden",
          backgroundColor: colors.soft,
        }}
      >
        <Image
          source={photos[selected].source}
          contentFit="cover"
          accessibilityLabel={`Illustrative shop photo: ${photos[selected].label}`}
          style={{ width: "100%", height: 205 }}
        />
        <View
          style={{
            position: "absolute",
            bottom: 10,
            left: 10,
            borderRadius: 8,
            paddingHorizontal: 10,
            paddingVertical: 5,
            backgroundColor: colors.surface,
          }}
        >
          <Text style={{ fontSize: 11, color: colors.muted }}>
            Sample photo
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {photos.map((photo, index) => (
          <Pressable
            key={photo.label}
            accessibilityRole="button"
            accessibilityLabel={`Show ${photo.label.toLowerCase()} sample`}
            accessibilityState={{ selected: selected === index }}
            onPress={() => setSelected(index)}
            style={{
              flex: 1,
              borderRadius: 12,
              borderWidth: 2,
              padding: 2,
              borderColor: selected === index ? colors.primary : "transparent",
              gap: 4,
            }}
          >
            <Image
              source={photo.source}
              contentFit="cover"
              style={{ width: "100%", height: 60, borderRadius: 8 }}
            />
            <Text
              style={{
                fontSize: 10,
                color: colors.muted,
                textAlign: "center",
              }}
            >
              {photo.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
