import { Order } from "./models.js";
import { nextStatus } from "./domain.js";
import { z } from "zod";
export const publicShop = {
  path: "shop",
  select: "-documents -email -owner -reviews -rejectionReason",
};
const fail = (status, message) => Object.assign(new Error(message), { status });
export async function advanceOrder(shopId, id, status, notifyPickup) {
  if (!/^[a-f\d]{24}$/i.test(id)) throw fail(400, "Invalid order.");
  const order = await Order.findOne({ _id: id, shop: shopId });
  if (!order) throw fail(404, "Order not found.");
  if (
    typeof status !== "string" ||
    !Object.hasOwn(nextStatus, order.status) ||
    nextStatus[order.status] !== status
  )
    throw fail(409, "Order changed. Refresh and try again.");
  if (status === "Collected" && order.paymentStatus !== "paid")
    throw fail(409, "Confirm pickup payment before marking collected.");
  const change = { status };
  if (status === "Ready for pickup")
    Object.assign(change, { readyAt: new Date(), pushState: "pending" });
  const updated = await Order.findOneAndUpdate(
    {
      _id: id,
      shop: shopId,
      status: order.status,
      ...(status === "Collected" ? { paymentStatus: "paid" } : {}),
    },
    change,
    { new: true },
  ).populate(publicShop);
  if (!updated) throw fail(409, "Order changed. Refresh and try again.");
  if (updated.pushState === "pending") await notifyPickup(updated);
  return updated;
}

// The source-state filter also arbitrates races with production and other outcomes.
export async function endOrder({
  id,
  scope,
  status,
  actorId,
  actorRole,
  body,
}) {
  if (!/^[a-f\d]{24}$/i.test(id)) throw fail(400, "Invalid order.");
  const parsed = z
    .object({ reason: z.string().trim().max(500).default("") })
    .strict()
    .safeParse(body ?? {});
  if (!parsed.success || (status === "Rejected" && !parsed.data.reason))
    throw fail(
      400,
      status === "Rejected"
        ? "Enter a rejection reason of 1–500 characters."
        : "Use a cancellation reason of up to 500 characters.",
    );
  const reason = parsed.data.reason;
  const updated = await Order.findOneAndUpdate(
    {
      _id: id,
      ...scope,
      status: "Queued",
      $or: [{ paymentStatus: "unpaid" }, { paymentStatus: { $exists: false } }],
    },
    {
      $set: { status, outcome: { actorId, actorRole, reason, at: new Date() } },
    },
    { new: true, runValidators: true },
  ).populate(publicShop);
  if (updated) return updated;
  const existing = await Order.findOne({ _id: id, ...scope }).populate(
    publicShop,
  );
  if (!existing) throw fail(404, "Order not found.");
  if (
    existing.status === status &&
    existing.outcome?.actorId === actorId &&
    existing.outcome?.actorRole === actorRole &&
    existing.outcome?.reason === reason
  )
    return existing;
  throw fail(
    409,
    "The order stage changed. Only unpaid Preparing orders can be cancelled or rejected. Refresh to see the latest status.",
  );
}
export async function confirmPayment(shopId, id) {
  if (!/^[a-f\d]{24}$/i.test(id)) throw fail(400, "Invalid order.");
  const updated = await Order.findOneAndUpdate(
    {
      _id: id,
      shop: shopId,
      status: "Ready for pickup",
      paymentMethod: "pickup",
    },
    { paymentStatus: "paid" },
    { new: true },
  ).populate(publicShop);
  if (!updated)
    throw fail(409, "Confirm payment when this order is ready for pickup.");
  return updated;
}
