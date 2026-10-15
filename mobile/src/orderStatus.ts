import type { Order } from "./types";
export const isCancelledOrRejected = (order: Pick<Order, "status">) =>
  order.status === "Cancelled" || order.status === "Rejected";
export const isActiveOrder = (order: Pick<Order, "status">) =>
  ["Queued", "Printing", "Ready for pickup"].includes(order.status);
export const isTerminalOrder = (order: Pick<Order, "status">) =>
  order.status === "Collected" || isCancelledOrRejected(order);
export const canEndOrder = (order: Pick<Order, "status" | "paymentStatus">) =>
  order.status === "Queued" && (order.paymentStatus || "unpaid") === "unpaid";
export const paymentLabel = (order: Pick<Order, "status" | "paymentStatus">) =>
  isCancelledOrRejected(order)
    ? "No payment due"
    : order.paymentStatus === "paid"
      ? "Paid"
      : "Due on pickup";
