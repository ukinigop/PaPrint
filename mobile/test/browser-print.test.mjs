import { test } from "node:test";
import assert from "node:assert/strict";
import { createPdfPrintJob } from "../src/browserPrint.ts";

function browser(t, { printError = false, restricted = false } = {}) {
  const originalDocument = globalThis.document;
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  const calls = { prints: 0, focus: 0, removed: 0, revoked: [] };
  const listeners = new Map();
  const frame = {
    style: {},
    attributes: {},
    setAttribute(key, value) {
      this.attributes[key] = value;
    },
    remove() {
      calls.removed++;
    },
    contentWindow: {
      addEventListener(key, callback) {
        if (restricted) throw new Error("Restricted PDF viewer");
        listeners.set(key, callback);
      },
      removeEventListener(key) {
        if (restricted) throw new Error("Restricted PDF viewer");
        listeners.delete(key);
      },
      focus() {
        calls.focus++;
      },
      print() {
        calls.prints++;
        if (printError) throw new Error("Printing unavailable");
      },
    },
  };
  globalThis.document = {
    createElement(tag) {
      assert.equal(tag, "iframe");
      return frame;
    },
    body: {
      appendChild(element) {
        assert.equal(element, frame);
      },
    },
  };
  URL.createObjectURL = () => "blob:private-pdf";
  URL.revokeObjectURL = (url) => calls.revoked.push(url);
  t.after(() => {
    globalThis.document = originalDocument;
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  });
  return { frame, calls, listeners };
}
const pdf = new Blob(["%PDF-1.7"], { type: "application/pdf" });

test("print waits for its private PDF, opens only once and cleans up after closing", async (t) => {
  const { frame, calls, listeners } = browser(t);
  const job = createPdfPrintJob(pdf, "document.pdf");
  t.after(job.dispose);
  assert.equal(calls.prints, 0);
  assert.equal(frame.src, "blob:private-pdf");
  assert.equal(frame.attributes["aria-hidden"], "true");
  assert.equal(frame.tabIndex, -1);
  assert.equal(frame.style.opacity, "0");
  const onLoad = frame.onload;
  onLoad();
  onLoad();
  await job.opened;
  assert.equal(calls.prints, 1);
  assert.equal(calls.focus, 1);
  assert.equal(calls.removed, 0);
  listeners.get("afterprint")();
  job.dispose();
  assert.equal(calls.removed, 1);
  assert.deepEqual(calls.revoked, ["blob:private-pdf"]);
  assert.equal(frame.onload, null);
});

test("leaving an order before the PDF loads prevents printing and releases its URL", async (t) => {
  const { frame, calls } = browser(t);
  const job = createPdfPrintJob(pdf, "document.pdf");
  const onLoad = frame.onload;
  job.dispose();
  onLoad();
  await assert.rejects(job.opened, { name: "AbortError" });
  assert.equal(calls.prints, 0);
  assert.equal(calls.removed, 1);
  assert.equal(calls.revoked.length, 1);
});

test("unavailable or restricted PDF printing fails cleanly and permits a fresh retry", async (t) => {
  for (const options of [{ printError: true }, { restricted: true }]) {
    const { frame, calls } = browser(t, options);
    const job = createPdfPrintJob(pdf, "document.pdf");
    frame.onload();
    await assert.rejects(job.opened, /Download the file/);
    assert.equal(calls.removed, 1);
    assert.equal(calls.revoked.length, 1);
    job.dispose();
    assert.equal(calls.removed, 1);
  }
});

test("PDF load errors release the private frame without opening a print dialog", async (t) => {
  const { frame, calls } = browser(t);
  const job = createPdfPrintJob(pdf, "document.pdf");
  frame.onerror();
  await assert.rejects(job.opened, /Could not prepare this PDF/);
  assert.equal(calls.prints, 0);
  assert.equal(calls.removed, 1);
  assert.equal(calls.revoked.length, 1);
});
