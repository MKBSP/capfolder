// A priced round as pure math over holdings: SAFEs convert (YC post-money method), the pool is topped up in the
// pre-money, new money buys shares at the round price. Nothing here is an event.
import { fmtInt, parseDec, ratioFixed, subDec, sumDec } from "../num";
import { POOL } from "./holdings";
import type { Holding, RoundStep } from "./types";

/** Exact fraction n/d, d > 0. */
type Frac = { n: bigint; d: bigint };
const F = (n: bigint, d = 1n): Frac => (d < 0n ? { n: -n, d: -d } : { n, d });
const dec = (s: string): Frac => {
  const { v, scale } = parseDec(s);
  return F(v, 10n ** BigInt(scale));
};
const pct = (s: string): Frac => div(dec(s), F(100n));
const add = (a: Frac, b: Frac): Frac => F(a.n * b.d + b.n * a.d, a.d * b.d);
const sub = (a: Frac, b: Frac): Frac => add(a, F(-b.n, b.d));
const mul = (a: Frac, b: Frac): Frac => F(a.n * b.n, a.d * b.d);
const div = (a: Frac, b: Frac): Frac => F(a.n * b.d, a.d * b.n);
const floor = (a: Frac): bigint => (a.n >= 0n ? a.n / a.d : -((-a.n + a.d - 1n) / a.d));
const ge = (a: Frac, b: Frac): boolean => a.n * b.d >= b.n * a.d;
const ONE = F(1n);
const ZERO = F(0n);
const show = (a: Frac, decimals = 4) => ratioFixed(a.n, a.d, decimals);
const money = (s: string) => fmtInt(BigInt(s.split(".")[0]!));

type Math = Record<string, Record<string, string>>;

/**
 * Apply one round. New investors become one holding "<name> investors"; converted SAFEs become share holdings
 * under the investor's name; a top-up is added to the pool holding. `math` is keyed by holder, then by label.
 */
