import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { PDFDocument } from "pdf-lib";
import { randomUUID } from "node:crypto";
import { createApp } from "../src/app.js";
import { Order, Upload, Shop, seedShops } from "../src/models.js";

let mongo,
  app,
  folder,
  customer,
  other,
  shop,
  shopToken,
  otherShopToken,
  pdf,
  file,
  order,
  key;
const delivered = [];
const auth = (token) => ({ Authorization: `Bearer ${token}` });
before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await seedShops();
  await Order.init();
  folder = await mkdtemp(path.join(os.tmpdir(), "paprint-test-"));
  app = createApp({
    secret: "test-secret-with-at-least-32-characters",
    shopPin: "2468",
    uploadDir: folder,
    pushSender: async (notification) => delivered.push(notification),
  });
  customer = (await request(app).post("/api/session")).body.token;
  other = (await request(app).post("/api/session")).body.token;
  const shops = (await request(app).get("/api/shops").set(auth(customer))).body;
  shop = shops.find((s) => s.open);
  shopToken = (
    await request(app)
      .post("/api/shop-session")
      .send({ shopId: shop._id, pin: "2468" })
  ).body.token;
  otherShopToken = (
    await request(app)
      .post("/api/shop-session")
      .send({ shopId: shops.find((s) => s._id !== shop._id)._id, pin: "2468" })
  ).body.token;
  const document = await PDFDocument.create();
  document.addPage();
  document.addPage();
  pdf = Buffer.from(await document.save());
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
  if (folder) await rm(folder, { recursive: true, force: true });
});
test("shops require a session and shop PIN is enforced", async () => {
  assert.equal((await request(app).get("/api/shops")).status, 401);
  assert.equal(
    (
      await request(app)
        .post("/api/shop-session")
        .send({ shopId: shop._id, pin: "wrong" })
    ).status,
    401,
  );
});
test("renewing a guest session preserves the customer identity", async () => {
  const jwt = (await import("jsonwebtoken")).default;
  const identity = jwt.verify(
    customer,
    "test-secret-with-at-least-32-characters",
  );
  const expired = jwt.sign(
    { id: identity.id, role: "customer" },
    "test-secret-with-at-least-32-characters",
    { expiresIn: -1 },
  );
  const renewed = await request(app).post("/api/session").set(auth(expired));
  assert.equal(renewed.status, 200);
  assert.equal(renewed.body.customerId, identity.id);
});
test("PDF upload validates bytes and reads actual page count", async () => {
  const bad = await request(app)
    .post("/api/uploads")
    .set(auth(customer))
    .attach("files", Buffer.from("not a PDF"), "fake.pdf");
  assert.equal(bad.status, 400);
  assert.equal(await Upload.countDocuments(), 0);
  const uploaded = await request(app)
    .post("/api/uploads")
    .set(auth(customer))
    .attach("files", pdf, "thesis.pdf");
  assert.equal(uploaded.status, 201);
  file = uploaded.body[0];
  assert.equal(file.pages, 2);
  assert.equal(file.path, undefined);
});
const payload = () => ({
  shopId: shop._id,
  fileIds: [file._id],
  settings: {
    paper: "Legal",
    color: "Color",
    sides: "Double-sided",
    copies: 3,
  },
  notes: "Please staple",
  requestKey: key,
});
test("quote is authoritative and rejects another customer’s files and closed shops", async () => {
  key = randomUUID();
  const quote = await request(app)
    .post("/api/quote")
    .set(auth(customer))
    .send({ ...payload(), amount: 1 });
  assert.equal(quote.status, 200);
  assert.equal(quote.body.amount, 2 * 3 * shop.colorRate * 1.25);
  assert.equal(
    (await request(app).post("/api/quote").set(auth(other)).send(payload()))
      .status,
    400,
  );
  const closed = await Shop.findOne({ open: false });
  assert.equal(
    (
      await request(app)
        .post("/api/orders")
        .set(auth(customer))
        .send({ ...payload(), shopId: closed.id })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(app)
        .post("/api/orders")
        .set(auth(customer))
        .send({ ...payload(), settings: { ...payload().settings, copies: 0 } })
    ).status,
    400,
  );
});
test("booking persists, concurrent retries create only one order", async () => {
  const results = await Promise.all(
    [1, 2, 3].map(() =>
      request(app).post("/api/orders").set(auth(customer)).send(payload()),
    ),
  );
  assert.ok(results.every((r) => [200, 201].includes(r.status)));
  order = results[0].body;
  assert.equal(await Order.countDocuments(), 1);
  assert.equal(order.status, "Queued");
  assert.match(order.pickupCode, /^\d{6}$/);
  assert.equal(
    (await request(app).get("/api/orders").set(auth(customer))).body[0]._id,
    order._id,
  );
  assert.equal(
    (await request(app).get("/api/orders").set(auth(other))).body.length,
    0,
  );
});
test("files are accessible only to their customer or assigned shop", async () => {
  const route = `/api/orders/${order._id}/files/${file._id}`;
  assert.equal((await request(app).get(route).set(auth(customer))).status, 200);
  assert.equal(
    (await request(app).get(route).set(auth(shopToken))).status,
    200,
  );
  assert.equal((await request(app).get(route).set(auth(other))).status, 404);
  assert.equal(
    (await request(app).get(route).set(auth(otherShopToken))).status,
    404,
  );
});
test("shop transitions are ordered and customer cannot mutate status", async () => {
  const route = `/api/orders/${order._id}/status`;
  assert.equal(
    (
      await request(app)
        .patch(route)
        .set(auth(customer))
        .send({ status: "Printing" })
    ).status,
    403,
  );
  assert.equal(
    (
      await request(app)
        .patch(route)
        .set(auth(otherShopToken))
        .send({ status: "Printing" })
    ).status,
    404,
  );
  assert.equal(
    (
      await request(app)
        .patch(route)
        .set(auth(shopToken))
        .send({ status: "Ready for pickup" })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(app)
        .patch(route)
        .set(auth(shopToken))
        .send({ status: "Printing" })
    ).status,
    200,
  );
});
test("ready state creates durable pickup notification and sends exactly one push", async () => {
  await request(app)
    .post("/api/device")
    .set(auth(customer))
    .send({ pushToken: "ExponentPushToken[test-token]" })
    .expect(200);
  const route = `/api/orders/${order._id}/status`;
  const ready = await request(app)
    .patch(route)
    .set(auth(shopToken))
    .send({ status: "Ready for pickup" });
  assert.equal(ready.status, 200);
  assert.ok(ready.body.readyAt);
  assert.equal(ready.body.pushState, "sent");
  assert.equal(delivered.length, 1);
  assert.equal(delivered[0].data.orderId, order._id);
  assert.equal(
    (
      await request(app)
        .patch(route)
        .set(auth(shopToken))
        .send({ status: "Ready for pickup" })
    ).status,
    409,
  );
  assert.equal(delivered.length, 1);
  await request(app)
    .patch(route)
    .set(auth(shopToken))
    .send({ status: "Collected" })
    .expect(200);
  const collected = (await request(app).get("/api/orders").set(auth(customer)))
    .body[0];
  assert.equal(collected.status, "Collected");
  assert.ok(collected.readyAt);
});
