import { beforeEach, test } from "node:test";
import assert from "node:assert/strict";
const storage = new Map();
globalThis.paprintTestStorage = {
  getItem: async (key) => storage.get(key) ?? null,
  setItem: async (key, value) => {
    storage.set(key, value);
  },
  removeItem: async (key) => {
    storage.delete(key);
  },
  multiGet: async (keys) => keys.map((key) => [key, storage.get(key) ?? null]),
};
const api = await import("../src/api.ts");
const { StaleSessionError } = await import("../src/customerFlow.ts");
function deferred() {
  let resolve;
  const promise = new Promise((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
const response = (data, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => data,
});
beforeEach(async () => {
  await api.clearAccount();
  storage.clear();
});

test("real API rejects a delayed old-account response after a different login", async () => {
  await api.acceptAccount({ token: "old-token", user: { id: "old-account" } });
  const pending = deferred();
  globalThis.fetch = () => pending.promise;
  const request = api.request("/orders");
  await api.acceptAccount({ token: "new-token", user: { id: "new-account" } });
  pending.resolve(response([{ files: ["private-old-file.pdf"] }]));
  await assert.rejects(request, StaleSessionError);
  assert.equal(storage.get("paprint.accountToken"), "new-token");
});

test("an old unauthorized response cannot expire a newer login", async () => {
  let expired = 0;
  const unsubscribe = api.onSessionExpired(() => expired++);
  await api.acceptAccount({ token: "old", user: { id: "same-account" } });
  const pending = deferred();
  globalThis.fetch = () => pending.promise;
  const request = api.request("/auth/me");
  await api.acceptAccount({ token: "renewed", user: { id: "same-account" } });
  pending.resolve(response({ message: "Expired" }, 401));
  await assert.rejects(request, StaleSessionError);
  assert.equal(expired, 0);
  assert.equal(storage.get("paprint.accountToken"), "renewed");
  unsubscribe();
});

test("expiry clears credentials and invalidates other in-flight requests", async () => {
  let expired = 0;
  const unsubscribe = api.onSessionExpired(() => expired++);
  await api.acceptAccount({ token: "expired", user: { id: "account" } });
  const pending = deferred();
  globalThis.fetch = (url) =>
    url.endsWith("/orders")
      ? pending.promise
      : Promise.resolve(response({ message: "Expired" }, 401));
  const orders = api.request("/orders");
  await assert.rejects(api.request("/auth/me"), StaleSessionError);
  pending.resolve(response(["old data"]));
  await assert.rejects(orders, StaleSessionError);
  assert.equal(expired, 1);
  assert.equal(storage.has("paprint.accountToken"), false);
  unsubscribe();
});

test("logout response cannot clear credentials written by a newer login", async () => {
  await api.acceptAccount({ token: "old", user: { id: "old-account" } });
  const pending = deferred(),
    started = deferred();
  globalThis.fetch = () => {
    started.resolve();
    return pending.promise;
  };
  const logout = api.signOut();
  await started.promise;
  await api.acceptAccount({ token: "new", user: { id: "new-account" } });
  pending.resolve(response({ ok: true }));
  await assert.rejects(logout, StaleSessionError);
  assert.equal(storage.get("paprint.accountToken"), "new");
});

test("normal logout revokes device and account with the captured token", async () => {
  await api.acceptAccount({ token: "old", user: { id: "account" } });
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push([url, options.headers.Authorization]);
    return response({ ok: true });
  };
  await api.signOut();
  assert.equal(calls.length, 2);
  assert.ok(calls[1][0].endsWith("/auth/logout"));
  assert.deepEqual(
    calls.map((c) => c[1]),
    ["Bearer old", "Bearer old"],
  );
  assert.equal(storage.has("paprint.accountToken"), false);
});

test("a delayed storage removal finishes before persisting the next account token", async () => {
  await api.acceptAccount({ token: "old", user: { id: "old-account" } });
  const started = deferred(),
    release = deferred();
  const original = globalThis.paprintTestStorage.removeItem;
  globalThis.paprintTestStorage.removeItem = async (key) => {
    started.resolve();
    await release.promise;
    return original(key);
  };
  try {
    const clearing = api.clearAccount();
    await started.promise;
    const login = api.acceptAccount({
      token: "new",
      user: { id: "new-account" },
    });
    release.resolve();
    await Promise.all([clearing, login]);
    assert.equal(storage.get("paprint.accountToken"), "new");
  } finally {
    globalThis.paprintTestStorage.removeItem = original;
  }
});

test("preparing an old upload cannot send its file with a newer account token", async () => {
  await api.acceptAccount({ token: "old", user: { id: "old-account" } });
  const pending = deferred(),
    calls = [];
  globalThis.fetch = async (url) => {
    calls.push(url);
    return { blob: () => pending.promise };
  };
  const upload = api.uploadFiles([
    { uri: "blob:previous-account", name: "private.pdf" },
  ]);
  await api.acceptAccount({ token: "new", user: { id: "new-account" } });
  pending.resolve(new Blob(["sample"]));
  await assert.rejects(upload, StaleSessionError);
  assert.deepEqual(calls, ["blob:previous-account"]);
});

test("unreadable server errors give actionable feedback", async () => {
  globalThis.fetch = async () => ({
    ok: false,
    status: 503,
    json: async () => {
      throw new SyntaxError("HTML response");
    },
  });
  await assert.rejects(api.request("/quote"), /unreadable response.*retry/i);
});

test("owner print preview uses the authenticated workspace file route and original PDF bytes", async () => {
  await api.acceptAccount({ token: "owner-token", user: { id: "owner" } });
  const pdf = new Blob(["%PDF-1.7 sample"], { type: "application/pdf" });
  globalThis.fetch = async (url, options) => {
    assert.ok(url.endsWith("/api/workspace/orders/order/files/file"));
    assert.ok(!url.includes("owner-token"));
    assert.equal(options.headers.Authorization, "Bearer owner-token");
    return { ok: true, blob: async () => pdf };
  };
  assert.equal(await api.loadOwnerPrintPdf("order", "file"), pdf);
});
test("a delayed private print PDF cannot enter a different account", async () => {
  await api.acceptAccount({ token: "old", user: { id: "old-owner" } });
  const pending = deferred(),
    started = deferred();
  globalThis.fetch = async () => ({
    ok: true,
    blob: () => {
      started.resolve();
      return pending.promise;
    },
  });
  const preview = api.loadOwnerPrintPdf("order", "file");
  await started.promise;
  await api.acceptAccount({ token: "new", user: { id: "new-owner" } });
  pending.resolve(new Blob(["%PDF-1.7 private"], { type: "application/pdf" }));
  await assert.rejects(preview, StaleSessionError);
});
test("private print preview handles denied access, expired sessions and unexpected content", async () => {
  await api.acceptAccount({ token: "owner", user: { id: "owner" } });
  globalThis.fetch = async () =>
    response({ message: "Shop approval required." }, 403);
  await assert.rejects(
    api.loadOwnerPrintPdf("order", "file"),
    /approval required/,
  );
  globalThis.fetch = async () => ({
    ok: true,
    blob: async () => new Blob(["<html>error</html>"], { type: "text/html" }),
  });
  await assert.rejects(api.loadOwnerPrintPdf("order", "file"), /not a PDF/);
  let expired = 0;
  const off = api.onSessionExpired(() => expired++);
  try {
    globalThis.fetch = async () =>
      response({ message: "Session expired" }, 401);
    await assert.rejects(
      api.loadOwnerPrintPdf("order", "file"),
      StaleSessionError,
    );
    assert.equal(expired, 1);
    assert.equal(storage.has("paprint.accountToken"), false);
  } finally {
    off();
  }
});