export function applyRound(
  holdings: Holding[],
  round: RoundStep,
): { holdings: Holding[]; notes: string[]; math: Math } | { error: string } {
  const notes: string[] = [];
  const math: Math = {};
  const note = (holder: string, label: string, text: string) => {
    math[holder] ??= {};
    math[holder][label] = text;
  };
  const investors = `${round.name} investors`;
  const out: Holding[] = holdings.filter((h) => h.kind !== "safe").map((h) => ({ ...h }));
  const safes = holdings.filter((h) => h.kind === "safe");
  const priced = !!round.newMoney && !!(round.preMoney || round.postMoney);
  if (!priced && !round.sells)
    return { error: "Give the round new money and a valuation, or the percent of the company it sells." };

  // 1. Capitalization before the round: everything but the SAFEs, unissued pool included.
  const S = out.reduce((a, h) => a + h.shares, 0n);

  // 2a. Cap SAFEs: share of the capitalization is exactly amount ÷ cap, solved together.
  const capped = safes.filter((s) => s.cap);
  const sumRatio = capped.reduce((a, s) => add(a, div(dec(s.amount!), dec(s.cap!))), ZERO);
  if (ge(sumRatio, ONE))
    return { error: "The SAFE caps are below the money raised, so the SAFEs can't convert on their caps." };
  const C = div(F(S), sub(ONE, sumRatio));
  const converted: Holding[] = [];
  for (const s of capped) {
    const ratio = div(dec(s.amount!), dec(s.cap!));
    const shares = floor(mul(C, ratio));
    converted.push({ holder: s.holder, kind: "shares", shares });
    note(
      s.holder,
      "shares",
      `${fmtInt(shares)} = ${fmtInt(S)} ÷ (1 − ${show(sumRatio)}) × ${money(s.amount!)} ÷ ${money(s.cap!)} (post-money cap)`,
    );
    if (s.mfn) note(s.holder, "MFN", "most favored nation ignored in projections");
  }
  // 2b. Discount-only and uncapped SAFEs need a price.
  const unpriced = safes.filter((s) => !s.cap);
  if (!priced && unpriced.length)
    return {
      error: `Give this round a valuation: ${unpriced.map((s) => s.holder).join(", ")} ${unpriced.length > 1 ? "hold SAFEs" : "holds a SAFE"} without a cap, which can't be sized from a percent.`,
    };
  const D = unpriced.reduce((a, s) => add(a, div(dec(s.amount!), sub(ONE, dec(s.discount ?? "0")))), ZERO);
  const held = S + converted.reduce((a, h) => a + h.shares, 0n);
  const pool = out.find((h) => h.kind === "pool") ?? { holder: POOL, kind: "pool" as const, shares: 0n };
  if (!out.includes(pool)) out.push(pool);
  const t = round.poolTarget ? pct(round.poolTarget) : null;

  if (priced) {
    const pre = round.preMoney ?? subDec(round.postMoney!, round.newMoney!);
    const post = round.postMoney ?? sumDec([pre, round.newMoney!]);
    const preAfterSafes = sub(dec(pre), D);
    if (!ge(preAfterSafes, ZERO))
      return { error: "The pre-money valuation is below the SAFE money, so there is no price." };
    // 3. Pool top-up T so that (pool + T) = t × post-money fully diluted, where post FD = (held + T) × post ÷ (pre − D).
    let T = 0n;
    if (t) {
      const k = div(dec(post), preAfterSafes);
      const tk = mul(t, k);
      const want = div(sub(mul(tk, F(held)), F(pool.shares)), sub(ONE, tk));
      if (want.n > 0n) T = floor(want);
      else notes.push(`The pool is already above ${round.poolTarget}% of the post-money, so no top-up.`);
    }
    if (T > 0n) {
      pool.shares += T;
      note(
        POOL,
        "top-up",
        `${fmtInt(T)} added in the pre-money so the pool is ${round.poolTarget}% after the round`,
      );
    }
    // 4. Price and 5. new shares.
    const price = div(preAfterSafes, F(held + T));
    note(
      investors,
      "round price",
      `${money(pre)}${D.n ? ` − ${show(D, 0)} (uncapped SAFE money at its discount)` : ""} ÷ ${fmtInt(held + T)} = ${show(price)}`,
    );
    for (const s of unpriced) {
      const shares = floor(div(dec(s.amount!), mul(price, sub(ONE, dec(s.discount ?? "0")))));
      converted.push({ holder: s.holder, kind: "shares", shares });
      note(
        s.holder,
        "shares",
        `${fmtInt(shares)} = ${money(s.amount!)} ÷ (${show(price)} × (1 − ${s.discount ?? "0"}))`,
      );
    }
    for (const s of capped.filter((x) => x.discount)) {
      // ponytail: cap and discount, the larger count wins at the cap-path price; the price is not re-solved
      const atDiscount = floor(div(dec(s.amount!), mul(price, sub(ONE, dec(s.discount!)))));
      const h = converted.find((x) => x.holder === s.holder)!;
      if (atDiscount > h.shares) {
        note(
          s.holder,
          "discount",
          `${fmtInt(atDiscount)} at the discount beats ${fmtInt(h.shares)} at the cap`,
        );
        h.shares = atDiscount;
      } else
        note(
          s.holder,
          "discount",
          `${fmtInt(h.shares)} at the cap beats ${fmtInt(atDiscount)} at the discount`,
        );
    }
    const n = floor(div(dec(round.newMoney!), price));
    note(investors, "new shares", `${fmtInt(n)} = ${money(round.newMoney!)} ÷ ${show(price)}`);
    out.push(...converted, { holder: investors, kind: "shares", shares: n });
    return { holdings: out, notes, math };
  }

  // A "sells X%" round: no price; the new investors get X% of the post-money fully diluted count.
  const s = pct(round.sells!);
  if (!(s.n > 0n) || ge(s, ONE)) return { error: "The percent sold must be between 0 and 100." };
  if (capped.length) notes.push("SAFEs convert on their caps, assuming the round prices above them.");
  const H = held - pool.shares;
  let total = div(F(held), sub(ONE, s));
  if (t) {
    if (ge(F(pool.shares), mul(t, total)))
      notes.push(`The pool is already above ${round.poolTarget}% of the post-money, so no top-up.`);
    else {
      if (ge(add(s, t), ONE)) return { error: "The percent sold plus the pool target must be under 100." };
      total = div(F(H), sub(sub(ONE, s), t));
      const target = floor(mul(t, total));
      note(
        POOL,
        "top-up",
        `${fmtInt(target - pool.shares)} added in the pre-money: ${fmtInt(target)} = ${round.poolTarget}% × ${fmtInt(floor(total))}`,
      );
      pool.shares = target;
    }
  }
  const n = floor(mul(s, total));
  note(
    investors,
    "new shares",
    `${fmtInt(n)} = ${round.sells}% × ${fmtInt(floor(total))} post-money fully diluted`,
  );
  out.push(...converted, { holder: investors, kind: "shares", shares: n });
  return { holdings: out, notes, math };
}
