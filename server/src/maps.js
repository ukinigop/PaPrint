import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import rateLimit from "express-rate-limit";
const require = createRequire(import.meta.url);
export function installMaps(app, { searchPlaces } = {}) {
  const assets = {
    "leaflet.js": require.resolve("leaflet/dist/leaflet.js"),
    "leaflet.css": require.resolve("leaflet/dist/leaflet.css"),
    "client.js": fileURLToPath(new URL("./map-client.js", import.meta.url)),
  };
  app.get("/api/map/assets/:name", async (req, res) => {
    if (!Object.hasOwn(assets, req.params.name)) return res.sendStatus(404);
    res
      .type(req.params.name.endsWith(".css") ? "css" : "js")
      .send(await readFile(assets[req.params.name]));
  });
  app.get("/api/map", (req, res) => {
    // OSM requires an identifying Referer. Send only the app origin, never account URLs.
    res.set("Referrer-Policy", "strict-origin-when-cross-origin");
    res.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://tile.openstreetmap.org; connect-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'",
    );
    res
      .type("html")
      .send(
        `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Choose shop location</title><link rel="stylesheet" href="/api/map/assets/leaflet.css"><style>html,body,#map{height:100%;margin:0}body{font:14px sans-serif}.pin{background:#276a68;border:3px solid white;border-radius:50%;box-shadow:0 2px 8px #3458}.leaflet-control-attribution{font-size:10px}#hint{position:absolute;z-index:800;bottom:25px;left:8px;right:8px;background:white;padding:8px;border-radius:8px;color:#264e4c;pointer-events:none}</style></head><body><div id="map" aria-label="Shop location map"></div><div id="hint">Tap the map or drag the pin to your storefront.</div><script src="/api/map/assets/leaflet.js"></script><script src="/api/map/assets/client.js"></script></body></html>`,
      );
  });
  const cache = new Map();
  app.get(
    "/api/map/search",
    rateLimit({ windowMs: 60_000, limit: 15 }),
    async (req, res) => {
      const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
      if (query.length < 3 || query.length > 200)
        return res.status(400).json({
          message: "Enter an address or landmark (3–200 characters).",
        });
      const cached = cache.get(query.toLowerCase());
      if (cached && cached.until > Date.now()) return res.json(cached.results);
      try {
        let data;
        if (searchPlaces) data = await searchPlaces(query);
        else {
          const url = new URL(
            process.env.GEOCODER_URL || "https://photon.komoot.io/api/",
          );
          url.search = new URLSearchParams({
            q: `${query}, Naga City, Philippines`,
            limit: "5",
            lat: "13.6218",
            lon: "123.1948",
          }).toString();
          const response = await fetch(url, {
            signal: AbortSignal.timeout(8000),
          });
          if (!response.ok) throw new Error("Search unavailable");
          data = await response.json();
        }
        const results = (data.features || [])
          .slice(0, 5)
          .filter(
            (f) =>
              f.geometry?.type === "Point" &&
              f.geometry.coordinates?.length === 2 &&
              f.geometry.coordinates.every(Number.isFinite) &&
              Math.abs(f.geometry.coordinates[0]) <= 180 &&
              Math.abs(f.geometry.coordinates[1]) <= 90,
          )
          .map((f) => ({
            address: [
              ...new Set(
                [
                  f.properties?.name,
                  f.properties?.housenumber,
                  f.properties?.street,
                  f.properties?.district,
                  f.properties?.city,
                  f.properties?.state,
                  f.properties?.country,
                ].filter((v) => typeof v === "string" && v.trim()),
              ),
            ]
              .join(", ")
              .slice(0, 250),
            coordinates: {
              latitude: f.geometry.coordinates[1],
              longitude: f.geometry.coordinates[0],
            },
          }));
        if (cache.size >= 200) cache.delete(cache.keys().next().value);
        cache.set(query.toLowerCase(), {
          results,
          until: Date.now() + 3600000,
        });
        res.json(results);
      } catch {
        res.status(503).json({
          message:
            "Address search is unavailable. Try again, or move the map and tap your storefront directly.",
        });
      }
    },
  );
}
