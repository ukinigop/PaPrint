import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { createApp } from "../src/app.js";
import { Shop, User, Order, Upload } from "../src/models.js";
let mongo, app, owner, admin, customer, stranger, shop;
const auth = (account) => ({ Authorization: `Bearer ${account.token}` });
const original = { latitude: 13.62, longitude: 123.18 };
const proposed = {
  address: "New storefront, Naga City",
  coordinates: { latitude: 13.625, longitude: 123.185 },
};
before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  app = createApp({
    secret: "location-tests-secret-at-least-32-characters",
    uploadDir: "unused",
  });
  async function account(name, accountType) {
    return (
      await request(app)
        .post("/api/auth/signup")
        .send({
          name,
          email: `${name}@location.test`,
          password: "LocationTest123!",
          accountType,
        })
        .expect(201)
    ).body;
  }
  owner = await account("owner", "owner");
  stranger = await account("stranger", "owner");
  customer = await account("customer", "customer");
  admin = await account("reviewer", "customer");
  await User.updateOne({ _id: admin.user.id }, { accountType: "admin" });
  shop = await Shop.create({
    name: "Map Test Prints",
    address: "Original street, Naga City",
    coordinates: original,
    owner: owner.user.id,
    registrationStatus: "approved",
    open: true,
    monoRate: 2,
    colorRate: 8,
  });
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});
const publicShop = async () =>
  (
    await request(app).get("/api/shops").set(auth(customer)).expect(200)
  ).body.find((s) => s._id === shop.id);
test("location changes require ownership and approval; pending pins stay private and cannot bypass review", async () => {
  const path = "/api/workspace/location-request";
  await request(app).post(path).send(proposed).expect(401);
  await request(app).post(path).set(auth(customer)).send(proposed).expect(403);
  await request(app).post(path).set(auth(stranger)).send(proposed).expect(404);
  await Shop.updateOne({ _id: shop.id }, { registrationStatus: "submitted" });
  await request(app).post(path).set(auth(owner)).send(proposed).expect(403);
  await Shop.updateOne({ _id: shop.id }, { registrationStatus: "approved" });
  await request(app)
    .post(path)
    .set(auth(owner))
    .send({ ...proposed, coordinates: { latitude: 91, longitude: 123 } })
    .expect(400);
  await request(app)
    .patch("/api/workspace/operations")
    .set(auth(owner))
    .send({
      hours: "9 AM–6 PM",
      contact: "09123456789",
      monoRate: 2,
      colorRate: 8,
      open: true,
      coordinates: proposed.coordinates,
    })
    .expect(400);
  await request(app)
    .put("/api/workspace")
    .set(auth(owner))
    .send({
      name: shop.name,
      representative: "Owner",
      address: proposed.address,
      coordinates: proposed.coordinates,
      contact: "09123456789",
      email: "owner@location.test",
      hours: "9 AM–6 PM",
      monoRate: 2,
      colorRate: 8,
    })
    .expect(409);
  const competing = await Promise.all(
    [1, 2].map(() => request(app).post(path).set(auth(owner)).send(proposed)),
  );
  assert.deepEqual(competing.map((r) => r.status).sort(), [201, 409]);
  const publicValue = await publicShop();
  assert.deepEqual(publicValue.coordinates, original);
  assert.equal(publicValue.locationRequest, undefined);
  assert.equal(publicValue.locationReviews, undefined);
  await request(app)
    .get("/api/admin/location-requests")
    .set(auth(owner))
    .expect(403);
  const pending = (
    await request(app)
      .get("/api/admin/location-requests")
      .set(auth(admin))
      .expect(200)
  ).body[0];
  assert.equal(pending.locationRequest.status, "pending");
  const decisionPath = `/api/admin/shops/${shop.id}/location-decision`;
  const body = {
    requestId: pending.locationRequest.requestId,
    decision: "approved",
  };
  await request(app).post(decisionPath).set(auth(owner)).send(body).expect(403);
  const decisions = await Promise.all(
    [1, 2].map(() =>
      request(app).post(decisionPath).set(auth(admin)).send(body),
    ),
  );
  assert.deepEqual(decisions.map((r) => r.status).sort(), [200, 409]);
  const approved = await publicShop();
  assert.deepEqual(approved.coordinates, proposed.coordinates);
  assert.equal(approved.locationAddress, proposed.address);
  assert.equal(approved.address, shop.address);
  assert.equal(approved.open, true);
  assert.equal((await Shop.findById(shop.id)).locationReviews.length, 1);
  const next = (
    await request(app)
      .post(path)
      .set(auth(owner))
      .send({ address: "Another street, Naga City", coordinates: original })
      .expect(201)
  ).body;
  const reject = {
    requestId: next.locationRequest.requestId,
    decision: "rejected",
    reason: "  ",
  };
  await request(app)
    .post(decisionPath)
    .set(auth(admin))
    .send(reject)
    .expect(400);
  await request(app)
    .post(decisionPath)
    .set(auth(admin))
    .send({ ...reject, reason: "Pin does not match storefront" })
    .expect(200);
  assert.deepEqual((await publicShop()).coordinates, proposed.coordinates);
  assert.equal((await Shop.findById(shop.id)).locationReviews.length, 2);
  await User.updateOne({ _id: admin.user.id }, { accountType: "customer" });
  await request(app)
    .get("/api/admin/location-requests")
    .set(auth(admin))
    .expect(403);
});
test("new registrations cannot submit without a storefront pin", async () => {
  const draft = await Shop.create({
    name: "No Pin Prints",
    address: "Naga City center",
    owner: stranger.user.id,
    registrationStatus: "draft",
    documents: [1, 2, 3].map((i) => ({ name: `${i}.pdf`, path: "private" })),
  });
  await request(app)
    .post("/api/workspace/submit")
    .set(auth(stranger))
    .send({ confirm: true })
    .expect(400);
  assert.equal((await Shop.findById(draft.id)).registrationStatus, "draft");
});
test("public queue totals include production only, separately count ready orders, and reveal no files or customers", async () => {
  const statuses = [
    "Queued",
    "Queued",
    "Printing",
    "Ready for pickup",
    "Collected",
    "Cancelled",
    "Rejected",
  ];
  await Order.insertMany(
    statuses.map((status) => ({
      customer: customer.user.id,
      requestKey: crypto.randomUUID(),
      shop: shop.id,
      status,
      files: [{ name: "private.pdf" }],
      amount: 20,
    })),
  );
  const exposed = await publicShop();
  assert.deepEqual(exposed.queue, {
    preparing: 2,
    printing: 1,
    ready: 1,
    ongoing: 3,
  });
  assert.equal(exposed.files, undefined);
  assert.equal(exposed.customer, undefined);
  const queued = await Order.findOne({ shop: shop.id, status: "Queued" });
  await Order.updateOne({ _id: queued.id }, { status: "Cancelled" });
  assert.equal((await publicShop()).queue.ongoing, 2);
});

