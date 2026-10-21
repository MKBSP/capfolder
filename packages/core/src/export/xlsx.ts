// A minimal SpreadsheetML (.xlsx) writer: one zip of XML parts. Text is always an inline string, never a formula.
// ponytail: write-only, no shared strings or styles beyond bold, #,##0, 0.00% and dates, one-series doughnut/line charts;
// a library is worth it once we need more.
import { strFromU8, strToU8, zipSync } from "fflate";
import { type Cell, type Chart, cellText, type Sheet } from "./sheets";

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
  const drawing = s.charts?.length ? '<drawing r:id="rId1"/>' : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${R}">${view}${cols ? `<cols>${cols}</cols>` : ""}<sheetData>${rows}</sheetData>${drawing}</worksheet>`;
}

const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const C = "http://schemas.openxmlformats.org/drawingml/2006/chart";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const rels = (items: [string, string][]) =>
  `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items.map(([type, target], i) => `<Relationship Id="rId${i + 1}" Type="${R}/${type}" Target="${target}"/>`).join("")}</Relationships>`;
// Capfolder's greens first, then the pool's orange; a doughnut cycles through them
const COLORS = ["1F6F4A", "4FA374", "A8D5B9", "E08A2E", "5B46C7", "8C8F96", "2E86AB", "C9DECF"];

/** A chart part (DrawingML): one series, its cells referenced and cached so every app can draw it. */
function chartXml(c: Chart): string {
  const pts = (vs: string[]) => vs.map((v, i) => `<c:pt idx="${i}"><c:v>${esc(v)}</c:v></c:pt>`).join("");
  const cat = `<c:cat><c:strRef><c:f>${esc(c.cat.ref)}</c:f><c:strCache><c:ptCount val="${c.cat.values.length}"/>${pts(c.cat.values)}</c:strCache></c:strRef></c:cat>`;
  const val = `<c:val><c:numRef><c:f>${esc(c.val.ref)}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${c.val.values.length}"/>${pts(c.val.values)}</c:numCache></c:numRef></c:val>`;
  const fill = (hex: string) => `<a:solidFill><a:srgbClr val="${hex}"/></a:solidFill>`;
  const head = `<c:idx val="0"/><c:order val="0"/><c:tx><c:v>${esc(c.series)}</c:v></c:tx>`;
  const plot =
    c.kind === "doughnut"
      ? `<c:doughnutChart><c:varyColors val="1"/><c:ser>${head}${c.cat.values.map((_, i) => `<c:dPt><c:idx val="${i}"/><c:bubble3D val="0"/><c:spPr>${fill(COLORS[i % COLORS.length]!)}</c:spPr></c:dPt>`).join("")}<c:dLbls><c:numFmt formatCode="0.0%" sourceLinked="0"/><c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="1"/><c:showBubbleSize val="0"/><c:showLeaderLines val="1"/></c:dLbls>${cat}${val}</c:ser><c:firstSliceAng val="0"/><c:holeSize val="55"/></c:doughnutChart>`
      : `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/><c:ser>${head}<c:spPr><a:ln w="28575">${fill(COLORS[0]!)}</a:ln></c:spPr><c:marker><c:symbol val="none"/></c:marker>${cat}${val}<c:smooth val="0"/></c:ser><c:marker val="1"/><c:axId val="1001"/><c:axId val="1002"/></c:lineChart><c:catAx><c:axId val="1001"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:numFmt formatCode="General" sourceLinked="0"/><c:tickLblPos val="nextTo"/><c:txPr><a:bodyPr rot="-2700000"/><a:lstStyle/><a:p><a:pPr><a:defRPr/></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr><c:crossAx val="1002"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:tickLblSkip val="6"/><c:tickMarkSkip val="6"/><c:noMultiLvlLbl val="0"/></c:catAx><c:valAx><c:axId val="1002"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:majorGridlines/><c:numFmt formatCode="#,##0" sourceLinked="0"/><c:tickLblPos val="nextTo"/><c:crossAx val="1001"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>`;
  const legend =
    c.kind === "doughnut" ? '<c:legend><c:legendPos val="r"/><c:overlay val="0"/></c:legend>' : "";
  return `${XML}<c:chartSpace xmlns:c="${C}" xmlns:a="${A}" xmlns:r="${R}"><c:roundedCorners val="0"/><c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:p><a:r><a:rPr lang="en-US" sz="1200" b="1"/><a:t>${esc(c.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/><c:plotArea><c:layout/>${plot}</c:plotArea>${legend}<c:plotVisOnly val="1"/></c:chart><c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="900"><a:latin typeface="Calibri"/></a:defRPr></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr></c:chartSpace>`;
}

/** The drawing that places a tab's charts on its grid; chart k of this drawing is rId k. */
const drawingXml = (charts: Chart[]) =>
  `${XML}<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="${A}">${charts
    .map(
      (c, i) =>
        `<xdr:twoCellAnchor><xdr:from><xdr:col>${c.at.col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${c.at.row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${c.at.col + c.at.cols}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${c.at.row + c.at.rows}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${i + 2}" name="Chart ${i + 1}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="${C}"><c:chart xmlns:c="${C}" xmlns:r="${R}" r:id="rId${i + 1}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`,
    )
    .join("")}</xdr:wsDr>`;

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
  // Charts: sheet → its drawing → the chart parts, each listed in [Content_Types].xml
  const types: string[] = [];
  let d = 0;
  let k = 0;
  sheets.forEach((s, i) => {
    if (!s.charts?.length) return;
    d++;
    files[`xl/worksheets/_rels/sheet${i + 1}.xml.rels`] = strToU8(
      rels([["drawing", `../drawings/drawing${d}.xml`]]),
    );
    files[`xl/drawings/drawing${d}.xml`] = strToU8(drawingXml(s.charts));
    types.push(
      `<Override PartName="/xl/drawings/drawing${d}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`,
    );
    const mine = s.charts.map((c) => {
      k++;
      files[`xl/charts/chart${k}.xml`] = strToU8(chartXml(c));
      types.push(
        `<Override PartName="/xl/charts/chart${k}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`,
      );
      return ["chart", `../charts/chart${k}.xml`] as [string, string];
    });
    files[`xl/drawings/_rels/drawing${d}.xml.rels`] = strToU8(rels(mine));
  });
  if (types.length)
    files["[Content_Types].xml"] = strToU8(
      strFromU8(files["[Content_Types].xml"]!).replace("</Types>", `${types.join("")}</Types>`),
    );
  return zipSync(files);
}
