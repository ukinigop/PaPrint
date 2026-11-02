import {
  getDocument,
  GlobalWorkerOptions,
} from "/api/pdf-preview/assets/pdf.mjs";

GlobalWorkerOptions.workerSrc = "/api/pdf-preview/assets/pdf.worker.mjs";
const canvas = document.querySelector("canvas");
const status = document.querySelector("#status");
const number = document.querySelector("#number");
const previous = document.querySelector("#previous");
const next = document.querySelector("#next");
const zoomOut = document.querySelector("#out");
const zoomIn = document.querySelector("#in");
let pdf,
  task,
  rendering,
  page = 1,
  zoom = 1,
  received = false;
const notify = (type, extra = {}) =>
  window.ReactNativeWebView?.postMessage(JSON.stringify({ type, ...extra }));
function controls(busy = false) {
  previous.disabled = busy || !pdf || page === 1;
  next.disabled = busy || !pdf || page === pdf.numPages;
  zoomOut.disabled = busy || !pdf || zoom <= 1;
  zoomIn.disabled = busy || !pdf || zoom >= 2;
}
async function render() {
  controls(true);
  status.hidden = false;
  status.textContent = "Loading page…";
  try {
    const current = await pdf.getPage(page);
    const natural = current.getViewport({ scale: 1 });
    const width = Math.max(
      100,
      document.querySelector("#pages").clientWidth - 24,
    );
    const viewport = current.getViewport({
      scale: Math.min(width / natural.width, 2) * zoom,
    });
    // Bound canvas memory for unusually large pages and high-density phones.
    const ratio = Math.min(
      window.devicePixelRatio || 1,
      2,
      4096 / Math.max(viewport.width, viewport.height),
    );
    canvas.width = Math.ceil(viewport.width * ratio);
    canvas.height = Math.ceil(viewport.height * ratio);
    canvas.style.width = `${viewport.width}px`;
    canvas.style.height = `${viewport.height}px`;
    rendering = current.render({
      canvasContext: canvas.getContext("2d"),
      viewport,
      transform: [ratio, 0, 0, ratio, 0, 0],
    });
    await rendering.promise;
    number.textContent = `Page ${page} of ${pdf.numPages}`;
    canvas.setAttribute("aria-label", `PDF page ${page} of ${pdf.numPages}`);
    status.hidden = true;
    current.cleanup();
    notify("paprint-pdf-rendered");
  } catch {
    status.textContent =
      "This page could not be displayed. Close the preview and retry.";
    notify("paprint-pdf-error");
  } finally {
    controls();
  }
}
previous.onclick = () => {
  page--;
  void render();
};
next.onclick = () => {
  page++;
  void render();
};
zoomOut.onclick = () => {
  zoom = Math.max(1, zoom - 0.25);
  void render();
};
zoomIn.onclick = () => {
  zoom = Math.min(2, zoom + 0.25);
  void render();
};
async function loadPdf(bytes) {
  if (received) return;
  received = true;
  try {
    task = getDocument({
      data: new Uint8Array(bytes),
      isEvalSupported: false,
      useWasm: false,
      cMapUrl: "/api/pdf-preview/resources/cmaps/",
      cMapPacked: true,
      standardFontDataUrl: "/api/pdf-preview/resources/standard_fonts/",
    });
    pdf = await task.promise;
    await render();
  } catch {
    status.textContent =
      "This PDF could not be previewed. Close the preview and retry.";
    notify("paprint-pdf-error");
  }
}
window.addEventListener("message", (event) => {
  if (
    event.source !== parent ||
    event.origin !== location.origin ||
    event.data?.type !== "paprint-pdf" ||
    !(event.data.bytes instanceof ArrayBuffer)
  )
    return;
  void loadPdf(event.data.bytes);
});
// Native sends small acknowledged chunks; authentication stays in the app's
// API layer. No file URL, token, or downloaded file enters the reader.
if (window.ReactNativeWebView && parent === window) {
  let buffer = null,
    next = 0;
  window.paprintPdfChunk = (chunk) => {
    if (
      received ||
      !chunk ||
      !Number.isInteger(chunk.total) ||
      chunk.total < 1 ||
      chunk.total > 32 * 1024 * 1024 ||
      chunk.offset !== next ||
      typeof chunk.base64 !== "string" ||
      chunk.base64.length > 65536
    )
      return;
    try {
      const decoded = atob(chunk.base64);
      if (!decoded.length || next + decoded.length > chunk.total) return;
      if (!buffer) buffer = new Uint8Array(chunk.total);
      if (buffer.length !== chunk.total) return;
      for (let i = 0; i < decoded.length; i++)
        buffer[next + i] = decoded.charCodeAt(i);
      next += decoded.length;
      notify("paprint-pdf-chunk", { next });
      if (next === buffer.length) {
        const bytes = buffer.buffer;
        buffer = null;
        void loadPdf(bytes);
      }
    } catch {
      notify("paprint-pdf-error");
    }
  };
}
window.addEventListener("pagehide", () => {
  rendering?.cancel();
  void task?.destroy();
});
parent.postMessage({ type: "paprint-pdf-ready" }, location.origin);
notify("paprint-pdf-ready");
