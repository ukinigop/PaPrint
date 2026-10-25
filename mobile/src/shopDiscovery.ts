import type { Shop } from "./types";
export type Coordinates = { latitude: number; longitude: number };
export function validCoordinates(
  point?: Coordinates | null,
): point is Coordinates {
  return (
    !!point &&
    Number.isFinite(point.latitude) &&
    Math.abs(point.latitude) <= 90 &&
    Number.isFinite(point.longitude) &&
    Math.abs(point.longitude) <= 180
  );
}
export function distanceKm(
  from: Coordinates,
  to?: Coordinates | null,
): number | null {
  if (!validCoordinates(from) || !validCoordinates(to)) return null;
  const rad = (value: number) => (value * Math.PI) / 180;
  const a =
    Math.sin(rad(to.latitude - from.latitude) / 2) ** 2 +
    Math.cos(rad(from.latitude)) *
      Math.cos(rad(to.latitude)) *
      Math.sin(rad(to.longitude - from.longitude) / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, a)));
}
export function sortShops(
  shops: Shop[],
  sort: string,
  origin?: Coordinates | null,
) {
  return [...shops].sort((a, b) => {
    if (sort === "Most Bookmarked" || sort === "Most Saved")
      return (
        (b.savedCount || 0) - (a.savedCount || 0) ||
        a.name.localeCompare(b.name)
      );
    if (sort === "Nearby" && origin)
      return (
        (distanceKm(origin, a.coordinates) ?? Infinity) -
          (distanceKm(origin, b.coordinates) ?? Infinity) ||
        a.name.localeCompare(b.name)
      );
    return 0;
  });
}
export function shopMapUrl(
  shop: Pick<Shop, "name" | "address" | "coordinates" | "locationAddress">,
) {
  const query = validCoordinates(shop.coordinates)
    ? `${shop.coordinates.latitude},${shop.coordinates.longitude}`
    : `${shop.name}, ${shop.locationAddress || shop.address}, Naga City, Philippines`;
  return (
    "https://www.google.com/maps/search/?api=1&query=" +
    encodeURIComponent(query)
  );
}
export function savedShopLabel(count = 0) {
  return `${count} ${count === 1 ? "bookmark" : "bookmarks"}`;
}
export function shopHours(hours?: string) {
  return (
    hours
      ?.trim()
      .replace(
        /\b(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(am|pm)\b/gi,
        (_, hour, minute, period) =>
          `${Number(hour)}:${minute || "00"} ${period.toUpperCase()}`,
      )
      .replace(/\s*[–—-]\s*/g, " - ") || "Hours not set"
  );
}
export function shopSummary(shop: Shop) {
  const ongoing = shop.queue?.ongoing ?? 0;
  return `${savedShopLabel(shop.savedCount)} · ${ongoing} Ongoing ${ongoing === 1 ? "Order" : "Orders"} · ${shopHours(shop.hours)}`;
}
