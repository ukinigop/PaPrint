import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const pdfRoot = path.dirname(require.resolve("pdfjs-dist/package.json"));
export function installPdfPreview(app) {
  app.get("/api/pdf-preview/assets/:name", async (req, res) => {
    const files = {
      "pdf.mjs": path.join(pdfRoot, "legacy/build/pdf.mjs"),
      "pdf.worker.mjs": path.join(pdfRoot, "legacy/build/pdf.worker.mjs"),
      "client.js": fileURLToPath(
        new URL("./pdf-preview-client.js", import.meta.url),
      ),
    };
    if (!Object.hasOwn(files, req.params.name)) return res.sendStatus(404);
    res.type("js").send(await readFile(files[req.params.name]));
  });
  app.get("/api/pdf-preview/resources/:folder/:name", async (req, res) => {
    const { folder, name } = req.params;
    if (
      !["cmaps", "standard_fonts"].includes(folder) ||
      !/^[\w.-]+\.(bcmap|pfb|ttf)$/.test(name)
    )
      return res.sendStatus(404);
    try {
      res
        .type("application/octet-stream")
        .send(await readFile(path.join(pdfRoot, folder, name)));
    } catch (error) {
      if (error.code === "ENOENT") return res.sendStatus(404);
      throw error;
    }
  });
  app.get("/api/pdf-preview", (req, res) => {
    res.set("Cache-Control", "no-store");
    res.set(
      "Content-Security-Policy",
      "default-src 'none'; script-src 'self'; worker-src 'self' blob:; connect-src 'self'; style-src 'unsafe-inline'; font-src 'self' blob:; img-src 'self' data: blob:; frame-ancestors 'self'; base-uri 'none'; form-action 'none'",
    );
    res.type("html")
      .send(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>PDF preview</title><style>
      *{box-sizing:border-box}html,body{margin:0;height:100%;font:14px system-ui;color:#233e48;background:#dce5e9}
      header{position:sticky;top:0;display:flex;justify-content:center;align-items:center;gap:12px;padding:10px;background:#e9eef2;z-index:1;flex-wrap:wrap}
      button{font:inherit;color:#276a68;background:#fff;border:1px solid #ccd7de;border-radius:8px;padding:8px;min-height:40px;cursor:pointer}button:disabled{opacity:.45;cursor:default}
      #status{text-align:center;padding:12px}#pages{overflow:auto;padding:12px;min-height:80%}canvas{display:block;margin:auto;background:white;box-shadow:0 2px 10px #233e4822}
    </style></head><body><header><button id="previous" disabled aria-label="Previous page">‹</button><span id="number" aria-live="polite">PDF preview</span><button id="next" disabled aria-label="Next page">›</button><button id="out" disabled aria-label="Zoom out">−</button><button id="in" disabled aria-label="Zoom in">+</button></header><div id="status" role="status">Loading preview…</div><main id="pages"><canvas aria-label="PDF page"></canvas></main><script type="module" src="/api/pdf-preview/assets/client.js"></script></body></html>`);
  });
}
