import React, { useEffect, useRef } from "react";
import { baseUrl } from "./api";

export function PdfCanvas({
  bytes,
  name,
}: {
  bytes: ArrayBuffer;
  name: string;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const origin = new URL(baseUrl).origin;
  useEffect(() => {
    const ready = (event: MessageEvent) => {
      if (
        event.origin === origin &&
        event.source === frame.current?.contentWindow &&
        event.data?.type === "paprint-pdf-ready"
      )
        frame.current?.contentWindow?.postMessage(
          { type: "paprint-pdf", bytes },
          origin,
        );
    };
    window.addEventListener("message", ready);
    return () => window.removeEventListener("message", ready);
  }, [bytes, origin]);
  return (
    <iframe
      ref={frame}
      title={`Preview of ${name}`}
      src={`${baseUrl}/api/pdf-preview`}
      onLoad={() =>
        frame.current?.contentWindow?.postMessage(
          { type: "paprint-pdf", bytes },
          origin,
        )
      }
      style={{ width: "100%", flex: 1, minHeight: 240, border: 0 }}
    />
  );
}
