// The richer Excel export: an Overview tab with real charts, Vesting by month and Missing documents; the
// familiar Pulley/Carta tabs stay as they are, in between.
import { strFromU8, unzipSync } from "fflate";
import { expect, test } from "vitest";
import { fullCapTable } from "../src/export/full";
import type { Cell, Sheet } from "../src/export/sheets";
import { toXlsx } from "../src/export/xlsx";
import { computeGaps } from "../src/gaps";
import { readXlsx } from "../src/import/xlsx-read";
import { reduce } from "../src/reduce";
import { acmeEvents } from "./helpers";

const AS_OF = "2026-10-07";
const book = fullCapTable(acmeEvents(), AS_OF);
const text = (c: Cell | undefined) =>
  c == null ? "" : typeof c === "object" ? ("num" in c ? c.num : "pct" in c ? c.pct : c.date) : String(c);
const tab = (name: string) => book.find((s) => s.name === name)!;
const row = (s: Sheet, first: string) => s.rows.find((r) => text(r[0]) === first)?.map(text);

test("Overview first, the familiar tabs unchanged, then Vesting by month and Missing documents before All holdings", () =>
  expect(book.map((s) => s.name)).toEqual([
    "Overview",
    "Summary",
    "Ownership",
    "Common (CS) Ledger",
    "2025 Equity Incentive Plan Ledger",
    "Convertibles",
    "Voting Ownership",
    "Vesting by month",
    "Missing documents",
    "All holdings",
  ]));

test("Overview: the four key numbers and ownership by holder, fully diluted", () => {
  const o = tab("Overview");
  expect(row(o, "Fully diluted")).toEqual(["Fully diluted", "8000000"]);
  expect(row(o, "Founders")).toEqual(["Founders", "0.875"]);
  expect(row(o, "Option pool available")).toEqual(["Option pool available", "920000"]);
  expect(row(o, "SAFEs outstanding (USD)")).toEqual(["SAFEs outstanding (USD)", "900000"]);
  expect(row(o, "Tim Apple")).toEqual(["Tim Apple", "4000000", "0.5"]);
  expect(row(o, "Steve Jobs")).toEqual(["Steve Jobs", "3000000", "0.375"]);
  expect(row(o, "Employees (options)")).toEqual(["Employees (options)", "80000", "0.01"]);
  expect(row(o, "Option pool (available)")).toEqual(["Option pool (available)", "920000", "0.115"]);
});

test("Vesting by month: one row per grant, cumulative vested at each month's end, and a total row", () => {
  const v = tab("Vesting by month");
  const head = v.rows[3]!.map(text);
  const woz = row(v, "Steve Wozniak")!;
  const at = (m: string) => woz[head.indexOf(m)];
  expect(head.slice(0, 2)).toEqual(["Holder", "Security"]);
  expect([at("2025-10"), at("2026-09"), at("2026-10"), at("2029-10")]).toEqual(["0", "0", "10000", "40000"]);
  const total = row(v, "Total")!;
  const last = head.length - 1;
  const grants = v.rows.slice(4).filter((r) => text(r[0]) !== "Total");
  expect(total[last]).toBe(String(grants.reduce((a, r) => a + BigInt(text(r[last]) || "0"), 0n)));
});

test("Missing documents: the same list as What's missing in the app", () => {
  const gaps = computeGaps(reduce(acmeEvents(), AS_OF));
  const m = tab("Missing documents");
  expect(m.rows[3]!.map(text)).toEqual(["What's missing", "Priority"]);
  expect(m.rows.slice(4).map((r) => text(r[0]))).toEqual(gaps.map((g) => g.text));
  expect(gaps.length).toBeGreaterThan(0);
});

test("xlsx: Overview carries a doughnut and a line chart as real chart parts, wired through the package rels", () => {
  const files = unzipSync(toXlsx(book));
  const f = (p: string) => strFromU8(files[p]!);
  expect(f("xl/worksheets/sheet1.xml")).toContain('<drawing r:id="rId1"/>');
  expect(f("xl/worksheets/_rels/sheet1.xml.rels")).toContain('Target="../drawings/drawing1.xml"');
  const rels = f("xl/drawings/_rels/drawing1.xml.rels");
  expect(rels).toContain('Target="../charts/chart1.xml"');
  expect(rels).toContain('Target="../charts/chart2.xml"');
  expect(f("xl/drawings/drawing1.xml").match(/<c:chart /g)).toHaveLength(2);
  const types = f("[Content_Types].xml");
  expect(types).toContain('PartName="/xl/drawings/drawing1.xml"');
  expect(types).toContain('PartName="/xl/charts/chart1.xml"');
  expect(types).toContain('PartName="/xl/charts/chart2.xml"');
  expect(f("xl/charts/chart1.xml")).toContain("<c:doughnutChart>");
  expect(f("xl/charts/chart1.xml")).toContain("<c:f>'Overview'!$A$");
  expect(f("xl/charts/chart2.xml")).toContain("<c:lineChart>");
  expect(f("xl/charts/chart2.xml")).toContain("<c:f>'Vesting by month'!$C$");
  // other sheets carry no drawing; the reader still sees every tab
  expect(f("xl/worksheets/sheet2.xml")).not.toContain("<drawing");
  expect(readXlsx(toXlsx(book)).map((s) => s.name)).toEqual(book.map((s) => s.name.slice(0, 31)));
});
