import React, { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { WebView } from "react-native-webview";
import { baseUrl, captureSession } from "./api";
import { pdfChunk } from "./pdfBridge";
import { Text } from "./ui";
import { s } from "./styles";
import { colors } from "./theme";

export function PdfCanvas({
  bytes,
  name,
}: {
  bytes: ArrayBuffer;
  name: string;
}) {
  const frame = useRef<WebView>(null);
  const expected = useRef(0);
  const current = useRef(captureSession()).current;
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const source = `${baseUrl}/api/pdf-preview`;
  const send = (offset: number) => {
    if (!current() || offset >= bytes.byteLength) return;
    const chunk = pdfChunk(bytes, offset);
    expected.current = chunk.next;
    frame.current?.injectJavaScript(
      `window.paprintPdfChunk && window.paprintPdfChunk(${JSON.stringify(chunk)});true;`,
    );
  };
  useEffect(() => {
    if (ready || error) return;
    const timeout = setTimeout(
      () => setError("The preview took too long to load. Close it and retry."),
      30000,
    );
    return () => clearTimeout(timeout);
  }, [ready, error]);
  return (
    <View style={{ flex: 1, minHeight: 240 }}>
      {error ? (
        <Text accessibilityRole="alert" style={{ color: colors.error }}>
          {error}
        </Text>
      ) : (
        <>
          {!ready && <Text style={s.small}>Preparing preview…</Text>}
          <WebView
            ref={frame}
            source={{ uri: source }}
            accessibilityLabel={`Preview of ${name}`}
            style={{ flex: 1 }}
            originWhitelist={[new URL(baseUrl).origin]}
            onShouldStartLoadWithRequest={(request) => request.url === source}
            allowFileAccess={false}
            allowUniversalAccessFromFileURLs={false}
            sharedCookiesEnabled={false}
            onError={() =>
              setError("Could not load the preview. Close it and retry.")
            }
            onHttpError={() =>
              setError("The preview is unavailable. Close it and retry.")
            }
            onMessage={(event) => {
              if (!current() || event.nativeEvent.url !== source) return;
              try {
                const message = JSON.parse(event.nativeEvent.data);
                if (
                  message.type === "paprint-pdf-ready" &&
                  expected.current === 0
                )
                  send(0);
                else if (
                  message.type === "paprint-pdf-chunk" &&
                  message.next === expected.current
                )
                  send(message.next);
                else if (message.type === "paprint-pdf-rendered")
                  setReady(true);
                else if (message.type === "paprint-pdf-error")
                  setError(
                    "This PDF could not be displayed. Close the preview and retry.",
                  );
              } catch {
                /* Ignore malformed reader messages. */
              }
            }}
          />
        </>
      )}
    </View>
  );
}
