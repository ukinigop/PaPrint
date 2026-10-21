import type { Order } from "./types";

// Convert the booking's continuous page numbers into numbers in this original PDF.
// Null means there are no printable pages in this file (or invalid historical data).
export function filePrintRange(
  files: Order["files"],
  fileId: string,
  pageRange = "",
): string | null {
  const index = files.findIndex((file) => file.upload === fileId);
  if (
    index < 0 ||
    files.some((file) => !Number.isInteger(file.pages) || file.pages < 1)
  )
    return null;
  if (!pageRange.trim()) return "All pages";
  const total = files.reduce((sum, file) => sum + file.pages, 0);
  const offset = files
    .slice(0, index)
    .reduce((sum, file) => sum + file.pages, 0);
  const intervals: [number, number][] = [];
  for (const part of pageRange.split(",")) {
    if (!/^\s*\d+\s*(-\s*\d+\s*)?$/.test(part)) return null;
    const [first, last = first] = part.split("-").map(Number);
    if (first < 1 || last < first || last > total) return null;
    const start = Math.max(first, offset + 1) - offset;
    const end = Math.min(last, offset + files[index].pages) - offset;
    if (start <= end) intervals.push([start, end]);
  }
  intervals.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const interval of intervals) {
    const previous = merged[merged.length - 1];
    if (previous && interval[0] <= previous[1] + 1)
      previous[1] = Math.max(previous[1], interval[1]);
    else merged.push([...interval]);
  }
  return merged.length
    ? merged
        .map(([start, end]) =>
          start === end ? String(start) : `${start}-${end}`,
        )
        .join(", ")
    : null;
}
