import { z } from "zod";
export const bookingSchema = z.object({
  shopId: z.string().regex(/^[a-f\d]{24}$/i),
  fileIds: z
    .array(z.string().regex(/^[a-f\d]{24}$/i))
    .min(1)
    .max(5)
    .refine((v) => new Set(v).size === v.length),
  settings: z.object({
    paper: z.enum(["A4", "Letter", "Legal"]),
    color: z.enum(["Black & white", "Color"]),
    sides: z.enum(["Single-sided", "Double-sided"]),
    copies: z.number().int().min(1).max(100),
    pageRange: z.string().max(100).default(""),
    finishing: z.enum(["No binding"]).default("No binding"),
  }),
  notes: z.string().max(500).default(""),
  requestKey: z.string().uuid(),
  paymentMethod: z.enum(["pickup", "gcash"]).default("pickup"),
  expectedAmount: z.number().nonnegative().optional(),
});
export function price(shop, files, settings) {
  const total = files.reduce((sum, f) => sum + f.pages, 0);
  let pages = total;
  if (settings.pageRange?.trim()) {
    const chosen = new Set();
    for (const part of settings.pageRange.split(",")) {
      if (!/^\s*\d+\s*(-\s*\d+\s*)?$/.test(part))
        throw Object.assign(new Error("Use page numbers such as 1-3, 5."), {
          status: 400,
        });
      const [first, last = first] = part.split("-").map(Number);
      if (first < 1 || last < first || last > total)
        throw Object.assign(new Error(`Choose pages between 1 and ${total}.`), {
          status: 400,
        });
      for (let p = first; p <= last; p++) chosen.add(p);
    }
    pages = chosen.size;
  }
  const rate = settings.color === "Color" ? shop.colorRate : shop.monoRate;
  const paperMultiplier = settings.paper === "Legal" ? 1.25 : 1;
  return {
    pages,
    amount:
      Math.round(pages * settings.copies * rate * paperMultiplier * 100) / 100,
  };
}
export const nextStatus = {
  Queued: "Printing",
  Printing: "Ready for pickup",
  "Ready for pickup": "Collected",
};
