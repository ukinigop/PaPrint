import { randomBytes, scrypt as deriveKey, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { User, AccountSession, Device } from "./models.js";

const scrypt = promisify(deriveKey);
const fail = (status, message) => Object.assign(new Error(message), { status });
const email = z.string().trim().toLowerCase().email().max(254);
const password = z.string().min(10).max(128);
const phone = z
  .string()
  .regex(/^[0-9]{11}$/, "Enter an 11-digit mobile number.");
const name = z.string().trim().min(1).max(80);
const profile = (user) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  phone: user.phone || "",
  accountType: user.accountType || "customer",
  savedShops: (user.savedShops || []).map(String),
  defaultPaper: user.defaultPaper,
  reducedMotion: user.reducedMotion,
});

export async function passwordHash(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = await scrypt(password, salt, 64);
  return `${salt}:${hash.toString("hex")}`;
}
async function matches(password, stored) {
  const [salt, hex] = stored.split(":");
  const key = await scrypt(password, salt, 64);
  return timingSafeEqual(key, Buffer.from(hex, "hex"));
}
// A fixed dummy hash keeps unknown-email and wrong-password work comparable.
const dummyHash = passwordHash(randomBytes(32).toString("hex"));
export function installAccounts(app, { secret, auth, customer }) {
  const limit = rateLimit({
    windowMs: 15 * 60_000,
    limit: 20,
    message: {
      message: "Too many sign-in attempts. Please try again in 15 minutes.",
    },
  });
  const issue = async (user, res) => {
    await AccountSession.init();
    const session = await AccountSession.create({
      user: user._id,
      expiresAt: new Date(Date.now() + 30 * 86400000),
    });
    const token = jwt.sign(
      { id: user.id, role: "customer", account: true, sid: session.id },
      secret,
      { expiresIn: "30d", algorithm: "HS256" },
    );
    res.json({ token, user: profile(user) });
  };
  const accountOnly = (req, res, next) =>
    req.user.account
      ? next()
      : next(fail(401, "Sign in to your account first."));
  app.post("/api/auth/signup", limit, async (req, res) => {
    const parsed = z
      .object({
        email,
        password,
        name,
        // Omitted phone remains compatible with older API clients; supplied values are strict.
        phone: phone.optional(),
        accountType: z.enum(["customer", "owner"]).default("customer"),
      })
      .safeParse(req.body);
    if (!parsed.success)
      throw fail(
        400,
        parsed.error.issues.some((issue) => issue.path[0] === "phone")
          ? "Enter an 11-digit mobile number."
          : "Enter your name, a valid email, and a password of 10–128 characters.",
      );
    await User.init();
    const data = parsed.data;
    let user;
    try {
      user = await User.create({
        email: data.email,
        name: data.name,
        phone: data.phone || "",
        accountType: data.accountType,
        passwordHash: await passwordHash(data.password),
      });
    } catch (error) {
      if (error.code === 11000)
        throw fail(
          409,
          "An account with this email already exists. Please sign in.",
        );
      throw error;
    }
    await issue(user, res.status(201));
  });
  app.post("/api/auth/login", limit, async (req, res) => {
    const parsed = z
      .object({ email, password: z.string().min(1).max(128) })
      .safeParse(req.body);
    if (!parsed.success) throw fail(401, "Email or password is incorrect.");
    const user = await User.findOne({ email: parsed.data.email }).select(
      "+passwordHash",
    );
    const valid = await matches(
      parsed.data.password,
      user?.passwordHash || (await dummyHash),
    );
    if (!user || !valid) throw fail(401, "Email or password is incorrect.");
    await issue(user, res);
  });
  app.get("/api/auth/me", auth, customer, accountOnly, async (req, res) => {
    const user = await User.findById(req.user.id);
    if (!user) throw fail(401, "Please sign in again.");
    res.json(profile(user));
  });
  app.patch("/api/auth/me", auth, customer, accountOnly, async (req, res) => {
    const parsed = z
      .object({
        name: name.optional(),
        defaultPaper: z.enum(["A4", "Letter", "Legal"]).optional(),
        reducedMotion: z.boolean().optional(),
        phone: phone.optional(),
        savedShops: z
          .array(z.string().regex(/^[a-f\d]{24}$/i))
          .max(100)
          .optional(),
      })
      .strict()
      .safeParse(req.body);
    if (
      !parsed.success &&
      parsed.error.issues.some((issue) => issue.path[0] === "phone")
    )
      throw fail(400, "Enter an 11-digit mobile number.");
    if (!parsed.success || !Object.keys(parsed.data).length)
      throw fail(400, "Check your profile settings and try again.");
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: parsed.data },
      { new: true, runValidators: true },
    );
    if (!user) throw fail(401, "Please sign in again.");
    res.json(profile(user));
  });
  app.post(
    "/api/auth/logout",
    auth,
    customer,
    accountOnly,
    async (req, res) => {
      await AccountSession.deleteOne({ _id: req.user.sid, user: req.user.id });
      res.json({ ok: true });
    },
  );
  app.delete("/api/device", auth, customer, async (req, res) => {
    await Device.deleteOne({ customer: req.user.id });
    res.json({ ok: true });
  });
}
