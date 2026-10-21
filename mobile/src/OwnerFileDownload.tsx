import React, { useRef, useState } from "react";
import { MotionButton as Button } from "./motion";
import { Text } from "./ui";
import { s } from "./styles";
import * as api from "./api";

export function OwnerFileDownload({
  orderId,
  fileId,
}: {
  orderId: string;
  fileId: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const locked = useRef(false);

  async function download() {
    if (locked.current) return;
    locked.current = true;
    setLoading(true);
    setError("");
    try {
      await api.openPrintFile(orderId, fileId, "", true);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not download this file.",
      );
    } finally {
      locked.current = false;
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        title="Download file"
        secondary
        loading={loading}
        onPress={() => void download()}
      />
      {error ? (
        <Text accessibilityRole="alert" style={s.small}>
          {error}
        </Text>
      ) : null}
    </>
  );
}
