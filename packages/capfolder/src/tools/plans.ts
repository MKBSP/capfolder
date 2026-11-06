// run_scenario, defined once: the zod input, the description, and the pure function that renders the result.
// The MCP server (read.ts) and the app's Ask AI (apps/desktop/src/chat.ts) both register this. Nothing is written.
import {
  BENCHMARKS,
  type Benchmark,
  defaultPath,
  fmtInt,
  runScenario,
  type ScenarioResult,
  type Step,
  type StepResult,
  type VaultEvent,
} from "@capfolder/core";
import { z } from "zod";

const shares = z.string().regex(/^\d+$/).describe("Whole shares, digits only");
const money = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/)
  .describe("An amount in the company's currency, digits only (no commas or symbols)");
const percent = z
  .string()
  .regex(/^\d+(\.\d+)?$/)
  .describe("A percent as a number, e.g. 20 for 20%");
const vesting = z
  .object({ months: z.number().int().positive(), cliffMonths: z.number().int().min(0) })
  .describe("Vesting schedule; default 48 months with a 12-month cliff");

export const stepSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("founders"),
      founders: z.array(z.object({ name: z.string().min(1), shares, vesting: vesting.optional() })).min(1),
      authorized: shares.optional().describe("Authorized shares of the common class; default 10,000,000"),
    })
    .describe("Founders and their shares. With start 'empty' this creates the company"),
  z
    .object({ kind: z.literal("pool"), shares: shares.optional(), percent: percent.optional() })
    .describe("Option pool by shares or by percent of fully diluted after this step"),
  z
    .object({
      kind: z.literal("safe"),
      investor: z.string().min(1),
      amount: money,
      cap: money.optional().describe("Post-money valuation cap"),
      discount: z
        .string()
        .regex(/^0?\.\d+$/)
        .optional()
        .describe("Discount as a fraction, e.g. 0.2"),
      mfn: z.boolean().optional(),
    })
    .describe("A post-money SAFE (YC form)"),
  z
    .object({
      kind: z.literal("grant"),
      person: z.string().min(1),
      options: shares,
      strike: money.optional(),
      vesting: vesting.optional(),
    })
    .describe("An option grant from the pool"),
  z
    .object({
      kind: z.literal("round"),
      name: z.string().min(1).describe("Seed, Series A, …"),
      newMoney: money.optional(),
      preMoney: money.optional(),
      postMoney: money.optional(),
      sells: percent
        .optional()
        .describe("Instead of money and a valuation: the percent of the post-money the round sells"),
      poolTarget: percent
        .optional()
        .describe("Top the pool up in the pre-money to this percent of the post-money"),
    })
    .describe(
      "A priced round: new money plus a pre- or post-money valuation, or just the percent it sells. SAFEs convert here. A projection, never recorded",
    ),
  z
    .object({ kind: z.literal("exit"), value: money })
    .describe("A sale of the company: proceeds per holder. A projection, never recorded"),
]);

export const runScenarioInput = z.object({
  start: z
    .enum(["empty", "company"])
    .describe(
      "empty: no company, founders come from the first step; company: the open company's cap table as of today",
    ),
  steps: z.array(stepSchema).min(1),
  default_path: z
    .object({
      from: z.enum(["preseed", "seed", "series-a"]),
      through: z.enum(["seed", "series-a", "series-b", "series-c"]),
    })
    .optional()
    .describe("Append the typical rounds (Carta medians) after your steps"),
  sweep: z
    .object({
      step: z.number().int().min(0).describe("Index into steps"),
      field: z.string().min(1).describe("The field of that step to vary, e.g. cap"),
      values: z.array(z.string()).min(2).max(12),
    })
    .optional()
    .describe("Re-run with one field set to each value, for side-by-side comparisons like 'cap 1M, 2M, 5M'"),
});
export type RunScenarioInput = z.infer<typeof runScenarioInput>;

/** The input as JSON Schema for the chat providers (Anthropic, OpenAI-style, Gemini); `$schema` is dropped. */
export const runScenarioJsonSchema = (() => {
  const { $schema: _s, ...js } = z.toJSONSchema(runScenarioInput) as Record<string, unknown>;
  return js;
})();

export const RUN_SCENARIO = {
  name: "run_scenario",
  title: "Try a scenario",
  parameters: runScenarioJsonSchema,
  description:
    "Plays out what-ifs: founders, a pool, SAFEs, priced rounds and an exit, one cap table per step with every number's math. Nothing is written; the engine does all the math. Start 'empty' for a founder with no company, 'company' to build on the open cap table. Results name the source of every default (Carta). Show the numbers as they are; never present a number as advice.",
};

