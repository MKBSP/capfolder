import { withSignaturePage } from "@capfolder/core";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { expect, test } from "vitest";
import { pageTexts, verifySigned } from "./pdfverify";

async function pdf(lines: string[]) {
  const d = await PDFDocument.create();
  const f = await d.embedFont(StandardFonts.Helvetica);
  for (const l of lines) d.addPage([612, 792]).drawText(l, { x: 72, y: 700, size: 12, font: f });
  return d.save();
}

test("reads page text", async () => {
  expect(await pageTexts(await pdf(["Purchase Amount $250,000", "Page two"]))).toEqual([
    "Purchase Amount $250,000",
    "Page two",
  ]);
});

test("a sealed copy with extra pages passes; a changed term doesn't", async () => {
  const original = await pdf(["The Purchase Amount is $250,000."]);
  const sent = await withSignaturePage(original, {
    title: "SAFE",
    signers: [{ name: "Fund Y", email: "f@y.example" }],
  });
  const sealed = await PDFDocument.load(sent.pdf);
  sealed.addPage([612, 792]); // Documenso's certificate page
  expect(await verifySigned(sent.pdf, await sealed.save(), sent.originalPages)).toEqual({ ok: true });
  const tampered = await pdf(["The Purchase Amount is $25,000."]);
  const t = await withSignaturePage(tampered, {
    title: "SAFE",
    signers: [{ name: "Fund Y", email: "f@y.example" }],
  });
  expect(await verifySigned(sent.pdf, t.pdf, sent.originalPages)).toEqual({
    ok: false,
    reason: "Page 1 of the signed copy doesn't match what you sent.",
  });
  expect((await verifySigned(sent.pdf, new Uint8Array([1, 2, 3]), 1)).ok).toBe(false);
});

test("WebKit (the macOS app) has no async iterator on ReadableStream: text still reads", async () => {
  const proto = ReadableStream.prototype as unknown as Record<symbol, unknown>;
  const native = proto[Symbol.asyncIterator];
  delete proto[Symbol.asyncIterator];
  try {
    const { PDFDocument, StandardFonts } = await import("pdf-lib");
    const d = await PDFDocument.create();
    d.addPage([612, 792]).drawText("Hello WebKit", {
      x: 72,
      y: 700,
      font: await d.embedFont(StandardFonts.Helvetica),
    });
    const { pageInfo } = await import("./pdfverify");
    expect((await pageInfo(await d.save()))[0]!.text).toBe("Hello WebKit");
  } finally {
    proto[Symbol.asyncIterator] = native;
  }
});

test("the signature page itself may gain signatures but must keep its own text (YC's names, title, wording)", async () => {
  const { PDFDocument, StandardFonts } = await import("pdf-lib");
  const make = async (sig: string, extra?: string) => {
    const d = await PDFDocument.create();
    const f = await d.embedFont(StandardFonts.Helvetica);
    d.addPage([612, 792]).drawText("The SAFE terms", { x: 72, y: 700, font: f });
    const p = d.addPage([612, 792]);
    p.drawText(sig, { x: 72, y: 700, font: f });
    if (extra) p.drawText(extra, { x: 72, y: 600, font: f });
    return d.save();
  };
  const sent = await make("IN WITNESS WHEREOF ACME INC. By: Mads Petersen CEO");
  expect(
    await verifySigned(sent, await make("IN WITNESS WHEREOF ACME INC. By: Mads Petersen CEO", "Mads P"), 1),
  ).toEqual({ ok: true });
  expect(
    await verifySigned(sent, await make("IN WITNESS WHEREOF EVIL INC. By: Mads Petersen CEO"), 1),
  ).toMatchObject({
    ok: false,
    reason: "Page 2 of the signed copy doesn't keep the text you sent.",
  });
});
