import { describe, expect, test } from "vitest";
import { appendEvents } from "../src/append";
import * as b from "../src/builders";
import { captableCsv } from "../src/captable-csv";
import { sheets } from "../src/export/sheets";
import { toXlsx } from "../src/export/xlsx";
import { zip } from "../src/export/zip";
import { buildImport, reconcile } from "../src/import/build";
import { parseCsv } from "../src/import/csv";
import { detectImport } from "../src/import/detect";
import { guessHeaderRow, guessMapping } from "../src/import/fields";
import { ocfImportDrafts } from "../src/import/ocf";
import { readXlsx } from "../src/import/xlsx-read";
import { validateOcf } from "../src/ocf/validate";
import { toOcfExport } from "../src/ocf-export";
import { reduce } from "../src/reduce";
import { capTableRows } from "../src/rows";
import { acmeEvents, readFix } from "./helpers";

const csv = parseCsv(readFix("../import/acme-generic.csv"));
const h = guessHeaderRow(csv);
const header = csv[h]!;
const body = csv.slice(h + 1);
const mapping = guessMapping(header);
const base = { header, rows: body, mapping, firstRow: h + 2, exportDate: "2026-10-07" };

let n = 0;
const ctx = {
  now: () => new Date("2026-10-10T12:00:00Z"),
  newId: () => `evt_M${String(n++).padStart(6, "0")}`,
  deviceId: "d",
};
const strip = (s: string) =>
  s
    .split("\n")
    .map((l) => l.replace(/,[^,]*$/, ""))
    .join("\n");

describe("reading files", () => {
  test("csv with quotes and a title row", () => {
    expect(h).toBe(2);
    expect(header[0]).toBe("Stakeholder");
    expect(body[0]!.slice(0, 5)).toEqual(["Tim Apple", "tim@acme.example", "Common", "Common", "4,000,000"]);
  });
  test("xlsx round trip through our own writer", () => {
    const book = readXlsx(toXlsx(sheets(acmeEvents(), "2026-10-07")));
    expect(book.map((s) => s.name)).toEqual(["Summary", "By person", "Vesting", "SAFEs"]);
    const safes = book.find((s) => s.name === "SAFEs")!.rows;
    expect(safes[2]).toEqual(["Angel A", "safe", "150000", "8000000", "0.2", "1.88", "signed"]); // a number cell: no trailing zeros
  });
  test("xlsx shared strings, sparse cells and entities", () => {
    const file = zip({
      "xl/workbook.xml":
        '<workbook xmlns:r="r"><sheets><sheet name="Cap &amp; table" sheetId="1" r:id="rId1"/></sheets></workbook>',
      "xl/_rels/workbook.xml.rels":
        '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
      "xl/sharedStrings.xml":
        '<sst><si><t>Name</t></si><si><r><t>Jo</t></r><r><t xml:space="preserve">ão &lt;3</t></r></si></sst>',
      "xl/worksheets/sheet1.xml":
        '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1"><v>12</v></c></row><row r="3"><c r="B3" t="s"><v>1</v></c><c r="C3"/></row></sheetData></worksheet>',
    });
    expect(readXlsx(file)).toEqual([
      { name: "Cap & table", rows: [["Name", "", "12"], [], ["", "João <3", ""]] },
    ]);
  });
  test("detects by content", () => {
    const ocf = toOcfExport(acmeEvents(), { asOf: "2026-10-07", generatedAt: "2026-10-10T00:00:00Z" });
    expect(detectImport("export.zip", zip(ocf)).kind).toBe("ocf");
    expect(detectImport("Manifest.ocf.json", new TextEncoder().encode(ocf["Manifest.ocf.json"]!)).kind).toBe(
      "error",
    );
    expect(detectImport("cap.csv", new TextEncoder().encode("a,b\n1,2")).kind).toBe("sheets");
    expect(detectImport("old.xls", new Uint8Array([0xd0, 0xcf])).kind).toBe("error");
  });
});

test("header synonyms", () => {
  expect(mapping).toEqual([
    "name",
    "email",
    "kind",
    "class",
    "shares",
    "price",
    "strike",
    "issueDate",
    "vestingStart",
    "vestingMonths",
    "cliffMonths",
    "safeAmount",
    "safeCap",
    "safeDiscount",
    "safeMfn",
  ]);
  expect(guessMapping(["Holder", "Options granted", "Grant date", "Strike", "Shoe size"])).toEqual([
    "name",
    "shares",
    "issueDate",
    "strike",
    null,
  ]);
});

