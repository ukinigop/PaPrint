import { z } from "zod";
export const coordinatesSchema = z
  .object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  })
  .strict();
export const locationSchema = z
  .object({
    address: z.string().trim().min(5).max(250),
    coordinates: coordinatesSchema,
  })
  .strict();
