import "dotenv/config";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { createApp } from "./app.js";
import { seedShops } from "./models.js";
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
const app = createApp({
  secret,
  shopPin: process.env.SHOP_PIN || "2468",
  uploadDir: directory,
  corsOrigin: process.env.CORS_ORIGIN,
});
const server = app.listen(4000, "0.0.0.0", () =>
  console.log(
    "PaPrint demo API: http://localhost:4000 | Shop PIN: " +
      (process.env.SHOP_PIN ? "(from .env)" : "2468") +
      "\nSample shops and prices. MongoDB data persists in server/uploads/demo-db.",
  ),
);
async function stop() {
  server.close();
  await mongoose.disconnect();
  await mongo.stop({ doCleanup: false });
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
