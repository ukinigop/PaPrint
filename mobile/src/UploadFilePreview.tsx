import React, { useEffect, useState } from "react";
import { Modal, Pressable, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { captureSession, loadUploadPreview } from "./api";
import { StaleSessionError } from "./customerFlow";
import { MotionButton as Button } from "./motion";
import { Text } from "./ui";
import { s } from "./styles";
import { colors } from "./theme";
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
          <View style={{ padding: 20, gap: 12, flex: 1 }}>
            <View style={s.between}>
              <Text style={[s.cardTitle, { flex: 1 }]} numberOfLines={2}>
                {name}
              </Text>
              <Button
                title="Close preview"
                secondary
                onPress={() => setOpen(false)}
              />
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
                <Text style={s.small}>
                  Check the original document here. Print settings are applied
                  at checkout.
                </Text>
                <PdfCanvas bytes={bytes} name={name} />
              </>
            ) : null}
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
}
