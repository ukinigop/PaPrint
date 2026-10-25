import { test } from "node:test";
import assert from "node:assert/strict";
import {
  passwordRequirements,
  phoneDigits,
  validPhone,
  signupValidation,
} from "../src/accountValidation.ts";

test("password checklist updates both ways and agrees with signup length boundaries", () => {
  for (const [value, expected] of [
    ["", [false, false]],
    ["short", [false, true]],
    ["a".repeat(10), [true, true]],
    ["a".repeat(128), [true, true]],
    ["a".repeat(129), [true, false]],
  ])
    assert.deepEqual(
      passwordRequirements(value).map((rule) => rule.met),
      expected,
    );
  assert.ok(signupValidation("09123456789", "short", "short"));
  assert.equal(
    signupValidation("09123456789", "a".repeat(128), "a".repeat(128)),
    "",
  );
});

test("confirmation is required and must match the current password exactly", () => {
  assert.match(
    signupValidation("09123456789", "valid-password", ""),
    /confirm/,
  );
  assert.match(
    signupValidation("09123456789", "valid-password", "different-password"),
    /do not match/,
  );
  assert.match(
    signupValidation("09123456789", "valid-password ", "valid-password"),
    /do not match/,
  );
  assert.equal(
    signupValidation("09123456789", "valid-password", "valid-password"),
    "",
  );
});

test("phone input preserves leading zeroes, strips non-digits and caps at eleven", () => {
  assert.equal(phoneDigits("09 123-456-789extra012"), "09123456789");
  assert.equal(phoneDigits("letters"), "");
  assert.equal(validPhone("09123456789"), true);
  for (const value of [
    "",
    "0912345678",
    "091234567890",
    "0912345678x",
    "+639123456789",
  ])
    assert.equal(validPhone(value), false);
  assert.match(
    signupValidation("09123", "valid-password", "valid-password"),
    /11-digit/,
  );
});
