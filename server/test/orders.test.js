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
import { gridFsStorage } from "../src/storage.js";
import express from "express";
import hostedHandler from "../../api/index.js";
import { Order, Upload, Shop, User, seedShops } from "../src/models.js";
import { seedDemoOwner, demoOwner } from "../src/demo-owner.js";
import { promoteAdmin } from "../src/admin-account.js";

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
    enableLegacyShopAccess: true,
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
test("private PDF previews allow local blobs while retaining other security restrictions", async () => {
  const response = await request(app).get("/api/health").expect(200);
  const policy = response.headers["content-security-policy"];
  assert.match(policy, /(?:^|;)frame-src 'self' blob:(?:;|$)/);
  assert.match(policy, /(?:^|;)object-src blob:(?:;|$)/);
  assert.match(policy, /(?:^|;)script-src 'self'(?:;|$)/);
  assert.match(policy, /(?:^|;)frame-ancestors 'self'(?:;|$)/);
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
    .post(`/api/orders/${order._id}/payment`)
    .set(auth(shopToken))
    .expect(200);
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

test("hosted PDFs survive API recreation in private GridFS storage", async () => {
  const settings = {
    secret: "test-secret-with-at-least-32-characters",
    shopPin: "2468",
    fileStorage: gridFsStorage(),
    enableLegacyShopAccess: true,
    maxUploadBytes: 3 * 1024 * 1024,
    trustProxy: true,
  };
  const hosted = createApp(settings);
  const config = await request(hosted).get("/api/config");
  assert.equal(config.body.maxUploadBytes, 3 * 1024 * 1024);
  const uploaded = await request(hosted)
    .post("/api/uploads")
    .set(auth(customer))
    .attach("files", pdf, "hosted.pdf");
  assert.equal(uploaded.status, 201);
  const hostedFile = uploaded.body[0];
  const booked = await request(hosted)
    .post("/api/orders")
    .set(auth(customer))
    .send({
      ...payload(),
      fileIds: [hostedFile._id],
      requestKey: randomUUID(),
    });
  assert.equal(booked.status, 201);
  const recreated = createApp(settings);
  const route = `/api/orders/${booked.body._id}/files/${hostedFile._id}`;
  const downloaded = await request(recreated).get(route).set(auth(shopToken));
  assert.equal(downloaded.status, 200);
  assert.deepEqual(downloaded.body, pdf);
  assert.equal(
    (await request(recreated).get(route).set(auth(other))).status,
    404,
  );
  assert.equal((await request(recreated).get(route)).status, 401);
});

test("hosted upload limit rejects large PDFs before writing to storage", async () => {
  let writes = 0;
  const limited = createApp({
    secret: "test-secret-with-at-least-32-characters",
    shopPin: "2468",
    maxUploadBytes: 10,
    fileStorage: {
      put() {
        writes++;
      },
      remove() {},
      read() {},
    },
  });
  const result = await request(limited)
    .post("/api/uploads")
    .set(auth(customer))
    .attach("files", pdf, "large.pdf");
  assert.equal(result.status, 400);
  assert.equal(writes, 0);
});

test("Vercel entry point connects to MongoDB and serves API routes", async () => {
  const original = {
    MONGODB_URI: process.env.MONGODB_URI,
    JWT_SECRET: process.env.JWT_SECRET,
    SHOP_PIN: process.env.SHOP_PIN,
    ENABLE_LEGACY_SHOP_ACCESS: process.env.ENABLE_LEGACY_SHOP_ACCESS,
  };
  Object.assign(process.env, {
    MONGODB_URI: mongo.getUri(),
    JWT_SECRET: "test-secret-with-at-least-32-characters",
    SHOP_PIN: "2468",
    ENABLE_LEGACY_SHOP_ACCESS: "true",
  });
  try {
    const entry = express();
    entry.use(hostedHandler);
    await request(entry).get("/api/health").expect(200, { ok: true });
    const config = await request(entry).get("/api/config").expect(200);
    assert.equal(config.body.maxUploadBytes, 3 * 1024 * 1024);
    const shops = await request(entry)
      .get("/api/shops")
      .set(auth(customer))
      .expect(200);
    assert.equal(shops.body.length, 3);
    const uploaded = await request(entry)
      .post("/api/uploads")
      .set(auth(customer))
      .attach("files", pdf, "function-upload.pdf")
      .expect(201);
    const booked = await request(entry)
      .post("/api/orders")
      .set(auth(customer))
      .send({
        ...payload(),
        fileIds: [uploaded.body[0]._id],
        requestKey: randomUUID(),
      })
      .expect(201);
    await request(entry)
      .get(`/api/orders/${booked.body._id}/files/${uploaded.body[0]._id}`)
      .set(auth(shopToken))
      .expect(200);
  } finally {
    for (const [name, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("email accounts hash passwords, validate credentials, and persist preferences", async () => {
  const email = `account-${randomUUID()}@example.test`;
  const password = "A-test-password-1234";
  await request(app)
    .post("/api/auth/signup")
    .send({ name: "Test Person", email, password: "short" })
    .expect(400);
  const created = await request(app)
    .post("/api/auth/signup")
    .send({ name: "Test Person", email, password })
    .expect(201);
  assert.equal(created.body.user.email, email);
  assert.equal(created.body.passwordHash, undefined);
  const stored = await User.findOne({ email }).select("+passwordHash");
  assert.notEqual(stored.passwordHash, password);
  assert.match(stored.passwordHash, /^[a-f0-9]{32}:[a-f0-9]{128}$/);
  await request(app)
    .post("/api/auth/signup")
    .send({ name: "Duplicate", email: email.toUpperCase(), password })
    .expect(409);
  await request(app)
    .post("/api/auth/login")
    .send({ email, password: "wrong-password" })
    .expect(401);
  await request(app)
    .post("/api/auth/login")
    .send({ email: { $ne: null }, password })
    .expect(401);
  const login = await request(app)
    .post("/api/auth/login")
    .send({ email: ` ${email.toUpperCase()} `, password })
    .expect(200);
  assert.equal(login.body.user.id, created.body.user.id);
  const edited = await request(app)
    .patch("/api/auth/me")
    .set(auth(login.body.token))
    .send({ name: "Updated Name", defaultPaper: "Legal", reducedMotion: true })
    .expect(200);
  assert.equal(edited.body.reducedMotion, true);
  assert.equal(edited.body.name, "Updated Name");
  await request(app)
    .patch("/api/auth/me")
    .set(auth(login.body.token))
    .send({ email: "someone@example.test" })
    .expect(400);
  await request(app).get("/api/auth/me").set(auth(customer)).expect(401);
  const restored = await request(app)
    .get("/api/auth/me")
    .set(auth(created.body.token))
    .expect(200);
  assert.equal(restored.body.defaultPaper, "Legal");
  assert.equal(restored.body.passwordHash, undefined);
});

test("supplied account phone numbers require exactly eleven digits on signup and profile edits", async () => {
  const phoneApp = createApp({
    secret: "phone-test-secret-with-at-least-32-characters",
    uploadDir: folder,
  });
  const account = {
    name: "Phone Test",
    email: `phone-${randomUUID()}@example.test`,
    password: "Phone-test-password-123",
  };
  for (const phone of [
    "",
    "09123",
    "091234567890",
    "0912345678x",
    "+639123456789",
    "09123 456789",
    9123456789,
  ]) {
    const rejected = await request(phoneApp)
      .post("/api/auth/signup")
      .send({ ...account, phone })
      .expect(400);
    assert.match(rejected.body.message, /11-digit/);
  }
  assert.equal(await User.countDocuments({ email: account.email }), 0);
  const created = await request(phoneApp)
    .post("/api/auth/signup")
    .send({ ...account, phone: "09123456789" })
    .expect(201);
  assert.equal(created.body.user.phone, "09123456789");
  for (const phone of ["", "123", "091234567890", "abcdefghijk"]) {
    await request(phoneApp)
      .patch("/api/auth/me")
      .set(auth(created.body.token))
      .send({ phone })
      .expect(400);
  }
  const unchanged = await request(phoneApp)
    .get("/api/auth/me")
    .set(auth(created.body.token))
    .expect(200);
  assert.equal(unchanged.body.phone, "09123456789");
  const updated = await request(phoneApp)
    .patch("/api/auth/me")
    .set(auth(created.body.token))
    .send({ phone: "09987654321" })
    .expect(200);
  assert.equal(updated.body.phone, "09987654321");
  await request(phoneApp)
    .post("/api/auth/login")
    .send({ email: account.email, password: account.password })
    .expect(200);
});

test("account orders survive new logins, stay private, and revoked tokens cannot renew as guests", async () => {
  const email = `owner-${randomUUID()}@example.test`;
  const password = "Another-test-password-123";
  const first = (
    await request(app)
      .post("/api/auth/signup")
      .send({ name: "Account Owner", email, password })
      .expect(201)
  ).body;
  const second = (
    await request(app)
      .post("/api/auth/login")
      .send({ email, password })
      .expect(200)
  ).body;
  const outsider = (
    await request(app)
      .post("/api/auth/signup")
      .send({
        name: "Other Account",
        email: `other-${randomUUID()}@example.test`,
        password,
      })
      .expect(201)
  ).body;
  const uploaded = await request(app)
    .post("/api/uploads")
    .set(auth(first.token))
    .attach("files", pdf, "account-document.pdf")
    .expect(201);
  const fileId = uploaded.body[0]._id;
  const booked = await request(app)
    .post("/api/orders")
    .set(auth(first.token))
    .send({ ...payload(), fileIds: [fileId], requestKey: randomUUID() })
    .expect(201);
  const list = await request(app)
    .get("/api/orders")
    .set(auth(second.token))
    .expect(200);
  assert.equal(list.body[0]._id, booked.body._id);
  await request(app)
    .get(`/api/orders/${booked.body._id}/files/${fileId}`)
    .set(auth(outsider.token))
    .expect(404);
  const outsiderList = await request(app)
    .get("/api/orders")
    .set(auth(outsider.token))
    .expect(200);
  assert.equal(outsiderList.body.length, 0);
  await request(app)
    .post("/api/auth/logout")
    .set(auth(first.token))
    .expect(200);
  await request(app).get("/api/orders").set(auth(first.token)).expect(401);
  await request(app).post("/api/session").set(auth(first.token)).expect(401);
  await request(app).get("/api/orders").set(auth(second.token)).expect(200);
  const jwt = (await import("jsonwebtoken")).default;
  const claims = jwt.verify(
    second.token,
    "test-secret-with-at-least-32-characters",
  );
  const expired = jwt.sign(
    { id: claims.id, role: "customer", account: true, sid: claims.sid },
    "test-secret-with-at-least-32-characters",
    { expiresIn: -1 },
  );
  await request(app).get("/api/orders").set(auth(expired)).expect(401);
  await request(app).post("/api/session").set(auth(expired)).expect(401);
});

test("owner registrations stay private and cannot self-approve", async () => {
  const signup = await request(app).post("/api/auth/signup").send({
    name: "Shop Owner",
    email: "owner-workspace@example.test",
    password: "A-safe-preview-password",
    accountType: "owner",
    phone: "09123456789",
  });
  assert.equal(signup.status, 201);
  const token = signup.body.token;
  assert.equal(signup.body.user.accountType, "owner");
  assert.equal(
    (await request(app).get("/api/workspace").set(auth(customer))).status,
    403,
  );
  assert.equal(
    (
      await request(app)
        .patch("/api/auth/me")
        .set(auth(token))
        .send({ accountType: "owner" })
    ).status,
    400,
  );
  const draft = await request(app).put("/api/workspace").set(auth(token)).send({
    name: "Private Test Prints",
    representative: "Shop Owner",
    address: "Sample Street, Naga City",
    contact: "09123456789",
    email: "shop@example.test",
    hours: "8 AM–6 PM",
    monoRate: 2,
    colorRate: 8,
  });
  assert.equal(draft.status, 200);
  assert.equal(draft.body.registrationStatus, "draft");
  const shops = (await request(app).get("/api/shops").set(auth(customer))).body;
  assert.equal(
    shops.some((s) => s._id === draft.body._id),
    false,
  );
  assert.equal(
    (
      await request(app)
        .post("/api/workspace/submit")
        .set(auth(token))
        .send({ confirm: true })
    ).status,
    400,
  );
  const docs = await request(app)
    .post("/api/workspace/documents")
    .set(auth(token))
    .attach("files", pdf, "permit.pdf")
    .attach("files", pdf, "registration.pdf")
    .attach("files", pdf, "owner-id.pdf");
  assert.equal(docs.status, 201);
  assert.equal(docs.body.documents.length, 3);
  assert.equal(
    docs.body.documents.some((d) => d.path),
    false,
  );
  const submitted = await request(app)
    .post("/api/workspace/submit")
    .set(auth(token))
    .send({ confirm: true });
  assert.equal(submitted.status, 200);
  assert.equal(submitted.body.registrationStatus, "submitted");
  const another = (
    await request(app).post("/api/auth/signup").send({
      name: "Another Owner",
      email: "another-owner@example.test",
      password: "A-safe-preview-password",
      accountType: "owner",
    })
  ).body;
  assert.equal(
    (await request(app).get("/api/workspace").set(auth(another.token))).body,
    null,
  );
  const pending = await request(app)
    .post("/api/orders")
    .set(auth(customer))
    .send({
      shopId: draft.body._id,
      fileIds: [file._id],
      settings: {
        paper: "A4",
        color: "Black & white",
        sides: "Single-sided",
        copies: 1,
      },
      requestKey: randomUUID(),
    });
  assert.equal(pending.status, 409);
  assert.equal(
    (
      await request(app)
        .patch("/api/workspace/orders/" + order._id + "/status")
        .set(auth(token))
        .send({ status: "Printing" })
    ).status,
    403,
  );
});

test("approved owners can act only on their shop orders and collect after payment", async () => {
  const login = (
    await request(app).post("/api/auth/login").send({
      email: "owner-workspace@example.test",
      password: "A-safe-preview-password",
    })
  ).body;
  const owned = await Shop.findOne({ owner: login.user.id });
  owned.registrationStatus = "approved";
  owned.open = true;
  await owned.save();
  const another = (
    await request(app).post("/api/auth/login").send({
      email: "another-owner@example.test",
      password: "A-safe-preview-password",
    })
  ).body;
  const settings = {
    paper: "A4",
    color: "Black & white",
    sides: "Single-sided",
    copies: 1,
    pageRange: "1",
    finishing: "No binding",
  };
  const created = await request(app)
    .post("/api/orders")
    .set(auth(customer))
    .send({
      shopId: owned.id,
      fileIds: [file._id],
      settings,
      requestKey: randomUUID(),
      paymentMethod: "pickup",
    });
  assert.equal(created.status, 201);
  assert.equal(created.body.amount, 2);
  assert.equal(created.body.pages, 1);
  assert.equal(created.body.shop.documents, undefined);
  assert.equal(
    (await request(app).get("/api/workspace/orders").set(auth(login.token)))
      .body.length,
    1,
  );
  const base = "/api/workspace/orders/" + created.body._id;
  assert.equal(
    (
      await request(app)
        .get(base + "/files/" + file._id)
        .set(auth(login.token))
    ).status,
    200,
  );
  assert.equal(
    (
      await request(app)
        .get(base + "/files/" + file._id)
        .set(auth(another.token))
    ).status,
    404,
  );
  assert.equal(
    (
      await request(app)
        .patch("/api/workspace/orders/" + order._id + "/status")
        .set(auth(login.token))
        .send({ status: "Printing" })
    ).status,
    404,
  );
  assert.equal(
    (
      await request(app)
        .post(base + "/payment")
        .set(auth(login.token))
    ).status,
    409,
  );
  assert.equal(
    (
      await request(app)
        .patch(base + "/status")
        .set(auth(login.token))
        .send({ status: "Ready for pickup" })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(app)
        .patch(base + "/status")
        .set(auth(login.token))
        .send({ status: "Printing" })
    ).status,
    200,
  );
  const ready = await request(app)
    .patch(base + "/status")
    .set(auth(login.token))
    .send({ status: "Ready for pickup" });
  assert.equal(ready.status, 200);
  assert.ok(ready.body.readyAt);
  assert.equal(
    (
      await request(app)
        .patch(base + "/status")
        .set(auth(login.token))
        .send({ status: "Collected" })
    ).status,
    409,
  );
  const paid = await request(app)
    .post(base + "/payment")
    .set(auth(login.token));
  assert.equal(paid.status, 200);
  assert.equal(paid.body.paymentStatus, "paid");
  assert.equal(
    (
      await request(app)
        .patch(base + "/status")
        .set(auth(login.token))
        .send({ status: "Collected" })
    ).status,
    200,
  );
  await request(app).post("/api/auth/logout").set(auth(login.token));
  assert.equal(
    (await request(app).get("/api/workspace/orders").set(auth(login.token)))
      .status,
    401,
  );
});

test("page ranges are validated and GCash cannot create a pretend paid order", async () => {
  const book = {
    shopId: shop._id,
    fileIds: [file._id],
    settings: {
      paper: "A4",
      color: "Black & white",
      sides: "Single-sided",
      copies: 1,
      pageRange: "1-2, 2",
    },
    requestKey: randomUUID(),
  };
  const quote = await request(app)
    .post("/api/quote")
    .set(auth(customer))
    .send(book);
  assert.equal(quote.status, 200);
  assert.equal(quote.body.pages, 2);
  for (const pageRange of ["0", "3", "2-1", "1,,2", "x"]) {
    assert.equal(
      (
        await request(app)
          .post("/api/quote")
          .set(auth(customer))
          .send({ ...book, settings: { ...book.settings, pageRange } })
      ).status,
      400,
    );
  }
  assert.equal(
    (
      await request(app)
        .post("/api/orders")
        .set(auth(customer))
        .send({ ...book, paymentMethod: "gcash" })
    ).status,
    409,
  );
  assert.equal(
    (
      await request(app)
        .post("/api/orders")
        .set(auth(customer))
        .send({ ...book, requestKey: { $ne: "" } })
    ).status,
    400,
  );
});
test("local demo seeds a usable owner without resetting the account on restart", async () => {
  await seedDemoOwner();
  const first = await User.findOne({ email: demoOwner.email }).select(
    "+passwordHash",
  );
  const demoShop = await Shop.findById("70617072696e740000000001");
  assert.equal(first.accountType, "owner");
  assert.equal(String(demoShop.owner), first.id);
  assert.equal(demoShop.registrationStatus, "approved");
  await seedDemoOwner();
  assert.equal(
    (await User.findById(first.id).select("+passwordHash")).passwordHash,
    first.passwordHash,
  );
  const login = await request(app).post("/api/auth/login").send(demoOwner);
  assert.equal(login.status, 200);
  const workspace = await request(app)
    .get("/api/workspace")
    .set(auth(login.body.token));
  assert.equal(workspace.status, 200);
  assert.equal(workspace.body._id, demoShop.id);
});

test("admin promotion is explicit, revokes sessions and cannot elevate owners or public signups", async () => {
  await request(app)
    .post("/api/auth/signup")
    .send({
      name: "Intruder",
      email: "intruder@example.test",
      password: "Strong-password-123",
      accountType: "admin",
    })
    .expect(400);
  const signup = await request(app)
    .post("/api/auth/signup")
    .send({
      name: "Reviewer",
      email: "reviewer@example.test",
      password: "Strong-password-123",
    })
    .expect(201);
  await request(app)
    .get("/api/admin/shops")
    .set(auth(signup.body.token))
    .expect(403);
  await request(app)
    .patch("/api/auth/me")
    .set(auth(signup.body.token))
    .send({ accountType: "admin" })
    .expect(400);
  await assert.rejects(
    promoteAdmin("owner-workspace@example.test"),
    /Owner accounts/,
  );
  await assert.rejects(
    promoteAdmin("absent@example.test"),
    /Create a customer/,
  );
  await promoteAdmin("reviewer@example.test");
  await request(app)
    .get("/api/auth/me")
    .set(auth(signup.body.token))
    .expect(401);
});

test("partner rejection, private document replacement, resubmission and approval form a complete flow", async () => {
  const admin = (
    await request(app)
      .post("/api/auth/login")
      .send({ email: "reviewer@example.test", password: "Strong-password-123" })
      .expect(200)
  ).body.token;
  const ownerSignup = await request(app)
    .post("/api/auth/signup")
    .send({
      name: "Pilot Owner",
      email: "pilot-owner@example.test",
      password: "Strong-password-123",
      accountType: "owner",
    })
    .expect(201);
  const owner = ownerSignup.body.token;
  const details = {
    name: "Pilot Prints",
    representative: "Pilot Owner",
    address: "Pilot Street, Naga City",
    contact: "09123456789",
    email: "pilot-shop@example.test",
    hours: "8 AM–5 PM",
    monoRate: 2,
    colorRate: 8,
  };
  const draft = (
    await request(app)
      .put("/api/workspace")
      .set(auth(owner))
      .send(details)
      .expect(200)
  ).body;
  const uploaded = (
    await request(app)
      .post("/api/workspace/documents")
      .set(auth(owner))
      .attach("files", pdf, "permit.pdf")
      .attach("files", pdf, "proof.pdf")
      .attach("files", pdf, "id.pdf")
      .expect(201)
  ).body;
  const url = `/api/admin/shops/${draft._id}`;
  const docUrl = `${url}/documents/${uploaded.documents[0]._id}`;
  await request(app).get(url).expect(401);
  await request(app).get(docUrl).set(auth(owner)).expect(403);
  await request(app).get(docUrl).set(auth(customer)).expect(403);
  await request(app)
    .get(docUrl)
    .set(auth(admin))
    .expect(200)
    .expect("Content-Type", /pdf/);
  await request(app)
    .get(`${url}/documents/000000000000000000000000`)
    .set(auth(admin))
    .expect(404);
  await request(app)
    .patch("/api/workspace/operations")
    .set(auth(owner))
    .send({ ...details, open: true })
    .expect(403);
  let submitted = (
    await request(app)
      .post("/api/workspace/submit")
      .set(auth(owner))
      .send({ confirm: true })
      .expect(200)
  ).body;
  assert.equal(submitted.submissionVersion, 1);
  const listed = (
    await request(app).get("/api/admin/shops").set(auth(admin)).expect(200)
  ).body;
  assert.ok(listed.some((shop) => shop._id === draft._id));
  assert.ok(!JSON.stringify(listed).includes('"path":'));
  await request(app)
    .post(`${url}/decision`)
    .set(auth(owner))
    .send({ decision: "approved", submissionVersion: 1 })
    .expect(403);
  await request(app)
    .post(`${url}/decision`)
    .set(auth(admin))
    .send({ decision: "rejected", submissionVersion: 1 })
    .expect(400);
  const rejected = (
    await request(app)
      .post(`${url}/decision`)
      .set(auth(admin))
      .send({
        decision: "rejected",
        reason: "Replace the blurred permit",
        submissionVersion: 1,
      })
      .expect(200)
  ).body;
  assert.equal(
    rejected.reviews[0].reviewer,
    (await User.findOne({ email: "reviewer@example.test" })).id,
  );
  assert.ok(rejected.reviews[0].at);
  await request(app)
    .post(`${url}/decision`)
    .set(auth(admin))
    .send({ decision: "approved", submissionVersion: 1 })
    .expect(409);
  assert.equal(
    (await request(app).get("/api/shops").set(auth(customer))).body.some(
      (shop) => shop._id === draft._id,
    ),
    false,
  );
  await request(app)
    .put("/api/workspace")
    .set(auth(owner))
    .send({ ...details, contact: "09999999999" })
    .expect(200);
  assert.equal(
    (await request(app).get("/api/workspace").set(auth(owner))).body
      .rejectionReason,
    "Replace the blurred permit",
  );
  await request(app)
    .delete(`/api/workspace/documents/${uploaded.documents[0]._id}`)
    .set(auth(owner))
    .expect(200);
  await request(app).get(docUrl).set(auth(admin)).expect(404);
  await request(app)
    .post("/api/workspace/submit")
    .set(auth(owner))
    .send({ confirm: true })
    .expect(400);
  await request(app)
    .post("/api/workspace/documents")
    .set(auth(owner))
    .attach("files", pdf, "clear-permit.pdf")
    .expect(201);
  submitted = (
    await request(app)
      .post("/api/workspace/submit")
      .set(auth(owner))
      .send({ confirm: true })
      .expect(200)
  ).body;
  assert.equal(submitted.submissionVersion, 2);
  assert.equal(submitted.rejectionReason, "");
  await request(app)
    .post(`${url}/decision`)
    .set(auth(admin))
    .send({ decision: "approved", submissionVersion: 1 })
    .expect(409);
  const decisions = await Promise.all(
    ["approved", "rejected"].map((decision) =>
      request(app)
        .post(`${url}/decision`)
        .set(auth(admin))
        .send({ decision, reason: "Review complete", submissionVersion: 2 }),
    ),
  );
  assert.deepEqual(decisions.map((result) => result.status).sort(), [200, 409]);
  // Both races are valid; ensure this fixture ends approved for the next test.
  if (decisions[0].status !== 200) {
    await request(app)
      .post("/api/workspace/submit")
      .set(auth(owner))
      .send({ confirm: true })
      .expect(200);
    await request(app)
      .post(`${url}/decision`)
      .set(auth(admin))
      .send({ decision: "approved", submissionVersion: 3 })
      .expect(200);
  }
  const approved = (await request(app).get(url).set(auth(admin))).body;
  assert.equal(approved.open, false);
  await request(app)
    .put("/api/workspace")
    .set(auth(owner))
    .send(details)
    .expect(409);
  await request(app)
    .delete(`/api/workspace/documents/${uploaded.documents[1]._id}`)
    .set(auth(owner))
    .expect(409);
  await request(app)
    .post("/api/workspace/documents")
    .set(auth(owner))
    .attach("files", pdf, "extra.pdf")
    .expect(409);
  // Authorization follows the database rather than the role returned at login.
  await User.updateOne(
    { email: "reviewer@example.test" },
    { accountType: "customer" },
  );
  await request(app).get(url).set(auth(admin)).expect(403);
  await User.updateOne(
    { email: "reviewer@example.test" },
    { accountType: "admin" },
  );
});

test("operating controls preserve identity, historical totals, file order and require renewed price confirmation", async () => {
  const owner = (
    await request(app).post("/api/auth/login").send({
      email: "pilot-owner@example.test",
      password: "Strong-password-123",
    })
  ).body.token;
  const pilot = await Shop.findOne({ name: "Pilot Prints" });
  const uploads = (
    await request(app)
      .post("/api/uploads")
      .set(auth(customer))
      .attach("files", pdf, "first.pdf")
      .attach("files", pdf, "second.pdf")
      .expect(201)
  ).body;
  const booking = {
    ...payload(),
    shopId: pilot.id,
    fileIds: [uploads[1]._id, uploads[0]._id],
    settings: {
      paper: "A4",
      color: "Black & white",
      sides: "Single-sided",
      copies: 1,
      pageRange: "2-3",
    },
    expectedAmount: 4,
    requestKey: randomUUID(),
  };
  await request(app)
    .post("/api/quote")
    .set(auth(customer))
    .send(booking)
    .expect(409);
  const operations = {
    hours: "9 AM–6 PM",
    contact: "09111111111",
    monoRate: 2,
    colorRate: 8,
    open: true,
  };
  await request(app)
    .patch("/api/workspace/operations")
    .set(auth(customer))
    .send(operations)
    .expect(403);
  await request(app)
    .patch("/api/workspace/operations")
    .set(auth(owner))
    .send({ ...operations, name: "Changed identity" })
    .expect(400);
  await request(app)
    .patch("/api/workspace/operations")
    .set(auth(owner))
    .send({ ...operations, monoRate: -1 })
    .expect(400);
  await request(app)
    .patch("/api/workspace/operations")
    .set(auth(owner))
    .send(operations)
    .expect(200);
  const created = (
    await request(app)
      .post("/api/orders")
      .set(auth(customer))
      .send(booking)
      .expect(201)
  ).body;
  assert.deepEqual(
    created.files.map((file) => file.upload),
    booking.fileIds,
  );
  assert.equal(created.pages, 2);
  assert.equal(created.amount, 4);
  await request(app)
    .patch("/api/workspace/operations")
    .set(auth(owner))
    .send({ ...operations, monoRate: 3 })
    .expect(200);
  await request(app)
    .post("/api/quote")
    .set(auth(customer))
    .send({
      ...booking,
      fileIds: booking.fileIds.map((id) => id.toUpperCase()),
    })
    .expect(200);
  const nextBooking = { ...booking, requestKey: randomUUID() };
  const changed = (
    await request(app)
      .post("/api/orders")
      .set(auth(customer))
      .send(nextBooking)
      .expect(409)
  ).body;
  assert.equal(changed.code, "PRICE_CHANGED");
  assert.equal(changed.amount, 6);
  assert.equal(
    await Order.countDocuments({ requestKey: nextBooking.requestKey }),
    0,
  );
  await request(app)
    .post("/api/orders")
    .set(auth(customer))
    .send({ ...nextBooking, expectedAmount: 6 })
    .expect(201);
  await request(app)
    .patch("/api/workspace/operations")
    .set(auth(owner))
    .send({ ...operations, open: false })
    .expect(200);
  await request(app)
    .post("/api/orders")
    .set(auth(customer))
    .send({ ...booking, requestKey: randomUUID() })
    .expect(409);
  await request(app)
    .post("/api/quote")
    .set(auth(customer))
    .send(booking)
    .expect(409);
  for (const status of ["Printing", "Ready for pickup"])
    await request(app)
      .patch(`/api/workspace/orders/${created._id}/status`)
      .set(auth(owner))
      .send({ status })
      .expect(200);
  await request(app)
    .patch(`/api/workspace/orders/${created._id}/status`)
    .set(auth(owner))
    .send({ status: "Collected" })
    .expect(409);
  await request(app)
    .post(`/api/workspace/orders/${created._id}/payment`)
    .set(auth(owner))
    .expect(200);
  await request(app)
    .patch(`/api/workspace/orders/${created._id}/status`)
    .set(auth(owner))
    .send({ status: "Collected" })
    .expect(200);
  const historical = await Order.findById(created._id);
  assert.equal(historical.amount, 4);
  assert.equal(historical.status, "Collected");
  assert.equal((await Shop.findById(pilot.id)).name, "Pilot Prints");
});

test("operating settings use atomic versions to reject stale and racing saves", async () => {
  const account = (
    await request(app)
      .post("/api/auth/signup")
      .send({
        name: "Concurrent Owner",
        email: "concurrent-owner@example.test",
        password: "Strong-password-123",
        accountType: "owner",
      })
      .expect(201)
  ).body;
  const partner = await Shop.create({
    name: "Concurrent Prints",
    address: "Sample Street, Naga City",
    owner: account.user.id,
    registrationStatus: "approved",
    hours: "8 AM–6 PM",
    contact: "09123456789",
    monoRate: 2,
    colorRate: 8,
    open: true,
  });
  const initial = (
    await request(app)
      .get("/api/workspace")
      .set(auth(account.token))
      .expect(200)
  ).body;
  const settings = {
    hours: initial.hours,
    contact: initial.contact,
    monoRate: 3,
    colorRate: 8,
    open: true,
    expectedVersion: initial.__v,
  };
  const results = await Promise.all(
    [3, 4].map((monoRate) =>
      request(app)
        .patch("/api/workspace/operations")
        .set(auth(account.token))
        .send({ ...settings, monoRate }),
    ),
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  const winner = results.find((r) => r.status === 200).body;
  const stored = await Shop.findById(partner.id);
  assert.equal(stored.monoRate, winner.monoRate);
  assert.equal(stored.__v, initial.__v + 1);
  await request(app)
    .patch("/api/workspace/operations")
    .set(auth(account.token))
    .send(settings)
    .expect(409);
  assert.equal((await Shop.findById(partner.id)).monoRate, winner.monoRate);
  await request(app)
    .patch("/api/workspace/operations")
    .set(auth(account.token))
    .send({ ...settings, expectedVersion: winner.__v, open: false })
    .expect(200);
  assert.equal((await Shop.findById(partner.id)).open, false);
});

test("registration submission refuses details changed after review", async () => {
  const reviewApp = createApp({
    secret: "test-secret-with-at-least-32-characters",
    uploadDir: folder,
  });
  const account = (
    await request(reviewApp)
      .post("/api/auth/signup")
      .send({
        name: "Review Owner",
        email: "review-owner@example.test",
        password: "Strong-password-123",
        accountType: "owner",
      })
      .expect(201)
  ).body;
  const details = {
    name: "Review Prints",
    representative: "Review Owner",
    address: "Sample Street, Naga City",
    contact: "09123456789",
    email: "review@example.test",
    hours: "8 AM–6 PM",
    monoRate: 2,
    colorRate: 8,
  };
  await request(reviewApp)
    .put("/api/workspace")
    .set(auth(account.token))
    .send(details)
    .expect(200);
  const reviewed = (
    await request(reviewApp)
      .post("/api/workspace/documents")
      .set(auth(account.token))
      .attach("files", pdf, "permit.pdf")
      .attach("files", pdf, "registration.pdf")
      .attach("files", pdf, "id.pdf")
      .expect(201)
  ).body;
  const changed = (
    await request(reviewApp)
      .put("/api/workspace")
      .set(auth(account.token))
      .send({ ...details, name: "Updated Review Prints" })
      .expect(200)
  ).body;
  await request(reviewApp)
    .post("/api/workspace/submit")
    .set(auth(account.token))
    .send({ confirm: true, expectedVersion: reviewed.__v })
    .expect(409);
  assert.equal((await Shop.findById(changed._id)).registrationStatus, "draft");
  const submitted = (
    await request(reviewApp)
      .post("/api/workspace/submit")
      .set(auth(account.token))
      .send({ confirm: true, expectedVersion: changed.__v })
      .expect(200)
  ).body;
  assert.equal(submitted.name, "Updated Review Prints");
  assert.equal(submitted.registrationStatus, "submitted");
});

test("legacy access defaults off, rejects existing PIN tokens, and enforces payment and approval when enabled", async () => {
  const disabled = createApp({
    secret: "test-secret-with-at-least-32-characters",
    shopPin: "2468",
    uploadDir: folder,
  });
  await request(disabled)
    .post("/api/shop-session")
    .send({ pin: "2468", shopId: shop._id })
    .expect(403);
  await request(disabled).get("/api/orders").set(auth(shopToken)).expect(401);
  const created = (
    await request(app)
      .post("/api/orders")
      .set(auth(customer))
      .send({ ...payload(), requestKey: randomUUID() })
      .expect(201)
  ).body;
  const pilot = await Shop.findOne({ name: "Pilot Prints" });
  const legacyPilot = (
    await request(app)
      .post("/api/shop-session")
      .send({ pin: "2468", shopId: pilot.id })
      .expect(200)
  ).body;
  assert.equal(legacyPilot.shop.documents, undefined);
  assert.equal(legacyPilot.shop.reviews, undefined);
  const route = `/api/orders/${created._id}`;
  await request(app).post(`${route}/payment`).set(auth(shopToken)).expect(409);
  for (const status of ["Printing", "Ready for pickup"])
    await request(app)
      .patch(`${route}/status`)
      .set(auth(shopToken))
      .send({ status })
      .expect(200);
  await request(app)
    .patch(`${route}/status`)
    .set(auth(shopToken))
    .send({ status: "Collected" })
    .expect(409);
  await request(app)
    .post(`${route}/payment`)
    .set(auth(otherShopToken))
    .expect(409);
  await request(app).post(`${route}/payment`).set(auth(shopToken)).expect(200);
  await request(app)
    .patch(`${route}/status`)
    .set(auth(shopToken))
    .send({ status: "Collected" })
    .expect(200);
  await Shop.updateOne({ _id: shop._id }, { registrationStatus: "rejected" });
  await request(app)
    .post("/api/shop-session")
    .send({ pin: "2468", shopId: shop._id })
    .expect(403);
  await request(app).post(`${route}/payment`).set(auth(shopToken)).expect(403);
  await Shop.updateOne({ _id: shop._id }, { registrationStatus: "approved" });
});
