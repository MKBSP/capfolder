// Scenarios (docs/superpowers/specs/2026-11-06-scenarios-design.md): a starting point plus ordered steps.
// Recordable steps become ordinary events in memory; projection steps are pure math and are never written.
import type { VaultEvent } from "../types";

export type Vesting = { months: number; cliffMonths: number };
export type FoundersStep = {
  kind: "founders";
  date?: string;
  authorized?: string;
  founders: readonly { name: string; shares: string; vesting?: Vesting }[];
};
/** One of `shares` or `percent`; percent = the pool's share of fully diluted after this step. */
export type PoolStep = { kind: "pool"; date?: string; shares?: string; percent?: string };
export type SafeStep = {
  kind: "safe";
  date?: string;
  investor: string;
  amount: string;
  cap?: string;
  discount?: string; // a fraction, "0.2"
  mfn?: boolean;
};
export type GrantStep = {
  kind: "grant";
  date?: string;
  person: string;
  options: string;
  strike?: string;
  vesting?: Vesting;
};
/** Either new money plus a pre- or post-money valuation, or just `sells` (a percent of the post-money). */
export type RoundStep = {
  kind: "round";
  name: string;
  newMoney?: string;
  preMoney?: string;
  postMoney?: string;
  sells?: string; // percent, "20"
  poolTarget?: string; // percent of post-money fully diluted, topped up in the pre-money
};
export type ExitStep = { kind: "exit"; value: string };
export type RecordableStep = FoundersStep | PoolStep | SafeStep | GrantStep;
export type ProjectionStep = RoundStep | ExitStep;
export type Step = RecordableStep | ProjectionStep;

export type Holding = {
  holder: string;
  kind: "shares" | "options" | "pool" | "safe";
  shares: bigint;
  amount?: string;
  cap?: string;
  discount?: string;
  mfn?: boolean;
  timing?: string; // convertibles: OCF conversion_timing (POST_MONEY, PRE_MONEY)
  type?: string; // convertibles: SAFE, NOTE, …
};
export type Line = {
  holder: string;
  kind: Holding["kind"];
  shares: bigint | null;
  percent: string;
  change: string;
  proceeds?: string;
  math: Record<string, string>;
};
export type StepResult = { step: Step; title: string; lines: Line[]; notes: string[]; error?: string };
/** `start`: null for no company, or the open company's events (the log appendEvents builds on). */
export type Scenario = { start: VaultEvent[] | null; steps: Step[]; today: string };
export type Sweep = { step: number; field: string; values: string[] };
export type ScenarioResult = {
  steps: StepResult[];
  sweep?: { field: string; values: string[]; results: { steps: StepResult[] }[] };
};
