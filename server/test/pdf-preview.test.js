import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

test("embedded native reader validates chunks and renders the exact PDF without credentials or URLs", async () => {
  const source = (
    await readFile(
      new URL("../src/pdf-preview-client.js", import.meta.url),
      "utf8",
    )
  ).replace(/^import[\s\S]*?from "\/api\/pdf-preview\/assets\/pdf.mjs";/, "");
  const messages = [],
    documents = [];
  const element = () => ({
    style: {},
    clientWidth: 390,
    setAttribute() {},
    getContext: () => ({}),
  });
  const nodes = new Map();
  const window = {
    ReactNativeWebView: {
      postMessage: (text) => messages.push(JSON.parse(text)),
    },
    addEventListener() {},
    postMessage() {},
    devicePixelRatio: 2,
  };
  const context = {
    window,
    parent: window,
    location: { origin: "https://paprint.test" },
    ArrayBuffer,
    Uint8Array,
    atob,
    document: {
      querySelector: (key) => {
        if (!nodes.has(key)) nodes.set(key, element());
        return nodes.get(key);
      },
    },
    GlobalWorkerOptions: {},
    getDocument: ({ data }) => {
      documents.push(Buffer.from(data));
      return {
        promise: Promise.resolve({
          numPages: 1,
          getPage: async () => ({
            getViewport: ({ scale }) => ({
              width: 612 * scale,
              height: 792 * scale,
            }),
            render: () => ({ promise: Promise.resolve() }),
            cleanup() {},
          }),
        }),
      };
    },
  };
  vm.runInNewContext(source, context);
  assert.equal(messages[0].type, "paprint-pdf-ready");
  window.paprintPdfChunk({ offset: 1, total: 10, base64: "YWJj" });
  window.paprintPdfChunk({ offset: 0, total: 1000000000, base64: "YWJj" });
  assert.equal(messages.length, 1);
  const pdf = Buffer.from("%PDF-1.7\n" + "private bytes\n".repeat(10000));
  for (let offset = 0; offset < pdf.length; offset += 49152) {
    const part = pdf.subarray(offset, offset + 49152);
    window.paprintPdfChunk({
      offset,
      total: pdf.length,
      base64: part.toString("base64"),
    });
    assert.equal(messages.at(-1).next, offset + part.length);
  }
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(documents, [pdf]);
  assert.equal(messages.at(-1).type, "paprint-pdf-rendered");
  window.paprintPdfChunk({ offset: 0, total: 3, base64: "YWJj" });
  assert.equal(documents.length, 1);
});
