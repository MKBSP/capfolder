import { expect, test } from "vitest";
import { defaultPath, runScenario } from "../src/scenario";

const two = {
  kind: "founders",
  founders: [
    { name: "Steve Jobs", shares: "5000000" },
    { name: "Steve Wozniak", shares: "5000000" },
  ],
} as const;

test("the first question: two founders, $500k at a $2M cap, the default path, exit at $200M", async () => {
  const r = await runScenario({
    start: null,
    today: "2026-11-06",
    steps: [
      two,
      { kind: "pool", percent: "10" },
      { kind: "safe", investor: "Bill Gates", amount: "500000", cap: "2000000" },
      ...defaultPath({ from: "preseed", through: "series-b" }),
      { kind: "exit", value: "200000000" },
    ],
  });
  expect(r.steps.map((s) => s.title)).toEqual([
    "Founders",
    "Option pool",
    "SAFE: Bill Gates",
    "Seed",
    "Series A",
    "Series B",
    "Exit at $200M",
  ]);
  expect(r.steps.every((s) => !s.error)).toBe(true);
  const exit = r.steps.at(-1)!;
  expect(exit.lines.reduce((a, l) => a + BigInt(l.proceeds ?? "0"), 0n)).toBe(200000000n);
  const jobs = r.steps.map((s) => s.lines.find((l) => l.holder === "Steve Jobs")?.percent).slice(0, 6);
  expect(jobs.map(Number)).toEqual([...jobs.map(Number)].sort((a, b) => b - a)); // never goes up
});

test("a sweep over the cap returns one result per value", async () => {
  const r = await runScenario(
    {
      start: null,
      today: "2026-11-06",
      steps: [
        two,
        { kind: "safe", investor: "Bill Gates", amount: "50000", cap: "1000000" },
        { kind: "round", name: "Seed", sells: "20" },
      ],
    },
    { step: 1, field: "cap", values: ["1000000", "2000000", "5000000"] },
  );
  expect(r.sweep!.results.length).toBe(3);
  const billAfterSeed = r.sweep!.results.map(
    (x) => x.steps[2]!.lines.find((l) => l.holder === "Bill Gates")!.percent,
  );
  expect(billAfterSeed.map(Number)).toEqual([...billAfterSeed.map(Number)].sort((a, b) => b - a)); // a higher cap, a smaller share
});

test("a recordable step after a round is refused", async () => {
  const r = await runScenario({
    start: null,
    today: "2026-11-06",
    steps: [two, { kind: "round", name: "Seed", sells: "20" }, { kind: "pool", percent: "10" }],
  });
  expect(r.steps[2]!.error).toContain("Record the round first");
});

test("an error inside a step comes back as text, never a throw (bad sweep value)", async () => {
  const r = await runScenario(
    {
      start: null,
      today: "2026-11-06",
      steps: [two, { kind: "round", name: "Seed", newMoney: "1000000", preMoney: "4000000" }],
    },
    { step: 1, field: "preMoney", values: ["abc", "0"] },
  );
  expect(r.sweep!.results.every((x) => x.steps.at(-1)!.error)).toBe(true);
});
