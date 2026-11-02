// Bounded native/WebView messages avoid copying a large PDF into one script.
export const pdfChunkSize = 48 * 1024;
const alphabet =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
export function pdfChunk(bytes: ArrayBuffer, offset: number) {
  if (!Number.isInteger(offset) || offset < 0 || offset >= bytes.byteLength)
    throw new Error("Invalid PDF chunk offset.");
  const data = new Uint8Array(
    bytes,
    offset,
    Math.min(pdfChunkSize, bytes.byteLength - offset),
  );
  let encoded = "";
  for (let i = 0; i < data.length; i += 3) {
    const a = data[i],
      b = data[i + 1] || 0,
      c = data[i + 2] || 0;
    encoded +=
      alphabet[a >> 2] +
      alphabet[((a & 3) << 4) | (b >> 4)] +
      (i + 1 < data.length ? alphabet[((b & 15) << 2) | (c >> 6)] : "=") +
      (i + 2 < data.length ? alphabet[c & 63] : "=");
  }
  return {
    offset,
    total: bytes.byteLength,
    base64: encoded,
    next: offset + data.length,
  };
}
