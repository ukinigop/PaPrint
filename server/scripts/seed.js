import "dotenv/config";
import mongoose from "mongoose";
import { seedShops, Order } from "../src/models.js";
if (!process.env.MONGODB_URI)
  throw new Error("Set MONGODB_URI in server/.env to your hosted database.");
try {
  await mongoose.connect(process.env.MONGODB_URI);
  await seedShops();
  await Order.init();
  console.log(
    "Sample shops and order indexes are ready. Existing shops were preserved.",
  );
} finally {
  await mongoose.disconnect();
}
