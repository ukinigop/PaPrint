import { test } from "node:test";
import assert from "node:assert/strict";
import { pdfChunk, pdfChunkSize } from "../src/pdfBridge.ts";

test("native PDF chunks preserve bytes across boundaries with bounded bridge messages", () => {
  for (const length of [
    1,
    2,
    3,
    pdfChunkSize - 1,
    pdfChunkSize,
    pdfChunkSize + 2,
    1024 * 1024 + 1,
  ]) {
    const source = Uint8Array.from({ length }, (_, i) => (i * 37) % 256);
    const result = [];
    for (let offset = 0; offset < length;) {
      const part = pdfChunk(source.buffer, offset);
      assert.equal(part.offset, offset);
      assert.equal(part.total, length);
      assert.ok(part.base64.length <= 65536);
      result.push(Buffer.from(part.base64, "base64"));
      offset = part.next;
    }
    assert.deepEqual(Buffer.concat(result), Buffer.from(source));
  }
});

test("native PDF bridge refuses invalid offsets instead of leaking unrelated buffer bytes", () => {
  const bytes = new ArrayBuffer(3);
  for (const offset of [-1, 0.5, 3, 20, NaN])
    assert.throws(() => pdfChunk(bytes, offset), /Invalid/);
});
