import type { Order } from "./types";
export function canEstimatePickup(order: Pick<Order, "status">) {
  return order.status === "Queued" || order.status === "Printing";
}
export function toManilaInput(iso: string) {
  const time = Date.parse(iso);
  return Number.isFinite(time)
    ? new Date(time + 8 * 3600000).toISOString().slice(0, 16)
    : "";
}
export function fromManilaInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00+08:00`);
  if (
    !Number.isFinite(date.getTime()) ||
    toManilaInput(date.toISOString()) !== value
  )
    return null;
  return date.toISOString();
}
export function pickupTimeLabel(iso: string) {
  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso));
}
