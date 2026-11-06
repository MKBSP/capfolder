import { expect, test } from "vitest";
import type { Holding } from "../src/scenario";
import { applyRound } from "../src/scenario/round";

// Numbers hand-checked on 2026-11-06 (exact fractions, floor to whole shares where a step issues shares).
const base: Holding[] = [
  { holder: "Steve Jobs", kind: "shares", shares: 4000000n },
  { holder: "Steve Wozniak", kind: "shares", shares: 4000000n },
  { holder: "Option pool", kind: "pool", shares: 2000000n },
];
const bill: Holding = { holder: "Bill Gates", kind: "safe", shares: 0n, amount: "1000000", cap: "10000000" };
const ok = (r: ReturnType<typeof applyRound>) => {
  if ("error" in r) throw new Error(r.error);
  return r;
};
const shares = (h: Holding[], holder: string) => h.find((x) => x.holder === holder)!.shares;
const total = (h: Holding[]) => h.reduce((a, x) => a + x.shares, 0n);

test("one post-money SAFE at cap converts to exactly amount ÷ cap of the pre-round capitalization", () => {
  const r = ok(
    applyRound([...base, bill], { kind: "round", name: "Seed", newMoney: "2000000", preMoney: "8000000" }),
  );
  expect(shares(r.holdings, "Bill Gates")).toBe(1111111n); // floor(10,000,000 ÷ 0.9 × 0.1)
  expect(shares(r.holdings, "Seed investors")).toBe(2777777n); // $2M ÷ ($8M ÷ 11,111,111)
  expect(total(r.holdings)).toBe(13888888n);
  expect(r.holdings.find((h) => h.kind === "safe")).toBeUndefined();
  expect(r.math["Seed investors"]!["round price"]).toContain("8,000,000 ÷ 11,111,111");
});

test("stacked SAFEs: $500k at $5M and $1M at $10M each take 10% of the capitalization", () => {
  const r = ok(
    applyRound(
      [
        ...base,
        { holder: "Bill Gates", kind: "safe", shares: 0n, amount: "500000", cap: "5000000" },
        { holder: "Fund X", kind: "safe", shares: 0n, amount: "1000000", cap: "10000000" },
      ],
      { kind: "round", name: "Seed", newMoney: "2000000", preMoney: "8000000" },
    ),
  );
  expect(shares(r.holdings, "Bill Gates")).toBe(1250000n);
  expect(shares(r.holdings, "Fund X")).toBe(1250000n);
});

test("discount-only SAFE: price solves against the pre-money, shares at 80% of it", () => {
  const r = ok(
    applyRound(
      [...base, { holder: "Bill Gates", kind: "safe", shares: 0n, amount: "1000000", discount: "0.2" }],
      {
        kind: "round",
        name: "Seed",
        newMoney: "2000000",
        preMoney: "8000000",
      },
    ),
  );
  expect(r.math["Seed investors"]!["round price"]).toContain("0.675");
  expect(shares(r.holdings, "Bill Gates")).toBe(1851851n);
  expect(shares(r.holdings, "Seed investors")).toBe(2962962n);
});

test("sells 20%: the new investors hold 20.00% after; pool already above target is left alone", () => {
  const r = ok(applyRound([...base, bill], { kind: "round", name: "Seed", sells: "20", poolTarget: "10" }));
  expect(shares(r.holdings, "Seed investors")).toBe(2777777n);
  expect(shares(r.holdings, "Option pool")).toBe(2000000n);
  expect(r.notes.join(" ")).toContain("already above");
});

test("sells 20% with a pool top-up to 15% in the pre-money", () => {
  const r = ok(applyRound([...base, bill], { kind: "round", name: "Seed", sells: "20", poolTarget: "15" }));
  expect(shares(r.holdings, "Option pool")).toBe(2102564n);
  expect(shares(r.holdings, "Seed investors")).toBe(2803418n);
  expect(total(r.holdings)).toBe(14017093n);
});

test("sells-percent round refuses a discount-only SAFE", () => {
  const r = applyRound(
    [...base, { holder: "Bill Gates", kind: "safe", shares: 0n, amount: "1000000", discount: "0.2" }],
    {
      kind: "round",
      name: "Seed",
      sells: "20",
    },
  );
  expect(r).toMatchObject({ error: expect.stringContaining("valuation") });
});

test("caps below money raised is an error", () => {
  const r = applyRound(
    [...base, { holder: "Bill Gates", kind: "safe", shares: 0n, amount: "6000000", cap: "5000000" }],
    {
      kind: "round",
      name: "Seed",
      sells: "20",
    },
  );
  expect(r).toMatchObject({ error: expect.stringContaining("caps") });
});

test("post-money valuation input becomes pre-money minus new money", () => {
  const a = ok(applyRound(base, { kind: "round", name: "Seed", newMoney: "2000000", preMoney: "8000000" }));
  const b = ok(applyRound(base, { kind: "round", name: "Seed", newMoney: "2000000", postMoney: "10000000" }));
  expect(b.holdings).toEqual(a.holdings);
});
