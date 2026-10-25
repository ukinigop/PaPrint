import React, { useEffect, useRef, useState } from "react";
import { MotionButton as Button } from "./motion";
import { Text } from "./ui";
import { s } from "./styles";
import { colors } from "./theme";
import { captureSession, loadOwnerPrintPdf } from "./api";
import { StaleSessionError } from "./customerFlow";
import { createPdfPrintJob } from "./browserPrint";

export function OwnerFilePrint({
  orderId,
  fileId,
  name,
  pages,
  disabled,
}: {
  orderId: string;
  fileId: string;
  name: string;
  pages: string;
  disabled: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const locked = useRef(false);
  const active = useRef(true);
  const job = useRef<ReturnType<typeof createPdfPrintJob> | null>(null);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      job.current?.dispose();
    };
  }, []);

  async function print() {
    if (locked.current || disabled) return;
    locked.current = true;
    setLoading(true);
    setError("");
    const current = captureSession();
    try {
      job.current?.dispose();
      const blob = await loadOwnerPrintPdf(orderId, fileId);
      if (!active.current || !current()) return;
      job.current = createPdfPrintJob(blob, name);
      await job.current.opened;
    } catch (error) {
      if (
        active.current &&
        current() &&
        !(error instanceof StaleSessionError) &&
        !(error instanceof DOMException && error.name === "AbortError")
      )
        setError(
          error instanceof Error
            ? error.message
            : "Could not open the print dialog.",
        );
    } finally {
      locked.current = false;
      if (active.current) setLoading(false);
    }
  }
  return (
    <>
      <Button
        title="Print file"
        disabled={disabled}
        loading={loading}
        onPress={() => void print()}
      />
      <Text style={s.small}>Pages to print in this PDF: {pages}</Text>
      {error ? (
        <Text accessibilityRole="alert" style={{ color: colors.error }}>
          {error}
        </Text>
      ) : null}
    </>
  );
}
