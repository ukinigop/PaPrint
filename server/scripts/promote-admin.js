import { parseArgs } from "node:util";
import mongoose from "mongoose";
import { promoteAdmin } from "../src/admin-account.js";
const { values } = parseArgs({
  options: { email: { type: "string" }, "mongo-uri": { type: "string" } },
});
if (!values.email || !values["mongo-uri"]) {
  console.error(
    'Usage: npm --prefix server run admin:promote -- --email "you@example.com" --mongo-uri "mongodb://127.0.0.1:27017/paprint"',
  );
  process.exitCode = 1;
} else {
  try {
    await mongoose.connect(values["mongo-uri"], {
      serverSelectionTimeoutMS: 10000,
    });
    const user = await promoteAdmin(values.email);
    console.log(`Admin enabled for ${user.email}. Sign in again.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}
