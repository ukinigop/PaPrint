import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app.js";
test("map assets keep executable code local, expose attribution, and never inject query HTML", async () => {
  const app = createApp({
    secret: "map-tests-secret-long-enough",
    uploadDir: "unused",
  });
  const page = await request(app)
    .get("/api/map?lat=<script>alert(1)</script>")
    .expect(200);
  assert.match(page.text, /Choose shop location/);
  assert.doesNotMatch(page.text, /alert\(1\)/);
  assert.match(page.headers["content-security-policy"], /script-src 'self'/);
  assert.equal(
    page.headers["referrer-policy"],
    "strict-origin-when-cross-origin",
  );
  assert.match(
    page.headers["content-security-policy"],
    /https:\/\/tile.openstreetmap.org/,
  );
  await request(app).get("/api/map/assets/leaflet.js").expect(200);
  await request(app).get("/api/map/assets/leaflet.css").expect(200);
  const client = await request(app)
    .get("/api/map/assets/client.js")
    .expect(200);
  assert.match(client.text, /OpenStreetMap/);
  await request(app).get("/api/map/assets/missing.js").expect(404);
});
test("address search validates queries, normalizes provider data, caches repeats, and handles failure", async () => {
  let calls = 0;
  const app = createApp({
    secret: "map-tests-secret-long-enough",
    uploadDir: "unused",
    searchPlaces: async () => {
      calls++;
      return {
        features: [
          {
            geometry: { type: "Point", coordinates: [123.19, 13.62] },
            properties: {
              name: "Naga City Hall",
              city: "Naga",
              country: "Philippines",
            },
          },
          {
            geometry: { type: "Point", coordinates: [999, 13] },
            properties: {},
          },
        ],
      };
    },
  });
  await request(app).get("/api/map/search?q=a").expect(400);
  const response = await request(app)
    .get("/api/map/search?q=City%20Hall")
    .expect(200);
  assert.deepEqual(response.body, [
    {
      address: "Naga City Hall, Naga, Philippines",
      coordinates: { latitude: 13.62, longitude: 123.19 },
    },
  ]);
  await request(app).get("/api/map/search?q=city%20hall").expect(200);
  assert.equal(calls, 1);
  const failed = createApp({
    secret: "map-tests-secret-long-enough",
    uploadDir: "unused",
    searchPlaces: async () => {
      throw new Error("offline");
    },
  });
  const error = await request(failed)
    .get("/api/map/search?q=City%20Hall")
    .expect(503);
  assert.match(error.body.message, /tap your storefront/);
});
