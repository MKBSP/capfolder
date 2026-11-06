import { expect, test } from "vitest";
import { z } from "zod";
import { runScenarioInput, runScenarioTool } from "./plans";

test("empty start renders one table per step and the sources", async () => {
  const input = runScenarioInput.parse({
    start: "empty",
    steps: [
      {
        kind: "founders",
        founders: [
          { name: "Steve Jobs", shares: "5000000" },
          { name: "Steve Wozniak", shares: "5000000" },
        ],
      },
      { kind: "safe", investor: "Bill Gates", amount: "50000", cap: "2000000" },
    ],
    default_path: { from: "preseed", through: "series-a" },
  });
  const r = await runScenarioTool(input, null, "2026-11-06");
  expect(r.text).toContain("## Founders");
  expect(r.text).toContain("## Series A");
  expect(r.text).toContain("Carta");
  expect(r.text).toContain("not advice");
  expect(r.text).not.toMatch(/\bshould\b/);
});

test("company start without a company says so", async () => {
  const r = await runScenarioTool(
    runScenarioInput.parse({ start: "company", steps: [{ kind: "exit", value: "1000000" }] }),
    null,
    "2026-11-06",
  );
  expect(r.text).toContain("No company");
});

test("the schema converts to JSON schema for the chat providers", () => {
  const js = z.toJSONSchema(runScenarioInput) as { properties: Record<string, unknown> };
  expect(Object.keys(js.properties)).toEqual(["start", "steps", "default_path", "sweep"]);
});

test("default_path goes before a trailing exit, so question 1 works", async () => {
  const r = await runScenarioTool(
    runScenarioInput.parse({
      start: "empty",
      steps: [
        {
          kind: "founders",
          founders: [
            { name: "Steve Jobs", shares: "5000000" },
            { name: "Steve Wozniak", shares: "5000000" },
          ],
        },
        { kind: "safe", investor: "Bill Gates", amount: "500000", cap: "2000000" },
        { kind: "exit", value: "200000000" },
      ],
      default_path: { from: "preseed", through: "series-b" },
    }),
    null,
    "2026-11-06",
  );
  expect(r.text).toContain("## Series B");
  expect(r.text).toContain("## Exit at $200M");
  expect(r.text).not.toContain("Stopped here");
});

test("a sweep row that stops says why instead of showing zeros", async () => {
  const r = await runScenarioTool(
    runScenarioInput.parse({
      start: "empty",
      steps: [
        { kind: "founders", founders: [{ name: "Steve Jobs", shares: "5000000" }] },
        { kind: "safe", investor: "Bill Gates", amount: "500000", cap: "2000000" },
        { kind: "round", name: "Seed", sells: "20" },
        { kind: "exit", value: "200000000" },
      ],
      sweep: { step: 1, field: "cap", values: ["400000", "2000000"] },
    }),
    null,
    "2026-11-06",
  );
  expect(r.text).toMatch(/\| 400000 \| stopped:/);
  expect(r.text).toContain("After the last step (Exit at $200M)");
});

test("an open folder with no events is no company", async () => {
  const r = await runScenarioTool(
    runScenarioInput.parse({ start: "company", steps: [{ kind: "exit", value: "1" }] }),
    [],
    "2026-11-06",
  );
  expect(r.text).toContain("No company");
});
