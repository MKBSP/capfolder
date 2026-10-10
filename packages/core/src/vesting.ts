import { addMonths } from "./dates";
import { decFraction, fmtInt, toInt } from "./num";
import type { Data } from "./types";

export interface VestingResult {
  vested: bigint | null;
  math: string;
  unknownReason?: string;
}

interface Step {
  offsetMonths: number;
  dayRule: string;
  portion?: [bigint, bigint];
  quantity?: bigint;
}

const SUPPORTED_ALLOCATION = new Set(["CUMULATIVE_ROUND_DOWN", "CUMULATIVE_ROUNDING"]);
const START_DAY = "VESTING_START_DAY_OR_LAST_DAY_OF_MONTH";

export const startConditionId = (terms: Data): string | undefined =>
  (terms.vesting_conditions ?? []).find((c: Data) => c.trigger?.type === "VESTING_START_DATE")?.id;

function step(c: Data, offsetMonths: number, dayRule: string): Step {
  return c.portion
    ? { offsetMonths, dayRule, portion: decFraction(c.portion.numerator, c.portion.denominator) }
    : { offsetMonths, dayRule, quantity: toInt(c.quantity ?? "0") };
}

/** The supported subset: one start condition, then a linear chain of month-based relative schedules. */
function scheduleSteps(terms: Data): Step[] | string {
  if (!SUPPORTED_ALLOCATION.has(terms.allocation_type))
    return `allocation ${terms.allocation_type} is not supported`;
  const conds: Data[] = terms.vesting_conditions ?? [];
  const byId = new Map(conds.map((c) => [c.id, c]));
  const starts = conds.filter((c) => c.trigger?.type === "VESTING_START_DATE");
  if (starts.length !== 1) return "needs exactly one VESTING_START_DATE condition";
  let c = starts[0]!;
  const steps = [step(c, 0, START_DAY)];
  const seen = new Set<string>([c.id]);
  let offset = 0;
  for (;;) {
    const next: string[] = c.next_condition_ids ?? [];
    if (next.length === 0) return steps;
    if (next.length > 1) return "branching vesting conditions are not supported";
    const n = byId.get(next[0]!);
    if (!n || seen.has(n.id)) return "broken vesting condition chain";
    const t = n.trigger;
    if (
      t?.type !== "VESTING_SCHEDULE_RELATIVE" ||
      t.period?.type !== "MONTHS" ||
      t.relative_to_condition_id !== c.id
    )
      return `condition ${n.id}: only month-based relative schedules are supported`;
    if (n.portion?.remainder) return "remainder portions are not supported";
    for (let j = 1; j <= t.period.occurrences; j++)
      steps.push(step(n, offset + t.period.length * j, t.period.day_of_month));
    offset += t.period.length * t.period.occurrences;
    seen.add(n.id);
    c = n;
  }
}

/** Vested quantity of `total` at date `at` for OCF vesting terms starting on `start`. */
export function vestedAt(total: bigint, terms: Data, start: string, at: string): VestingResult {
  const steps = scheduleSteps(terms);
  if (typeof steps === "string")
    return { vested: null, math: `vesting unknown: ${steps}`, unknownReason: steps };
  let num = 0n;
  let den = 1n;
  let qty = 0n;
  for (const s of steps) {
    if (addMonths(start, s.offsetMonths, s.dayRule) > at) continue;
    if (s.portion) {
      const [n, d] = s.portion;
      if (num === 0n) [num, den] = [n, d];
      else if (d === den) num += n;
      else [num, den] = [num * d + n * den, den * d];
    } else qty += s.quantity!;
  }
  const round = terms.allocation_type === "CUMULATIVE_ROUNDING";
  let vested = (round ? 2n * total * num + den : total * num) / (round ? 2n * den : den) + qty;
  if (vested > total) vested = total;
  const how = `${round ? "round" : "floor"}(${fmtInt(total)} × ${num}/${den})${qty ? ` + ${fmtInt(qty)}` : ""}`;
  return { vested, math: `${fmtInt(vested)} = ${how}, as of ${at}` };
}
