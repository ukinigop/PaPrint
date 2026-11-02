import { test } from "node:test";
import assert from "node:assert/strict";
import { pricingSummary } from "../src/pricingSummary.ts";

test("price breakdown explains selected pages, copies and Legal pricing using quoted rates", () => {
  const settings = { paper: "A4", color: "Color", copies: 1 };
  assert.deepEqual(
    pricingSummary(
      { pages: 4, rate: 1, paperMultiplier: 1, amount: 4 },
      settings,
    ),
    {
      title: "A4 · Color",
      equation: "4 pages × ₱1.00 per page = ₱4.00",
    },
  );
  assert.equal(
    pricingSummary(
      { pages: 1, rate: 2.5, paperMultiplier: 1.25, amount: 9.38 },
      { ...settings, paper: "Legal", copies: 3 },
    ).equation,
    "1 page × ₱2.50 per page × 3 copies × 1.25 (Legal paper) = ₱9.38",
  );
  assert.equal(pricingSummary({ pages: 4, amount: 4 }, settings), null);
  assert.equal(
    pricingSummary(
      { pages: 4, rate: 0, paperMultiplier: 1, amount: 0 },
      settings,
    ).equation,
    "4 pages × ₱0.00 per page = ₱0.00",
  );
});
