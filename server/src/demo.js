import "dotenv/config";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { createApp } from "./app.js";
import { seedShops } from "./models.js";
import { seedDemoOwner, demoOwner } from "./demo-owner.js";
const directory = path.resolve("uploads");
await mkdir(path.join(directory, "demo-db"), { recursive: true });
const secretFile = path.join(directory, ".demo-secret");
let secret;
try {
  secret = await readFile(secretFile, "utf8");
} catch {
  secret = randomBytes(48).toString("hex");
  await writeFile(secretFile, secret);
}
const mongo = await MongoMemoryServer.create({
  instance: {
    dbPath: path.join(directory, "demo-db"),
    storageEngine: "wiredTiger",
  },
});
await mongoose.connect(mongo.getUri());
await seedShops();
await seedDemoOwner();
const app = createApp({
  secret,
  enableLegacyShopAccess: process.env.ENABLE_LEGACY_SHOP_ACCESS === "true",
  shopPin: process.env.SHOP_PIN || "2468",
  uploadDir: directory,
  corsOrigin: process.env.CORS_ORIGIN,
});
const server = app.listen(4000, "0.0.0.0", () => {
  console.log("Local demo database for admin promotion: " + mongo.getUri());
  console.log(
    "PaPrint demo API: http://localhost:4000 | Shared-PIN access: " +
      (process.env.ENABLE_LEGACY_SHOP_ACCESS === "true"
        ? "enabled"
        : "disabled") +
      "\nSample shops and prices. MongoDB data persists in server/uploads/demo-db." +
      "\nLocal demo owner: " +
      demoOwner.email +
      " | Password: " +
      demoOwner.password,
  );
});
async function stop() {
  server.close();
  await mongoose.disconnect();
  await mongo.stop({ doCleanup: false });
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
