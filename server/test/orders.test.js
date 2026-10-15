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

test("hosted PDFs survive API recreation in private GridFS storage", async () => {
  const settings = {
    secret: "test-secret-with-at-least-32-characters",
    shopPin: "2468",
    fileStorage: gridFsStorage(),
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
  };
  Object.assign(process.env, {
    MONGODB_URI: mongo.getUri(),
    JWT_SECRET: "test-secret-with-at-least-32-characters",
    SHOP_PIN: "2468",
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
