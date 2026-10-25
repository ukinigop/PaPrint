import React, { useRef, useState } from "react";
import { View } from "react-native";
import { MapCanvas } from "./MapCanvas";
import { Field } from "./design";
import { MotionButton as Button } from "./motion";
import { Text } from "./ui";
import { s } from "./styles";
import * as api from "./api";
import type { Coordinates } from "./shopDiscovery";
export type ShopLocation = { address: string; coordinates: Coordinates | null };
export function ShopLocationPicker({
  value,
  onChange,
}: {
  value: ShopLocation;
  onChange: (next: ShopLocation) => void;
}) {
  const [query, setQuery] = useState(value.address);
  const [results, setResults] = useState<ShopLocation[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  async function search() {
    const id = ++generation.current;
    const current = api.captureSession();
    setBusy(true);
    setError("");
    setResults([]);
    try {
      const next = await api.request<ShopLocation[]>(
        "/map/search?q=" + encodeURIComponent(query.trim()),
      );
      if (id !== generation.current || !current()) return;
      setResults(next);
      if (!next.length)
        setError(
          "No address found. Try a nearby landmark, or tap your storefront on the map.",
        );
    } catch (e) {
      if (id === generation.current && current())
        setError(
          e instanceof Error
            ? e.message
            : "Address search failed. You can still place the pin on the map.",
        );
    } finally {
      if (id === generation.current && current()) setBusy(false);
    }
  }
  return (
    <View style={{ gap: 12 }}>
      <Text style={s.cardTitle}>Exact storefront location</Text>
      <Text style={s.small}>
        Search for your business address, then tap the map or drag the pin to
        the storefront entrance.
      </Text>
      <Field
        label="Search address or landmark"
        value={query}
        onChangeText={(text) => {
          generation.current++;
          setBusy(false);
          setQuery(text);
          setResults([]);
          setError("");
        }}
        maxLength={200}
      />
      <Button
        title="Search map"
        secondary
        loading={busy}
        disabled={query.trim().length < 3}
        onPress={() => void search()}
      />
      {error ? (
        <Text accessibilityRole="alert" style={s.error}>
          {error}
        </Text>
      ) : null}
      {results.map((result, index) => (
        <Button
          key={index}
          title={result.address || "Select map result"}
          secondary
          onPress={() => {
            onChange(result);
            setResults([]);
          }}
        />
      ))}
      <MapCanvas
        coordinates={value.coordinates}
        onChange={(coordinates) => onChange({ ...value, coordinates })}
      />
      <Field
        label="Storefront address"
        value={value.address}
        onChangeText={(address) => onChange({ ...value, address })}
        maxLength={250}
        multiline
      />
      <Text style={s.small}>
        {value.coordinates
          ? `Latitude ${value.coordinates.latitude.toFixed(6)} · Longitude ${value.coordinates.longitude.toFixed(6)}`
          : "Choose a pin on the map to continue."}
      </Text>
      <Text style={s.small}>
        Map data © OpenStreetMap contributors. Address search uses Photon.
      </Text>
    </View>
  );
}
