/* Runs only in the isolated map document; no account credentials are available here. */
/* global L */
const params = new URLSearchParams(window.location.search);
const valid = (p) =>
  p &&
  Number.isFinite(p.latitude) &&
  Math.abs(p.latitude) <= 90 &&
  Number.isFinite(p.longitude) &&
  Math.abs(p.longitude) <= 180;
const initial = {
  latitude: Number(params.get("lat")),
  longitude: Number(params.get("lng")),
};
const hasPin = params.has("lat") && params.has("lng") && valid(initial);
const center = hasPin
  ? [initial.latitude, initial.longitude]
  : [13.6218, 123.1948];
const map = L.map("map", { scrollWheelZoom: false }).setView(
  center,
  hasPin ? 18 : 14,
);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
}).addTo(map);
const icon = L.divIcon({
  className: "pin",
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});
let marker;
function move(point, notify = false) {
  if (!valid(point)) return;
  if (!marker) {
    marker = L.marker([point.latitude, point.longitude], {
      draggable: true,
      icon,
      title: "Shop storefront pin",
    }).addTo(map);
    marker.on("dragend", () => {
      const point = marker.getLatLng();
      move({ latitude: point.lat, longitude: point.lng }, true);
    });
  } else marker.setLatLng([point.latitude, point.longitude]);
  if (notify) {
    const message = { type: "paprint-pin", coordinates: point };
    if (window.ReactNativeWebView)
      window.ReactNativeWebView.postMessage(JSON.stringify(message));
    else window.parent.postMessage(message, window.location.origin);
  }
}
if (hasPin) move(initial);
map.on("click", (e) =>
  move({ latitude: e.latlng.lat, longitude: e.latlng.lng }, true),
);
window.addEventListener("message", (event) => {
  if (
    event.origin !== window.location.origin ||
    event.source !== window.parent ||
    event.data?.type !== "paprint-center" ||
    !valid(event.data.coordinates)
  )
    return;
  move(event.data.coordinates);
  map.setView(
    [event.data.coordinates.latitude, event.data.coordinates.longitude],
    18,
  );
});
window.paprintSetPin = (point) => {
  if (valid(point)) {
    move(point);
    map.setView([point.latitude, point.longitude], 18);
  }
};
