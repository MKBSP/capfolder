// F-39 "Try a scenario": the screen's pure helpers. The math is core's runScenario; nothing here adds up shares.
import {
  BENCHMARKS,
  defaultPath,
  type ExitStep,
  type FoundersStep,
  holdingsOf,
  type PoolStep,
  type RoundStep,
  reduce,
  runScenario,
  type SafeStep,
  type ScenarioResult,
  type Step,
  type StepResult,
  tableOf,
  type VaultEvent,
} from "@capfolder/core";
import { useEffect, useState } from "react";
import { num } from "./fmt";

/** What "Save as my cap table" hands to Create company and the wizard: the real part only, never a round. */
export type ScenarioPrefill = {
  founders: { name: string; shares: string }[];
  pool?: { shares: string };
  safes: { investor: string; amount: string; cap: string; discount: string }[];
};

export const STARTER_STEPS: Step[] = [
  {
    kind: "founders",
    founders: [
      { name: "", shares: "" },
      { name: "", shares: "" },
    ],
  },
];

const whole = (s: string) => /^\d+$/.test(num(s)) && /[1-9]/.test(num(s));

/** The founders step as the engine wants it, or null while the founder is still typing. */
export function foundersReady(step: Step | undefined): step is FoundersStep {
  return (
    !!step &&
    step.kind === "founders" &&
    step.founders.length > 0 &&
    step.founders.every((f) => f.name.trim() && whole(f.shares))
  );
}

/** Steps with every typed number read in the founder's decimal mark (num), so the engine sees plain digits. */
export function engineSteps(steps: Step[]): Step[] {
  const n = (s: string | undefined) => (s === undefined || s === "" ? undefined : num(s) || s);
  return steps.map((st): Step => {
    switch (st.kind) {
      case "founders":
        return {
          ...st,
          founders: st.founders.map((f) => ({ ...f, name: f.name.trim(), shares: n(f.shares) ?? "" })),
        };
      case "pool":
        return {
          kind: "pool",
          ...(st.shares ? { shares: n(st.shares) } : {}),
          ...(st.percent ? { percent: n(st.percent) } : {}),
        };
      case "safe":
        return {
          ...st,
          investor: st.investor.trim(),
          amount: n(st.amount) ?? "",
          cap: n(st.cap),
          discount: st.discount || undefined,
        };
      case "round":
        return {
          kind: "round",
          name: st.name.trim() || "Round",
          ...(st.sells ? { sells: n(st.sells) } : {}),
          ...(st.newMoney ? { newMoney: n(st.newMoney) } : {}),
          ...(st.preMoney ? { preMoney: n(st.preMoney) } : {}),
          ...(st.postMoney ? { postMoney: n(st.postMoney) } : {}),
          ...(st.poolTarget ? { poolTarget: n(st.poolTarget) } : {}),
        };
      case "exit":
        return { kind: "exit", value: n(st.value) ?? "" };
      default:
        return st;
    }
  });
}

/** Runs the engine whenever the steps change; a later run always wins over an earlier, slower one (as Wizard.tsx). */
export function useScenario(start: VaultEvent[] | null, steps: Step[], today: string, ready: boolean) {
  const [result, setResult] = useState<ScenarioResult | null>(null);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    if (!ready) {
      setResult(null);
      return;
    }
    let current = true;
    setRunning(true);
    runScenario({ start, steps: engineSteps(steps), today }).then((r) => {
      if (!current) return;
      setResult(r);
      setRunning(false);
    });
    return () => {
      current = false;
    };
  }, [start, steps, today, ready]);
  return { result, running };
}

/** The open company's table as of today, shown as the first chip when a scenario builds on a company. */
export function todayResult(events: VaultEvent[], today: string): StepResult {
  return {
    step: { kind: "founders", founders: [] }, // a placeholder: "Today" is not a step the founder edits
    title: "Today",
    lines: tableOf(holdingsOf(reduce(events, today)), null, {}),
    notes: [],
  };
}

export const setStep = (steps: Step[], i: number, step: Step): Step[] =>
  steps.map((s, j) => (j === i ? step : s));
export const removeStep = (steps: Step[], i: number): Step[] => steps.filter((_, j) => j !== i);

const bench = (key: string) => BENCHMARKS.find((b) => b.key === key)!;

/** A new, empty step of that kind; a round starts as the typical seed (from the benchmarks, with its source). */
export function addStep(steps: Step[], kind: Step["kind"]): Step[] {
  const step: Step =
    kind === "pool"
      ? ({ kind: "pool", percent: "" } satisfies PoolStep)
      : kind === "safe"
        ? ({ kind: "safe", investor: "", amount: "", cap: "" } satisfies SafeStep)
        : kind === "round"
          ? ({
              kind: "round",
              name: "Seed",
              sells: bench("seed-dilution").value,
              poolTarget: bench("pool-seed").value,
            } satisfies RoundStep)
          : kind === "exit"
            ? ({ kind: "exit", value: "" } satisfies ExitStep)
            : STARTER_STEPS[0]!;
  const at = steps.at(-1)?.kind === "exit" && kind !== "exit" ? steps.length - 1 : steps.length;
  return [...steps.slice(0, at), step, ...steps.slice(at)];
}

/** Replace any rounds with the typical path (Carta medians), before a trailing exit. */
export function typicalRounds(steps: Step[]): Step[] {
  const kept = steps.filter((s) => s.kind !== "round");
  const at = kept.at(-1)?.kind === "exit" ? kept.length - 1 : kept.length;
  return [...kept.slice(0, at), ...defaultPath({ from: "preseed", through: "series-b" }), ...kept.slice(at)];
}

/** The typical rounds, with their sources, for the screen's copy. */
export const TYPICAL = ["seed-dilution", "series-a-dilution", "series-b-dilution", "pool-seed"].map(bench);

/** The real part of the scenario for Create company and the wizard. `poolShares` comes from the engine's pool table. */
export function prefillOf(steps: Step[], poolShares: bigint | null): ScenarioPrefill {
  const f = steps.find((s) => s.kind === "founders") as FoundersStep | undefined;
  const safes = steps.filter((s): s is SafeStep => s.kind === "safe");
  const discountPct = (d?: string) => (d ? String(Math.round(Number(d) * 10000) / 100) : "");
  return {
    founders: (f?.founders ?? []).map((x) => ({ name: x.name.trim(), shares: num(x.shares) })),
    ...(poolShares && poolShares > 0n ? { pool: { shares: poolShares.toString() } } : {}),
    safes: safes.map((s) => ({
      investor: s.investor.trim(),
      amount: num(s.amount),
      cap: num(s.cap ?? ""),
      discount: discountPct(s.discount),
    })),
  };
}
