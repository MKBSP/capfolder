// The projection view of a State: one holding per holder and kind, and the table lines the fronts display.
import { fmtInt } from "../num";
import { capTableRows, promisedTable } from "../rows";
import { percentOf } from "../totals";
import type { State } from "../types";
import type { Holding, Line } from "./types";

const KIND: Record<number, Holding["kind"]> = { 0: "shares", 1: "options", 2: "pool", 3: "safe" };
const ORDER: Record<Holding["kind"], number> = { shares: 0, options: 1, pool: 2, safe: 3 };
export const POOL = "Option pool";

/** Holdings as of the state, merged per holder and kind, in cap table order. Open promises count as shares. */
export function holdingsOf(state: State): Holding[] {
  const out: Holding[] = [];
  const add = (h: Holding) => {
    const same = out.find((x) => x.holder === h.holder && x.kind === h.kind && x.kind !== "safe");
    if (same) same.shares += h.shares;
    else out.push(h);
  };
  for (const p of promisedTable(state)) add({ holder: p.name, kind: "shares", shares: p.shares });
  for (const r of capTableRows(state)) {
    const kind = KIND[r.group]!;
    if (kind === "safe")
      add({
        holder: r.stakeholder,
        kind,
        shares: 0n,
        amount: r.safeAmount,
        ...(r.safeCap ? { cap: r.safeCap } : {}),
        ...(r.safeDiscount ? { discount: r.safeDiscount } : {}),
        ...(state.securities.get(r.securityId)?.mfn ? { mfn: true } : {}),
      });
    else add({ holder: kind === "pool" ? POOL : r.stakeholder, kind, shares: r.shares ?? 0n });
  }
  return out;
}

const bp = (pct: string) => BigInt(pct.replace(".", ""));
const signed = (n: bigint) => {
  const s = `${(n < 0n ? -n : n) / 100n}.${((n < 0n ? -n : n) % 100n).toString().padStart(2, "0")}`;
  return n < 0n ? `-${s}` : n > 0n ? `+${s}` : s;
};

/**
 * Table lines: percent of fully diluted (shares + options + pool; SAFEs show no percent), the change in
 * percentage points against `previous` ("new" when the holder wasn't there, "" with no previous), and the
 * math for the holder from `math[holder]`.
 */
export function tableOf(
  holdings: Holding[],
  previous: Line[] | null,
  math: Record<string, Record<string, string>>,
): Line[] {
  const sorted = [...holdings].sort((a, c) => ORDER[a.kind] - ORDER[c.kind]);
  const fd = sorted.filter((h) => h.kind !== "safe").reduce((a, h) => a + h.shares, 0n);
  return sorted.map((h) => {
    const percent = h.kind === "safe" ? "" : percentOf(h.shares, fd);
    const before = previous?.find((l) => l.holder === h.holder && l.kind === h.kind);
    const change =
      !previous || h.kind === "safe" ? "" : before ? signed(bp(percent) - bp(before.percent)) : "new";
    return {
      holder: h.holder,
      kind: h.kind,
      shares: h.kind === "safe" ? null : h.shares,
      percent,
      change,
      math: {
        ...(h.kind === "safe" ? {} : { percent: `${fmtInt(h.shares)} ÷ ${fmtInt(fd)} fully diluted` }),
        ...math[h.holder],
      },
    };
  });
}
