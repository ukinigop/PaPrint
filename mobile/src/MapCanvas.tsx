import React, { useEffect, useRef, useState } from "react";
import { WebView } from "react-native-webview";
import { baseUrl } from "./api";
import { validCoordinates, type Coordinates } from "./shopDiscovery";
export type MapCanvasProps = {
  coordinates: Coordinates | null;
  onChange: (point: Coordinates) => void;
};
export function MapCanvas({ coordinates, onChange }: MapCanvasProps) {
  const frame = useRef<WebView>(null);
  const [source] = useState(
    () =>
      baseUrl +
      "/api/map" +
      (coordinates
        ? `?lat=${coordinates.latitude}&lng=${coordinates.longitude}`
        : ""),
  );
  const sync = () => {
    if (validCoordinates(coordinates))
      frame.current?.injectJavaScript(
        `window.paprintSetPin && window.paprintSetPin(${JSON.stringify(coordinates)});true;`,
      );
  };
  useEffect(sync, [coordinates]);
  return (
    <WebView
      ref={frame}
      source={{ uri: source }}
      style={{ height: 320, flex: 0, borderRadius: 16 }}
      nestedScrollEnabled
      applicationNameForUserAgent="PaPrint/1.0 (+https://paprint.vercel.app)"
      onLoadEnd={sync}
      originWhitelist={[new URL(baseUrl).origin]}
      onShouldStartLoadWithRequest={(request) =>
        request.url.startsWith(baseUrl + "/api/map")
      }
      onMessage={(event) => {
        try {
          const data = JSON.parse(event.nativeEvent.data);
          if (data.type === "paprint-pin" && validCoordinates(data.coordinates))
            onChange(data.coordinates);
        } catch {
          /* Ignore malformed map messages. */
        }
      }}
    />
  );
}
