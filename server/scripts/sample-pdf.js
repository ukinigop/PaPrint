import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { mkdir, writeFile } from "node:fs/promises";
const pdf = await PDFDocument.create();
const font = await pdf.embedFont(StandardFonts.Helvetica);
for (let i = 1; i <= 2; i++) {
  const page = pdf.addPage([595, 842]);
  page.drawText("PaPrint - sample printing document", {
    x: 50,
    y: 760,
    size: 22,
    font,
    color: rgb(0.27, 0.4, 0.96),
  });
  page.drawText(`Page ${i} of 2. This file contains no customer information.`, {
    x: 50,
    y: 710,
    size: 12,
    font,
  });
}
await mkdir("../samples", { recursive: true });
await writeFile("../samples/sample-print.pdf", await pdf.save());
console.log("Created samples/sample-print.pdf");
