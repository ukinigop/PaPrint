import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canEstimatePickup,
  fromManilaInput,
  toManilaInput,
  pickupTimeLabel,
} from "../src/pickupEstimate.ts";
test("pickup estimates use Philippine time regardless of the device timezone and reject invalid dates", () => {
  assert.equal(fromManilaInput("2026-11-04T09:30"), "2026-11-04T01:30:00.000Z");
  assert.equal(toManilaInput("2026-11-03T23:30:00.000Z"), "2026-11-04T07:30");
  for (const value of [
    "2026-02-30T10:00",
    "2026-11-04T25:00",
    "2026-11-04T09:60",
    "",
    "tomorrow",
  ])
    assert.equal(fromManilaInput(value), null);
  assert.match(pickupTimeLabel("2026-11-04T01:30:00.000Z"), /9:30\s*AM/i);
  assert.equal(toManilaInput("bad"), "");
});
test("estimates only appear as upcoming while Preparing or Printing", () => {
  for (const status of ["Queued", "Printing"])
    assert.equal(canEstimatePickup({ status }), true);
  for (const status of [
    "Ready for pickup",
    "Collected",
    "Cancelled",
    "Rejected",
  ])
    assert.equal(canEstimatePickup({ status }), false);
});