test("admins can delete an open shop without disrupting orders already placed", async () => {
  const route = `/api/admin/shops/${shop.id}`;
  await request(app).delete(route).expect(401);
  for (const account of [customer, owner, admin])
    await request(app).delete(route).set(auth(account)).expect(403);
  await User.updateOne({ _id: admin.user.id }, { accountType: "admin" });
  await request(app)
    .delete("/api/admin/shops/invalid")
    .set(auth(admin))
    .expect(400);

  await request(app)
    .post("/api/workspace/location-request")
    .set(auth(owner))
    .send(proposed)
    .expect(201);
  const file = await Upload.create({
    owner: customer.user.id,
    name: "test.pdf",
    pages: 2,
  });
  const booking = {
    shopId: shop.id,
    fileIds: [file.id],
    settings: {
      paper: "A4",
      color: "Black & white",
      sides: "Single-sided",
      copies: 1,
    },
    requestKey: crypto.randomUUID(),
  };
  const booked = (
    await request(app)
      .post("/api/orders")
      .set(auth(customer))
      .send(booking)
      .expect(201)
  ).body;

  await request(app).delete(route).set(auth(admin)).expect(200, { ok: true });
  const stored = await Shop.findById(shop.id).select("+deletedBy");
  assert.equal(stored.open, false);
  assert.equal(stored.deletedBy.toString(), admin.user.id);
  assert.ok(stored.deletedAt);
  assert.equal(await publicShop(), undefined);
  await request(app).get(route).set(auth(admin)).expect(404);
  for (const list of [
    "/api/admin/shops?status=approved",
    "/api/admin/location-requests",
  ]) {
    const result = await request(app).get(list).set(auth(admin)).expect(200);
    assert.ok(!result.body.some((item) => item._id === shop.id));
  }
  await request(app)
    .post("/api/quote")
    .set(auth(customer))
    .send(booking)
    .expect(404);
  await request(app)
    .post("/api/orders")
    .set(auth(customer))
    .send({ ...booking, requestKey: crypto.randomUUID() })
    .expect(404);
  const retry = await request(app)
    .post("/api/orders")
    .set(auth(customer))
    .send(booking)
    .expect(200);
  assert.equal(retry.body._id, booked._id);
  assert.equal(retry.body.shop.name, shop.name);
  assert.equal(retry.body.shop.deletedBy, undefined);
  await request(app)
    .patch("/api/workspace/operations")
    .set(auth(owner))
    .send({
      hours: "9 AM–6 PM",
      contact: "09123456789",
      monoRate: 2,
      colorRate: 8,
      open: true,
    })
    .expect(409);
  const workspace = await request(app)
    .get("/api/workspace")
    .set(auth(owner))
    .expect(200);
  assert.equal(workspace.body._id, shop.id);
  assert.ok(workspace.body.deletedAt);
  assert.equal(workspace.body.deletedBy, undefined);

  const orderRoute = `/api/workspace/orders/${booked._id}`;
  for (const status of ["Printing", "Ready for pickup"])
    await request(app)
      .patch(orderRoute + "/status")
      .set(auth(owner))
      .send({ status })
      .expect(200);
  await request(app)
    .post(orderRoute + "/payment")
    .set(auth(owner))
    .expect(200);
  await request(app)
    .patch(orderRoute + "/status")
    .set(auth(owner))
    .send({ status: "Collected" })
    .expect(200);
  const history = await request(app)
    .get("/api/orders")
    .set(auth(customer))
    .expect(200);
  const collected = history.body.find((item) => item._id === booked._id);
  assert.equal(collected.status, "Collected");
  assert.equal(collected.amount, booked.amount);
  assert.equal(collected.shop.name, shop.name);
});

test("deleting a draft hides it from admin review and blocks owner resubmission", async () => {
  const draft = await Shop.findOne({ owner: stranger.user.id });
  const list = "/api/admin/shops?status=draft";
  const route = `/api/admin/shops/${draft.id}`;
  const before = await request(app).get(list).set(auth(admin)).expect(200);
  assert.ok(before.body.some((item) => item._id === draft.id));
  await request(app).delete(route).set(auth(admin)).expect(200);
  const after = await request(app).get(list).set(auth(admin)).expect(200);
  assert.ok(!after.body.some((item) => item._id === draft.id));
  const documentRoute = `${route}/documents/${draft.documents[0].id}`;
  await request(app).get(documentRoute).set(auth(admin)).expect(404);
  await request(app)
    .post("/api/workspace/submit")
    .set(auth(stranger))
    .send({ confirm: true })
    .expect(409);
});
