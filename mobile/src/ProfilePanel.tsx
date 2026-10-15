import React, { useState } from "react";
import { Pressable, Switch, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Text, TextInput } from "./ui";
import { MotionButton } from "./motion";
import { colors } from "./theme";
import { s } from "./styles";
import type { Account } from "./types";
import * as api from "./api";

export function ProfilePanel({
  user,
  onUpdated,
  onSignOut,
  onNotifications,
  notificationMessage,
}: {
  user: Account;
  onUpdated: (user: Account) => void;
  onSignOut: () => Promise<void>;
  onNotifications: () => Promise<void>;
  notificationMessage: string;
}) {
  const [name, setName] = useState(user.name);
  const [paper, setPaper] = useState(user.defaultPaper);
  const [reducedMotion, setReducedMotion] = useState(user.reducedMotion);
  const [busy, setBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [help, setHelp] = useState(false);
  async function run(action: () => Promise<void>, label = "save") {
    if (busy) return;
    setBusy(true);
    setPendingAction(label);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Please try again.");
    } finally {
      setBusy(false);
      setPendingAction("");
    }
  }
  async function save() {
    const updated = await api.request<Account>("/auth/me", {
      method: "PATCH",
      body: JSON.stringify({
        name: name.trim(),
        defaultPaper: paper,
        reducedMotion,
      }),
    });
    onUpdated(updated);
    setNotice("Your settings are saved.");
  }
  return (
    <>
      <View style={s.card}>
        <View style={s.row}>
          <View style={s.avatar}>
            <Text style={[s.sectionTitle, { marginTop: 0 }]}>
              {user.name.trim().slice(0, 1).toUpperCase()}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.cardTitle}>{user.name}</Text>
            <Text style={s.muted}>{user.email}</Text>
          </View>
          <Feather name="user" size={18} color={colors.primary} />
        </View>
      </View>
      {!!error && (
        <View style={s.error} accessibilityRole="alert">
          <Text style={{ color: colors.error }}>{error}</Text>
        </View>
      )}
      {!!notice && (
        <View style={s.success} accessibilityLiveRegion="polite">
          <Text style={s.body}>{notice}</Text>
        </View>
      )}
      <View style={s.card}>
        <Text style={s.cardTitle}>Account & preferences</Text>
        <Text style={s.formLabel}>Full name</Text>
        <TextInput
          accessibilityLabel="Profile name"
          value={name}
          onChangeText={setName}
          maxLength={80}
          editable={!busy}
          style={s.input}
        />
        <Text style={s.formLabel}>Default paper size</Text>
        <View style={s.wrap}>
          {(["A4", "Letter", "Legal"] as const).map((value) => (
            <Pressable
              key={value}
              accessibilityRole="radio"
              accessibilityState={{ checked: paper === value }}
              aria-checked={paper === value}
              disabled={busy}
              onPress={() => setPaper(value)}
              style={[s.choice, paper === value && s.choiceActive]}
            >
              <Feather
                name={paper === value ? "check-circle" : "circle"}
                size={14}
                color={colors.primary}
              />
              <Text style={s.choiceText}>{value}</Text>
            </Pressable>
          ))}
        </View>
        <View style={[s.between, { marginTop: 18 }]}>
          <View style={{ flex: 1 }}>
            <Text style={s.body}>Reduce motion</Text>
            <Text style={s.muted}>Keep loading and status visuals still.</Text>
          </View>
          <Switch
            accessibilityLabel="Reduce motion"
            value={reducedMotion}
            onValueChange={setReducedMotion}
            disabled={busy}
            trackColor={{ true: colors.primary, false: colors.line }}
          />
        </View>
        <MotionButton
          title="Save settings"
          loading={pendingAction === "save"}
          disabled={busy || !name.trim()}
          onPress={() => void run(save)}
        />
      </View>
      <View style={s.card}>
        <View style={s.row}>
          <Feather name="bell" color={colors.primary} size={20} />
          <Text style={s.cardTitle}>Pickup notifications</Text>
        </View>
        <Text style={[s.muted, { marginVertical: 12 }]}>
          {notificationMessage ||
            "Order updates are always available in your inbox. Enable phone alerts for pickup reminders."}
        </Text>
        <MotionButton
          title="Enable phone alerts"
          secondary
          disabled={busy}
          loading={pendingAction === "notifications"}
          onPress={() => void run(onNotifications, "notifications")}
        />
      </View>
      <View style={s.card}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: help }}
          onPress={() => setHelp(!help)}
          style={[s.between, { minHeight: 44 }]}
        >
          <View style={s.row}>
            <Feather name="help-circle" color={colors.primary} size={20} />
            <Text style={s.cardTitle}>Help & privacy</Text>
          </View>
          <Feather
            name={help ? "chevron-up" : "chevron-down"}
            size={18}
            color={colors.muted}
          />
        </Pressable>
        {help && (
          <View style={{ gap: 14, paddingTop: 12 }}>
            <Text style={s.body}>
              Pay when you pick up. Show the pickup code from your order at the
              shop.
            </Text>
            <Text style={s.body}>
              Your PDFs are private: only your account and the assigned print
              shop can download them.
            </Text>
            <Text style={s.body}>
              Printing updates come from the shop. The progress display shows
              the current stage, not a timed estimate.
            </Text>
          </View>
        )}
      </View>
      <MotionButton
        title="Sign out"
        secondary
        loading={pendingAction === "signout"}
        disabled={busy}
        onPress={() => void run(onSignOut, "signout")}
      />
      <Text style={[s.small, { textAlign: "center" }]}>
        PaPrint · Version 1.0.0
      </Text>
    </>
  );
}
