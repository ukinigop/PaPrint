import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import type { DocumentPickerAsset } from "expo-document-picker";
import type { PrintFile } from "./types";
export let baseUrl =
  process.env.EXPO_PUBLIC_API_URL ||
  (Platform.OS === "web" &&
  typeof window !== "undefined" &&
  window.location.hostname !== "localhost" &&
  window.location.hostname !== "127.0.0.1"
    ? window.location.origin
    : "http://localhost:4000");
let token = "";
export async function initialize() {
  const stored = await AsyncStorage.multiGet([
    "paprint.api",
    "paprint.session",
  ]);
  baseUrl = stored[0][1] || baseUrl;
  token = stored[1][1] || "";
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
    token = "";
    await AsyncStorage.removeItem("paprint.session");
  }
}
export async function request<T>(
  route: string,
  options: RequestInit = {},
  shopToken?: string,
): Promise<T> {
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
        Authorization: `Bearer ${shopToken || token}`,
        ...options.headers,
      },
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Request failed.");
    return data;
  } catch (error) {
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
  const session = await request<{ token: string }>("/session", {
    method: "POST",
  });
  token = session.token;
  await AsyncStorage.setItem("paprint.session", token);
}
export async function uploadFiles(
  assets: DocumentPickerAsset[],
): Promise<PrintFile[]> {
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
  return request("/uploads", { method: "POST", body: form });
}
export async function openPrintFile(
  orderId: string,
  fileId: string,
  shopToken: string,
) {
  const url = `${baseUrl}/api/orders/${orderId}/files/${fileId}`;
  if (Platform.OS === "web") {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${shopToken || token}` },
    });
    if (!response.ok) throw new Error("Could not download this document.");
    const blobUrl = URL.createObjectURL(await response.blob());
    const anchor = document.createElement("a");
    anchor.href = blobUrl;
    anchor.download = `paprint-${fileId}.pdf`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  } else {
    const { File, Paths } = await import("expo-file-system");
    const Sharing = await import("expo-sharing");
    const file = await File.downloadFileAsync(
      url,
      new File(Paths.cache, `paprint-${fileId}.pdf`),
      {
        headers: { Authorization: `Bearer ${shopToken || token}` },
        idempotent: true,
      },
    );
    if (await Sharing.isAvailableAsync())
      await Sharing.shareAsync(file.uri, {
        mimeType: "application/pdf",
        UTI: "com.adobe.pdf",
      });
    else throw new Error("File sharing is unavailable on this device.");
  }
}
