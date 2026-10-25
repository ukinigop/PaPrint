import React, { useRef, useState } from "react";
import { ActivityIndicator, Pressable } from "react-native";
import { Image } from "expo-image";
import { useApp } from "./state";
import * as api from "./api";
import { StaleSessionError } from "./customerFlow";
import { colors } from "./theme";
export function BookmarkButton({
  shopId,
  name,
}: {
  shopId: string;
  name: string;
}) {
  const app = useApp();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const bookmarked = app.user?.savedShops.includes(shopId) || false;
  async function toggle() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    const current = api.captureSession();
    try {
      await app.toggleBookmark(shopId);
    } catch (error) {
      if (current() && !(error instanceof StaleSessionError))
        app.setError(
          error instanceof Error
            ? error.message
            : "Couldn’t update your bookmark. Please try again.",
        );
    } finally {
      lock.current = false;
      if (current()) setBusy(false);
    }
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        bookmarked ? `Remove ${name} from bookmarks` : `Bookmark ${name}`
      }
      accessibilityState={{ selected: bookmarked, disabled: busy, busy }}
      disabled={busy}
      onPress={() => void toggle()}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: colors.surface,
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {busy ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <Image
          source={
            bookmarked
              ? require("../assets/shops/bookmark-filled.svg")
              : require("../assets/shops/bookmark.svg")
          }
          style={{ width: 24, height: 24 }}
          accessible={false}
          contentFit="contain"
        />
      )}
    </Pressable>
  );
}
