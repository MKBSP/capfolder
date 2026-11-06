# Scenarios, plan 1 of 3: the engine and the AI tool

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pure `runScenario` in `@capfolder/core` that turns a starting point and a list of steps (founders, pool, SAFEs, priced rounds, an exit) into one table per step, exposed as the `run_scenario` tool in the MCP server and in the app's Ask AI.

**Architecture:** Recordable steps (founders, pool, SAFE, grant) are turned into real events with the existing builders and `appendEvents` on an in-memory log, then reduced to a `State`. Projection steps (round, exit) are pure math on a `Holding[]` view of that state and never create events. The tool is defined once in `packages/capfolder/src/tools/plans.ts` and registered in both the MCP server and `chat.ts`.

**Tech Stack:** TypeScript, bigint fractions from `packages/core/src/num.ts`, vitest, fast-check (already a dev dependency of core), zod 4 (`z.toJSONSchema`), the MCP SDK.

**Spec:** `docs/superpowers/specs/2026-11-06-scenarios-design.md`. Plans 2 (desktop screen) and 3 (website calculator) follow this one.

## Global Constraints

- `packages/core` keeps zero `node:` imports (the website bundles it for the browser).
- No new runtime dependency.
- All share math in bigint; a step issues whole shares (round down) and percentages come from `percentOf` in `totals.ts` (2 decimals, half up).
- The engine never recommends: result text may say "typical" with a source, never "should".
- Projections are never written: no `EventDraft` for a round or an exit, and no new OCF event type.
- Every default in `benchmarks.ts` carries `source` and `year`.
- Sample names only in tests and copy: Tim Apple, Steve Jobs, Steve Wozniak, Bill Gates, Acme.
- Commits on `main`, message style `feat(core): …`, `feat(capfolder): …`, `feat(desktop): …`.

## Review Focus

1. A round given as "sells X%" while a discount-only or uncapped SAFE is outstanding: the step must return an error asking for a valuation, not silently size the SAFE (Task 2 test `sells-percent round refuses a discount-only SAFE`).
2. A pool target below the current pool: no negative top-up; the pool stays and the note says so (Task 2 test `pool already above target`).
3. A SAFE whose cap is lower than the money it raised in total (Σ amount/cap ≥ 1): the capitalization formula divides by zero or goes negative; the step must error "the SAFE caps are below the money raised" (Task 2 test `caps below money raised`).
4. A recordable step after a projection step: refused with "record the round first" (Task 5 test).
5. Empty-start founders whose shares don't add up to a whole class, or a zero-share founder: `stateFrom` must surface the engine's error text rather than throw (Task 1 test `zero shares is an error, not a throw`).

---

### Task 1: Types, the empty start, and the holdings view

**Files:**
- Create: `packages/core/src/scenario/types.ts`
- Create: `packages/core/src/scenario/start.ts`
- Create: `packages/core/src/scenario/holdings.ts`
- Create: `packages/core/src/scenario/index.ts` (re-exports; Task 5 adds it to `packages/core/src/index.ts`)
- Test: `packages/core/test/scenario-start.test.ts`

**Interfaces:**
- Consumes: `builders` (`issuer`, `stockClass`, `stakeholder`, `vestingTerms`, `stockIssuance`, `stockPlan`, `safe`, `optionGrant`), `appendEvents(log: string, drafts: EventDraft[], ctx: AppendCtx)`, `defaultCtx(deviceId)`, `reduce(events, asOf)`, `MAX_DATE`, `capTableRows(state)`, `percentOf`, `toInt`, `parseDec` from core.
- Produces (in `types.ts`):

```ts
export type Vesting = { months: number; cliffMonths: number };
export type FoundersStep = { kind: "founders"; date?: string; authorized?: string; founders: { name: string; shares: string; vesting?: Vesting }[] };
export type PoolStep = { kind: "pool"; shares?: string; percent?: string }; // one of the two; percent = share of fully diluted after this step
export type SafeStep = { kind: "safe"; investor: string; amount: string; cap?: string; discount?: string; mfn?: boolean };
export type GrantStep = { kind: "grant"; person: string; options: string; strike?: string; vesting?: Vesting };
export type RoundStep = { kind: "round"; name: string; newMoney?: string; preMoney?: string; postMoney?: string; sells?: string; poolTarget?: string };
export type ExitStep = { kind: "exit"; value: string };
export type RecordableStep = FoundersStep | PoolStep | SafeStep | GrantStep;
export type ProjectionStep = RoundStep | ExitStep;
export type Step = RecordableStep | ProjectionStep;
export type Holding = { holder: string; kind: "shares" | "options" | "pool" | "safe"; shares: bigint; amount?: string; cap?: string; discount?: string };
export type Line = { holder: string; kind: Holding["kind"]; shares: bigint | null; percent: string; change: string; proceeds?: string; math: Record<string, string> };
export type StepResult = { step: Step; title: string; lines: Line[]; notes: string[]; error?: string };
export type Scenario = { start: State | null; steps: Step[]; today: string };
export type Sweep = { step: number; field: string; values: string[] };
export type ScenarioResult = { steps: StepResult[]; sweep?: { field: string; values: string[]; results: { steps: StepResult[] }[] } };
```