describe("buildImport", () => {
  const r = buildImport(base);
  test("no issues, and the summary matches the old tool", () => {
    expect(r.issues).toEqual([]);
    expect(r.summary.fullyDiluted).toBe(8000000n);
    expect(r.summary.stakeholders).toBe(7);
    expect(r.summary.safeTotal).toBe("900000");
    expect(r.poolAvailable).toBe(920000n);
    expect(r.classes).toEqual([{ name: "Common", issued: 7000000n, preferred: false }]);
    expect(reconcile(r.summary, "8,000,000")).toEqual({ ok: true, text: "Fully diluted matches: 8,000,000" });
    expect(reconcile(r.summary, "8000001")).toEqual({
      ok: false,
      text: "Fully diluted is 8,000,000 here but 8,000,001 in your old tool (1 short)",
    });
  });
  test("every draft is valid OCF", () => {
    const bad = r.drafts
      .filter((d) => d.kind === "ocf")
      .map((d) => validateOcf(d.data))
      .filter((e) => e.length);
    expect(bad).toEqual([]);
  });
  test("golden: imported into an empty vault, the cap table equals acme's", async () => {
    const out = await appendEvents(
      "",
      [b.issuer({ name: "Acme Inc.", formationDate: "2021-09-14" }), ...r.drafts],
      ctx,
    );
    if (!out.ok) throw new Error(out.errors.join("; "));
    expect(strip(captableCsv(out.events, "2026-10-07"))).toBe(strip(readFix("captable.expected.csv")));
    expect(strip(captableCsv(out.events, "2027-01-01"))).toBe(strip(captableCsv(acmeEvents(), "2027-01-01")));
  });
  test("day-first column when a value can only be day-first", () => {
    const rows = [
      ["A", "Common", "100", "25/12/2020"],
      ["B", "Common", "100", "01/02/2021"],
    ];
    const x = buildImport({
      ...base,
      header: ["Name", "Type", "Shares", "Issue date"],
      mapping: ["name", "kind", "shares", "issueDate"],
      rows,
    });
    const dates = x.drafts.filter((d) => d.type === "TX_STOCK_ISSUANCE").map((d) => d.data.date);
    expect(dates).toEqual(["2020-12-25", "2021-02-01"]);
  });
  test("excel serial dates and 'Mar 14, 2023'", () => {
    const rows = [
      ["A", "100", "44634"],
      ["B", "100", "Mar 14, 2023"],
    ];
    const x = buildImport({
      ...base,
      header: ["Name", "Shares", "Date"],
      mapping: ["name", "shares", "issueDate"],
      rows,
    });
    expect(x.drafts.filter((d) => d.type === "TX_STOCK_ISSUANCE").map((d) => d.data.date)).toEqual([
      "2022-03-14",
      "2023-03-14",
    ]);
  });
  test("people are deduped by email, then by name", () => {
    const rows = [
      ["Ana Ribeiro", "ana@x.com", "100"],
      ["ANA  RIBEIRO", "", "50"],
      ["A. Ribeiro", "ana@x.com", "25"],
    ];
    const x = buildImport({
      ...base,
      header: ["Name", "Email", "Shares"],
      mapping: ["name", "email", "shares"],
      rows,
    });
    expect(x.drafts.filter((d) => d.type === "STAKEHOLDER")).toHaveLength(1);
    expect(x.summary.fullyDiluted).toBe(150n);
    // same email, different spelling: flagged, never silently merged (M2 review)
    expect(x.issues).toEqual([
      "Row 6 (A. Ribeiro): same email as Ana Ribeiro (ana@x.com). Use one name, or give each its own email.",
    ]);
  });
  test("missing issue date: export date, marked as an imported snapshot", () => {
    const x = buildImport({
      ...base,
      header: ["Name", "Shares"],
      mapping: ["name", "shares"],
      rows: [["A", "10"]],
    });
    const tx = x.drafts.find((d) => d.type === "TX_STOCK_ISSUANCE")!;
    expect([tx.data.date, tx.meta?.note]).toEqual(["2026-10-07", "imported snapshot"]);
  });
  test("only 'vested so far': vesting unknown, never a guess", async () => {
    const x = buildImport({
      ...base,
      header: ["Name", "Shares", "Vested", "Issue date"],
      mapping: ["name", "shares", "vested", "issueDate"],
      rows: [
        ["A", "1000", "250", "2024-01-01"],
        ["B", "1000", "1000", "2024-01-01"],
      ],
    });
    expect(x.issues).toEqual([]);
    const out = await appendEvents(
      "",
      [b.issuer({ name: "Co", formationDate: "2020-01-01" }), ...x.drafts],
      ctx,
    );
    if (!out.ok) throw new Error(out.errors.join("; "));
    const rows = capTableRows(reduce(out.events, "2026-10-07"));
    expect(rows.map((r) => [r.stakeholder, r.vested])).toEqual([
      ["A", null],
      ["B", 1000n],
    ]);
  });
  test("preferred class and a cliff-free schedule", async () => {
    const x = buildImport({
      ...base,
      header: ["Name", "Class", "Shares", "Issue date", "Vesting start", "Vesting months", "Cliff"],
      mapping: ["name", "class", "shares", "issueDate", "vestingStart", "vestingMonths", "cliffMonths"],
      rows: [
        ["Fund Q", "Series Seed Preferred", "1000", "2024-01-01", "", "", ""],
        ["Eve", "Common", "2400", "2024-01-01", "2024-01-01", "24", "0"],
      ],
    });
    expect(x.classes.map((c) => [c.name, c.preferred])).toEqual([
      ["Series Seed Preferred", true],
      ["Common", false],
    ]);
    const out = await appendEvents(
      "",
      [b.issuer({ name: "Co", formationDate: "2020-01-01" }), ...x.drafts],
      ctx,
    );
    if (!out.ok) throw new Error(out.errors.join("; "));
    const rows = capTableRows(reduce(out.events, "2024-07-01"));
    expect(rows.map((r) => [r.stakeholder, r.type, r.vested])).toEqual([
      ["Eve", "common", 600n], // CS-1 sorts before PS-1
      ["Fund Q", "preferred", 1000n],
    ]);
  });
  test("row issues name the row and the person", () => {
    const x = buildImport({
      ...base,
      header: ["Name", "Type", "Shares", "Strike", "Investment"],
      mapping: ["name", "kind", "shares", "strike", "safeAmount"],
      rows: [
        ["Lisa", "Option", "100", "", ""],
        ["", "Common", "5", "", ""],
        ["Bob", "Common", "1.5", "", ""],
        ["Cy", "SAFE", "", "", ""],
        ["Dee", "Warrant", "10", "", ""],
      ],
      firstRow: 2,
    });
    expect(x.issues).toEqual([
      "Row 2 (Lisa): strike price missing",
      "Row 3: name missing",
      'Row 4 (Bob): shares must be a whole number above 0, got "1.5"',
      "Row 5 (Cy): SAFE amount missing",
      'Row 6 (Dee): "Warrant" isn\'t supported yet (common, preferred, options and SAFEs are)',
    ]);
  });
  test("authorized and pool inputs; over-issuing is a row-free issue", () => {
    const x = buildImport({ ...base, authorized: { Common: "5000000" } });
    expect(x.issues).toEqual(["Issued would exceed authorized for Common (7,000,000 > 5,000,000)"]);
    const y = buildImport({ ...base, poolReserved: "2000000" });
    expect(y.summary.fullyDiluted).toBe(9000000n);
  });
});

