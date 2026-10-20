// The import's "Compare with Pulley/Carta" step: every total the old tool shows, and each grant's vested count.
import { expect, test } from "vitest";
import { buildImport, reconcile } from "../src/import/build";
import type { Field } from "../src/import/fields";

const run = (header: string[], mapping: (Field | null)[], rows: string[][]) =>
  buildImport({ header, mapping, rows, firstRow: 2, exportDate: "2026-10-07" });

const r = run(
  ["Name", "Type", "Class", "Shares", "Strike"],
  ["name", "kind", "class", "shares", "strike"],
  [
    ["Tim Apple", "Common", "Common", "7000", ""],
    ["Steve Wozniak", "Option", "Common", "100", "0.10"],
    ["Option pool (available)", "", "Common", "900", ""],
  ],
);

test("the summary carries options outstanding and the pool available", () => {
  expect(r.issues).toEqual([]);
  expect(r.summary).toMatchObject({ fullyDiluted: 8000n, optionsOutstanding: 100n, poolAvailable: 900n });
});

test("each number typed in is checked; the ones left empty are skipped", () => {
  const rec = reconcile(
    r.summary,
    { fullyDiluted: "8,000", optionsOutstanding: "100", poolAvailable: "800", perClass: { Common: "7000" } },
    "Pulley",
  );
  expect(rec.ok).toBe(false);
  expect(rec.lines.map((l) => [l.label, l.ours, l.ok, l.gap])).toEqual([
    ["Fully diluted", "8,000", true, undefined],
    ["Common shares", "7,000", true, undefined],
    ["Options outstanding", "100", true, undefined],
    ["Pool available", "900", false, "100 over"],
    ["Stakeholders", "2", null, undefined],
  ]);
  expect(rec.text).toBe(
    "Fully diluted matches: 8,000. Common shares match: 7,000. Options outstanding match: 100. Pool available is 900 here but 800 in Pulley (100 over)",
  );
});

test("a number that isn't a whole number says so", () => {
  const rec = reconcile(r.summary, { fullyDiluted: "8000", stakeholders: "two" }, "Carta");
  expect(rec.ok).toBe(false);
  expect(rec.text).toContain("Type Stakeholders as a whole number");
});

test("vested so far: compared with the schedule, 1 share of rounding allowed, more than granted is an issue", () => {
  const v = run(
    ["Name", "Type", "Shares", "Strike", "Issue date", "Vesting start", "Months", "Cliff", "Vested"],
    [
      "name",
      "kind",
      "shares",
      "strike",
      "issueDate",
      "vestingStart",
      "vestingMonths",
      "cliffMonths",
      "vested",
    ],
    [
      ["A", "Option", "4800", "0.1", "2024-10-07", "2024-10-07", "48", "12", "2400"],
      ["B", "Option", "4800", "0.1", "2024-10-07", "2024-10-07", "48", "12", "2000"],
      ["C", "Option", "4800", "0.1", "2024-10-07", "2024-10-07", "48", "12", "2401"],
      ["D", "Option", "4800", "0.1", "2024-10-07", "2024-10-07", "48", "12", "5000"],
    ],
  );
  expect(v.warnings).toEqual([
    "Row 3 (B): the file says 2,000 vested, Capfolder works out 2,400. Check the vesting start or cliff.",
  ]);
  expect(v.issues).toContain("Row 5 (D): 5,000 vested is more than the 4,800 granted");
});
