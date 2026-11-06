// runScenario: walk the steps, recordable ones through the real engine, projections through pure math.
import { reduce } from "../reduce";
import { applyExit } from "./exit";
import { holdingsOf, tableOf } from "./holdings";
import { applyRound } from "./round";
import { stateFrom } from "./start";
import type {
  Holding,
  Line,
  RecordableStep,
  Scenario,
  ScenarioResult,
  Step,
  StepResult,
  Sweep,
} from "./types";

/** "$200M", "$1.5M", "$500K", "$950". */
export function shortMoney(value: string): string {
  const n = Number(value);
  const f = (x: number) => String(Math.round(x * 10) / 10);
  if (n >= 1e9) return `$${f(n / 1e9)}B`;
  if (n >= 1e6) return `$${f(n / 1e6)}M`;
  if (n >= 1e3) return `$${f(n / 1e3)}K`;
  return `$${f(n)}`;
}

export function titleOf(step: Step): string {
  switch (step.kind) {
    case "founders":
      return "Founders";
    case "pool":
      return "Option pool";
    case "safe":
      return `SAFE: ${step.investor}`;
    case "grant":
      return `Grant: ${step.person}`;
    case "round":
      return step.name;
    case "exit":
      return `Exit at ${shortMoney(step.value)}`;
  }
}

const isRecordable = (s: Step): s is RecordableStep => s.kind !== "round" && s.kind !== "exit";

async function walk(s: Scenario): Promise<StepResult[]> {
  const out: StepResult[] = [];
  const recorded: RecordableStep[] = [];
  let holdings: Holding[] = s.start ? holdingsOf(reduce(s.start, s.today)) : [];
  let previous: Line[] | null = s.start ? tableOf(holdings, null, {}) : null;
  let projected = false;
  for (const step of s.steps) {
    const title = titleOf(step);
    const fail = (error: string) => out.push({ step, title, lines: previous ?? [], notes: [], error });
    if (out.at(-1)?.step.kind === "exit") {
      fail("Nothing comes after an exit. Put the exit last.");
      break;
    }
    if (isRecordable(step)) {
      if (projected) {
        fail(`Record the round first: ${title} would be saved, but it comes after a projected round.`);
        break;
      }
      recorded.push(step);
      const r = await stateFrom(s.start, recorded, s.today);
      if ("error" in r) {
        fail(r.error);
        break;
      }
      holdings = holdingsOf(r.state);
      const lines = tableOf(holdings, previous, {});
      out.push({ step, title, lines, notes: [] });
      previous = lines;
      continue;
    }
    projected = true;
    if (step.kind === "round") {
      const r = applyRound(holdings, step);
      if ("error" in r) {
        fail(r.error);
        break;
      }
      holdings = r.holdings;
      const lines = tableOf(holdings, previous, r.math);
      out.push({ step, title, lines, notes: r.notes });
      previous = lines;
    } else {
      const r = applyExit(holdings, step.value);
      if ("error" in r) {
        fail(r.error);
        break;
      }
      out.push({ step, title, lines: r.lines, notes: r.notes });
    }
  }
  return out;
}

/**
 * One table per step. A `sweep` re-runs the scenario with `steps[sweep.step][sweep.field]` set to each value;
 * the main `steps` are the run with the original value. Nothing is written anywhere.
 */
export async function runScenario(s: Scenario, sweep?: Sweep): Promise<ScenarioResult> {
  const steps = await walk(s);
  if (!sweep) return { steps };
  const results: { steps: StepResult[] }[] = [];
  for (const value of sweep.values) {
    const copy = s.steps.map((st, i) => (i === sweep.step ? { ...st, [sweep.field]: value } : st)) as Step[];
    results.push({ steps: await walk({ ...s, steps: copy }) });
  }
  return { steps, sweep: { field: sweep.field, values: sweep.values, results } };
}
