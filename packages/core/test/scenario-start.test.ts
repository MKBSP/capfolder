import { expect, test } from "vitest";
import { holdingsOf, stateFrom, tableOf } from "../src/scenario";

const founders = {
  kind: "founders",
  founders: [
    { name: "Steve Jobs", shares: "4000000" },
    { name: "Steve Wozniak", shares: "4000000" },
  ],
} as const;

test("empty start: two founders and a pool by shares", async () => {
  const r = await stateFrom(null, [founders, { kind: "pool", shares: "2000000" }], "2026-11-06");
  if ("error" in r) throw new Error(r.error);
  const lines = tableOf(holdingsOf(r.state), null, {});
  expect(lines.map((l) => [l.holder, l.kind, l.shares, l.percent])).toEqual([
    ["Steve Jobs", "shares", 4000000n, "40.00"],
    ["Steve Wozniak", "shares", 4000000n, "40.00"],
    ["Option pool", "pool", 2000000n, "20.00"],
  ]);
});

test("pool by percent: 10% of fully diluted after the step", async () => {
  const r = await stateFrom(null, [founders, { kind: "pool", percent: "10" }], "2026-11-06");
  if ("error" in r) throw new Error(r.error);
  const pool = holdingsOf(r.state).find((h) => h.kind === "pool")!;
  expect(pool.shares).toBe(888888n); // floor(8,000,000 × 0.1 ÷ 0.9)
});

test("a SAFE shows as a safe holding with its terms, no shares", async () => {
  const r = await stateFrom(
    null,
    [founders, { kind: "safe", investor: "Bill Gates", amount: "1000000", cap: "10000000" }],
    "2026-11-06",
  );
  if ("error" in r) throw new Error(r.error);
  expect(holdingsOf(r.state).find((h) => h.kind === "safe")).toMatchObject({
    holder: "Bill Gates",
    amount: "1000000",
    cap: "10000000",
    shares: 0n,
  });
});

test("zero shares is an error, not a throw", async () => {
  const r = await stateFrom(
    null,
    [{ kind: "founders", founders: [{ name: "Steve Jobs", shares: "0" }] }],
    "2026-11-06",
  );
  expect("error" in r).toBe(true);
});

test("change column: percentage points against the previous table", () => {
  const before = [
    { holder: "Steve Jobs", kind: "shares", shares: 4000000n, percent: "50.00", change: "", math: {} },
  ] as const;
  const lines = tableOf(
    [
      { holder: "Steve Jobs", kind: "shares", shares: 4000000n },
      { holder: "Bill Gates", kind: "shares", shares: 6000000n },
    ],
    [...before],
    {},
  );
  expect(lines.map((l) => l.change)).toEqual(["-10.00", "new"]);
});
