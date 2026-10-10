// A Capfolder signature page appended to any PDF, with one signature box per signer. Documenso places its
// SIGNATURE fields on these boxes; the original pages stay exactly as they were (checked after signing).
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

export interface SignField {
  signer: number; // index into signers (= signing order)
  page: number; // 1-based
  x: number; // percent of the page, from the left
  y: number; // percent, from the top
  w: number;
  h: number;
}

const MARGIN = 54;
const BLOCK = 110; // points per signer block
const BOX_H = 44;

export async function withSignaturePage(
  original: Uint8Array,
  p: { title: string; signers: { name: string; email: string }[] },
): Promise<{ pdf: Uint8Array; fields: SignField[]; originalPages: number }> {
  const doc = await PDFDocument.load(original);
  const originalPages = doc.getPageCount();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const last = doc.getPage(originalPages - 1).getSize();
  const { width: W, height: H } = last;
  const safe = (s: string) => s.replace(/[^\x20-\x7e -ÿ]/g, "?"); // standard fonts: Latin-1 only
  const fields: SignField[] = [];
  let page = doc.addPage([W, H]);
  let y = H - MARGIN;
  const header = (first: boolean) => {
    page.drawText(first ? "Signatures" : "Signatures (continued)", { x: MARGIN, y, size: 16, font: bold });
    y -= 22;
    page.drawText(safe(p.title).slice(0, 90), { x: MARGIN, y, size: 11, font, color: rgb(0.35, 0.36, 0.4) });
    y -= 34;
  };
  header(true);
  p.signers.forEach((s, i) => {
    if (y - BLOCK < MARGIN) {
      page = doc.addPage([W, H]);
      y = H - MARGIN;
      header(false);
    }
    page.drawText(safe(`${i + 1}. ${s.name}`), { x: MARGIN, y, size: 11, font: bold });
    page.drawText(safe(s.email), { x: MARGIN, y: y - 14, size: 9, font, color: rgb(0.35, 0.36, 0.4) });
    const boxTop = y - 24;
    const boxW = Math.min(260, W - 2 * MARGIN);
    page.drawRectangle({
      x: MARGIN,
      y: boxTop - BOX_H,
      width: boxW,
      height: BOX_H,
      borderColor: rgb(0.8, 0.8, 0.78),
      borderWidth: 1,
    });
    page.drawText("Sign here", {
      x: MARGIN + 6,
      y: boxTop - BOX_H + 6,
      size: 8,
      font,
      color: rgb(0.6, 0.6, 0.6),
    });
    fields.push({
      signer: i,
      page: doc.getPageCount(),
      x: (MARGIN / W) * 100,
      y: ((H - boxTop) / H) * 100,
      w: (boxW / W) * 100,
      h: (BOX_H / H) * 100,
    });
    y -= BLOCK;
  });
  page.drawText("Added by Capfolder for electronic signature. The pages before this one are the document.", {
    x: MARGIN,
    y: MARGIN - 20,
    size: 8,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });
  return { pdf: await doc.save(), fields, originalPages };
}
