import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyDraft,
  completeDraft,
  createSessionScope,
  createQuoteLoader,
  uploadBatch,
  placeBooking,
  StaleSessionError,
} from "../src/customerFlow.ts";
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const file = (id) => ({ _id: id, name: id + ".pdf", pages: 1, size: 10 });
const draft = () => ({
  ...emptyDraft(),
  shop: { _id: "shop-one" },
  files: [file("second"), file("first")],
  requestKey: "booking-one",
});

test("expired or switched sessions cannot deliver delayed account results", async () => {
  const scope = createSessionScope(),
    response = deferred(),
    current = scope.capture();
  let visible = [];
  const pending = response.promise.then((value) => {
    if (current()) visible = value;
  });
  scope.invalidate();
  response.resolve(["previous-account-file.pdf"]);
  await pending;
  assert.deepEqual(visible, []);
  assert.equal(scope.capture()(), true);
});

test("quote responses and errors cannot replace newer settings or an unmounted view", async () => {
  const responses = new Map(),
    states = [];
  const loader = createQuoteLoader(
    (key) => {
      const response = deferred();
      responses.set(key, response);
      return response.promise;
    },
    (state) => states.push(state),
  );
  const old = loader.load("old settings"),
    next = loader.load("new settings");
  responses.get("new settings").resolve({ amount: 8, pages: 4 });
  await next;
  responses.get("old settings").reject(new Error("old invalid range"));
  await old;
  assert.deepEqual(states.at(-1), {
    key: "new settings",
    status: "success",
    quote: { amount: 8, pages: 4 },
  });
  const leaving = loader.load("leaving");
  loader.invalidate();
  const count = states.length;
  responses.get("leaving").resolve({ amount: 1, pages: 1 });
  await leaving;
  assert.equal(states.length, count);
});

test("quote failures are visible and retry can recover", async () => {
  const states = [];
  let attempt = 0;
  const loader = createQuoteLoader(
    async () => {
      if (!attempt++) throw new Error("Choose pages between 1 and 2.");
      return { amount: 4, pages: 2 };
    },
    (state) => states.push(state),
  );
  await loader.load("range");
  assert.equal(states.at(-1).error, "Choose pages between 1 and 2.");
  await loader.load("range");
  assert.equal(states.at(-1).status, "success");
});

test("partial upload retry preserves file order without uploading successful files twice", async () => {
  const calls = [],
    files = [],
    progress = [];
  let fail = true;
  const upload = async (asset) => {
    calls.push(asset);
    if (asset === "B" && fail) {
      fail = false;
      throw new Error("Connection lost");
    }
    return [file(asset)];
  };
  const append = (next) => files.push(...next);
  const first = await uploadBatch(
    ["A", "B", "C"],
    upload,
    append,
    (...n) => progress.push(n),
    () => true,
  );
  assert.deepEqual(first.remaining, ["B", "C"]);
  assert.deepEqual(
    files.map((f) => f._id),
    ["A"],
  );
  const retry = await uploadBatch(
    first.remaining,
    upload,
    append,
    (...n) => progress.push(n),
    () => true,
  );
  assert.deepEqual(retry.remaining, []);
  assert.deepEqual(calls, ["A", "B", "B", "C"]);
  assert.deepEqual(
    files.map((f) => f._id),
    ["A", "B", "C"],
  );
  assert.deepEqual(progress.at(-1), [2, 2]);
});

test("session changes during upload cannot append files or begin the next upload", async () => {
  const scope = createSessionScope(),
    current = scope.capture(),
    response = deferred();
  let appended = false,
    calls = 0;
  const upload = uploadBatch(
    ["A", "B"],
    async () => {
      calls++;
      return response.promise;
    },
    () => {
      appended = true;
    },
    () => {},
    current,
  );
  scope.invalidate();
  response.resolve([file("A")]);
  await assert.rejects(upload, StaleSessionError);
  assert.equal(appended, false);
  assert.equal(calls, 1);
});

test("changed prices require another submission; uncertain retries keep the original draft and key", async () => {
  let current = draft(),
    calls = [],
    attempts = 0;
  const request = async (body) => {
    const data = JSON.parse(body);
    calls.push(data);
    attempts++;
    if (attempts === 1) throw new Error("Connection lost");
    if (data.expectedAmount !== 6)
      throw Object.assign(new Error("Price changed"), {
        code: "PRICE_CHANGED",
        amount: 6,
      });
    return { _id: "original-order", status: "Queued", amount: 6 };
  };
  await assert.rejects(placeBooking(current, 4, request), /Connection lost/);
  assert.equal(current.requestKey, "booking-one");
  assert.equal(current.files.length, 2);
  const changed = await placeBooking(current, 4, request);
  assert.deepEqual(changed, { amount: 6 });
  assert.equal(attempts, 2);
  const confirmed = await placeBooking(current, changed.amount, request);
  assert.equal(confirmed.order.amount, 6);
  assert.deepEqual(
    calls.map((c) => c.requestKey),
    ["booking-one", "booking-one", "booking-one"],
  );
  assert.deepEqual(calls[2].fileIds, ["second", "first"]);
  assert.equal(calls[2].paymentMethod, "pickup");
  current = completeDraft(current, "booking-one");
  assert.deepEqual(current, emptyDraft());
});

test("a late booking result does not clear a newer draft; terminal retry stays terminal", async () => {
  const next = { ...draft(), requestKey: "booking-two" };
  assert.equal(completeDraft(next, "booking-one"), next);
  const original = {
    _id: "existing-order",
    status: "Cancelled",
    amount: 4,
    files: [file("second"), file("first")],
  };
  const result = await placeBooking(draft(), 4, async () => original);
  assert.equal(result.order, original);
  assert.deepEqual(
    result.order.files.map((f) => f._id),
    ["second", "first"],
  );
});
