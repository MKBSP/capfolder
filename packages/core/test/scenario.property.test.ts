import fc from "fast-check";
import { expect, test } from "vitest";
import { decFraction, ratioFixed } from "../src/num";
import { runScenario, type Step } from "../src/scenario";

const NAMES = ["Tim Apple", "Steve Jobs", "Steve Wozniak", "Bill Gates"];
const bp = (pct: string) => Number(pct.replace(".", ""));

const scenarioArb = fc
  .record({
    founders: fc.array(fc.integer({ min: 1_000_000, max: 10_000_000 }), { minLength: 1, maxLength: 4 }),
    pool: fc.integer({ min: 5, max: 20 }),
    safes: fc.array(
      fc.record({
        amount: fc.integer({ min: 10_000, max: 2_000_000 }),
        cap: fc.integer({ min: 1_000_000, max: 50_000_000 }),
      }),
      { maxLength: 3 },
    ),
    rounds: fc.array(fc.integer({ min: 5, max: 30 }), { minLength: 1, maxLength: 3 }),
  })
  .filter((s) => s.safes.reduce((a, x) => a + x.amount / x.cap, 0) < 0.5);

test("every step's percents sum to 100, founders never go up, a SAFE at cap takes amount ÷ cap", async () => {
  await fc.assert(
    fc.asyncProperty(scenarioArb, async (s) => {
      const steps: Step[] = [
        { kind: "founders", founders: s.founders.map((n, i) => ({ name: NAMES[i]!, shares: String(n) })) },
        { kind: "pool", percent: String(s.pool) },
        ...s.safes.map((x, i) => ({
          kind: "safe" as const,
          investor: `Fund ${i}`,
          amount: String(x.amount),
          cap: String(x.cap),
        })),
        ...s.rounds.map((sells, i) => ({ kind: "round" as const, name: `Round ${i}`, sells: String(sells) })),
      ];
      const r = await runScenario({ start: null, today: "2026-11-06", steps });
      for (const step of r.steps) expect(step.error, step.title).toBeUndefined();
      for (const step of r.steps) {
        const sum = step.lines.filter((l) => l.percent).reduce((a, l) => a + bp(l.percent), 0);
        expect(sum).toBeGreaterThanOrEqual(9998);
        expect(sum).toBeLessThanOrEqual(10002);
      }
      for (let i = 0; i < s.founders.length; i++) {
        const pcts = r.steps.map((st) => bp(st.lines.find((l) => l.holder === NAMES[i])!.percent));
        for (let k = 1; k < pcts.length; k++) expect(pcts[k]).toBeLessThanOrEqual(pcts[k - 1]!);
      }
      // right after the first round, each SAFE holds amount ÷ cap of the capitalization before the round
      const before = r.steps[1 + s.safes.length]!;
      const after = r.steps[2 + s.safes.length]!;
      const capBefore = before.lines.filter((l) => l.shares !== null).reduce((a, l) => a + l.shares!, 0n);
      s.safes.forEach((x, i) => {
        const line = after.lines.find((l) => l.holder === `Fund ${i}` && l.kind === "shares")!;
        const [n, d] = decFraction(String(x.amount), String(x.cap));
        const expected = bp(ratioFixed(n * 100n, d, 2)); // amount ÷ cap in basis points
        // the SAFE's share of the pre-round capitalization (shares of C, not of the post-money total)
        const got = bp(
          ratioFixed(
            line.shares! * 100n,
            capBefore +
              after.lines
                .filter((l) => l.kind === "shares" && l.holder.startsWith("Fund"))
                .reduce((a, l) => a + l.shares!, 0n),
            2,
          ),
        );
        expect(Math.abs(got - expected)).toBeLessThanOrEqual(1);
      });
    }),
    { numRuns: 200 },
  );
}, 120_000);
