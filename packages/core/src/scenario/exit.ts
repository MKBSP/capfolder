// An exit as pure math: proceeds split over shares and granted options; the unissued pool is cancelled.
import { fmtInt, parseDec } from "../num";
import { percentOf } from "../totals";
import type { Holding, Line } from "./types";

export const EXIT_NOTES = [
  "Unissued options are cancelled at an exit, so the pool gets nothing.",
  "Before exercise prices and liquidation preferences, which can change this a lot.",
];

/** Whole currency units per holding, summing exactly to `value` (largest remainder; ties to earlier rows). */
function split(value: bigint, shares: bigint[]): bigint[] {
  const total = shares.reduce((a, b) => a + b, 0n);
  if (total === 0n) return shares.map(() => 0n);
  const floors = shares.map((s) => (s * value) / total);
  let left = value - floors.reduce((a, b) => a + b, 0n);
  const order = shares
    .map((s, i) => ({ i, r: (s * value) % total }))
    .sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
  for (const { i } of order) {
    if (left <= 0n) break;
    floors[i]! += 1n;
    left -= 1n;
  }
  return floors;
}

export function applyExit(
  holdings: Holding[],
  value: string,
): { lines: Line[]; notes: string[] } | { error: string } {
  const safes = holdings.filter((h) => h.kind === "safe");
  if (safes.length)
    return {
      error: `Convert the SAFEs with a round first: ${safes.map((s) => s.holder).join(", ")} still ${safes.length > 1 ? "hold SAFEs" : "holds a SAFE"}.`,
    };
  let v: bigint;
  try {
    const { v: units, scale } = parseDec(value);
    v = units / 10n ** BigInt(scale);
  } catch {
    return { error: `Exit value: "${value}" is not a number.` };
  }
  if (v <= 0n) return { error: "Exit value: must be more than 0." };
  const paid = holdings.filter((h) => h.kind !== "pool");
  const denominator = paid.reduce((a, h) => a + h.shares, 0n);
  const proceeds = split(
    v,
    paid.map((h) => h.shares),
  );
  const lines: Line[] = holdings.map((h) => {
    const i = paid.indexOf(h);
    const p = i < 0 ? 0n : proceeds[i]!;
    return {
      holder: h.holder,
      kind: h.kind,
      shares: h.shares,
      percent: percentOf(i < 0 ? 0n : h.shares, denominator),
      change: "",
      proceeds: p.toString(),
      math: {
        proceeds:
          i < 0
            ? "0: unissued options are cancelled at an exit"
            : `${fmtInt(p)} = ${fmtInt(h.shares)} ÷ ${fmtInt(denominator)} shares and options × ${fmtInt(v)}`,
      },
    };
  });
  return { lines, notes: [...EXIT_NOTES] };
}
