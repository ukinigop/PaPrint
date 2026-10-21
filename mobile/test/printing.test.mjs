import { test } from "node:test";
import assert from "node:assert/strict";
import { filePrintRange } from "../src/printing.ts";

const files = [
  { upload: "selected-second", pages: 2 },
  { upload: "selected-first", pages: 3 },
  { upload: "last", pages: 4 },
];
test("printing maps continuous ranges to each PDF in saved order", () => {
  const before = JSON.stringify(files);
  assert.equal(filePrintRange(files, "selected-second", "2-4, 7"), "2");
  assert.equal(filePrintRange(files, "selected-first", "2-4, 7"), "1-2");
  assert.equal(filePrintRange(files, "last", "2-4, 7"), "2");
  assert.equal(filePrintRange(files, "selected-first", "1-2"), null);
  assert.equal(JSON.stringify(files), before);
});
test("printing merges overlapping ranges and refuses invalid page instructions", () => {
  assert.equal(filePrintRange(files, "selected-first", "5, 3-4, 4-5"), "1-3");
  assert.equal(filePrintRange(files, "last", ""), "All pages");
  for (const range of ["0", "10", "4-2", "1,", "bad"])
    assert.equal(filePrintRange(files, "last", range), null);
  assert.equal(filePrintRange(files, "unknown", ""), null);
});
