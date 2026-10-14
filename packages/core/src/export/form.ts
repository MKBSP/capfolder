// YC forms (templates/yc/*.json, made by scripts/docx-to-form.mjs) filled in and laid out as a PDF. Only the
// bracketed blanks change; every other character is YC's (CC BY-ND 4.0: unmodified except for the blanks).
import { PDFDocument, type PDFFont, rgb, StandardFonts } from "pdf-lib";

export interface FormRun {
  t: string;
  b?: boolean;
  i?: boolean;
  u?: boolean;
  caps?: boolean;
}
export interface FormParagraph {
  align?: "center";
  bullet?: boolean;
  indent: number; // points
  first: number; // first-line indent, points
  runs: FormRun[];
}
export interface Form {
  source: string;
  license: string;
  header: string;
  footer: string;
  paragraphs: FormParagraph[];
}

/** Blank → value, keyed by the blank's text in lower case without brackets ("company name", "_" for $[____]). */
export type FormValues = (blank: string, paragraph: string) => string | undefined;

const MONTHS = "January February March April May June July August September October November December".split(
  " ",
);
const longDate = (iso: string) =>
  `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}, ${iso.slice(0, 4)}`;
const dollars = (n: string) => {
  const [i = "0", f] = n.split(".");
  return `$${i.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${f && Number(f) ? `.${f}` : ""}`;
};

export function ycSafeValues(v: {
  company: string;
  investor: string;
  amount: string;
  cap?: string;
  discount?: string; // a fraction, "0.20"
  date: string; // YYYY-MM-DD
  state: string;
  signerName: string;
  signerTitle: string;
}): FormValues {
  return (blank, paragraph) => {
    if (blank === "_")
      return paragraph.includes("Valuation Cap” is")
        ? v.cap
          ? dollars(v.cap)
          : undefined
        : dollars(v.amount);
    if (blank === "100 minus the discount")
      return v.discount ? String(Math.round((1 - Number(v.discount)) * 10000) / 100) : undefined;
    return {
      "company name": v.company,
      company: v.company,
      "investor name": v.investor,
      "date of safe": longDate(v.date),
      "state of incorporation": v.state,
      "governing law jurisdiction": v.state,
      name: v.signerName,
      title: v.signerTitle,
    }[blank];
  };
}

const BLANK = /\$?\[([^\]]*)\]/g;

/** Replaces each blank the values know; the value takes the style of the run the blank starts in. */
export function fillForm(form: Form, values: FormValues): Form {
  return {
    ...form,
    paragraphs: form.paragraphs.map((p) => {
      const whole = p.runs.map((r) => r.t).join("");
      const hits = [...whole.matchAll(BLANK)]
        .map((m) => {
          const inner = m[1]!.trim();
          const key = /^_+$/.test(inner) ? "_" : inner.toLowerCase();
          const v = values(key, whole);
          return v === undefined
            ? null
            : {
                start: m.index!,
                end: m.index! + m[0].length,
                v: inner === inner.toUpperCase() && /[A-Z]/.test(inner) ? v.toUpperCase() : v,
              };
        })
        .filter((h) => h !== null);
      if (!hits.length) return p;
      const runs: FormRun[] = [];
      let pos = 0;
      for (const r of p.runs) {
        let t = "";
        for (let i = 0; i < r.t.length; i++) {
          const at = pos + i;
          const h = hits.find((x) => at >= x.start && at < x.end);
          if (!h) t += r.t[i];
          else if (at === h.start) t += h.v;
        }
        pos += r.t.length;
        if (t) runs.push({ ...r, t });
      }
      return { ...p, runs };
    }),
  };
}

// Letter, 1" margins, Times like the Word original.
const W = 612;
const H = 792;
const M = 72;
const SIZE = 11;
const LEAD = 14;
const TAB = 36;

