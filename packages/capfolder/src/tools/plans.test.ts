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
