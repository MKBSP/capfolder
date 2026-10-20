// @vitest-environment node
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { reduce, sortText } from "@capfolder/core";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { createWorker } from "tesseract.js";
import { describe, expect, test } from "vitest";
import { readText } from "./docread";

const acmeNoDocs = () =>
  readFileSync(new URL("../../../fixtures/acme-vault/events.jsonl", import.meta.url), "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l))
    .filter((e) => !e.type.startsWith("doc_"));
const require = createRequire(import.meta.url);
const langPath = join(dirname(require.resolve("@tesseract.js-data/eng/package.json")), "4.0.0_best_int");

async function pdf(lines: string[][]) {
  const d = await PDFDocument.create();
  const f = await d.embedFont(StandardFonts.Helvetica);
  for (const page of lines) {
    const p = d.addPage([612, 792]);
    page.forEach((l, i) => {
      p.drawText(l, { x: 72, y: 720 - i * 16, size: 11, font: f });
    });
  }
  return d.save();
}
const noOcr = { image: async () => "", pdfPage: async () => "OCR TEXT" };

describe("readText", () => {
  test("a text PDF keeps its lines and isn't OCR'd", async () => {
    const r = await readText(
      await pdf([["STOCK OPTION GRANT NOTICE", "Optionholder: Steve Wozniak"]]),
      "a.pdf",
      noOcr,
    );
    expect(r).toEqual({ text: "STOCK OPTION GRANT NOTICE\nOptionholder: Steve Wozniak", ocr: false });
  });
  test("a page with no text layer goes through OCR", async () => {
    const r = await readText(await pdf([["A page with enough text on it"], []]), "a.pdf", noOcr);
    expect(r).toEqual({ text: "A page with enough text on it\nOCR TEXT", ocr: true });
  });
  test("a scanned SAFE (PNG) is read by tesseract and sorted", async () => {
    const w = await createWorker("eng", 1, { langPath, gzip: true, cacheMethod: "none" });
    try {
      const ocr = { image: async (b: Uint8Array) => (await w.recognize(Buffer.from(b))).data.text };
      const png = new Uint8Array(readFileSync(new URL("./test/fixtures/scan-safe.png", import.meta.url)));
      const r = await readText(png, "scan.png", ocr);
      expect(r.ocr).toBe(true);
      const s = sortText(r.text, reduce(acmeNoDocs(), "9999-12-31"));
      expect(s).toMatchObject({ type: "safe", status: "review", suggestion: "SAFE-3" });
      expect(s.fields).toMatchObject({ amount: "250000", date: "2023-03-14", cap: "10000000" });
    } finally {
      await w.terminate();
    }
  }, 60_000);
});
