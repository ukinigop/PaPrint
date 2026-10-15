import { before, beforeEach, after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { PDFDocument } from "pdf-lib";
import { createApp } from "../src/app.js";
import { Order, Shop, Upload } from "../src/models.js";

const secret = "isolated-cancellation-test-secret-with-32-characters";
let mongo,
  folder,
  app,
  customer,
  other,
  owner,
  otherOwner,
  shop,
  shopToken,
  upload,
  pdf;
const pushes = [];
const auth = (token) => ({ Authorization: `Bearer ${token}` });
const makeApp = (legacy = true) =>
  createApp({
    secret,
    shopPin: "2468",
    enableLegacyShopAccess: legacy,
    uploadDir: folder,
    pushSender: async (notification) => pushes.push(notification),
  });
before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  folder = await mkdtemp(path.join(os.tmpdir(), "paprint-cancellation-"));
  app = makeApp();
  await Order.init();
  async function signup(email, accountType) {
    return (
      await request(app)
        .post("/api/auth/signup")
        .send({
          name: "Lifecycle Test",
          email,
          password: "Lifecycle-password-123",
          accountType,
        })
        .expect(201)
    ).body;
  }
  customer = await signup("customer@lifecycle.test", "customer");
  other = await signup("other@lifecycle.test", "customer");
  owner = await signup("owner@lifecycle.test", "owner");
  otherOwner = await signup("other-owner@lifecycle.test", "owner");
  shop = await Shop.create({
    name: "Lifecycle Prints",
    owner: owner.user.id,
    registrationStatus: "approved",
    open: true,
    monoRate: 2,
    colorRate: 8,
  });
  await Shop.create({
    name: "Other Prints",
    owner: otherOwner.user.id,
    registrationStatus: "approved",
    open: true,
    monoRate: 2,
    colorRate: 8,
  });
  shopToken = (
    await request(app)
      .post("/api/shop-session")
      .send({ shopId: shop.id, pin: "2468" })
      .expect(200)
  ).body.token;
  const document = await PDFDocument.create();
  document.addPage();
  pdf = Buffer.from(await document.save());
  upload = (
    await request(app)
      .post("/api/uploads")
      .set(auth(customer.token))
      .attach("files", pdf, "lifecycle.pdf")
      .expect(201)
  ).body[0];
});
beforeEach(() => {
  app = makeApp();
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
  if (folder) await rm(folder, { recursive: true, force: true });
});
async function book() {
  const payload = {
    shopId: shop.id,
    fileIds: [upload._id],
    settings: {
      paper: "A4",
      color: "Black & white",
      sides: "Single-sided",
      copies: 1,
    },
    requestKey: randomUUID(),
    expectedAmount: 2,
  };
  return {
    payload,
    order: (
      await request(app)
        .post("/api/orders")
        .set(auth(customer.token))
        .send(payload)
        .expect(201)
    ).body,
  };
}

test("customers cancel only their own orders; retries preserve outcome and booking history", async () => {
  const { order, payload } = await book();
  const route = `/api/orders/${order._id}/cancel`;
  await request(app).post(route).send({}).expect(401);
  await request(app).post(route).set(auth(other.token)).send({}).expect(404);
  await request(app).post(route).set(auth(shopToken)).send({}).expect(403);
  await request(app)
    .post("/api/orders/invalid/cancel")
    .set(auth(customer.token))
    .send({})
    .expect(400);
  await request(app)
    .post("/api/orders/000000000000000000000000/cancel")
    .set(auth(customer.token))
    .send({})
    .expect(404);
  for (const body of [
    { reason: "x".repeat(501) },
    { reason: 123 },
    { reason: "OK", actorId: "forged" },
  ])
    await request(app)
      .post(route)
      .set(auth(customer.token))
      .send(body)
      .expect(400);
  const before = pushes.length;
  const cancelled = (
    await request(app)
      .post(route)
      .set(auth(customer.token))
      .send({ reason: "  Wrong document  " })
      .expect(200)
  ).body;
  assert.equal(cancelled.status, "Cancelled");
  assert.equal(cancelled.outcome.actorId, customer.user.id);
  assert.equal(cancelled.outcome.actorRole, "customer");
  assert.equal(cancelled.outcome.reason, "Wrong document");
  assert.ok(cancelled.outcome.at);
  assert.equal(cancelled.amount, order.amount);
  assert.deepEqual(cancelled.files, order.files);
  const retry = (
    await request(app)
      .post(route)
      .set(auth(customer.token))
      .send({ reason: "Wrong document" })
      .expect(200)
  ).body;
  assert.deepEqual(retry.outcome, cancelled.outcome);
  await request(app)
    .post(route)
    .set(auth(customer.token))
    .send({ reason: "Changed reason" })
    .expect(409);
  const replay = (
    await request(app)
      .post("/api/orders")
      .set(auth(customer.token))
      .send(payload)
      .expect(200)
  ).body;
  assert.equal(replay._id, order._id);
  assert.equal(replay.status, "Cancelled");
  assert.equal(
    await Order.countDocuments({ requestKey: payload.requestKey }),
    1,
  );
  assert.ok(await Upload.exists({ _id: upload._id }));
  assert.equal(pushes.length, before);
  await request(app)
    .get(`/api/orders/${order._id}/files/${upload._id}`)
    .set(auth(customer.token))
    .expect(200)
    .expect("Content-Type", /pdf/);
  await request(app)
    .get(`/api/workspace/orders/${order._id}/files/${upload._id}`)
    .set(auth(owner.token))
    .expect(200);
  await request(app)
    .get(`/api/orders/${order._id}/files/${upload._id}`)
    .set(auth(other.token))
    .expect(404);
  const history = (
    await request(app).get("/api/orders").set(auth(customer.token)).expect(200)
  ).body;
  assert.equal(
    history.find((item) => item._id === order._id).status,
    "Cancelled",
  );
  const empty = await book();
  assert.equal(
    (
      await request(app)
        .post(`/api/orders/${empty.order._id}/cancel`)
        .set(auth(customer.token))
        .send({})
        .expect(200)
    ).body.outcome.reason,
    "",
  );
});

