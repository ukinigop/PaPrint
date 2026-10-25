import { test } from "node:test";
import assert from "node:assert/strict";
import { customerTabRoutes, tabForPath } from "../src/customerTabs.ts";
test("customer navigation selects the matching tab on detail routes and hides on checkout and staff routes", () => {
  for (const [tab, path] of Object.entries(customerTabRoutes))
    assert.equal(tabForPath(path), tab);
  assert.equal(tabForPath("/shop"), "Shops");
  assert.equal(tabForPath("/shops/"), "Shops");
  assert.equal(tabForPath("/order"), "Orders");
  for (const path of [
    "/",
    "/login",
    "/signup",
    "/upload",
    "/options",
    "/review",
    "/gcash",
    "/workspace",
    "/admin",
  ])
    assert.equal(tabForPath(path), null);
});
