import { expect, test } from "vitest";
import { reduce } from "../src/reduce";
import { capTableRows } from "../src/rows";
import { capTableTotals, percentOf } from "../src/totals";
import { acmeEvents } from "./helpers";

test("cap table totals come from core", () => {
  const rows = capTableRows(reduce(acmeEvents(), "2026-10-07"));
  expect(capTableTotals(rows, ["CS-1", "CS-2"])).toEqual({
    fullyDiluted: 8000000n,
    poolAvailable: 920000n,
    safeAmount: "900000",
    selectedPercent: "87.50",
  });
});
test("a share of FD is computed from shares, not by adding rounded percentages", () => {
  // three founders with 1/3 each: rows show 33.34 / 33.33 / 33.33, the founders' total is exactly 100.00
  expect(percentOf(3n, 3n)).toBe("100.00");
  expect(percentOf(1n, 3n)).toBe("33.33");
  expect(percentOf(0n, 0n)).toBe("0.00");
});