export async function renderForm(form: Form): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fonts = {
    r: await doc.embedFont(StandardFonts.TimesRoman),
    b: await doc.embedFont(StandardFonts.TimesRomanBold),
    i: await doc.embedFont(StandardFonts.TimesRomanItalic),
    bi: await doc.embedFont(StandardFonts.TimesRomanBoldItalic),
  };
  const fontOf = (r: FormRun) => (r.b && r.i ? fonts.bi : r.b ? fonts.b : r.i ? fonts.i : fonts.r);
  const ok = new Map<string, boolean>();
  const safe = (s: string, f: PDFFont) =>
    [...s]
      .map((c) => {
        if (!ok.has(c))
          try {
            f.encodeText(c);
            ok.set(c, true);
          } catch {
            ok.set(c, false);
          }
        return ok.get(c) ? c : c === "" ? "•" : "?";
      })
      .join("");
  const small = (page: ReturnType<typeof doc.addPage>, text: string, y: number) => {
    const words = safe(text, fonts.r).split(" ");
    let line = "";
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (fonts.r.widthOfTextAtSize(next, 7) > W - 2 * M) {
        page.drawText(line, { x: M, y, size: 7, font: fonts.r, color: rgb(0.4, 0.4, 0.4) });
        y -= 9;
        line = w;
      } else line = next;
    }
    if (line) page.drawText(line, { x: M, y, size: 7, font: fonts.r, color: rgb(0.4, 0.4, 0.4) });
  };

  let page = doc.addPage([W, H]);
  let y = H - M;
  const newPage = () => {
    page = doc.addPage([W, H]);
    y = H - M;
  };

  for (const p of form.paragraphs) {
    const text = p.runs.map((r) => r.t).join("");
    if (!text.trim()) {
      y -= LEAD / 2;
      continue;
    }
    const left = M + Math.min(p.indent, 300) + (p.bullet ? 36 : 0);
    // A word can span runs ("“" + bold "Investor" + "”)"): its pieces stay together on one line.
    type Seg = { t: string; f: PDFFont; u?: boolean; w: number };
    type Word = { segs: Seg[]; w: number } | { tab: true } | { space: number; u?: boolean };
    const words: Word[] = [];
    for (const r of p.runs) {
      const f = fontOf(r);
      for (const part of (r.caps ? r.t.toUpperCase() : r.t).split(/(\t| +)/)) {
        if (!part) continue;
        if (part === "\t") words.push({ tab: true });
        else if (part.startsWith(" ")) words.push({ space: f.widthOfTextAtSize(" ", SIZE), u: r.u });
        else {
          const t = safe(part, f);
          const seg = { t, f, u: r.u, w: f.widthOfTextAtSize(t, SIZE) };
          const last = words.at(-1);
          if (last && "segs" in last) {
            last.segs.push(seg);
            last.w += seg.w;
          } else words.push({ segs: [seg], w: seg.w });
        }
      }
    }
    type Item = { x: number; segs: Seg[]; w: number; ul?: number }; // ul: underlined space after it
    const lines: Item[][] = [];
    let x = left + (p.bullet ? 0 : p.first);
    let cur: Item[] = [];
    let pendingSpace: { w: number; u?: boolean } | null = null;
    for (const w of words) {
      if ("tab" in w) {
        x = left + (Math.floor((x - left) / TAB) + 1) * TAB;
        pendingSpace = null;
      } else if ("space" in w) {
        if (cur.length) {
          x += w.space;
          pendingSpace = { w: w.space, u: w.u };
        }
      } else {
        if (x + w.w > W - M && cur.length) {
          lines.push(cur);
          cur = [];
          x = left;
        } else if (pendingSpace?.u && cur.length && w.segs[0]!.u) cur.at(-1)!.ul = pendingSpace.w;
        pendingSpace = null;
        cur.push({ x, segs: w.segs, w: w.w });
        x += w.w;
      }
    }
    lines.push(cur);
    for (const [n, line] of lines.entries()) {
      if (!line.length) continue;
      if (y < M + 30) newPage();
      const end = line.at(-1)!.x + line.at(-1)!.w;
      const shift = p.align === "center" ? (W - 2 * M - (end - line[0]!.x)) / 2 - (line[0]!.x - M) : 0;
      if (p.bullet && n === 0) page.drawText("•", { x: left - 18, y, size: SIZE, font: fonts.r });
      for (const it of line) {
        let sx = it.x + shift;
        for (const s of it.segs) {
          page.drawText(s.t, { x: sx, y, size: SIZE, font: s.f });
          const uw = s.w + (s === it.segs.at(-1) ? (it.ul ?? 0) : 0);
          if (s.u)
            page.drawLine({ start: { x: sx, y: y - 1.5 }, end: { x: sx + uw, y: y - 1.5 }, thickness: 0.5 });
          sx += s.w;
        }
      }
      y -= LEAD;
    }
    y -= 6;
    if (text.trim() === "(Signature page follows)") newPage();
  }

  const pages = doc.getPages();
  pages.forEach((pg, i) => {
    if (form.header)
      pg.drawText(safe(form.header, fonts.r), {
        x: M,
        y: H - 40,
        size: 7,
        font: fonts.r,
        color: rgb(0.4, 0.4, 0.4),
      });
    if (form.footer) small(pg, form.footer, 46);
    const n = `- ${i + 1} -`;
    pg.drawText(n, { x: (W - fonts.r.widthOfTextAtSize(n, 8)) / 2, y: 24, size: 8, font: fonts.r });
  });
  return doc.save();
}
