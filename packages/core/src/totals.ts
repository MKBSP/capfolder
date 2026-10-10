// Totals for the Home stat cards and People list, so the UI never adds up numbers itself.
import { ratioFixed, sumDec } from "./num";
import type { Row } from "./types";

/** part ÷ whole as a percentage to 2 decimals (half up); "0.00" when whole is 0. */
export const percentOf = (part: bigint, whole: bigint): string =>
  whole > 0n ? ratioFixed(part * 100n, whole, 2) : "0.00";

export interface Totals {
  fullyDiluted: bigint;
  poolAvailable: bigint;
  safeAmount: string; // sum of SAFE amounts, exact decimal string
  selectedPercent: string; // the chosen securities' share of fully diluted (e.g. founders)
}

export function capTableTotals(rows: Row[], selectedSecurityIds: string[] = []): Totals {
  const fd = rows.filter((r) => r.group <= 2);
  const fullyDiluted = fd.reduce((a, r) => a + (r.shares ?? 0n), 0n);
  const selected = new Set(selectedSecurityIds);
  const part = fd.filter((r) => selected.has(r.securityId)).reduce((a, r) => a + (r.shares ?? 0n), 0n);
  return {
    fullyDiluted,
    poolAvailable: fd.filter((r) => r.group === 2).reduce((a, r) => a + (r.shares ?? 0n), 0n),
    safeAmount: sumDec(rows.filter((r) => r.group === 3).map((r) => r.safeAmount)),
    selectedPercent: percentOf(part, fullyDiluted),
  };
}
