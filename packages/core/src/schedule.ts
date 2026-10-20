// Vesting over time for the Person chart and "Next vest" lines. Built on vestedAt, so the numbers match the cap table.
import { addMonths } from "./dates";
import { toInt } from "./num";
import { securityVested } from "./rows";
import type { Security, State } from "./types";
import { vestedAt } from "./vesting";

export interface SchedulePoint {
  date: string;
  cumulative: bigint;
}

const START_DAY = "VESTING_START_DAY_OR_LAST_DAY_OF_MONTH";
const MAX_MONTHS = 600; // ponytail: schedules longer than 50 years are cut off

/** Monthly cumulative vesting of the original grant, frozen at a termination/repurchase date. Null when unknown/none. */
export function vestingSchedule(x: Security, s: State): SchedulePoint[] | null {
  const stop = (d: string) => (x.stoppedAt && x.stoppedAt < d ? x.stoppedAt : d);
  if (x.vestings?.length) {
    let sum = 0n;
    return [...x.vestings]
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .map((v) => {
        if (!x.stoppedAt || v.date <= x.stoppedAt) sum += toInt(v.amount);
        return { date: v.date, cumulative: sum };
      });
  }
  const terms = x.vestingTermsId ? s.vestingTerms.get(x.vestingTermsId) : undefined;
  if (!terms || !x.vestingStart) return null;
  const start = x.vestingStart.date;
  const points: SchedulePoint[] = [];
  for (let m = 1; m <= MAX_MONTHS; m++) {
    const date = addMonths(start, m, START_DAY);
    const r = vestedAt(x.originalQuantity, terms, start, stop(date));
    if (r.vested === null) return null;
    points.push({ date, cumulative: r.vested });
    if (vestedAt(x.originalQuantity, terms, start, date).vested === x.originalQuantity) break;
  }
  return points;
}

const vestedRaw = (x: Security, s: State, at: string): bigint => {
  const pts = vestingSchedule(x, s) ?? [];
  return pts.filter((p) => p.date <= at).at(-1)?.cumulative ?? 0n;
};

/** The next date after `at` on which more vests, and how much. Null when nothing more will vest. */
export function nextVest(x: Security, s: State, at: string): { date: string; quantity: bigint } | null {
  const pts = vestingSchedule(x, s);
  if (!pts) return null;
  const now = vestedRaw(x, s, at);
  const next = pts.find((p) => p.date > at && p.cumulative > now);
  return next ? { date: next.date, quantity: next.cumulative - now } : null;
}

/** The date the full original grant has vested, or null when it never will (unknown, or stopped early). */
export function fullyVestedOn(x: Security, s: State): string | null {
  const pts = vestingSchedule(x, s);
  return pts?.find((p) => p.cumulative === x.originalQuantity)?.date ?? null;
}

/** The 409A share price in effect on state.asOf (the latest one), or null when none is recorded. */
export function fmv(s: State): { amount: string; currency: string; date: string } | null {
  const v = s.valuations
    .filter((d) => d.valuation_type === "409A")
    .sort((a, b) => (a.effective_date < b.effective_date ? -1 : 1))
    .at(-1);
  return v ? { ...v.price_per_share, date: v.effective_date } : null;
}

export interface PoolOverview {
  name: string;
  approved: string;
  reserved: bigint;
  allocated: bigint; // granted, less what came back
  vested: bigint; // of the grants, exercised included
  available: bigint;
  returned: bigint;
  people: number;
}

/** The equity incentive pool, all plans added up (the Vesting screen). Null when there is no plan. */
export function poolOverview(s: State): PoolOverview | null {
  const plans = [...s.plans.values()];
  if (!plans.length) return null;
  const grants = [...s.securities.values()].filter((x) => x.planId && s.plans.has(x.planId));
  const sum = (xs: bigint[]) => xs.reduce((a, b) => a + b, 0n);
  const reserved = sum(plans.map((p) => p.reserved));
  const returned = sum(plans.map((p) => p.returned));
  const allocated = sum(grants.map((x) => x.originalQuantity)) - returned;
  return {
    name: plans[0]!.data.plan_name,
    approved: plans[0]!.data.board_approval_date,
    reserved,
    allocated,
    vested: sum(grants.map((x) => (securityVested(x, s, s.asOf).vested ?? 0n) + x.exercised)),
    available: reserved - allocated,
    returned,
    people: new Set(grants.filter((x) => x.quantity > 0n).map((x) => x.stakeholderId)).size,
  };
}
