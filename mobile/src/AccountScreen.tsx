import React, { useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Text } from "./ui";
import { MotionButton, useQuietMotion } from "./motion";
import Animated from "react-native-reanimated";
import { colors, depth } from "./theme";
import { s } from "./styles";
import { Art, Card, Field, LinkText, Segments } from "./design";
import { useApp } from "./state";
import * as api from "./api";
import type { Account } from "./types";

export function AccountScreen({ signup = false }: { signup?: boolean }) {
  const { setUser, error: initialError } = useApp();
  const [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [phone, setPhone] = useState(""),
    [password, setPassword] = useState("");
  const [role, setRole] = useState<"Customer" | "Shop owner">("Customer");
  const [show, setShow] = useState(false),
    [agree, setAgree] = useState(false),
    [privacy, setPrivacy] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(initialError);
  const [connection, setConnection] = useState(false),
    [address, setAddress] = useState(api.baseUrl);
  const lock = useRef(false);
  async function submit() {
    if (lock.current) return;
    if (
      !email.trim() ||
      !password ||
      (signup && (!name.trim() || !phone.trim()))
    ) {
      setError("Please fill in all fields.");
      return;
    }
    if (signup && password.length < 10) {
      setError("Use at least 10 characters for your password.");
      return;
    }
    if (signup && !agree) {
      setError("Please read and acknowledge the preview data notice.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await api.request<{ token: string; user: Account }>(
        signup ? "/auth/signup" : "/auth/login",
        {
          method: "POST",
          body: JSON.stringify({
            email: email.trim(),
            password,
            ...(signup
              ? {
                  name: name.trim(),
                  phone: phone.trim(),
                  accountType: role === "Shop owner" ? "owner" : "customer",
                }
              : {}),
          }),
        },
      );
      const acceptance = api.acceptAccount(result);
      const current = api.captureSession();
      const user = await acceptance;
      if (!current()) return;
      setUser(user);
      setPassword("");
      router.replace(
        user.accountType === "admin"
          ? "/admin"
          : user.accountType === "owner"
            ? "/workspace"
            : "/home",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[
            s.authPage,
            { justifyContent: "flex-start", gap: 20, paddingTop: 32 },
          ]}
        >
          <View style={{ gap: 4 }}>
            <View style={[s.row, { marginBottom: 8 }]}>
              <Art name="logo" size={32} />
              <Text style={{ color: colors.primary, fontSize: 11 }}>
                PaPrint / NAGA
              </Text>
            </View>
            <Text style={s.heading}>
              {signup ? "Create account" : "Welcome back"}
            </Text>
            <Text style={[s.body, { color: colors.muted }]}>
              {signup
                ? "Choose how you’ll use PaPrint."
                : "Sign in to get your next print started."}
            </Text>
          </View>
          {!signup && (
            <Card>
              <Art name="print" size={40} />
              <Text style={s.cardTitle}>Your files. Your local shop.</Text>
              <Text style={[s.body, { color: colors.muted }]}>
                Print with a partner shop in Naga.
              </Text>
            </Card>
          )}
          {signup && (
            <Segments
              values={["Customer", "Shop owner"] as const}
              value={role}
              onChange={setRole}
            />
          )}
          {!signup && (
            <Text style={s.small}>
              Log in with the email you registered. Your account opens the right
              workspace.
            </Text>
          )}
          {error ? (
            <Text accessibilityRole="alert" style={s.error}>
              {error}
            </Text>
          ) : null}
          {signup && (
            <Field
              label="Full name"
              placeholder="Juan Dela Cruz"
              value={name}
              onChangeText={setName}
              autoComplete="name"
              maxLength={80}
              editable={!busy}
            />
          )}
          <Field
            label="Email address"
            placeholder="you@example.com"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            maxLength={254}
            editable={!busy}
          />
          {signup && (
            <Field
              label="Mobile number"
              placeholder="09XX XXX XXXX"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              autoComplete="tel"
              maxLength={20}
              editable={!busy}
            />
          )}
          <View style={{ gap: 4 }}>
            <Field
              label="Password"
              placeholder={
                signup ? "At least 10 characters" : "Enter your password"
              }
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!show}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete={signup ? "new-password" : "current-password"}
              maxLength={128}
              onSubmitEditing={() => void submit()}
              editable={!busy}
            />
            <LinkText onPress={() => setShow(!show)}>
              {show ? "Hide password" : "Show password"}
            </LinkText>
          </View>
          {signup && (
            <View>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: agree }}
                aria-checked={agree}
                onPress={() => setAgree(!agree)}
                style={[s.row, { minHeight: 44 }]}
              >
                <Text style={{ color: colors.primary, fontSize: 20 }}>
                  {agree ? "☑" : "☐"}
                </Text>
                <Text style={[s.small, { flex: 1 }]}>
                  I acknowledge how this preview uses my data.
                </Text>
              </Pressable>
              <LinkText onPress={() => setPrivacy(!privacy)}>
                Data & privacy notice
              </LinkText>
              {privacy && (
                <Card>
                  <Text style={s.body}>
                    PaPrint saves your account details, settings, and orders.
                    Files are accessible to your account and the assigned shop.
                    Use sample documents when trying this MVP.
                  </Text>
                </Card>
              )}
            </View>
          )}
          <MotionButton
            title={signup ? "Create account" : "Log in"}
            loading={busy}
            onPress={() => void submit()}
          />
          {!signup ? (
            <MotionButton
              title="Create an account"
              secondary
              onPress={() => router.push("/signup")}
            />
          ) : (
            <>
              <Text style={s.small}>
                Shop owners continue to business registration.
              </Text>
              <LinkText onPress={() => router.replace("/login")}>
                Already registered? Log in
              </LinkText>
            </>
          )}
          <Text style={[s.small, { marginTop: 20 }]}>
            Local printing, made simple.
          </Text>
          <LinkText onPress={() => setConnection(!connection)}>
            Connection settings
          </LinkText>
          {connection && (
            <Card>
              <Field
                label="Server address"
                value={address}
                onChangeText={setAddress}
                autoCapitalize="none"
              />
              <MotionButton
                title="Save connection"
                secondary
                onPress={() => {
                  void api
                    .setServer(address.trim())
                    .then(() => setConnection(false))
                    .catch((e) => setError(e.message));
                }}
              />
            </Card>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
export function AccountLoading() {
  const quiet = useQuietMotion();
  return (
    <SafeAreaView
      style={[
        s.safe,
        { justifyContent: "center", alignItems: "center", gap: 20 },
      ]}
    >
      <View
        style={{
          ...depth.raised,
          width: 112,
          height: 112,
          borderRadius: 28,
          backgroundColor: colors.surface,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Art name="splash" size={48} />
      </View>
      <Text style={{ fontSize: 36, color: colors.primary, fontWeight: "700" }}>
        PaPrint
      </Text>
      <Text style={[s.body, { color: colors.muted }]}>
        Local printing, made simple.
      </Text>
      <Animated.View
        accessibilityRole="progressbar"
        accessibilityLabel="Getting things ready"
        style={
          quiet
            ? undefined
            : {
                animationName: {
                  "0%": { opacity: 0.35 },
                  "50%": { opacity: 1 },
                  "100%": { opacity: 0.35 },
                },
                animationDuration: 1200,
                animationIterationCount: "infinite",
                animationTimingFunction: "linear",
              }
        }
      >
        <Art name="dots" width={64} height={16} />
      </Animated.View>
      <Text style={s.small}>Getting things ready…</Text>
    </SafeAreaView>
  );
}