test("owners must be approved, scoped and provide a reason; legacy rejection respects its setting", async () => {
  const { order } = await book();
  const route = `/api/workspace/orders/${order._id}/reject`;
  await request(app)
    .post(route)
    .set(auth(customer.token))
    .send({ reason: "Cannot print" })
    .expect(403);
  await request(app)
    .post(route)
    .set(auth(otherOwner.token))
    .send({ reason: "Cannot print" })
    .expect(404);
  for (const reason of [undefined, "   ", 12, "x".repeat(501)])
    await request(app)
      .post(route)
      .set(auth(owner.token))
      .send({ reason })
      .expect(400);
  await Shop.updateOne({ _id: shop.id }, { registrationStatus: "submitted" });
  await request(app)
    .post(route)
    .set(auth(owner.token))
    .send({ reason: "Cannot print" })
    .expect(403);
  await request(app)
    .post(`/api/orders/${order._id}/reject`)
    .set(auth(shopToken))
    .send({ reason: "Cannot print" })
    .expect(403);
  await Shop.updateOne(
    { _id: shop.id },
    { registrationStatus: "approved", open: false },
  );
  const result = (
    await request(app)
      .post(route)
      .set(auth(owner.token))
      .send({ reason: "  Paper unavailable  " })
      .expect(200)
  ).body;
  assert.equal(result.status, "Rejected");
  assert.equal(result.outcome.reason, "Paper unavailable");
  assert.equal(result.outcome.actorId, owner.user.id);
  assert.equal(result.outcome.actorRole, "owner");
  const retry = (
    await request(app)
      .post(route)
      .set(auth(owner.token))
      .send({ reason: "Paper unavailable" })
      .expect(200)
  ).body;
  assert.deepEqual(retry.outcome, result.outcome);
  await request(app)
    .post(`/api/orders/${order._id}/cancel`)
    .set(auth(customer.token))
    .send({})
    .expect(409);
  const visible = (
    await request(app).get("/api/orders").set(auth(customer.token))
  ).body.find((item) => item._id === order._id);
  assert.equal(visible.outcome.reason, "Paper unavailable");
  await request(app)
    .get(`/api/workspace/orders/${order._id}/files/${upload._id}`)
    .set(auth(owner.token))
    .expect(200);
  await Shop.updateOne({ _id: shop.id }, { open: true });
  const legacyOrder = (await book()).order;
  const legacyRoute = `/api/orders/${legacyOrder._id}/reject`;
  await request(makeApp(false))
    .post(legacyRoute)
    .set(auth(shopToken))
    .send({ reason: "No stock" })
    .expect(401);
  await request(app)
    .post(legacyRoute)
    .set(auth(customer.token))
    .send({ reason: "No stock" })
    .expect(403);
  await request(app)
    .post(legacyRoute)
    .set(auth(shopToken))
    .send({ reason: " " })
    .expect(400);
  const rejected = (
    await request(app)
      .post(legacyRoute)
      .set(auth(shopToken))
      .send({ reason: "No stock" })
      .expect(200)
  ).body;
  assert.equal(rejected.outcome.actorRole, "shop");
  assert.equal(rejected.outcome.actorId, shop.id);
  await request(app)
    .post(legacyRoute)
    .set(auth(shopToken))
    .send({ reason: "No stock" })
    .expect(200);
  await request(app)
    .post(`/api/workspace/orders/${legacyOrder._id}/reject`)
    .set(auth(owner.token))
    .send({ reason: "No stock" })
    .expect(409);
});

