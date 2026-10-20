import { test } from "node:test";
import assert from "node:assert/strict";
import { draftCache } from "../src/draftCache.ts";
import {
  emptyDraft,
  completeDraft,
  placeBooking,
} from "../src/customerFlow.ts";

function fixture() {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
  return { values, cache: draftCache(storage) };
}
const draft = () => ({
  ...emptyDraft(),
  shop: { _id: "shop", name: "Prints" },
  files: [
    { _id: "second", name: "second.pdf", pages: 2, size: 100 },
    { _id: "first", name: "first.pdf", pages: 2, size: 100 },
  ],
  requestKey: "original-key",
  notes: "Test",
  settings: { ...emptyDraft().settings, pageRange: "2-3" },
});

test("checkout reload restores ordered acknowledged PDFs, settings and the original retry key", async () => {
  const { cache } = fixture();
  cache.write("customer", "local", draft());
  const recovered = cache.read("customer", "local");
  assert.deepEqual(recovered, draft());
  let submitted;
  await placeBooking(recovered, 4, async (body) => {
    submitted = JSON.parse(body);
    return { _id: "existing", status: "Cancelled" };
  });
  assert.equal(submitted.requestKey, "original-key");
  assert.deepEqual(submitted.fileIds, ["second", "first"]);
  assert.equal(submitted.settings.pageRange, "2-3");
  cache.write("customer", "local", completeDraft(recovered, "original-key"));
  assert.deepEqual(cache.read("customer", "local"), emptyDraft());
});
test("checkout caches are isolated by account and API; logout and malformed storage clear safely", () => {
  const { cache, values } = fixture();
  cache.write("first", "local", draft());
  assert.deepEqual(cache.read("second", "local"), emptyDraft());
  assert.deepEqual(cache.read("first", "other-api"), emptyDraft());
  cache.clear("first", "local");
  assert.deepEqual(cache.read("first", "local"), emptyDraft());
  cache.write("first", "local", draft());
  values.set([...values.keys()][0], "{broken");
  assert.deepEqual(cache.read("first", "local"), emptyDraft());
  values.set(
    [...values.keys()][0],
    JSON.stringify({ ...draft(), files: [{ _id: "invalid" }] }),
  );
  assert.deepEqual(cache.read("first", "local"), emptyDraft());
  assert.doesNotThrow(() =>
    draftCache(undefined).write("first", "local", draft()),
  );
});
