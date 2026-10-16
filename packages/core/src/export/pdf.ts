// The cap table as a printable PDF (for the lawyer zip). One table per sheet, landscape, Helvetica.
// ponytail: standard PDF fonts only cover Latin-1-ish (WinAnsi); other characters print as "?". Embed IBM Plex for full Unicode.
import { PDFDocument, type PDFFont, rgb, StandardFonts } from "pdf-lib";
import { fmtInt, parseDec, ratioFixed } from "../num";
import { type Cell, cellText, type Sheet } from "./sheets";

const W = 792;
const H = 612;
const M = 36;
const SIZE = 8;
const LINE = 12;

function safeText(font: PDFFont, cache: Map<string, string>) {
  return (s: string) =>
    [...s.replace(/[\r\n\t]+/g, " ")]
      .map((ch) => {
        let out = cache.get(ch);
        if (out === undefined) {
          try {
            font.encodeText(ch);
            out = ch;
          } catch {
            out = "?";
          }
          cache.set(ch, out);
        }
        return out;
      })
      .join("");
}

const show = (c: Cell) =>
  typeof c === "bigint"
    ? fmtInt(c)
    : c !== null && typeof c === "object" && "pct" in c
      ? `${ratioFixed(parseDec(c.pct).v * 100n, 10n ** BigInt(parseDec(c.pct).scale), 2)}%`
      : cellText(c);

export async function toPdf(sheets: Sheet[], title: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const clean = safeText(font, new Map());
  doc.setTitle(clean(title));
  doc.setProducer("Capfolder");
  doc.setCreator("Capfolder");

  let page = doc.addPage([W, H]);
  let y = H - M;
  const newPage = () => {
    page = doc.addPage([W, H]);
    y = H - M;
  };
  const fit = (s: string, f: PDFFont, width: number) => {
    if (f.widthOfTextAtSize(s, SIZE) <= width) return s;
    let t = s;
    while (t && f.widthOfTextAtSize(`${t}…`, SIZE) > width) t = t.slice(0, -1);
    return `${t}…`;
  };
  const words = (s: string, f: PDFFont, width: number) => {
    const lines: string[] = [];
    let cur = "";
    for (const w of s.split(" ")) {
      const next = cur ? `${cur} ${w}` : w;
      if (f.widthOfTextAtSize(next, SIZE) > width && cur) {
        lines.push(cur);
        cur = w;
      } else cur = next;
    }
    return cur ? [...lines, cur] : lines;
  };

  page.drawText(clean(title), { x: M, y, size: 14, font: bold });
  y -= 24;
  for (const s of sheets) {
    if (y < M + 4 * LINE) newPage();
    page.drawText(clean(s.name), { x: M, y, size: 11, font: bold });
    y -= LINE + 4;
    const table = s.rows.filter((r) => r.length > 1);
    const ncol = Math.max(0, ...table.map((r) => r.length));
    const want = Array.from({ length: ncol }, (_, i) =>
      Math.min(40, Math.max(4, ...table.map((r) => clean(show(r[i] ?? null)).length))),
    );
    const total = want.reduce((a, b) => a + b, 0) || 1;
    const widths = want.map((w) => ((W - 2 * M) * w) / total);
    s.rows.forEach((r, i) => {
      if (y < M) newPage();
      const f = s.header.includes(i) ? bold : font;
      if (r.length === 0) {
        y -= LINE / 2;
        return;
      }
      if (r.length === 1) {
        for (const line of words(clean(show(r[0] ?? null)), font, W - 2 * M)) {
          if (y < M) newPage();
          page.drawText(line, { x: M, y, size: SIZE, font, color: rgb(0.35, 0.36, 0.4) });
          y -= LINE;
        }
        return;
      }
      let x = M;
      r.forEach((c, j) => {
        const w = widths[j] ?? 0;
        const t = fit(clean(show(c)), f, w - 4);
        if (t) page.drawText(t, { x, y, size: SIZE, font: f });
        x += w;
      });
      y -= LINE;
    });
    y -= LINE;
  }
  return doc.save();
}
