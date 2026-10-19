import { PDFDocument } from "pdf-lib";
import { expect, test } from "vitest";
import { withSignaturePage } from "../src/export/signature-page";

test("adds one signature page with a box per signer, in order, and keeps the original pages", async () => {
  const src = await PDFDocument.create();
  src.addPage([612, 792]);
  src.addPage([612, 792]);
  const original = await src.save();
  const r = await withSignaturePage(original, {
    title: "SAFE · Fund Y",
    signers: [
      { name: "Fund Y", email: "fund@y.example" },
      { name: "Tim Apple", email: "tim@acme.example" },
    ],
  });
  const out = await PDFDocument.load(r.pdf);
  expect(out.getPageCount()).toBe(3);
  expect(out.getPage(2).getSize()).toEqual({ width: 612, height: 792 });
  expect(r.fields.map((f) => [f.signer, f.page])).toEqual([
    [0, 3],
    [1, 3],
  ]);
  for (const f of r.fields) {
    expect(f.x).toBeGreaterThan(0);
    expect(f.x + f.w).toBeLessThan(100);
    expect(f.y + f.h).toBeLessThan(100);
  }
  expect(r.fields[1]!.y).toBeGreaterThan(r.fields[0]!.y + r.fields[0]!.h); // stacked, no overlap
  expect(r.originalPages).toBe(2);
});

test("many signers spill onto more signature pages", async () => {
  const src = await PDFDocument.create();
  src.addPage([612, 792]);
  const signers = Array.from({ length: 9 }, (_, i) => ({ name: `Signer ${i}`, email: `s${i}@x.example` }));
  const r = await withSignaturePage(await src.save(), { title: "T", signers });
  expect((await PDFDocument.load(r.pdf)).getPageCount()).toBeGreaterThan(2);
  expect(new Set(r.fields.map((f) => `${f.page}:${f.y}`)).size).toBe(9);
});
