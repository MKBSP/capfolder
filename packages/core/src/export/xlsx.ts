// A minimal SpreadsheetML (.xlsx) writer: one zip of XML parts. Text is always an inline string, never a formula.
// ponytail: write-only, no shared strings or styles beyond bold, #,##0, 0.00% and dates; a library is worth it once we need more.
import { strToU8, zipSync } from "fflate";
import { type Cell, cellText, type Sheet } from "./sheets";

const esc = (s: string) =>
  s
    // biome-ignore lint/suspicious/noControlCharactersInRegex: XML 1.0 forbids these characters
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const NUMBER = /^-?\d+(\.\d+)?(e[+-]?\d+)?$/i;

const col = (i: number): string =>
  (i < 26 ? "" : col(Math.floor(i / 26) - 1)) + String.fromCharCode(65 + (i % 26));
const len = (c: Cell) => (c !== null && typeof c === "object" && !("num" in c) ? 10 : cellText(c).length);
/** Excel's day number: days since 1899-12-30. */
const serial = (iso: string) =>
  (Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) - Date.UTC(1899, 11, 30)) / 864e5;

function cellXml(c: Cell, ref: string, bold: boolean): string {
  if (c === null || c === "") return "";
  if (typeof c === "bigint") return `<c r="${ref}" s="${bold ? 5 : 2}"><v>${c}</v></c>`;
  if (typeof c === "object") {
    // values from the vault are strings: anything that isn't a plain number goes in as text, never raw XML
    const v = "pct" in c ? c.pct : "num" in c ? c.num : null;
    if (v !== null && !NUMBER.test(v)) return cellXml(v, ref, bold);
    if ("pct" in c) return `<c r="${ref}" s="3"><v>${c.pct}</v></c>`;
    if ("date" in c)
      return Number.isNaN(serial(c.date)) ? "" : `<c r="${ref}" s="4"><v>${serial(c.date)}</v></c>`;
    return `<c r="${ref}"><v>${c.num}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr"${bold ? ' s="1"' : ""}><is><t xml:space="preserve">${esc(c)}</t></is></c>`;
}

function sheetXml(s: Sheet): string {
  const widths: number[] = [];
  for (const r of s.rows) {
    if (r.length === 1) continue; // a lone long cell (the disclaimer) shouldn't widen column A
    r.forEach((c, i) => {
      widths[i] = Math.min(60, Math.max(widths[i] ?? 8, len(c) + 2));
    });
  }
  const cols = widths
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join("");
  const rows = s.rows
    .map(
      (r, i) =>
        `<row r="${i + 1}">${r.map((c, j) => cellXml(c, `${col(j)}${i + 1}`, s.header.includes(i))).join("")}</row>`,
    )
    .join("");
  const view = s.freeze
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${s.freeze}" topLeftCell="A${s.freeze + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${view}${cols ? `<cols>${cols}</cols>` : ""}<sheetData>${rows}</sheetData></worksheet>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="3" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

/** Excel's sheet name rules: 31 characters, none of []:*?/\, unique (case-insensitive). */
function sheetNames(sheets: Sheet[]): string[] {
  const seen = new Set<string>();
  return sheets.map((s) => {
    const base = s.name.replace(/[[\]:*?/\\]/g, " ").slice(0, 31) || "Sheet";
    let name = base;
    for (let i = 2; seen.has(name.toLowerCase()); i++)
      name = `${base.slice(0, 31 - String(i).length - 1).trimEnd()} ${i}`;
    seen.add(name.toLowerCase());
    return name;
  });
}

/** The sheets as .xlsx bytes. */
export function toXlsx(sheets: Sheet[]): Uint8Array {
  const names = sheetNames(sheets);
  const n = sheets.map((_, i) => i + 1);
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${n.map((i) => `<Override PartName="/xl/worksheets/sheet${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    "xl/workbook.xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((name, i) => `<sheet name="${esc(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`,
    ),
    "xl/_rels/workbook.xml.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${n.map((i) => `<Relationship Id="rId${i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i}.xml"/>`).join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ),
    "xl/styles.xml": strToU8(STYLES),
  };
  sheets.forEach((s, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(s));
  });
  return zipSync(files);
}
