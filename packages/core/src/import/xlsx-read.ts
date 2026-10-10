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

export function readXlsx(bytes: Uint8Array): { name: string; rows: string[][] }[] {
  const files = unzipSync(bytes);
  const read = (p: string) => (files[p] ? strFromU8(files[p]!) : "");
  const shared = [...read("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1]!));
  const rels = new Map(
    [...read("xl/_rels/workbook.xml.rels").matchAll(/<Relationship\b[^>]*>/g)].map((m) => [
      attr(m[0], "Id"),
      attr(m[0], "Target")?.replace(/^\/?(xl\/)?/, "xl/"),
    ]),
  );
  return [...read("xl/workbook.xml").matchAll(/<sheet\b[^>]*>/g)].map((m) => {
    const xml = read(rels.get(attr(m[0], "r:id")) ?? "");
    const rows: string[][] = [];
    for (const row of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>|<row\b([^>]*)\/>/g)) {
      const r = Number(attr(row[1] ?? row[3] ?? "", "r") ?? rows.length + 1) - 1;
      const cells: string[] = [];
      let next = 0;
      for (const c of (row[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
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
                : decode(v);
        while (cells.length < i) cells.push("");
        cells[i] = val;
      }
      while (rows.length < r) rows.push([]);
      rows[r] = cells;
    }
    return { name: decode(attr(m[0], "name") ?? "Sheet"), rows };
  });
}
