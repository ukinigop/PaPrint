// The frame is only a private PDF transport for the browser's own print dialog.
// Never print the parent window: that would print the shop dashboard instead.
export function createPdfPrintJob(blob: Blob, name: string) {
  const frame = document.createElement("iframe");
  const url = URL.createObjectURL(blob);
  let released = false;
  let started = false;
  let settled = false;
  let printWindow: Window | null = null;
  let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const opened = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  const release = () => {
    if (released) return;
    released = true;
    clearTimeout(loadTimer);
    clearTimeout(cleanupTimer);
    frame.onload = null;
    frame.onerror = null;
    try {
      printWindow?.removeEventListener("afterprint", release);
    } catch {
      // A browser PDF viewer may expose a restricted WindowProxy.
    }
    frame.remove();
    URL.revokeObjectURL(url);
  };
  const fail = (error: Error) => {
    if (!settled) {
      settled = true;
      reject(error);
    }
    release();
  };
  const loadTimer = setTimeout(
    () =>
      fail(
        new Error("The PDF did not load. Retry or download the file to print."),
      ),
    30000,
  );
  frame.title = `Print ${name}`;
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  Object.assign(frame.style, {
    position: "fixed",
    width: "1px",
    height: "1px",
    bottom: "0",
    left: "0",
    border: "0",
    opacity: "0",
    pointerEvents: "none",
  });
  frame.onload = () => {
    if (released || started) return;
    started = true;
    clearTimeout(loadTimer);
    try {
      printWindow = frame.contentWindow;
      if (!printWindow)
        throw new Error("The browser print dialog is unavailable.");
      printWindow.addEventListener("afterprint", release);
      // Some PDF viewers omit afterprint; bound their private resource lifetime.
      cleanupTimer = setTimeout(release, 5 * 60 * 1000);
      printWindow.focus();
      printWindow.print();
      settled = true;
      resolve();
    } catch {
      fail(
        new Error(
          "Your browser could not open the print dialog. Download the file to print it.",
        ),
      );
    }
  };
  frame.onerror = () =>
    fail(
      new Error(
        "Could not prepare this PDF. Retry or download the file to print.",
      ),
    );
  frame.src = url;
  try {
    document.body.appendChild(frame);
  } catch {
    fail(new Error("Could not prepare the browser print dialog."));
  }
  return {
    opened,
    dispose() {
      fail(new DOMException("Print request closed.", "AbortError"));
    },
  };
}