- Produces (in `start.ts`): `stateFrom(base: State | null, steps: RecordableStep[], today: string): { state: State; events: VaultEvent[] } | { error: string }`. With `base === null` it first builds an issuer named "Scenario" (country US) and one Common class with `authorized` (default `"10000000"`) at the first founders step; a `percent` pool step issues `floor(held × p ÷ (1 − p))` shares; founders' vesting defaults to 4 years, 12-month cliff. Dates default to `today`.
- Produces (in `holdings.ts`): `holdingsOf(state: State): Holding[]` (from `capTableRows`: group 0 → shares, 1 → options, 2 → pool, 3 → safe with amount/cap/discount; merged per holder and kind) and `tableOf(holdings: Holding[], previous: Line[] | null, math: Record<string, Record<string, string>>): Line[]` (percent of fully diluted = shares + options + pool; SAFE lines show `shares: null`, `percent: ""`; `change` = percentage-point difference to the same holder in `previous`, `"new"` when absent, `""` when `previous` is null).

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, test } from "vitest";
import { holdingsOf, stateFrom, tableOf } from "../src/scenario";

const founders = { kind: "founders", founders: [{ name: "Steve Jobs", shares: "4000000" }, { name: "Steve Wozniak", shares: "4000000" }] } as const;

test("empty start: two founders and a pool by shares", () => {
  const r = stateFrom(null, [founders, { kind: "pool", shares: "2000000" }], "2026-11-06");
  if ("error" in r) throw new Error(r.error);
  const lines = tableOf(holdingsOf(r.state), null, {});
  expect(lines.map((l) => [l.holder, l.kind, l.shares, l.percent])).toEqual([
    ["Steve Jobs", "shares", 4000000n, "40.00"],
    ["Steve Wozniak", "shares", 4000000n, "40.00"],
    ["Option pool", "pool", 2000000n, "20.00"],
  ]);
});

test("pool by percent: 10% of fully diluted after the step", () => {
  const r = stateFrom(null, [founders, { kind: "pool", percent: "10" }], "2026-11-06");
  if ("error" in r) throw new Error(r.error);
  const pool = holdingsOf(r.state).find((h) => h.kind === "pool")!;
  expect(pool.shares).toBe(888888n); // floor(8,000,000 × 0.1 ÷ 0.9)
});

test("a SAFE shows as a safe holding with its terms, no shares", () => {
  const r = stateFrom(null, [founders, { kind: "safe", investor: "Bill Gates", amount: "1000000", cap: "10000000" }], "2026-11-06");
  if ("error" in r) throw new Error(r.error);
  expect(holdingsOf(r.state).find((h) => h.kind === "safe")).toMatchObject({ holder: "Bill Gates", amount: "1000000", cap: "10000000", shares: 0n });
});

test("zero shares is an error, not a throw", () => {
  const r = stateFrom(null, [{ kind: "founders", founders: [{ name: "Steve Jobs", shares: "0" }] }], "2026-11-06");
  expect("error" in r).toBe(true);
});

