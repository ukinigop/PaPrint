import React, { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { Text } from "./ui";
import { MotionButton as Button } from "./motion";
import { s } from "./styles";
import { colors } from "./theme";
import { captureSession, loadOwnerPrintPdf } from "./api";
import { StaleSessionError } from "./customerFlow";
import type { Order } from "./types";

// Mounted only in the shop's web workspace. Native file sharing is unchanged.
export function OwnerPrintPreview({
  order,
  fileId,
  name,
  pages,
  onClose,
}: {
  order: Order;
  fileId: string;
  name: string;
  pages: string;
  onClose: () => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [state, setState] = useState({ url: "", error: "" });
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [help, setHelp] = useState("");
  useEffect(() => {
    let active = true;
    let url = "";
    const current = captureSession();
    void loadOwnerPrintPdf(order._id, fileId)
      .then((blob) => {
        if (!active || !current()) return;
        url = URL.createObjectURL(blob);
        setState({ url, error: "" });
      })
      .catch((error) => {
        if (active && !(error instanceof StaleSessionError))
          setState({
            url: "",
            error:
              error instanceof Error
                ? error.message
                : "Could not load the PDF.",
          });
      });
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [order._id, fileId, attempt]);
  return (
    <View style={{ gap: 12, paddingVertical: 12 }}>
      <Text style={s.cardTitle}>Print preview</Text>
      <Text style={s.body}>Pages in this PDF: {pages}</Text>
      <Text style={s.small}>
        Set the print dialog to {order.settings.copies}{" "}
        {order.settings.copies === 1 ? "copy" : "copies"},{" "}
        {order.settings.paper}, {order.settings.color.toLowerCase()},{" "}
        {order.settings.sides.toLowerCase()}. Enter the page numbers shown
        above. These settings are not applied automatically.
      </Text>
      {state.error ? (
        <>
          <Text accessibilityRole="alert" style={{ color: colors.error }}>
            {state.error}
          </Text>
          <Button
            title="Retry PDF preview"
            secondary
            onPress={() => {
              setState({ url: "", error: "" });
              setReady(false);
              setHelp("");
              setAttempt((value) => value + 1);
            }}
          />
        </>
      ) : !state.url ? (
        <Text accessibilityRole="progressbar" style={s.small}>
          Loading private PDF…
        </Text>
      ) : (
        <>
          <iframe
            ref={frame}
            title={`Print preview: ${name}`}
            src={state.url}
            style={{
              width: "100%",
              height: 480,
              border: `1px solid ${colors.line}`,
              borderRadius: 12,
            }}
            onLoad={() => setReady(true)}
          />
          <Button
            title="Open print dialog"
            disabled={!ready}
            onPress={() => {
              setHelp(
                "If the dialog does not open, use the PDF toolbar’s print button or Open PDF viewer below.",
              );
              try {
                if (!frame.current?.contentWindow) return;
                frame.current.contentWindow.focus();
                frame.current.contentWindow.print();
              } catch {
                setHelp(
                  "Your browser requires the PDF viewer. Open it below and use its print button.",
                );
              }
            }}
          />
          <a
            href={state.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: colors.primary, padding: 12, minHeight: 44 }}
          >
            Open PDF viewer ↗
          </a>
          {!!help && (
            <Text accessibilityLiveRegion="polite" style={s.small}>
              {help}
            </Text>
          )}
        </>
      )}
      <Text style={s.small}>
        Cancelling the print dialog leaves this order in Printing. Mark it as
        Done after the documents have finished printing.
      </Text>
      <Button title="Close print preview" secondary onPress={onClose} />
    </View>
  );
}
