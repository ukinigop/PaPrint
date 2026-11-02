import React, { useEffect, useState } from "react";
import { Modal, Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { captureSession, loadUploadPreview } from "./api";
import { StaleSessionError } from "./customerFlow";
import { MotionButton as Button } from "./motion";
import { Text } from "./ui";
import { s } from "./styles";
import { colors, depth } from "./theme";
import { Art } from "./design";
import { PdfCanvas } from "./PdfCanvas";

export function UploadFilePreview({
  id,
  name,
  children,
}: {
  id: string;
  name: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [bytes, setBytes] = useState<ArrayBuffer | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  function startPreview() {
    setLoading(true);
    setError("");
    setBytes(null);
    setAttempt((n) => n + 1);
    setOpen(true);
  }
  useEffect(() => {
    if (!open) return;
    const current = captureSession();
    let active = true;
    void (async () => {
      try {
        const blob = await loadUploadPreview(id);
        const data = await blob.arrayBuffer();
        if (!active || !current()) return;
        setBytes(data);
      } catch (cause) {
        if (active && current() && !(cause instanceof StaleSessionError))
          setError(
            cause instanceof Error ? cause.message : "Could not open this PDF.",
          );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [open, id, attempt]);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Preview ${name}`}
        accessibilityHint="Opens this PDF for review"
        onPress={startPreview}
        style={{ flex: 1, minWidth: 0, minHeight: 44, gap: 4 }}
      >
        {children}
        <Text style={[s.small, { color: colors.primary }]}>Tap to preview</Text>
      </Pressable>
      <Modal
        visible={open}
        onRequestClose={() => setOpen(false)}
        animationType="none"
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.surface }}>
          <View style={[s.app, { padding: 16, gap: 12 }]}>
            <View style={s.row}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close preview"
                onPress={() => setOpen(false)}
                style={{
                  ...depth.small,
                  backgroundColor: colors.surface,
                  borderRadius: 16,
                  minWidth: 44,
                  minHeight: 44,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontSize: 30, color: colors.primary }}>‹</Text>
              </Pressable>
              <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                <Text style={[s.small, { color: colors.primary }]}>
                  Document preview
                </Text>
                <Text style={s.cardTitle} numberOfLines={2}>
                  {name}
                </Text>
              </View>
            </View>
            {loading && <Text style={s.body}>Loading PDF…</Text>}
            {error ? (
              <>
                <Text accessibilityRole="alert" style={{ color: colors.error }}>
                  {error}
                </Text>
                <Button
                  title="Retry preview"
                  secondary
                  onPress={startPreview}
                />
              </>
            ) : null}
            {bytes ? (
              <>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    backgroundColor: colors.mint,
                    borderRadius: 18,
                    padding: 12,
                  }}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 12,
                      backgroundColor: colors.surface,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Art name="file" size={20} />
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text
                      style={[
                        s.small,
                        { color: colors.primary, fontWeight: "600" },
                      ]}
                    >
                      Original document
                    </Text>
                    <Text style={s.small}>
                      Print settings apply at checkout.
                    </Text>
                  </View>
                </View>
                <PdfCanvas bytes={bytes} name={name} />
              </>
            ) : null}
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
}