test("only unpaid Preparing orders can end and terminal outcomes block all fulfillment paths", async () => {
  for (const [status, paymentStatus] of [
    ["Printing", "unpaid"],
    ["Ready for pickup", "unpaid"],
    ["Collected", "paid"],
    ["Queued", "paid"],
  ]) {
    const { order } = await book();
    await Order.updateOne({ _id: order._id }, { status, paymentStatus });
    await request(app)
      .post(`/api/orders/${order._id}/cancel`)
      .set(auth(customer.token))
      .send({})
      .expect(409);
    await request(app)
      .post(`/api/workspace/orders/${order._id}/reject`)
      .set(auth(owner.token))
      .send({ reason: "Cannot print" })
      .expect(409);
    await request(app)
      .post(`/api/orders/${order._id}/reject`)
      .set(auth(shopToken))
      .send({ reason: "Cannot print" })
      .expect(409);
    assert.equal((await Order.findById(order._id)).outcome, undefined);
  }
  for (const outcome of ["Cancelled", "Rejected"]) {
    const { order } = await book();
    const route =
      outcome === "Cancelled"
        ? `/api/orders/${order._id}/cancel`
        : `/api/workspace/orders/${order._id}/reject`;
    await request(app)
      .post(route)
      .set(auth(outcome === "Cancelled" ? customer.token : owner.token))
      .send({ reason: "Test outcome" })
      .expect(200);
    const competing =
      outcome === "Cancelled"
        ? `/api/workspace/orders/${order._id}/reject`
        : `/api/orders/${order._id}/cancel`;
    await request(app)
      .post(competing)
      .set(auth(outcome === "Cancelled" ? owner.token : customer.token))
      .send({ reason: "Other action" })
      .expect(409);
    for (const status of [
      undefined,
      "Printing",
      "Ready for pickup",
      "Collected",
      "Cancelled",
      "Rejected",
      "unknown",
    ]) {
      await request(app)
        .patch(`/api/workspace/orders/${order._id}/status`)
        .set(auth(owner.token))
        .send({ status })
        .expect(409);
      await request(app)
        .patch(`/api/orders/${order._id}/status`)
        .set(auth(shopToken))
        .send({ status })
        .expect(409);
    }
    await request(app)
      .post(`/api/workspace/orders/${order._id}/payment`)
      .set(auth(owner.token))
      .expect(409);
    await request(app)
      .post(`/api/orders/${order._id}/payment`)
      .set(auth(shopToken))
      .expect(409);
    const stored = await Order.findById(order._id);
    assert.equal(stored.status, outcome);
    assert.equal(stored.paymentStatus, "unpaid");
    assert.equal(stored.readyAt, undefined);
  }
  const historical = (await book()).order;
  await Order.updateOne(
    { _id: historical._id },
    { $unset: { paymentStatus: 1 } },
  );
  await request(app)
    .post(`/api/orders/${historical._id}/cancel`)
    .set(auth(customer.token))
    .send({})
    .expect(200);
});

test("competing cancellation, rejection and printing actions have exactly one winner", async () => {
  for (const pair of [
    ["cancel", "print"],
    ["cancel", "reject"],
    ["reject", "print"],
    ["cancel", "reject", "print"],
  ]) {
    const { order } = await book();
    const attempt = (action) =>
      action === "cancel"
        ? request(app)
            .post(`/api/orders/${order._id}/cancel`)
            .set(auth(customer.token))
            .send({ reason: "Wrong file" })
        : action === "reject"
          ? request(app)
              .post(`/api/workspace/orders/${order._id}/reject`)
              .set(auth(owner.token))
              .send({ reason: "No paper" })
          : request(app)
              .patch(`/api/workspace/orders/${order._id}/status`)
              .set(auth(owner.token))
              .send({ status: "Printing" });
    const results = await Promise.all(pair.map(attempt));
    assert.equal(results.filter((result) => result.status === 200).length, 1);
    assert.equal(
      results.filter((result) => result.status === 409).length,
      pair.length - 1,
    );
    const winner = results.find((result) => result.status === 200).body;
    const stored = await Order.findById(order._id);
    assert.equal(stored.status, winner.status);
    assert.equal(stored.outcome?.reason, winner.outcome?.reason);
  }
  const { order } = await book();
  const retries = await Promise.all(
    [1, 2, 3].map(() =>
      request(app)
        .post(`/api/orders/${order._id}/cancel`)
        .set(auth(customer.token))
        .send({ reason: "Duplicate request" }),
    ),
  );
  assert.deepEqual(
    retries.map((result) => result.status),
    [200, 200, 200],
  );
  assert.equal(
    new Set(retries.map((result) => result.body.outcome.at)).size,
    1,
  );
});
