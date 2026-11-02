import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const mobileRequire = createRequire(
  new URL("../../mobile/package.json", import.meta.url),
);
const pdfRoot = path.dirname(require.resolve("pdfjs-dist/package.json"));
export function installPdfPreview(app) {
  app.get("/api/pdf-preview/assets/:name", async (req, res) => {
    const files = {
      "pdf.mjs": path.join(pdfRoot, "legacy/build/pdf.mjs"),
      "pdf.worker.mjs": path.join(pdfRoot, "legacy/build/pdf.worker.mjs"),
      "body.ttf": mobileRequire.resolve(
        "@expo-google-fonts/manrope/500Medium/Manrope_500Medium.ttf",
      ),
      "title.ttf": mobileRequire.resolve(
        "@expo-google-fonts/manrope/700Bold/Manrope_700Bold.ttf",
      ),
      "client.js": fileURLToPath(
        new URL("./pdf-preview-client.js", import.meta.url),
      ),
    };
    if (!Object.hasOwn(files, req.params.name)) return res.sendStatus(404);
    res
      .type(req.params.name.endsWith(".ttf") ? "font/ttf" : "js")
      .send(await readFile(files[req.params.name]));
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
      @font-face{font-family:Manrope;src:url('/api/pdf-preview/assets/body.ttf') format('truetype');font-weight:500;font-display:swap}
      @font-face{font-family:Manrope;src:url('/api/pdf-preview/assets/title.ttf') format('truetype');font-weight:700;font-display:swap}
      *{box-sizing:border-box}html,body{margin:0;height:100%;color:#233e48;background:#e9eef2;font:500 13px/1.4 Manrope,system-ui,sans-serif}
      body{display:flex;flex-direction:column;gap:14px;padding:8px}
      header{order:2;flex:none;display:grid;grid-template-columns:44px minmax(0,1fr) 44px 44px 44px;align-items:center;gap:4px;padding:8px;border-radius:24px;background:#e9eef2;box-shadow:6px 6px 14px #9cadba5c,-6px -6px 14px #fffffff2}
      #number{text-align:center;font-weight:700;color:#276a68;font-size:11px;padding:0 2px}
      button{font:500 24px/1 Manrope,system-ui;color:#276a68;background:#e9eef2;border:0;border-radius:16px;min-width:44px;min-height:44px;cursor:pointer;box-shadow:3px 3px 7px #9cadba44,-3px -3px 7px #ffffffcc;touch-action:manipulation}
      button#in{background:#dceae7}button:enabled:hover{background:#dceae7}button:enabled:active{box-shadow:inset 2px 2px 5px #9cadba55,inset -2px -2px 5px #ffffff99}button:focus-visible{outline:2px solid #276a68;outline-offset:2px}button:disabled{color:#a2b1b6;box-shadow:none;cursor:default;opacity:.65}
      #status{order:1;flex:none;text-align:center;padding:10px;color:#637a84}#status[hidden]{display:none}
      #pages{order:0;flex:1;min-height:0;overflow:auto;padding:12px;border-radius:22px;background:#e0e8ec;box-shadow:inset 5px 5px 12px #9cadba40,inset -5px -5px 12px #ffffffb3;overscroll-behavior:contain}
      canvas{display:block;margin:auto;background:white;border-radius:3px;box-shadow:0 4px 14px #233e481c}
    </style></head><body><header><button id="previous" disabled aria-label="Previous page">‹</button><span id="number" aria-live="polite">PDF preview</span><button id="next" disabled aria-label="Next page">›</button><button id="out" disabled aria-label="Zoom out">−</button><button id="in" disabled aria-label="Zoom in">+</button></header><div id="status" role="status">Loading preview…</div><main id="pages"><canvas aria-label="PDF page"></canvas></main><script type="module" src="/api/pdf-preview/assets/client.js"></script></body></html>`);
  });
}
