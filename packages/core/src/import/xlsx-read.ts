// A minimal .xlsx reader: sheet names and cell text. Numbers come back as written (dates are Excel serials;
// the importer converts them by the column's meaning). Formulas give their cached value.
// ponytail: regex over the XML parts, no styles; swap for a library if real exports need more.
import { strFromU8, unzipSync } from "fflate";

const decode = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(Number.parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");

const attr = (tag: string, name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];
const texts = (xml: string) =>
  [...xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1]!)).join("");
const colIndex = (ref: string) =>
  [...(/^[A-Z]+/.exec(ref)?.[0] ?? "A")].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1;

/** Excel stores 0.00001 as 1.0000000000000001E-5: round to 15 significant digits and write it out plainly. */
export function plainNumber(v: string): string {
  if (!/^-?\d+(\.\d+)?(e[-+]?\d+)?$/i.test(v)) return v;
  const [mant, expRaw] = Number(v).toPrecision(15).split("e");
  let [int, frac = ""] = mant!.replace("-", "").split(".");
  const exp = Number(expRaw ?? 0);
  if (exp > 0) {
    frac = frac.padEnd(exp, "0");
    [int, frac] = [int + frac.slice(0, exp), frac.slice(exp)];
  } else if (exp < 0) {
    [int, frac] = ["0", "0".repeat(-exp - 1) + int + frac];
  }
  frac = frac.replace(/0+$/, "");
  int = int!.replace(/^0+(?=\d)/, "");
  return `${v.startsWith("-") ? "-" : ""}${int}${frac ? `.${frac}` : ""}`;
}

export function readXlsx(bytes: Uint8Array): { name: string; rows: string[][]; date1904?: boolean }[] {
  const files = unzipSync(bytes);
  // Some writers (OpenXML SDK) prefix every tag: <x:row>. Tag prefixes are dropped; attributes like r:id stay.
  const read = (p: string) => (files[p] ? strFromU8(files[p]!).replace(/<(\/?)[A-Za-z]\w*:/g, "<$1") : "");
  const shared = [...read("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1]!));
  const rels = new Map(
    [...read("xl/_rels/workbook.xml.rels").matchAll(/<Relationship\b[^>]*>/g)].map((m) => [
      attr(m[0], "Id"),
      attr(m[0], "Target")?.replace(/^\/?(xl\/)?/, "xl/"),
    ]),
  );
  const workbook = read("xl/workbook.xml");
  const pr = /<workbookPr\b[^>]*>/.exec(workbook)?.[0] ?? "";
  const date1904 = /date1904="(1|true)"/.test(pr);
  return [...workbook.matchAll(/<sheet\b[^>]*>/g)].map((m) => {
    const xml = read(rels.get(attr(m[0], "r:id")) ?? "");
    const rows: string[][] = [];
    for (const row of xml.matchAll(/<row\b([^>]*?)\/>|<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
      const r = Number(attr(row[1] ?? row[2] ?? "", "r") ?? rows.length + 1) - 1;
      const cells: string[] = [];
      let next = 0;
      for (const c of (row[3] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = attr(c[1]!, "r");
        const i = ref ? colIndex(ref) : next;
        next = i + 1;
        const t = attr(c[1]!, "t");
        const inner = c[2] ?? "";
        const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
        const val =
          t === "s"
            ? (shared[Number(v)] ?? "")
            : t === "inlineStr"
              ? texts(inner)
              : v === undefined
                ? ""
                : !t || t === "n"
                  ? plainNumber(decode(v))
                  : decode(v);
        while (cells.length < i) cells.push("");
        cells[i] = val;
      }
      while (rows.length < r) rows.push([]);
      rows[r] = cells;
    }
    return { name: decode(attr(m[0], "name") ?? "Sheet"), rows, ...(date1904 ? { date1904 } : {}) };
  });
}
