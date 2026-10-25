import React, { useEffect, useRef, useState } from "react";
import { baseUrl } from "./api";
import { validCoordinates, type Coordinates } from "./shopDiscovery";
export type MapCanvasProps = {
  coordinates: Coordinates | null;
  onChange: (point: Coordinates) => void;
};
export function MapCanvas({ coordinates, onChange }: MapCanvasProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [source] = useState(
    () =>
      baseUrl +
      "/api/map" +
      (coordinates
        ? `?lat=${coordinates.latitude}&lng=${coordinates.longitude}`
        : ""),
  );
  const origin = new URL(baseUrl).origin;
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (
        event.origin === origin &&
        event.source === frame.current?.contentWindow &&
        event.data?.type === "paprint-pin" &&
        validCoordinates(event.data.coordinates)
      )
        onChange(event.data.coordinates);
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [origin, onChange]);
  useEffect(() => {
    if (coordinates)
      frame.current?.contentWindow?.postMessage(
        { type: "paprint-center", coordinates },
        origin,
      );
  }, [coordinates, origin]);
  return (
    <iframe
      ref={frame}
      src={source}
      onLoad={() => {
        if (coordinates)
          frame.current?.contentWindow?.postMessage(
            { type: "paprint-center", coordinates },
            origin,
          );
      }}
      title="Choose exact storefront location"
      style={{ width: "100%", height: 320, border: 0, borderRadius: 16 }}
    />
  );
}
