// Regression tests for the M2 final-review findings.
import { describe, expect, test } from "vitest";
import { zip } from "../src/export/zip";
import { buildImport, reconcile } from "../src/import/build";
import type { Field } from "../src/import/fields";
import { readXlsx } from "../src/import/xlsx-read";

const run = (header: string[], mapping: (Field | null)[], rows: string[][], extra = {}) =>
  buildImport({ header, mapping, rows, firstRow: 2, exportDate: "2026-10-07", ...extra });
const tx = (r: ReturnType<typeof buildImport>, type: string) => r.drafts.filter((d) => d.type === type);

describe("critical: number formats", () => {
  test("European decimals and thousands (Portuguese Excel CSV)", () => {
    const r = run(
      ["Name", "Type", "Shares", "Price", "Strike", "Investment"],
      ["name", "kind", "shares", "price", "strike", "safeAmount"],
      [
        ["Steve", "Common", "1.000.000", "0,0001", "", ""],
        ["Rui", "Option", "10.000", "", "0,50", ""],
        ["Fund", "SAFE", "", "", "", "250.000,00"],
      ],
    );
    expect(r.issues).toEqual([]);
    expect(tx(r, "TX_STOCK_ISSUANCE")[0]!.data).toMatchObject({
      quantity: "1000000",
      share_price: { amount: "0.0001" },
    });
    expect(tx(r, "TX_EQUITY_COMPENSATION_ISSUANCE")[0]!.data).toMatchObject({
      quantity: "10000",
      exercise_price: { amount: "0.50" },
    });
    expect(tx(r, "TX_CONVERTIBLE_ISSUANCE")[0]!.data.investment_amount.amount).toBe("250000.00");
  });
  test("US formats still work, and nonsense is an issue, not a number", () => {
    const r = run(
      ["Name", "Shares", "Price"],
      ["name", "shares", "price"],
      [
        ["A", "1,000,000.00", "$0.00001"],
        ["B", "100", "1.5M"],
      ],
    );
    expect(tx(r, "TX_STOCK_ISSUANCE")[0]!.data).toMatchObject({
      quantity: "1000000",
      share_price: { amount: "0.00001" },
    });
    expect(r.issues).toEqual(['Row 3 (B): price "1.5M" isn\'t a number']);
  });
  test("options on a preferred class don't crash; options use the common plan class", () => {
    const r = run(
      ["Name", "Type", "Class", "Shares", "Strike"],
      ["name", "kind", "class", "shares", "strike"],
      [
        ["VC", "Preferred", "Series A Preferred", "100", ""],
        ["Rui", "Option", "", "10", "0.1"],
        ["Eve", "Common", "Common Stock", "50", ""],
      ],
    );
    expect(r.issues).toEqual([]);
    const plan = tx(r, "STOCK_PLAN")[0]!;
    const common = tx(r, "STOCK_CLASS").find((d) => d.data.name === "Common Stock")!;
    expect(plan.data.stock_class_ids).toEqual([common.data.id]);
    expect(tx(r, "STOCK_CLASS").map((d) => d.data.name)).toEqual(["Series A Preferred", "Common Stock"]);
  });
});

