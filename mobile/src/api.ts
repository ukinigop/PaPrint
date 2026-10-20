import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import type { DocumentPickerAsset } from "expo-document-picker";
import type { PrintFile, Account } from "./types";
import { createSessionScope, StaleSessionError } from "./customerFlow";
const sessions = createSessionScope();
export const captureSession = sessions.capture;
function requireCurrent(current: () => boolean) {
  if (!current()) throw new StaleSessionError();
}
// Serialize credential writes so a slow removal cannot erase a newer login.
let credentialWrite = Promise.resolve();
function persistToken(value: string | null) {
  const write = async () => {
    if (Platform.OS === "web") {
      if (value === null) await AsyncStorage.removeItem("paprint.accountToken");
      else await AsyncStorage.setItem("paprint.accountToken", value);
    } else {
      const storage = await import("expo-secure-store");
      if (value === null) await storage.deleteItemAsync("paprint.accountToken");
      else await storage.setItemAsync("paprint.accountToken", value);
    }
  };
  credentialWrite = credentialWrite.catch(() => {}).then(write);
  return credentialWrite;
}
export let baseUrl =
  process.env.EXPO_PUBLIC_API_URL ||
  (Platform.OS === "web" &&
  typeof window !== "undefined" &&
  (window.location.port === "8083" ||
    !["localhost", "127.0.0.1"].includes(window.location.hostname))
    ? window.location.origin
    : "http://localhost:4000");
let token = "";
let accountSession = false;
let expired: (() => void) | undefined;
export function onSessionExpired(listener: () => void) {
  expired = listener;
  return () => {
    if (expired === listener) expired = undefined;
  };
}
async function savedAccountToken() {
  if (Platform.OS === "web")
    return AsyncStorage.getItem("paprint.accountToken");
  return (await import("expo-secure-store")).getItemAsync(
    "paprint.accountToken",
  );
}
export async function acceptAccount(result: { token: string; user: Account }) {
  sessions.invalidate();
  const current = captureSession();
  token = result.token;
  accountSession = true;
  await persistToken(result.token);
  requireCurrent(current);
  return result.user;
}
export async function clearAccount() {
  sessions.invalidate();
  token = "";
  accountSession = false;
  await persistToken(null);
}
export async function restoreAccount() {
  await initialize();
  return accountSession ? request<Account>("/auth/me") : null;
}
export async function signOut() {
  const previousToken = token;
  // Stop old requests immediately; revoke using the captured credentials.
  const clearing = clearAccount();
  const current = captureSession();
  await clearing;
  requireCurrent(current);
  if (previousToken) {
    await request("/device", { method: "DELETE" }, previousToken);
    requireCurrent(current);
    await request("/auth/logout", { method: "POST" }, previousToken);
  }
}
export async function initialize() {
  const current = captureSession();
  const stored = await AsyncStorage.multiGet([
    "paprint.api",
    "paprint.session",
  ]);
  const accountToken = await savedAccountToken();
  requireCurrent(current);
  baseUrl = stored[0][1] || baseUrl;
  token = stored[1][1] || "";
  accountSession = !!accountToken;
  if (accountToken) token = accountToken;
}
export async function setServer(url: string) {
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol))
    throw new Error("Use an http:// or https:// server address.");
  const nextUrl = url.replace(/\/$/, "");
  const changed = nextUrl !== baseUrl;
  baseUrl = nextUrl;
  await AsyncStorage.setItem("paprint.api", baseUrl);
  if (changed) {
    await clearAccount();
    token = "";
    await AsyncStorage.removeItem("paprint.session");
  }
}
export async function request<T>(
  route: string,
  options: RequestInit = {},
  shopToken?: string,
): Promise<T> {
  const current = captureSession();
  const requestToken = shopToken || token;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(`${baseUrl}/api${route}`, {
      ...options,
      signal: controller.signal,
      headers: {
        ...(options.body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
        Authorization: `Bearer ${requestToken}`,
        ...options.headers,
      },
    });
    const data = await response.json().catch(() => {
      throw new Error("PaPrint returned an unreadable response. Please retry.");
    });
    requireCurrent(current);
    if (!response.ok) {
      if (
        response.status === 401 &&
        accountSession &&
        requestToken === token &&
        !shopToken
      ) {
        const clearing = clearAccount();
        expired?.();
        await clearing;
      }
      throw Object.assign(new Error(data.message || "Request failed."), {
        status: response.status,
        code: data.code,
        amount: data.amount,
        pages: data.pages,
      });
    }
    return data;
  } catch (error) {
    requireCurrent(current);
    if (
      error instanceof TypeError ||
      (error instanceof Error && error.name === "AbortError")
    )
      throw new Error(
        "Cannot reach PaPrint. Check your server address and Wi-Fi connection.",
      );
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
export async function ensureSession() {
  if (accountSession) return;
  const session = await request<{ token: string }>("/session", {
    method: "POST",
  });
  token = session.token;
  await AsyncStorage.setItem("paprint.session", token);
}
export async function uploadFiles<T = PrintFile[]>(
  assets: DocumentPickerAsset[],
  route = "/uploads",
): Promise<T> {
  const current = captureSession();
  const form = new FormData();
  for (const asset of assets) {
    if (Platform.OS === "web")
      form.append(
        "files",
        asset.file || (await (await fetch(asset.uri)).blob()),
        asset.name,
      );
    else {
      const { File } = await import("expo-file-system");
      // Expo's fetch accepts real File/Blob parts, not legacy { uri } objects.
      form.append("files", new File(asset.uri), asset.name);
    }
  }
  requireCurrent(current);
  return request(route, { method: "POST", body: form });
}
export async function openPrintFile(
  orderId: string,
  fileId: string,
  shopToken = "",
  workspace = false,
) {
  return openPrivatePdf(
    `${workspace ? "/workspace" : ""}/orders/${orderId}/files/${fileId}`,
    fileId,
    shopToken,
  );
}
export async function openPrivatePdf(
  route: string,
  fileId: string,
  shopToken = "",
) {
  const current = captureSession();
  const downloadToken = shopToken || token;
  const url = `${baseUrl}/api${route}`;
  if (Platform.OS === "web") {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${downloadToken}` },
    });
    if (!response.ok) throw new Error("Could not download this document.");
    const blob = await response.blob();
    requireCurrent(current);
    const blobUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = blobUrl;
    anchor.download = `paprint-${fileId}.pdf`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  } else {
    const { File, Paths } = await import("expo-file-system");
    const Sharing = await import("expo-sharing");
    requireCurrent(current);
    const file = await File.downloadFileAsync(
      url,
      new File(Paths.cache, `paprint-${fileId}.pdf`),
      {
        headers: { Authorization: `Bearer ${downloadToken}` },
        idempotent: true,
      },
    );
    requireCurrent(current);
    if (await Sharing.isAvailableAsync()) {
      requireCurrent(current);
      await Sharing.shareAsync(file.uri, {
        mimeType: "application/pdf",
        UTI: "com.adobe.pdf",
      });
    } else throw new Error("File sharing is unavailable on this device.");
  }
}
