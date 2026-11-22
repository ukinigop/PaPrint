import React, { useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Text } from "./ui";
import { MotionButton, useQuietMotion } from "./motion";
import Animated from "react-native-reanimated";
import { useAppearance } from "./Appearance";
import { useStyles } from "./styles";
import { Art, Card, Field, LinkText, Segments } from "./design";
import { useApp } from "./state";
import * as api from "./api";
import type { Account } from "./types";
import { Brand } from "./Brand";
import Feather from "@expo/vector-icons/Feather";
import { CityMark, StudioPrint } from "./Studio";
import {
  passwordRequirements,
  phoneDigits,
  signupValidation,
} from "./accountValidation";

function PasswordEye({
  visible,
  label,
  onPress,
}: {
  visible: boolean;
  label: string;
  onPress: () => void;
}) {
  const s = useStyles();
  const { colors } = useAppearance();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={(visible ? "Hide " : "Show ") + label}
      onPress={onPress}
      style={s.eyeButton}
    >
      <Feather
        name={visible ? "eye-off" : "eye"}
        size={18}
        color={colors.muted}
      />
    </Pressable>
  );
}

export function AccountScreen({ signup = false }: { signup?: boolean }) {
  const s = useStyles();
  const { colors } = useAppearance();
  const wide = useWindowDimensions().width >= 860;
  const { setUser, error: initialError } = useApp();
  const [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [phone, setPhone] = useState(""),
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState("");
  const [role, setRole] = useState<"Customer" | "Shop owner">("Customer");
  const [show, setShow] = useState(false),
    [showConfirmation, setShowConfirmation] = useState(false),
    [agree, setAgree] = useState(false),
    [privacy, setPrivacy] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(initialError);
  const [connection, setConnection] = useState(false),
    [address, setAddress] = useState(api.baseUrl);
  const [connectionError, setConnectionError] = useState("");
  const lock = useRef(false);
  const confirmationInput = useRef<import("react-native").TextInput>(null);
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
    if (signup) {
      const message = signupValidation(phone, password, confirmation);
      if (message) {
        setError(message);
        return;
      }
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
      setConfirmation("");
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
          contentContainerStyle={{
            flexGrow: 1,
            alignItems: "center",
            justifyContent: wide ? "center" : "flex-start",
            padding: wide ? 32 : 0,
          }}
        >
          <View
            style={{
              width: "100%",
              maxWidth: wide ? 960 : 480,
              flexDirection: wide ? "row" : "column",
              borderRadius: wide ? 22 : 0,
              overflow: "hidden",
              backgroundColor: colors.canvas,
              borderWidth: wide ? 1 : 0,
              borderColor: colors.line,
            }}
          >
            <View
              style={{
                flex: wide ? 1 : undefined,
                backgroundColor: colors.canvas,
              }}
            >
              <View
                style={[
                  s.masthead,
                  {
                    paddingVertical: wide ? 24 : 15,
                    paddingHorizontal: wide ? 26 : 22,
                  },
                ]}
              >
                <Brand variant="full" width={wide ? 156 : 132} />
                <CityMark />
              </View>
              {(wide || !signup) && (
                <StudioPrint
                  style={
                    wide
                      ? { width: "100%", flex: 1, minHeight: 330 }
                      : { width: "100%", aspectRatio: 2.8 }
                  }
                />
              )}
            </View>
            <View
              style={{
                flex: wide ? 1 : undefined,
                padding: wide ? 36 : 22,
                gap: 17,
                justifyContent: "center",
                backgroundColor: colors.surface,
              }}
            >
              <View style={{ gap: 7, marginBottom: 3 }}>
                <Text accessibilityRole="header" style={s.heading}>
                  {signup ? "Create account" : "Welcome back"}
                </Text>
                <Text style={[s.body, { color: colors.muted }]}>
                  {signup
                    ? "Choose how you’ll use PaPrint."
                    : "Sign in to place an order or manage your prints."}
                </Text>
              </View>
              {signup && (
                <Segments
                  values={["Customer", "Shop owner"] as const}
                  value={role}
                  onChange={setRole}
                />
              )}

              {signup && (
                <Field
                  label="Full name"
                  placeholder="Juan Dela Cruz"
                  value={name}
                  onChangeText={(value) => {
                    setName(value);
                    setError("");
                  }}
                  autoComplete="name"
                  maxLength={80}
                  editable={!busy}
                />
              )}
              <Field
                label="Email address"
                placeholder="you@example.com"
                value={email}
                onChangeText={(value) => {
                  setEmail(value);
                  setError("");
                }}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                maxLength={254}
                editable={!busy}
              />
              {signup && (
                <Field
                  label="Mobile number"
                  placeholder="09123456789"
                  value={phone}
                  onChangeText={(value) => {
                    setPhone(phoneDigits(value));
                    setError("");
                  }}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  maxLength={11}
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
                  onChangeText={(value) => {
                    setPassword(value);
                    setError("");
                  }}
                  accessory={
                    <PasswordEye
                      visible={show}
                      label="password"
                      onPress={() => setShow(!show)}
                    />
                  }
                  secureTextEntry={!show}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete={signup ? "new-password" : "current-password"}
                  maxLength={128}
                  returnKeyType={signup ? "next" : "go"}
                  onSubmitEditing={
                    signup
                      ? () => confirmationInput.current?.focus()
                      : () => void submit()
                  }
                  editable={!busy}
                />
              </View>
              {signup && (
                <>
                  <View style={{ gap: 8 }}>
                    <Text style={s.small}>Password requirements</Text>
                    {passwordRequirements(password).map((rule) => (
                      <View
                        key={rule.label}
                        accessible
                        accessibilityRole="checkbox"
                        accessibilityLabel={rule.label}
                        accessibilityState={{
                          checked: rule.met,
                          disabled: true,
                        }}
                        aria-checked={rule.met}
                        style={[s.row, { gap: 8 }]}
                      >
                        <Text
                          accessible={false}
                          style={{
                            color: rule.met ? colors.success : colors.muted,
                          }}
                        >
                          {rule.met ? "☑" : "☐"}
                        </Text>
                        <Text
                          style={[
                            s.small,
                            rule.met && { color: colors.success },
                          ]}
                        >
                          {rule.label}
                        </Text>
                      </View>
                    ))}
                  </View>
                  <View style={{ gap: 4 }}>
                    <Field
                      label="Confirm password"
                      inputRef={confirmationInput}
                      placeholder="Re-enter your password"
                      value={confirmation}
                      onChangeText={(value) => {
                        setConfirmation(value);
                        setError("");
                      }}
                      accessory={
                        <PasswordEye
                          visible={showConfirmation}
                          label="confirm password"
                          onPress={() => setShowConfirmation(!showConfirmation)}
                        />
                      }
                      secureTextEntry={!showConfirmation}
                      autoCapitalize="none"
                      autoCorrect={false}
                      autoComplete="new-password"
                      maxLength={128}
                      editable={!busy}
                      onSubmitEditing={() => void submit()}
                    />

                    {confirmation ? (
                      <Text
                        accessibilityLiveRegion="polite"
                        style={{
                          color:
                            password === confirmation
                              ? colors.success
                              : colors.error,
                          fontSize: 12,
                        }}
                      >
                        {password === confirmation
                          ? "Passwords match."
                          : "Passwords do not match."}
                      </Text>
                    ) : null}
                  </View>
                </>
              )}
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
                        PaPrint saves your account details, settings, and
                        orders. Files are accessible to your account and the
                        assigned shop. Use sample documents when trying this
                        MVP.
                      </Text>
                    </Card>
                  )}
                </View>
              )}
              {!!error && (
                <Text
                  accessibilityRole="alert"
                  style={[s.error, { color: colors.error }]}
                >
                  {error}
                </Text>
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
                  {role === "Shop owner" && (
                    <Text style={s.small}>
                      Next, register your shop for approval.
                    </Text>
                  )}
                  <LinkText onPress={() => router.replace("/login")}>
                    Already registered? Log in
                  </LinkText>
                </>
              )}
              <View style={s.rule} />
              <LinkText
                onPress={() => {
                  setConnectionError("");
                  setConnection(!connection);
                }}
              >
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
                  {!!connectionError && (
                    <Text
                      accessibilityRole="alert"
                      style={[s.error, { color: colors.error }]}
                    >
                      {connectionError}
                    </Text>
                  )}
                  <MotionButton
                    title="Save connection"
                    secondary
                    onPress={() => {
                      void api
                        .setServer(address.trim())
                        .then(() => setConnection(false))
                        .catch((e) => setConnectionError(e.message));
                    }}
                  />
                </Card>
              )}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
export function AccountLoading() {
  const s = useStyles();
  const quiet = useQuietMotion();
  return (
    <SafeAreaView
      style={[
        s.safe,
        { justifyContent: "center", alignItems: "center", gap: 20 },
      ]}
    >
      <Brand variant="full" width={240} />

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