export const NOT_ADVICE = "These are projections, not advice. Nothing was recorded.";

const PATH_KEYS = [
  "seed-dilution",
  "series-a-dilution",
  "series-b-dilution",
  "series-c-dilution",
  "pool-seed",
];

const cell = (s: string) => s.replace(/\|/g, "\\|");

function table(r: StepResult): string {
  const exit = r.step.kind === "exit";
  const head = exit
    ? "| Holder | Shares | % of proceeds | Proceeds |"
    : "| Holder | Shares | % fully diluted | Change |";
  const rule = exit ? "|---|---:|---:|---:|" : "|---|---:|---:|---:|";
  const rows = r.lines.map((l) => {
    const n = l.shares === null ? (l.kind === "safe" ? "SAFE" : "") : fmtInt(l.shares);
    const last = exit ? fmtInt(BigInt(l.proceeds ?? "0")) : l.change;
    return `| ${cell(l.holder)} | ${n} | ${l.percent} | ${last} |`;
  });
  return [head, rule, ...rows].join("\n");
}

function render(r: StepResult): string {
  const out = [`## ${r.title}`];
  if (r.error) out.push(`Stopped here: ${r.error}`);
  else {
    out.push(table(r));
    for (const n of r.notes) out.push(`- ${n}`);
    const math = r.lines.flatMap((l) =>
      Object.entries(l.math)
        .filter(([k]) => k !== "percent")
        .map(([k, v]) => `- ${l.holder}, ${k}: ${v}`),
    );
    if (math.length) out.push("Math:", ...math);
  }
  return out.join("\n");
}

function renderSweep(s: NonNullable<ScenarioResult["sweep"]>): string {
  const last = (steps: StepResult[]) => steps.at(-1)!;
  const holders = [...new Set(s.results.flatMap((r) => last(r.steps).lines.map((l) => l.holder)))];
  const exit = s.results.some((r) => last(r.steps).step.kind === "exit");
  const head = `| ${s.field} | ${holders.map(cell).join(" | ")} |`;
  const rows = s.results.map((r, i) => {
    const l = last(r.steps);
    const cells = holders.map((h) => {
      const line = l.lines.find((x) => x.holder === h);
      if (!line) return "";
      return exit ? `${fmtInt(BigInt(line.proceeds ?? "0"))} (${line.percent}%)` : `${line.percent}%`;
    });
    return `| ${s.values[i]} | ${cells.join(" | ")} |`;
  });
  return [
    `## Side by side: ${s.field}`,
    `After the last step (${last(s.results[0]!.steps).title}), per value of ${s.field}:`,
    head,
    `|---|${holders.map(() => "---:").join("|")}|`,
    ...rows,
  ].join("\n");
}

const sources = (used: Benchmark[]) =>
  used.length
    ? [
        "## Sources",
        ...used.map(
          (b) =>
            `- ${b.label}: ${b.value}. ${b.source}, ${b.year}${b.unverified ? " (reported)" : ""}${b.url ? `, ${b.url}` : ""}`,
        ),
      ]
    : [];

/** Runs the scenario and renders one markdown table per step. `company` is the open vault's events, or null. */
export async function runScenarioTool(
  input: RunScenarioInput,
  company: VaultEvent[] | null,
  today: string,
): Promise<{ text: string; data: Record<string, unknown> }> {
  if (input.start === "company" && !company)
    return {
      text: "No company is open. Start with 'empty' and name the founders in the first step, or set up a cap table first.",
      data: { error: "no company" },
    };
  const steps: Step[] = [...(input.steps as Step[])];
  const used: Benchmark[] = [];
  if (input.default_path) {
    steps.push(...defaultPath(input.default_path));
    used.push(...BENCHMARKS.filter((b) => PATH_KEYS.includes(b.key)));
  }
  const result = await runScenario(
    { start: input.start === "company" ? company : null, steps, today },
    input.sweep,
  );
  const text = [
    ...result.steps.map(render),
    ...(result.sweep ? [renderSweep(result.sweep)] : []),
    ...sources(used),
    NOT_ADVICE,
  ].join("\n\n");
  const data = JSON.parse(JSON.stringify(result, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
  return { text, data: { ...data, note: NOT_ADVICE } };
}
