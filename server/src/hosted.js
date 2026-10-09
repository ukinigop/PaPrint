import mongoose from "mongoose";
import { createApp } from "./app.js";
import { gridFsStorage } from "./storage.js";
import { Order, seedShops } from "./models.js";

let connection;
let app;
export default async function handler(req, res) {
  try {
    if (
      !process.env.MONGODB_URI ||
      !process.env.JWT_SECRET ||
      process.env.JWT_SECRET.length < 32 ||
      !process.env.SHOP_PIN
    )
      throw new Error(
        "Configure MONGODB_URI, JWT_SECRET (32+ characters), and SHOP_PIN in Vercel.",
      );
    if (!connection) {
      connection = mongoose
        .connect(process.env.MONGODB_URI, {
          maxPoolSize: 5,
          serverSelectionTimeoutMS: 10000,
        })
        .then(async () => {
          await Order.init();
          if (process.env.SEED_SAMPLE_SHOPS === "true") await seedShops();
        });
      connection.catch(() => {
        connection = undefined;
      });
    }
    await connection;
    app ||= createApp({
      secret: process.env.JWT_SECRET,
      shopPin: process.env.SHOP_PIN,
      fileStorage: gridFsStorage(),
      maxUploadBytes: 3 * 1024 * 1024,
      trustProxy: true,
      corsOrigin: process.env.CORS_ORIGIN || false,
    });
    return app(req, res);
  } catch (error) {
    console.error("PaPrint initialization failed:", error.message);
    res
      .status(503)
      .json({
        message:
          "PaPrint is temporarily unavailable. Check the server configuration and database connection.",
      });
  }
}