describe("important", () => {
  test("same email, different names: an issue, not a silent merge", () => {
    const r = run(
      ["Name", "Email", "Shares"],
      ["name", "email", "shares"],
      [
        ["Fund I LP", "ops@f.com", "10"],
        ["Fund II LP", "ops@f.com", "20"],
      ],
    );
    expect(r.issues).toEqual([
      "Row 3 (Fund II LP): same email as Fund I LP (ops@f.com). Use one name, or give each its own email.",
    ]);
  });
  test("Series/Seed classes are preferred, and the founder can override per class", () => {
    const rows = [
      ["VC", "Series A", "100"],
      ["Eve", "Common", "50"],
    ];
    const r = run(["Name", "Class", "Shares"], ["name", "class", "shares"], rows);
    expect(r.classes.map((c) => [c.name, c.preferred])).toEqual([
      ["Series A", true],
      ["Common", false],
    ]);
    const o = run(["Name", "Class", "Shares"], ["name", "class", "shares"], rows, {
      preferred: { "Series A": false },
    });
    expect(o.classes.map((c) => c.preferred)).toEqual([false, false]);
  });
  test("a class is preferred if any of its rows says so", () => {
    const r = run(
      ["Name", "Type", "Class", "Shares"],
      ["name", "kind", "class", "shares"],
      [
        ["A", "Common", "Seed X", "10"],
        ["B", "Preferred", "Seed X", "10"],
      ],
    );
    expect(r.classes).toEqual([{ name: "Seed X", issued: 20n, preferred: true }]);
    expect(tx(r, "TX_STOCK_ISSUANCE").map((d) => d.data.security_id)).toEqual(["PS-1", "PS-2"]);
  });
  test("a pool with no grants yet still counts", () => {
    const r = run(
      ["Name", "Shares"],
      ["name", "shares"],
      [
        ["Founder", "900"],
        ["Option pool", "100"],
      ],
    );
    expect(r.summary.fullyDiluted).toBe(1000n);
  });
  test("total rows are skipped", () => {
    const r = run(
      ["Name", "Shares"],
      ["name", "shares"],
      [
        ["A", "900"],
        ["Total", "900"],
        ["Grand total", "900"],
      ],
    );
    expect(r.summary.fullyDiluted).toBe(900n);
  });
  test("reconcile checks the SAFE total too", () => {
    const r = run(["Name", "Investment"], ["name", "safeAmount"], [["Fund", "100"]]);
    expect(reconcile(r.summary, "0", "150").ok).toBe(false);
    expect(reconcile(r.summary, "0", "150").text).toContain(
      "SAFE total is $100 here but $150 in your old tool",
    );
    expect(reconcile(r.summary, "0", "100")).toEqual({
      ok: true,
      text: "Fully diluted matches: 0. SAFE total matches: $100",
    });
  });
  test("vesting length without a start uses the issue date; a start without a length is an issue", () => {
    const h = ["Name", "Shares", "Issue date", "Vesting start", "Months"];
    const m: Field[] = ["name", "shares", "issueDate", "vestingStart", "vestingMonths"];
    const r = run(h, m, [
      ["A", "48", "2024-01-01", "", "48"],
      ["B", "48", "2024-01-01", "2024-01-01", ""],
    ]);
    expect(tx(r, "TX_VESTING_START").map((d) => d.data.date)).toEqual(["2024-01-01"]);
    expect(r.issues).toEqual(["Row 3 (B): vesting start given but no vesting length (months)"]);
  });
  test('discount "1" is 1%, "20%" is 20%, "0.2" is 20%', () => {
    const r = run(
      ["Name", "Investment", "Discount"],
      ["name", "safeAmount", "safeDiscount"],
      [
        ["A", "1", "1"],
        ["B", "1", "20%"],
        ["C", "1", "0.2"],
      ],
    );
    expect(
      tx(r, "TX_CONVERTIBLE_ISSUANCE").map(
        (d) => d.data.conversion_triggers[0].conversion_right.conversion_mechanism.conversion_discount,
      ),
    ).toEqual(["0.01", "0.20", "0.2"]);
  });
  test("the person-or-entity column is used when mapped", () => {
    const r = run(
      ["Name", "Entity", "Shares"],
      ["name", "holderType", "shares"],
      [
        ["Steve Holdings", "Individual", "1"],
        ["Bo", "Entity", "1"],
      ],
    );
    expect(tx(r, "STAKEHOLDER").map((d) => d.data.stakeholder_type)).toEqual(["INDIVIDUAL", "INSTITUTION"]);
  });
  test('"Advisor common" is common, not an option', () => {
    const r = run(["Name", "Type", "Shares"], ["name", "kind", "shares"], [["A", "Advisor common", "10"]]);
    expect(r.issues).toEqual([]);
    expect(tx(r, "TX_STOCK_ISSUANCE")).toHaveLength(1);
  });
});

describe("important: xlsx files from other writers", () => {
  const book = (sheet: string, extra: Record<string, string> = {}) =>
    zip({
      "xl/workbook.xml":
        '<x:workbook xmlns:x="m" xmlns:r="r"><x:workbookPr date1904="1"/><x:sheets><x:sheet name="S" sheetId="1" r:id="rId1"/></x:sheets></x:workbook>',
      "xl/_rels/workbook.xml.rels":
        '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
      "xl/worksheets/sheet1.xml": sheet,
      ...extra,
    });
  test("namespaced tags, self-closing rows, float noise, 1904 dates", () => {
    const s = readXlsx(
      book(
        '<x:worksheet><x:sheetData><x:row r="1"><x:c r="A1"><x:v>1.0000000000000001E-5</x:v></x:c><x:c r="B1"><x:v>0.30000000000000004</x:v></x:c></x:row><x:row r="2"/><x:row r="3"><x:c r="A3" t="str"><x:v>ok</x:v></x:c></x:row></x:sheetData></x:worksheet>',
      ),
    );
    expect(s).toEqual([{ name: "S", rows: [["0.00001", "0.3"], [], ["ok"]], date1904: true }]);
  });
  test("1904 serial dates convert with the 1904 epoch", () => {
    const r = run(["Name", "Shares", "Date"], ["name", "shares", "issueDate"], [["A", "1", "43172"]], {
      date1904: true,
    });
    expect(tx(r, "TX_STOCK_ISSUANCE")[0]!.data.date).toBe("2022-03-14");
  });
});

test("region: an ambiguous file uses the founder's decimal mark; the company currency is used", () => {
  const h = ["Name", "Investment"];
  const m: Field[] = ["name", "safeAmount"];
  const us = run(h, m, [["Fund", "250.000"]]);
  const pt = run(h, m, [["Fund", "250.000"]], { decimalMark: ",", currency: "EUR" });
  expect(tx(us, "TX_CONVERTIBLE_ISSUANCE")[0]!.data.investment_amount).toEqual({
    amount: "250.000",
    currency: "USD",
  });
  expect(tx(pt, "TX_CONVERTIBLE_ISSUANCE")[0]!.data.investment_amount).toEqual({
    amount: "250000",
    currency: "EUR",
  });
});
