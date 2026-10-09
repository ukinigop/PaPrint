import "dotenv/config";
import mongoose from "mongoose";
import path from "node:path";
import { createApp } from "./app.js";
import { seedShops } from "./models.js";
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)
  throw new Error("Set JWT_SECRET to at least 32 characters in server/.env.");
if (!process.env.SHOP_PIN) throw new Error("Set SHOP_PIN in server/.env.");
await mongoose.connect(
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/paprint",
);
await seedShops();
const app = createApp({
  secret: process.env.JWT_SECRET,
  shopPin: process.env.SHOP_PIN,
  uploadDir: path.resolve(process.env.UPLOAD_DIR || "uploads"),
  corsOrigin: process.env.CORS_ORIGIN,
});
app.listen(Number(process.env.PORT || 4000), "0.0.0.0", () =>
  console.log("PaPrint API listening on port " + (process.env.PORT || 4000)),
);
