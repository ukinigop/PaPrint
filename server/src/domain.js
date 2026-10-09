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
  }),
  notes: z.string().max(500).default(""),
  requestKey: z.string().uuid(),
});
export function price(shop, files, settings) {
  const pages = files.reduce((sum, f) => sum + f.pages, 0);
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
