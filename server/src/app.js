import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import multer from "multer";
import { PDFDocument } from "pdf-lib";
import { randomUUID, randomInt } from "node:crypto";
import { diskStorage } from "./storage.js";
import { Shop, Upload, Order, Device, AccountSession } from "./models.js";
import { installAccounts } from "./accounts.js";
import { installWorkspace } from "./workspace.js";
import { installAdmin } from "./admin.js";
import {
  advanceOrder,
  confirmPayment,
  endOrder,
  publicShop,
} from "./fulfillment.js";
import { bookingSchema, price } from "./domain.js";
import { installMaps } from "./maps.js";

const fail = (status, message) => Object.assign(new Error(message), { status });
export function createApp({
  secret,
  shopPin,
  enableLegacyShopAccess = false,
  uploadDir,
  fileStorage = diskStorage(uploadDir),
  maxUploadBytes = 15 * 1024 * 1024,
  trustProxy = false,
  pushSender = defaultPushSender,
  corsOrigin = "http://localhost:8081",
  searchPlaces,
}) {
  const app = express();
  if (trustProxy) app.set("trust proxy", 1);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          // The owner print preview embeds an authenticated, locally created PDF blob.
          frameSrc: ["'self'", "blob:"],
          objectSrc: ["blob:"],
        },
      },
    }),
    cors({ origin: corsOrigin }),
    express.json({ limit: "32kb" }),
  );
  app.use("/api", rateLimit({ windowMs: 60_000, limit: 180 }));
  installMaps(app, { searchPlaces });
  const sign = (data) => jwt.sign(data, secret, { expiresIn: "30d" });
  const auth = async (req, res, next) => {
    try {
      req.user = jwt.verify(
        (req.headers.authorization || "").replace(/^Bearer /, ""),
        secret,
        { algorithms: ["HS256"] },
      );
      if (
        req.user.account &&
        (!req.user.sid ||
          !(await AccountSession.exists({
            _id: req.user.sid,
            user: req.user.id,
            expiresAt: { $gt: new Date() },
          })))
      )
        throw new Error("Session ended");
      if (req.user.role === "shop" && !enableLegacyShopAccess)
        throw new Error("Legacy access disabled");
      if (
        req.user.role === "shop" &&
        (await Shop.findById(req.user.id))?.registrationStatus !== "approved"
      )
        throw fail(403, "Shop approval required.");
      next();
    } catch (error) {
      next(
        error.status === 403
          ? error
          : fail(401, "Your session expired. Please sign in again."),
      );
    }
  };
  const customer = (req, res, next) =>
    req.user.role === "customer"
      ? next()
      : next(fail(403, "Customer access required."));
  const merchant = async (req, res, next) => {
    if (req.user.role !== "shop") throw fail(403, "Shop access required.");
    const shop = await Shop.findById(req.user.id);
    if (!shop || shop.registrationStatus !== "approved")
      throw fail(403, "Shop approval required.");
    next();
  };
  installAdmin(app, { auth, fileStorage });
  installAccounts(app, { secret, auth, customer });
  installWorkspace(app, {
    auth,
    fileStorage,
    maxUploadBytes,
    notifyPickup: (order) => sendPickup(order, pushSender),
  });
  app.get("/api/health", (req, res) => res.json({ ok: true }));
  app.get("/api/config", (req, res) =>
    res.json({ maxUploadBytes, maxFiles: 5 }),
  );
  app.post(
    "/api/session",
    rateLimit({ windowMs: 60_000, limit: 10 }),
    (req, res) => {
      let id = randomUUID();
      // A signed guest credential can renew the same device identity after expiry.
      try {
        const previous = jwt.verify(
          (req.headers.authorization || "").replace(/^Bearer /, ""),
          secret,
          { ignoreExpiration: true },
        );
        // Guest renewal must never turn an expired/revoked account token into a guest with that account's ID.
        if (previous.account)
          return res.status(401).json({ message: "Please sign in again." });
        if (previous.role === "customer") id = previous.id;
      } catch {
        /* A new device gets a fresh identity. */
      }
      res.json({ token: sign({ id, role: "customer" }), customerId: id });
    },
  );
  app.post(
    "/api/shop-session",
    rateLimit({ windowMs: 15 * 60_000, limit: 10 }),
    async (req, res) => {
      if (!enableLegacyShopAccess)
        throw fail(
          403,
          "Shared-PIN access is disabled. Sign in with your owner account.",
        );
      if (!shopPin || req.body.pin !== shopPin)
        throw fail(401, "Incorrect shop access PIN.");
      const shop = await Shop.findById(validId(req.body.shopId)).select(
        publicShop.select,
      );
      if (!shop) throw fail(404, "Shop not found.");
      if (shop.registrationStatus !== "approved")
        throw fail(403, "Shop approval required.");
      res.json({ token: sign({ id: shop.id, role: "shop" }), shop });
    },
  );
  app.get("/api/shops", auth, async (req, res) =>
    res.json(
      await Shop.find({
        $or: [
          { registrationStatus: "approved" },
          { registrationStatus: { $exists: false } },
        ],
      })
        .select(publicShop.select)
        .sort({ open: -1, rating: -1 }),
    ),
  );
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxUploadBytes, files: 5 },
  });
  app.post(
    "/api/uploads",
    auth,
    customer,
    upload.array("files", 5),
    async (req, res) => {
      if (!req.files?.length) throw fail(400, "Choose at least one PDF file.");
      if (req.files.reduce((sum, file) => sum + file.size, 0) > maxUploadBytes)
        throw fail(
          400,
          "Upload files one at a time so the request stays within the upload limit.",
        );
      const prepared = [];
      for (const file of req.files) {
        if (
          !file.originalname.toLowerCase().endsWith(".pdf") ||
          !file.buffer.subarray(0, 1024).includes(Buffer.from("%PDF-"))
        )
          throw fail(400, "Only valid PDF files are supported.");
        try {
          const pdf = await PDFDocument.load(file.buffer);
          if (!pdf.getPageCount()) throw new Error();
          prepared.push({ file, pages: pdf.getPageCount() });
        } catch {
          throw fail(400, "One PDF cannot be read. Use a valid, unlocked PDF.");
        }
      }
      const written = [],
        records = [];
      try {
        for (const { file, pages } of prepared) {
          const location = await fileStorage.put(file.buffer);
          written.push(location);
          records.push(
            await Upload.create({
              owner: req.user.id,
              name: file.originalname.slice(0, 180),
              path: location,
              size: file.size,
              pages,
            }),
          );
        }
      } catch (error) {
        await Promise.all(
          written.map((p) => fileStorage.remove(p).catch(() => {})),
        );
        await Upload.deleteMany({ _id: { $in: records.map((r) => r.id) } });
        throw error;
      }
      res.status(201).json(
        records.map((f) => ({
          _id: f.id,
          name: f.name,
          pages: f.pages,
          size: f.size,
        })),
      );
    },
  );
  async function prepare(req) {
    const parsed = bookingSchema.safeParse(req.body);
    if (!parsed.success)
      throw fail(400, "Check your shop, files, and printing settings.");
    const data = parsed.data;
    const shop = await Shop.findById(data.shopId);
    if (!shop) throw fail(404, "Shop not found.");
    if (shop.registrationStatus !== "approved")
      throw fail(409, "This shop is not accepting orders yet.");
    if (data.paymentMethod === "gcash")
      throw fail(
        409,
        "GCash payments are not connected yet. Choose pay on pickup.",
      );
    if (!shop.open)
      throw fail(409, "This shop is closed. Please choose an open shop.");
    const foundFiles = await Upload.find({
      _id: { $in: data.fileIds },
      owner: req.user.id,
    });
    if (foundFiles.length !== data.fileIds.length)
      throw fail(400, "Some files are unavailable. Upload your files again.");
    const byId = new Map(foundFiles.map((file) => [file.id, file]));
    const files = data.fileIds.map((id) => byId.get(id.toLowerCase()));
    return { data, shop, files, ...price(shop, files, data.settings) };
  }
  app.post("/api/quote", auth, customer, async (req, res) => {
    const { pages, amount } = await prepare(req);
    res.json({ pages, amount });
  });
  app.post("/api/orders", auth, customer, async (req, res) => {
    const valid = bookingSchema.safeParse(req.body);
    if (!valid.success)
      throw fail(400, "Check your shop, files, and printing settings.");
    const existing = await Order.findOne({
      customer: req.user.id,
      requestKey: valid.data.requestKey,
    }).populate(publicShop);
    if (existing) return res.json(existing);
    const { data, shop, files, pages, amount } = await prepare(req);
    if (data.expectedAmount !== undefined && data.expectedAmount !== amount)
      return res.status(409).json({
        message:
          "The price changed. Review the updated total and confirm again.",
        code: "PRICE_CHANGED",
        amount,
        pages,
      });
    try {
      const order = await Order.create({
        customer: req.user.id,
        shop: shop.id,
        files: files.map((f) => ({
          upload: f.id,
          name: f.name,
          pages: f.pages,
          size: f.size,
        })),
        settings: data.settings,
        notes: data.notes,
        requestKey: data.requestKey,
        pages,
        amount,
        paymentMethod: data.paymentMethod,
        pickupCode: String(randomInt(100000, 1000000)),
      });
      res.status(201).json(
        await order.populate({
          path: "shop",
          select: publicShop.select,
        }),
      );
    } catch (error) {
      if (error.code === 11000)
        return res.json(
          await Order.findOne({
            customer: req.user.id,
            requestKey: data.requestKey,
          }).populate(publicShop),
        );
      throw error;
    }
  });
  app.get("/api/orders", auth, async (req, res) => {
    const filter =
      req.user.role === "shop"
        ? { shop: req.user.id }
        : { customer: req.user.id };
    res.json(
      await Order.find(filter).sort({ createdAt: -1 }).populate(publicShop),
    );
  });
  app.get("/api/orders/:id/files/:fileId", auth, async (req, res) => {
    const order = await Order.findById(validId(req.params.id));
    if (
      !order ||
      (req.user.role === "shop"
        ? String(order.shop) !== req.user.id
        : order.customer !== req.user.id)
    )
      throw fail(404, "Order not found.");
    if (!order.files.some((f) => String(f.upload) === req.params.fileId))
      throw fail(404, "File not found.");
    const file = await Upload.findById(validId(req.params.fileId));
    if (!file) throw fail(404, "File not found.");
    res.set("Content-Type", "application/pdf");
    res.set(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    );
    res.send(await fileStorage.read(file.path));
  });
  app.patch("/api/orders/:id/status", auth, merchant, async (req, res) => {
    res.json(
      await advanceOrder(req.user.id, req.params.id, req.body.status, (order) =>
        sendPickup(order, pushSender),
      ),
    );
  });
  app.post("/api/orders/:id/payment", auth, merchant, async (req, res) => {
    res.json(await confirmPayment(req.user.id, req.params.id));
  });
  app.post("/api/orders/:id/cancel", auth, customer, async (req, res) => {
    res.json(
      await endOrder({
        id: req.params.id,
        scope: { customer: req.user.id },
        status: "Cancelled",
        actorId: req.user.id,
        actorRole: "customer",
        body: req.body,
      }),
    );
  });
  app.post("/api/orders/:id/reject", auth, merchant, async (req, res) => {
    res.json(
      await endOrder({
        id: req.params.id,
        scope: { shop: req.user.id },
        status: "Rejected",
        actorId: req.user.id,
        actorRole: "shop",
        body: req.body,
      }),
    );
  });
  app.post("/api/device", auth, customer, async (req, res) => {
    if (
      !/^Expo(nent)?PushToken\[[A-Za-z\d_-]+\]$/.test(req.body.pushToken || "")
    )
      throw fail(400, "Invalid notification token.");
    await Device.findOneAndUpdate(
      { customer: req.user.id },
      { pushToken: req.body.pushToken },
      { upsert: true },
    );
    res.json({ ok: true });
  });
  app.use((error, req, res, next) => {
    const status =
      error instanceof multer.MulterError
        ? 400
        : error.name === "VersionError"
          ? 409
          : error.status || 500;
    if (status === 500) console.error(error);
    res.status(status).json({
      message:
        error instanceof multer.MulterError
          ? `Upload up to 5 PDFs, each no larger than ${maxUploadBytes / 1024 / 1024} MB.`
          : error.name === "VersionError"
            ? "Registration changed. Refresh and try again."
            : status === 500
              ? "Something went wrong. Please try again."
              : error.message,
    });
  });
  return app;
}
function validId(id) {
  if (typeof id !== "string" || !/^[a-f\d]{24}$/i.test(id))
    throw fail(400, "Invalid identifier.");
  return id;
}
async function sendPickup(order, sender) {
  const device = await Device.findOne({ customer: order.customer });
  if (!device) {
    order.pushState = "in-app";
    await order.save();
    return;
  }
  try {
    await sender({
      to: device.pushToken,
      title: "Your prints are ready!",
      body: `Pick up your order at ${order.shop.name}. Code: ${order.pickupCode}`,
      data: { orderId: order.id },
      sound: "default",
      channelId: "pickup",
    });
    order.pushState = "sent";
  } catch {
    order.pushState = "failed";
  }
  await order.save();
}
async function defaultPushSender(message) {
  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message),
    signal: AbortSignal.timeout(10000),
  });
  const result = await response.json();
  if (!response.ok || result.data?.status !== "ok")
    throw new Error("Push delivery failed");
}