test("change column: percentage points against the previous table", () => {
  const before = [{ holder: "Steve Jobs", kind: "shares", shares: 4000000n, percent: "50.00", change: "", math: {} }] as const;
  const lines = tableOf([{ holder: "Steve Jobs", kind: "shares", shares: 4000000n }, { holder: "Bill Gates", kind: "shares", shares: 6000000n }], [...before], {});
  expect(lines.map((l) => l.change)).toEqual(["-10.00", "new"]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @capfolder/core exec vitest run test/scenario-start.test.ts`
Expected: FAIL, cannot resolve `../src/scenario`.

- [ ] **Step 3: Implement `types.ts`, `stateFrom` in `start.ts`, `holdingsOf` and `tableOf` in `holdings.ts`, and `index.ts`**

`stateFrom` builds drafts with the builders, calls `appendEvents("", drafts, defaultCtx("scenario"))` per step (passing the growing log along), and returns `{ error: r.errors.join(" ") }` on the first `!r.ok`. Builder calls that throw on bad input (`toInt`) are caught and returned the same way. `tableOf` sorts lines founders first in step order, then options, pool, SAFEs.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @capfolder/core exec vitest run test/scenario-start.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/scenario packages/core/test/scenario-start.test.ts
git commit -m "feat(core): scenario types, empty start and the holdings view"
```

---

### Task 2: The priced round

**Files:**
- Create: `packages/core/src/scenario/round.ts`
- Test: `packages/core/test/scenario-round.test.ts`

**Interfaces:**
- Consumes: `Holding`, `RoundStep` from Task 1; `parseDec`, `decFraction` from `num.ts`.
- Produces: `applyRound(holdings: Holding[], round: RoundStep): { holdings: Holding[]; notes: string[]; math: Record<string, Record<string, string>> } | { error: string }`. New investors become one holding `{ holder: round.name + " investors", kind: "shares" }`. Converted SAFEs become `kind: "shares"` holdings under the investor's name and the SAFE holding disappears. Pool top-up adds to the pool holding. `math` is keyed by holder, then by label ("SAFE price", "round price", "new shares", "top-up").

Order inside the step, from the spec: (1) company capitalization before the round = shares + options + pool, (2) cap SAFEs convert on the post-money cap method: `C = S ÷ (1 − Σ amountᵢ/capᵢ)`, SAFE *i* gets `floor(C × amountᵢ/capᵢ)`, (3) pool top-up in the pre-money to `poolTarget` % of post-money, (4) price = pre-money ÷ (shares after 2 and 3); `postMoney` given → `preMoney = postMoney − newMoney`, (5) new shares = `floor(newMoney ÷ price)`. Discount-only SAFEs: price = `(preMoney − Σ amountᵢ ÷ (1 − dᵢ)) ÷ S`, each gets `floor(amountᵢ ÷ (price × (1 − dᵢ)))`. Cap-and-discount: compute both share counts, take the larger (note it in `math`). A `sells` round: `T = held ÷ (1 − sells − poolTarget)` when a top-up is needed, else `T = (held + pool) ÷ (1 − sells)`; new shares = `floor(sells × T)`.

- [ ] **Step 1: Write the failing tests** (numbers hand-checked on 2026-11-06)

```ts
import { expect, test } from "vitest";
import { applyRound } from "../src/scenario/round";
import type { Holding } from "../src/scenario";

const base: Holding[] = [
  { holder: "Steve Jobs", kind: "shares", shares: 4000000n },
  { holder: "Steve Wozniak", kind: "shares", shares: 4000000n },
  { holder: "Option pool", kind: "pool", shares: 2000000n },
];
const bill: Holding = { holder: "Bill Gates", kind: "safe", shares: 0n, amount: "1000000", cap: "10000000" };
const ok = (r: ReturnType<typeof applyRound>) => { if ("error" in r) throw new Error(r.error); return r; };
const shares = (h: Holding[], holder: string) => h.find((x) => x.holder === holder)!.shares;

test("one post-money SAFE at cap converts to exactly amount ÷ cap of the pre-round capitalization", () => {
  const r = ok(applyRound([...base, bill], { kind: "round", name: "Seed", newMoney: "2000000", preMoney: "8000000" }));
  expect(shares(r.holdings, "Bill Gates")).toBe(1111111n); // floor(10,000,000 ÷ 0.9 × 0.1)
  expect(shares(r.holdings, "Seed investors")).toBe(2777777n); // $2M ÷ ($8M ÷ 11,111,111)
  expect(r.holdings.reduce((a, h) => a + h.shares, 0n)).toBe(13888888n);
  expect(r.math["Seed investors"]!["round price"]).toContain("8,000,000 ÷ 11,111,111");
});

test("stacked SAFEs: $500k at $5M and $1M at $10M each take 10% of the capitalization", () => {
  const r = ok(applyRound([...base, { holder: "Bill Gates", kind: "safe", shares: 0n, amount: "500000", cap: "5000000" }, { holder: "Fund X", kind: "safe", shares: 0n, amount: "1000000", cap: "10000000" }], { kind: "round", name: "Seed", newMoney: "2000000", preMoney: "8000000" }));
  expect(shares(r.holdings, "Bill Gates")).toBe(1250000n);
  expect(shares(r.holdings, "Fund X")).toBe(1250000n);
});

test("discount-only SAFE: price solves against the pre-money, shares at 80% of it", () => {
  const r = ok(applyRound([...base, { holder: "Bill Gates", kind: "safe", shares: 0n, amount: "1000000", discount: "0.2" }], { kind: "round", name: "Seed", newMoney: "2000000", preMoney: "8000000" }));
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
  expect(r.holdings.reduce((a, h) => a + h.shares, 0n)).toBe(14017093n);
});

test("sells-percent round refuses a discount-only SAFE", () => {
  const r = applyRound([...base, { holder: "Bill Gates", kind: "safe", shares: 0n, amount: "1000000", discount: "0.2" }], { kind: "round", name: "Seed", sells: "20" });
  expect(r).toMatchObject({ error: expect.stringContaining("valuation") });
});

test("caps below money raised is an error", () => {
  const r = applyRound([...base, { holder: "Bill Gates", kind: "safe", shares: 0n, amount: "6000000", cap: "5000000" }], { kind: "round", name: "Seed", sells: "20" });
  expect(r).toMatchObject({ error: expect.stringContaining("caps") });
});

test("post-money valuation input becomes pre-money minus new money", () => {
  const a = ok(applyRound(base, { kind: "round", name: "Seed", newMoney: "2000000", preMoney: "8000000" }));
  const b = ok(applyRound(base, { kind: "round", name: "Seed", newMoney: "2000000", postMoney: "10000000" }));
  expect(b.holdings).toEqual(a.holdings);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @capfolder/core exec vitest run test/scenario-round.test.ts`
Expected: FAIL, cannot resolve `../src/scenario/round`.

- [ ] **Step 3: Implement `applyRound` in `round.ts`**

Use a small local `Frac` (numerator and denominator bigint) built from `parseDec` for the valuation, cap and discount inputs; round to whole shares only where the spec says a step issues shares. Amount strings are OCF decimals (`^\d+(\.\d{1,10})?$`), discounts are fractions ("0.2"), `sells` and `poolTarget` are percent strings ("20").

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @capfolder/core exec vitest run test/scenario-round.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/scenario/round.ts packages/core/test/scenario-round.test.ts
git commit -m "feat(core): scenario priced round with SAFE conversion and pool top-up"
```

---

### Task 3: The exit

**Files:**
- Create: `packages/core/src/scenario/exit.ts`
- Test: `packages/core/test/scenario-exit.test.ts`

**Interfaces:**
- Consumes: `Holding`, `Line` from Task 1; `largestRemainder` from `num.ts`.
- Produces: `applyExit(holdings: Holding[], value: string): { lines: Line[]; notes: string[] } | { error: string }`. The unissued pool is dropped from the denominator and listed with `proceeds: "0"` and a note "Unissued options are cancelled at an exit." Options count as exercised, strike ignored (note "before exercise prices and liquidation preferences, which can change this a lot"). Proceeds are whole currency units via `largestRemainder` so they sum to the exit value. A SAFE still outstanding at the exit is an error: "convert the SAFEs with a round first".

- [ ] **Step 1: Write the failing tests**

```ts
import { expect, test } from "vitest";
import { applyExit } from "../src/scenario/exit";
import type { Holding } from "../src/scenario";

const after: Holding[] = [
  { holder: "Steve Jobs", kind: "shares", shares: 4000000n },
  { holder: "Steve Wozniak", kind: "shares", shares: 4000000n },
  { holder: "Bill Gates", kind: "shares", shares: 1111111n },
  { holder: "Seed investors", kind: "shares", shares: 2777777n },
  { holder: "Option pool", kind: "pool", shares: 2000000n },
];

test("exit at $100M: pool cancelled, proceeds sum to the exit value", () => {
  const r = applyExit([...after], "100000000");
  if ("error" in r) throw new Error(r.error);
  const by = Object.fromEntries(r.lines.map((l) => [l.holder, l.proceeds]));
  expect(by["Option pool"]).toBe("0");
  expect(by["Bill Gates"]).toMatch(/^934579[45]$/);
  expect(by["Seed investors"]).toMatch(/^2336448[12]$/);
  expect(r.lines.reduce((a, l) => a + BigInt(l.proceeds ?? "0"), 0n)).toBe(100000000n);
  expect(r.notes.join(" ")).toContain("liquidation preferences");
});

test("an outstanding SAFE at the exit is an error", () => {
  expect(applyExit([{ holder: "Bill Gates", kind: "safe", shares: 0n, amount: "1", cap: "2" }], "1")).toMatchObject({ error: expect.stringContaining("round") });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @capfolder/core exec vitest run test/scenario-exit.test.ts`
Expected: FAIL, cannot resolve `../src/scenario/exit`.

- [ ] **Step 3: Implement `applyExit` in `exit.ts`**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @capfolder/core exec vitest run test/scenario-exit.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/scenario/exit.ts packages/core/test/scenario-exit.test.ts
git commit -m "feat(core): scenario exit, pool cancelled, proceeds to the dollar"
```

---

### Task 4: Benchmarks and the default path

**Files:**
- Create: `packages/core/src/scenario/benchmarks.ts`
- Test: `packages/core/test/scenario-benchmarks.test.ts`

**Interfaces:**
- Produces: `BENCHMARKS: readonly { key: string; label: string; value: string; source: string; year: number; url?: string }[]` with the spec's table (`preseed-cap-under-250k` "7500000", `preseed-cap-to-1m` "10000000", `preseed-cap-to-2.5m` "12000000", `preseed-sells` "10-15", `pool-preseed` "10", `pool-seed` "12", `seed-dilution` "20", `series-a-dilution` "18", `series-b-dilution` "14", `series-c-dilution` "10", `first-hire` "1.5", `advisor-preseed` "0.25", `advisor-seed` "0.15", `two-founder-split` "50/50 in 44–46% of teams, median 51/49"; source "Carta" with the report name, year 2025 unless the spec says 2026).
- Produces: `defaultPath(opts: { from: "preseed" | "seed" | "series-a"; through: "seed" | "series-a" | "series-b" | "series-c" }): RoundStep[]` returning `sells` rounds in order with `poolTarget` "12" on the seed and the current pool target otherwise (omit `poolTarget` after seed).
- Produces: `preseedCapFor(amount: string): string` (the Carta band for the amount raised).

- [ ] **Step 1: Write the failing tests**

```ts
import { expect, test } from "vitest";
import { BENCHMARKS, defaultPath, preseedCapFor } from "../src/scenario/benchmarks";

test("every benchmark names its source and year", () => {
  for (const b of BENCHMARKS) expect([b.key, b.source.length > 0, b.year >= 2024]).toEqual([b.key, true, true]);
});

test("default path from pre-seed through series B", () => {
  expect(defaultPath({ from: "preseed", through: "series-b" }).map((r) => [r.name, r.sells, r.poolTarget])).toEqual([
    ["Seed", "20", "12"],
    ["Series A", "18", undefined],
    ["Series B", "14", undefined],
  ]);
});

test("pre-seed cap band by amount raised", () => {
  expect([preseedCapFor("200000"), preseedCapFor("500000"), preseedCapFor("2000000")]).toEqual(["7500000", "10000000", "12000000"]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @capfolder/core exec vitest run test/scenario-benchmarks.test.ts`
Expected: FAIL, cannot resolve `../src/scenario/benchmarks`.

- [ ] **Step 3: Implement `benchmarks.ts`**

Re-check each figure against the Carta report before writing it in (spec `[verify]`); if a figure can't be confirmed, keep the spec's value and add `unverified: true` to that entry so the tool text can say "reported".

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @capfolder/core exec vitest run test/scenario-benchmarks.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/scenario/benchmarks.ts packages/core/test/scenario-benchmarks.test.ts
git commit -m "feat(core): scenario benchmarks and the default path, each with its source"
```

---

### Task 5: `runScenario` with sweeps, property tests, core export

**Files:**
- Create: `packages/core/src/scenario/run.ts`
- Modify: `packages/core/src/scenario/index.ts` (export `runScenario`), `packages/core/src/index.ts` (add `export * from "./scenario";`)
- Modify: `docs/03-data-model.md` (one decision line: scenarios are derived state, never stored; the founder saves recordable steps as ordinary events)
- Test: `packages/core/test/scenario-run.test.ts`, `packages/core/test/scenario.property.test.ts`

**Interfaces:**
- Consumes: Tasks 1 to 4.
- Produces: `runScenario(s: Scenario, sweep?: Sweep): ScenarioResult`. Walks the steps: recordable steps go through `stateFrom` (cumulative, starting from `s.start`), then `holdingsOf`; each `round` goes through `applyRound`, each `exit` through `applyExit`; every step gets a `StepResult` with `title` ("Founders", "Option pool", "SAFE: Bill Gates", round.name, "Exit at $200M") and `lines` from `tableOf` with the previous step's lines as `previous`. A recordable step after a projection step yields `error: "Record the round first: …"` and the walk stops. An error in any step stops the walk at that step. With `sweep`, the step at `sweep.step` has `sweep.field` replaced by each value in turn and `result.sweep.results` holds one `{ steps }` per value; the main `steps` are the run with the original value.

- [ ] **Step 1: Write the failing tests**

```ts
import { expect, test } from "vitest";
import { defaultPath, runScenario } from "../src/scenario";

const two = { kind: "founders", founders: [{ name: "Steve Jobs", shares: "5000000" }, { name: "Steve Wozniak", shares: "5000000" }] } as const;

test("the first question: two founders, $500k at a $2M cap, the default path, exit at $200M", () => {
  const r = runScenario({ start: null, today: "2026-11-06", steps: [two, { kind: "pool", percent: "10" }, { kind: "safe", investor: "Bill Gates", amount: "500000", cap: "2000000" }, ...defaultPath({ from: "preseed", through: "series-b" }), { kind: "exit", value: "200000000" }] });
  expect(r.steps.map((s) => s.title)).toEqual(["Founders", "Option pool", "SAFE: Bill Gates", "Seed", "Series A", "Series B", "Exit at $200M"]);
  expect(r.steps.every((s) => !s.error)).toBe(true);
  const exit = r.steps.at(-1)!;
  expect(exit.lines.reduce((a, l) => a + BigInt(l.proceeds ?? "0"), 0n)).toBe(200000000n);
  const jobs = r.steps.map((s) => s.lines.find((l) => l.holder === "Steve Jobs")?.percent).slice(0, 6);
  expect(jobs.map(Number)).toEqual([...jobs.map(Number)].sort((a, b) => b - a)); // never goes up
});

test("a sweep over the cap returns one result per value", () => {
  const r = runScenario({ start: null, today: "2026-11-06", steps: [two, { kind: "safe", investor: "Bill Gates", amount: "50000", cap: "1000000" }, { kind: "round", name: "Seed", sells: "20" }] }, { step: 1, field: "cap", values: ["1000000", "2000000", "5000000"] });
  expect(r.sweep!.results.length).toBe(3);
  const billAfterSeed = r.sweep!.results.map((x) => x.steps[2]!.lines.find((l) => l.holder === "Bill Gates")!.percent);
  expect(billAfterSeed.map(Number)).toEqual([...billAfterSeed.map(Number)].sort((a, b) => b - a)); // a higher cap, a smaller share
});

test("a recordable step after a round is refused", () => {
  const r = runScenario({ start: null, today: "2026-11-06", steps: [two, { kind: "round", name: "Seed", sells: "20" }, { kind: "pool", percent: "10" }] });
  expect(r.steps[2]!.error).toContain("Record the round first");
});
```

Property test (`scenario.property.test.ts`, fast-check, 200 runs): for random founders (1 to 4, shares 1,000,000 to 10,000,000 each), a pool of 5 to 20 percent, 0 to 3 cap SAFEs (amount 10,000 to 2,000,000; cap 1,000,000 to 50,000,000 with Σ amount/cap < 0.5), and 1 to 3 `sells` rounds (5 to 30 percent): every step's share-percent lines sum to between "99.98" and "100.02"; each founder's percent never increases; each SAFE's percent right after conversion equals `amount ÷ cap` of the pre-round capitalization within 0.01 points.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @capfolder/core exec vitest run test/scenario-run.test.ts test/scenario.property.test.ts`
Expected: FAIL, `runScenario` is not exported.

- [ ] **Step 3: Implement `runScenario` in `run.ts`; export from `scenario/index.ts` and `core/src/index.ts`; add the decision line to `docs/03-data-model.md`**

- [ ] **Step 4: Run the whole core suite**

Run: `pnpm --filter @capfolder/core test`
Expected: all pass, including the existing golden tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core docs/03-data-model.md
git commit -m "feat(core): runScenario with sweeps and property tests"
```

---

### Task 6: The `run_scenario` tool, defined once, in the MCP server

**Files:**
- Create: `packages/capfolder/src/tools/plans.ts`
- Modify: `packages/capfolder/src/tools/read.ts` (register `run_scenario` next to `get_cap_table`)
- Modify: `skills/capfolder/SKILL.md` (a "Play with the numbers" section)
- Test: `packages/capfolder/src/tools/plans.test.ts`

**Interfaces:**
- Consumes: `runScenario`, `defaultPath`, `BENCHMARKS`, `Scenario`, `Step` from core; `reply`, `todayOf`, `currentVault`, `readOnly` from `read.ts`/`context.ts`.
- Produces (in `plans.ts`):

```ts
export const stepSchema: z.ZodType<Step>; // a discriminated union on `kind`, every field described for the model
export const runScenarioInput = z.object({
  start: z.enum(["empty", "company"]).describe("empty: no company, founders come from the first step; company: the open company's cap table as of today"),
  steps: z.array(stepSchema).min(1),
  default_path: z.object({ from: z.enum(["preseed", "seed", "series-a"]), through: z.enum(["seed", "series-a", "series-b", "series-c"]) }).optional().describe("Append the typical rounds (Carta medians) after your steps"),
  sweep: z.object({ step: z.number().int(), field: z.string(), values: z.array(z.string()).min(2).max(12) }).optional(),
});
export type RunScenarioInput = z.infer<typeof runScenarioInput>;
export const RUN_SCENARIO = { name: "run_scenario", title: "Try a scenario", description: string }; // description says: nothing is written; the engine does the math; results name their sources; never present a number as advice
export function runScenarioTool(input: RunScenarioInput, company: State | null, today: string): { text: string; data: Record<string, unknown> };
```

`runScenarioTool` builds the `Scenario` (`start: null` for "empty"; the reduced company state for "company", error text when there is no company), appends `defaultPath` rounds if asked, calls `runScenario`, and renders one markdown table per step (Holder, Shares, %, Change; Proceeds on the exit) plus the step's notes, then a "Sources" block listing the benchmarks used (label, value, source, year) and the fixed line "These are projections, not advice. Nothing was recorded." The `data` carries the raw `ScenarioResult` with bigints as strings.

- [ ] **Step 1: Write the failing tests**

```ts
import { expect, test } from "vitest";
import { z } from "zod";
import { runScenarioInput, runScenarioTool } from "./plans";

test("empty start renders one table per step and the sources", () => {
  const input = runScenarioInput.parse({ start: "empty", steps: [{ kind: "founders", founders: [{ name: "Steve Jobs", shares: "5000000" }, { name: "Steve Wozniak", shares: "5000000" }] }, { kind: "safe", investor: "Bill Gates", amount: "50000", cap: "2000000" }], default_path: { from: "preseed", through: "series-a" } });
  const r = runScenarioTool(input, null, "2026-11-06");
  expect(r.text).toContain("## Founders");
  expect(r.text).toContain("## Series A");
  expect(r.text).toContain("Carta");
  expect(r.text).toContain("not advice");
  expect(r.text).not.toMatch(/\bshould\b/);
});

test("company start without a company says so", () => {
  const r = runScenarioTool(runScenarioInput.parse({ start: "company", steps: [{ kind: "exit", value: "1000000" }] }), null, "2026-11-06");
  expect(r.text).toContain("No company");
});

test("the schema converts to JSON schema for the chat providers", () => {
  const js = z.toJSONSchema(runScenarioInput) as { properties: Record<string, unknown> };
  expect(Object.keys(js.properties)).toEqual(["start", "steps", "default_path", "sweep"]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter capfolder exec vitest run src/tools/plans.test.ts`
Expected: FAIL, cannot resolve `./plans`.

- [ ] **Step 3: Implement `plans.ts`; register the tool in `read.ts` with `annotations: readOnly("Try a scenario")` and `inputSchema: runScenarioInput.shape`, handler `(a) => reply(...runScenarioTool(a, state, todayOf(o)))` where `state` is `reduce(v.events, MAX_DATE)` when a company is open, else `null`; add the SKILL.md section**

SKILL.md section (copy fixed by the spec's anti-goals): "Play with the numbers. When the founder wants to try a round, a cap, an exit, or asks what they would own, call `run_scenario`. Show every table as it is. Say the sources next to the defaults. Never pick a number for them: show what each number does and, if they ask what is typical, quote the source. If they want to keep the real part (founders, pool, a SAFE), use the usual tools with a preview and a yes; rounds that haven't happened are never recorded."

- [ ] **Step 4: Run the package tests and the golden test**

Run: `pnpm --filter capfolder test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/capfolder/src/tools/plans.ts packages/capfolder/src/tools/plans.test.ts packages/capfolder/src/tools/read.ts skills/capfolder/SKILL.md
git commit -m "feat(capfolder): run_scenario tool, defined once in tools/plans.ts"
```

---

### Task 7: The same tool in Ask AI

**Files:**
- Modify: `apps/desktop/package.json` (add `"capfolder": "workspace:*"` to dependencies) and `packages/capfolder/package.json` (add an `exports` entry `"./plans": "./src/tools/plans.ts"` so the desktop imports only the pure file, never `write.ts`; the workspace consumes `@capfolder/core` as TypeScript source the same way. If `packaging.test.ts` or the npm build needs a built path, point `default` at `./dist/tools/plans.js` and `types` at the `.ts`)
- Modify: `apps/desktop/src/chat.ts` (tool list and `runTool`)
- Test: `apps/desktop/src/chat.test.ts`

**Interfaces:**
- Consumes: `RUN_SCENARIO`, `runScenarioInput`, `runScenarioTool` from `capfolder/plans`; `z.toJSONSchema`.
- Produces: in `READ`, a tool entry `{ name: RUN_SCENARIO.name, description: RUN_SCENARIO.description, parameters: z.toJSONSchema(runScenarioInput) }`; in `runTool`, `case "run_scenario"` → `runScenarioTool(runScenarioInput.parse(input), reduce(d.vault.events, MAX_DATE), d.asOf).text`, with a parse failure returned as text ("I couldn't read those scenario inputs: …") the way other tools report errors.

- [ ] **Step 1: Write the failing test** (use `chat.test.ts`'s existing provider-stub helpers; the helper names below are illustrative)

```ts
test("Ask AI runs a scenario through the shared tool and never writes", async () => {
  // stub provider: first reply calls run_scenario with an exit on the open company, second reply is text
  const msg = await askChat(depsWithStub([toolCall("run_scenario", { start: "company", steps: [{ kind: "exit", value: "100000000" }] }), text("done")]), [], "What do we get at a $100M exit?");
  expect(stubSawToolResult()).toContain("## Exit at $100M");
  expect(stubSawToolResult()).toContain("not advice");
  expect(msg.drafts ?? []).toEqual([]);
  expect(fs.readSync(`${root}/events.jsonl`)).toBe(eventsBefore);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @capfolder/desktop exec vitest run src/chat.test.ts -t "runs a scenario"`
Expected: FAIL, unknown tool `run_scenario`.

- [ ] **Step 3: Add the dependency and the `exports` entry, the tool entry and the `runTool` case; `pnpm i`**

`[verify]` from the spec: that the three provider wire formats accept the JSON schema `z.toJSONSchema` produces (an `$schema` key and `additionalProperties: false` are the usual snags; strip `$schema` in the `tool()` helper if a provider rejects it).

- [ ] **Step 4: Run the desktop suite and typecheck**

Run: `pnpm --filter @capfolder/desktop test && pnpm typecheck`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/package.json packages/capfolder/package.json pnpm-lock.yaml apps/desktop/src/chat.ts apps/desktop/src/chat.test.ts
git commit -m "feat(desktop): Ask AI runs scenarios through the shared run_scenario tool"
```

---

### Task 8: Story, changelog, lint

**Files:**
- Modify: `docs/02-user-stories.md` (add "F-39 Try a scenario before anything is real": the flow in six lines, mirroring the spec's "Answering the three questions")
- Modify: `CHANGELOG.md` under Unreleased: "**Try a scenario from your AI:** founders, a SAFE, the typical rounds and an exit, with every number's math and its source. Nothing is recorded." and "Ask AI can run the same scenarios."
- Modify: `docs/15-status-and-todo.md` (one line under Next developments: scenarios v1 built; desktop screen and website calculator are plans 2 and 3)

- [ ] **Step 1: Make the edits**

- [ ] **Step 2: Run lint, typecheck and every test**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all green.

- [ ] **Step 3: Commit**

```bash
git add docs/02-user-stories.md CHANGELOG.md docs/15-status-and-todo.md
git commit -m "docs: F-39 scenarios, changelog and status"
```
