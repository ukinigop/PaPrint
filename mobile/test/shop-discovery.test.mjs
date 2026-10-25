import { test } from "node:test";
import assert from "node:assert/strict";
import {
  distanceKm,
  sortShops,
  shopMapUrl,
  savedShopLabel,
} from "../src/shopDiscovery.ts";
test("Nearby uses actual coordinates, leaves missing pins last, and never mutates the list", () => {
  const origin = { latitude: 13.62, longitude: 123.18 };
  const shops = [
    { name: "Missing" },
    { name: "Far", coordinates: { latitude: 14, longitude: 124 } },
    { name: "Near", coordinates: origin },
  ];
  assert.deepEqual(
    sortShops(shops, "Nearby", origin).map((s) => s.name),
    ["Near", "Far", "Missing"],
  );
  assert.equal(shops[0].name, "Missing");
  assert.equal(distanceKm(origin, origin), 0);
  assert.equal(distanceKm(origin, null), null);
  assert.equal(distanceKm(origin, { latitude: 91, longitude: 0 }), null);
  assert.ok(
    Math.abs(
      distanceKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }) -
        111.195,
    ) < 0.01,
  );
});
test("Most Saved uses real totals and map queries safely encode names and addresses", () => {
  assert.deepEqual(
    sortShops(
      [
        { name: "A", savedCount: 2 },
        { name: "B", savedCount: 67 },
      ],
      "Most Saved",
    ).map((s) => s.name),
    ["B", "A"],
  );
  assert.equal(
    new URL(
      shopMapUrl({ name: "A & B", address: "Main street" }),
    ).searchParams.get("query"),
    "A & B, Main street, Naga City, Philippines",
  );
  assert.equal(
    new URL(
      shopMapUrl({
        name: "A",
        address: "B",
        coordinates: { latitude: 13, longitude: 123 },
      }),
    ).searchParams.get("query"),
    "13,123",
  );
  assert.equal(savedShopLabel(1), "1 person has saved this shop");
  assert.equal(savedShopLabel(0), "0 people have saved this shop");
});