test("vestingTerms builder: 4y/1y stays identical", () => {
  const { id: _a, ...one } = b.vestingTerms4y1y("vt").data;
  const { id: _b, ...two } = b.vestingTerms({ months: 48, cliffMonths: 12, id: "vt" }).data;
  expect(two).toEqual(one);
  expect(validateOcf(b.vestingTerms({ months: 24, cliffMonths: 0 }).data)).toEqual([]);
});

test("OCF import into a vault keeps the vault's issuer id", () => {
  const files = toOcfExport(acmeEvents(), { asOf: "2026-10-07", generatedAt: "2026-10-10T00:00:00Z" });
  const r = ocfImportDrafts(files, "iss_vault");
  if ("errors" in r) throw new Error(r.errors.join("; "));
  expect(r.drafts.filter((d) => d.type === "ISSUER").map((d) => [d.data.id, d.data.legal_name])).toEqual([
    ["iss_vault", "Acme Inc."],
  ]);
});

test("blank rows in the middle are skipped, not the end of the import", () => {
  const x = buildImport({
    ...base,
    header: ["Name", "Shares"],
    mapping: ["name", "shares"],
    rows: [
      ["A", "10"],
      ["", ""],
      ["B", "5"],
    ],
  });
  expect(x.summary.fullyDiluted).toBe(15n);
});

test("an OCF export with a stock split is refused at import, with a plain reason", async () => {
  const { toOcfExport } = await import("../src/ocf-export");
  const { ocfImportDrafts } = await import("../src/import/ocf");
  const { acmeEvents } = await import("./helpers");
  const files = toOcfExport(acmeEvents(), { asOf: "2026-10-07", generatedAt: "2026-10-07T12:00:00Z" });
  const tx = JSON.parse(files["Transactions.ocf.json"]!);
  tx.items.push({
    object_type: "TX_STOCK_CLASS_SPLIT",
    id: "split_1",
    date: "2026-06-01",
    stock_class_id: "sc_common",
    split_ratio: { numerator: "2", denominator: "1" },
  });
  files["Transactions.ocf.json"] = JSON.stringify(tx);
  const r = ocfImportDrafts(files, undefined);
  expect("errors" in r && r.errors[0]).toMatch(
    /^Capfolder can't apply these records yet.*TX_STOCK_CLASS_SPLIT \(1\)/,
  );
});
