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
 * Apply one round. New investors become one holding "<name> investors"; converted SAFEs become shares under the
 * investor's name (merged with shares they already hold); a top-up is added to the pool holding. `math` is keyed
 * by holder, then by label. Every problem comes back as `error`, nothing throws.
 */
export function applyRound(
  holdings: Holding[],
  round: RoundStep,
): { holdings: Holding[]; notes: string[]; math: Math } | { error: string } {
  try {
    return apply(holdings, round);
  } catch (e) {
    return { error: (e as Error).message };
  }
}

function apply(
  holdings: Holding[],
  round: RoundStep,
): { holdings: Holding[]; notes: string[]; math: Math } | { error: string } {
  const notes: string[] = [];
  const math: Math = Object.create(null); // no prototype: holder names are founder input
  const note = (holder: string, label: string, text: string) => {
    let m = math[holder];
    if (!m) {
      m = Object.create(null) as Record<string, string>;
      math[holder] = m;
    }
    let key = label;
    for (let i = 2; key in m; i++) key = `${label} (${i})`;
    m[key] = text;
  };
  const investors = `${round.name} investors`;
  const out: Holding[] = holdings.filter((h) => h.kind !== "safe").map((h) => ({ ...h }));
  const safes = holdings.filter((h) => h.kind === "safe");
  const priced = !!round.newMoney && !!(round.preMoney || round.postMoney);
  if (!priced && !round.sells)
    return { error: "Give the round new money and a valuation, or the percent of the company it sells." };
  if (priced && round.sells)
    return { error: "Give either new money and a valuation, or the percent sold, not both." };
  if (round.preMoney && round.postMoney && round.newMoney) {
    if (sumDec([round.preMoney, round.newMoney]) !== sumDec([round.postMoney]))
      return { error: "The pre-money, new money and post-money don't add up: post = pre + new money." };
  }
  const odd = safes.find((s) => (s.timing && s.timing !== "POST_MONEY") || (s.type && s.type !== "SAFE"));
  if (odd)
    return {
      error: `${odd.holder} holds a ${odd.type === "SAFE" ? "pre-money SAFE" : (odd.type ?? "convertible").toLowerCase()}; only post-money SAFEs are projected in v1.`,
    };
  const t = round.poolTarget ? pct(round.poolTarget) : null;
  if (t && (!(t.n > 0n) || ge(t, ONE))) return { error: "The pool target must be between 0 and 100." };

  // 1. Capitalization before the round: everything but the SAFEs, unissued pool included.
  const S = out.reduce((a, h) => a + h.shares, 0n);
  if (S <= 0n) return { error: "Nothing is held yet. Add the founders before a round." };
  const pool = out.find((h) => h.kind === "pool") ?? { holder: POOL, kind: "pool" as const, shares: 0n };
  if (!out.includes(pool) && t) out.push(pool);

  // The converted shares per SAFE, merged into the holder's share line at the end.
  const converted = new Map<Holding, bigint>();
  const merge = () => {
    for (const [s, shares] of converted) {
      const same = out.find((h) => h.holder === s.holder && h.kind === "shares");
      if (same) same.shares += shares;
      else out.push({ holder: s.holder, kind: "shares", shares });
    }
  };
  const atCap = (capped: Holding[]): { C: Frac; sumRatio: Frac } | { error: string } => {
    const sumRatio = capped.reduce((a, s) => add(a, div(dec(s.amount!), dec(s.cap!))), ZERO);
    if (ge(sumRatio, ONE))
      return { error: "The SAFE caps are below the money raised, so the SAFEs can't convert on their caps." };
    return { C: div(F(S), sub(ONE, sumRatio)), sumRatio };
  };
  const capNote = (s: Holding, shares: bigint, sumRatio: Frac) =>
    note(
      s.holder,
      "shares",
      `${fmtInt(shares)} = ${fmtInt(S)} ÷ (1 − ${show(sumRatio)}) × ${money(s.amount!)} ÷ ${money(s.cap!)} (post-money cap)`,
    );

  if (priced) {
    const pre = round.preMoney ?? subDec(round.postMoney!, round.newMoney!);
    const post = round.postMoney ?? sumDec([pre, round.newMoney!]);
    // 2. SAFEs: those converting at their cap, and those converting at the round price (uncapped, or a cap-and-
    // discount SAFE whose discount gives more shares). A SAFE that moves to the price set changes the price, so
    // re-solve until the sets are stable (at most one move per SAFE).
    let capSet = safes.filter((s) => s.cap);
    let priceSet = safes.filter((s) => !s.cap);
    for (;;) {
      const c = atCap(capSet);
      if ("error" in c) return c;
      const capShares = new Map(capSet.map((s) => [s, floor(mul(c.C, div(dec(s.amount!), dec(s.cap!))))]));
      const held = S + [...capShares.values()].reduce((a, n) => a + n, 0n);
      const D = priceSet.reduce(
        (a, s) => add(a, div(dec(s.amount!), sub(ONE, dec(s.discount ?? "0")))),
        ZERO,
      );
      const preAfterSafes = sub(dec(pre), D);
      if (!(preAfterSafes.n > 0n))
        return { error: "The pre-money valuation is not above the SAFE money, so there is no price." };
      // 3. Pool top-up T so (pool + T) = t × post-money fully diluted, where post FD = (held + T) × post ÷ (pre − D).
      let T = 0n;
      let topUp = "";
      if (t) {
        const tk = mul(t, div(dec(post), preAfterSafes));
        if (ge(tk, ONE))
          return {
            error: `A pool target of ${round.poolTarget}% can't be reached in the pre-money of this round; lower the pool target or raise the valuation.`,
          };
        const want = div(sub(mul(tk, F(held)), F(pool.shares)), sub(ONE, tk));
        if (want.n > 0n) T = floor(want);
      }
      // 4. Price.
      const price = div(preAfterSafes, F(held + T));
      // A cap-and-discount SAFE takes whichever gives more shares.
      const moved = capSet.find(
        (s) =>
          s.discount &&
          floor(div(dec(s.amount!), mul(price, sub(ONE, dec(s.discount!))))) > capShares.get(s)!,
      );
      if (moved) {
        note(
          moved.holder,
          "discount",
          `the ${Number(moved.discount) * 100}% discount gives more shares than the ${money(moved.cap!)} cap at this price`,
        );
        capSet = capSet.filter((s) => s !== moved);
        priceSet = [...priceSet, moved];
        continue;
      }
      for (const s of capSet) {
        converted.set(s, capShares.get(s)!);
        capNote(s, capShares.get(s)!, c.sumRatio);
        if (s.mfn) note(s.holder, "MFN", "most favored nation ignored in projections");
      }
      if (T > 0n) {
        pool.shares += T;
        topUp = `${fmtInt(T)} added in the pre-money so the pool is ${round.poolTarget}% after the round`;
        note(POOL, "top-up", topUp);
      } else if (t)
        notes.push(`The pool is already above ${round.poolTarget}% of the post-money, so no top-up.`);
      note(
        investors,
        "round price",
        `${money(pre)}${D.n ? ` − ${show(D, 0)} (SAFE money converting at the price, grossed up by its discount)` : ""} ÷ ${fmtInt(held + T)} = ${show(price)}`,
      );
      for (const s of priceSet) {
        const shares = floor(div(dec(s.amount!), mul(price, sub(ONE, dec(s.discount ?? "0")))));
        converted.set(s, shares);
        note(
          s.holder,
          "shares",
          `${fmtInt(shares)} = ${money(s.amount!)} ÷ (${show(price)} × (1 − ${s.discount ?? "0"}))`,
        );
      }
      // 5. New shares.
      const n = floor(div(dec(round.newMoney!), price));
      note(investors, "new shares", `${fmtInt(n)} = ${money(round.newMoney!)} ÷ ${show(price)}`);
      merge();
      out.push({ holder: investors, kind: "shares", shares: n });
      return { holdings: out, notes, math };
    }
  }

  // A "sells X%" round: no price; the new investors get X% of the post-money fully diluted count.
  const s = pct(round.sells!);
  if (!(s.n > 0n) || ge(s, ONE)) return { error: "The percent sold must be between 0 and 100." };
  const unpriced = safes.filter((x) => !x.cap);
  if (unpriced.length)
    return {
      error: `Give this round a valuation: ${unpriced.map((x) => x.holder).join(", ")} ${unpriced.length > 1 ? "hold SAFEs" : "holds a SAFE"} without a cap, which can't be sized from a percent.`,
    };
  const c = atCap(safes);
  if ("error" in c) return c;
  for (const x of safes) {
    const shares = floor(mul(c.C, div(dec(x.amount!), dec(x.cap!))));
    converted.set(x, shares);
    capNote(x, shares, c.sumRatio);
    if (x.discount) note(x.holder, "discount", "a percent-only round has no price, so the cap is used");
  }
  if (safes.length) notes.push("SAFEs convert on their caps, assuming the round prices above them.");
  const held = S + [...converted.values()].reduce((a, n) => a + n, 0n);
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
  merge();
  out.push({ holder: investors, kind: "shares", shares: n });
  return { holdings: out, notes, math };
}
