import fc from "fast-check";
import { expect, test } from "vitest";
import { checkInvariants } from "../src/invariants";
import { reduce } from "../src/reduce";
import { capTableRows, securityVested } from "../src/rows";
import type { VaultEvent } from "../src/types";
import { acmeEvents, ev } from "./helpers";

const acme = acmeEvents();
const defs = acme.filter((e) => e.kind === "ocf" && !e.type.startsWith("TX_")); // issuer, class 10M, people, terms, plan 1M
const safeTemplate = acme.find((e) => e.data.security_id === "SAFE-1")!.data;
const OPS = ["stock", "grant", "terminate", "exercise", "poolUp", "safe"] as const;
type Op = { op: (typeof OPS)[number]; pct: number; gap: number };
// Clock starts the day after the acme plan's board approval (2025-09-30), so grants are possible from op 1.
// (fast-check favours short arrays and small gaps; an earlier start meant almost no run ever reached a grant.)
const iso = (day: number) => new Date(Date.UTC(2025, 9, 1 + day)).toISOString().slice(0, 10);

/** Turns random intents into a VALID event sequence (quantities clamped to what the state allows). */
function build(ops: Op[]): VaultEvent[] {
  const events = [...defs];
  let day = 0;
  let k = 0;
  for (const { op, pct, gap } of ops) {
    day += gap;
    const date = iso(day);
    const s = reduce(events, date);
    const p = BigInt(pct);
    const id = `p${k++}`;
    const holder = ["sh_tim", "sh_steve", "sh_woz", "sh_bill"][pct % 4]!;
    const opts = [...s.securities.values()].filter((x) => x.kind === "equity" && x.quantity > 0n);
    const pick = opts[pct % Math.max(opts.length, 1)];
    if (op === "stock") {
      const issued = [...s.securities.values()]
        .filter((x) => x.kind === "stock")
        .reduce((a, x) => a + x.quantity, 0n);
      const q = ((10000000n - issued) * p) / 100n;
      if (q > 0n)
        events.push(
          ev("TX_STOCK_ISSUANCE", {
            id,
            date,
            security_id: `S-${id}`,
            stakeholder_id: holder,
            stock_class_id: "sc_common",
            quantity: `${q}`,
            share_price: { amount: "0.01", currency: "USD" },
            stock_legend_ids: [],
          }),
        );
    } else if (op === "grant") {
      const avail = capTableRows(s).find((r) => r.group === 2)?.shares ?? 0n;
      const q = (avail * p) / 100n;
      if (q > 0n)
        events.push(
          ev("TX_EQUITY_COMPENSATION_ISSUANCE", {
            id,
            date,
            security_id: `O-${id}`,
            stakeholder_id: holder,
            stock_plan_id: "plan_2025",
            stock_class_id: "sc_common",
            compensation_type: "OPTION_ISO",
            exercise_price: { amount: "0.1", currency: "USD" },
            quantity: `${q}`,
            expiration_date: "2040-01-01",
            termination_exercise_windows: [],
            vesting_terms_id: "vt_4y1c_monthly",
          }),
          ev("TX_VESTING_START", {
            id: `${id}v`,
            date,
            security_id: `O-${id}`,
            vesting_condition_id: "vesting-start",
          }),
        );
    } else if (op === "terminate" && pick) {
      const unvested = securityVested(pick, s, date).unvested ?? 0n;
      if (unvested > 0n)
        events.push(
          ev("TX_EQUITY_COMPENSATION_CANCELLATION", {
            id,
            date,
            security_id: pick.id,
            quantity: `${unvested}`,
            reason_text: "left",
          }),
          ev("TX_STOCK_PLAN_RETURN_TO_POOL", {
            id: `${id}r`,
            date,
            stock_plan_id: "plan_2025",
            quantity: `${unvested}`,
          }),
        );
    } else if (op === "exercise" && pick) {
      const q = ((securityVested(pick, s, date).vested ?? 0n) * p) / 100n;
      if (q > 0n)
        events.push(
          ev("TX_EQUITY_COMPENSATION_EXERCISE", { id, date, security_id: pick.id, quantity: `${q}` }),
        );
    } else if (op === "poolUp") {
      const plan = s.plans.get("plan_2025");
      if (plan)
        events.push(
          ev("TX_STOCK_PLAN_POOL_ADJUSTMENT", {
            id,
            date,
            stock_plan_id: "plan_2025",
            shares_reserved: `${plan.reserved + p * 1000n}`,
          }),
        );
    } else if (op === "safe") {
      events.push(
        ev("TX_CONVERTIBLE_ISSUANCE", {
          ...safeTemplate,
          id,
          date,
          security_id: `F-${id}`,
          investment_amount: { amount: `${p * 10000n}`, currency: "USD" },
        }),
      );
    }
  }
  return events;
}

test("invariants hold for 10k random valid event sequences", () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.record({
          op: fc.constantFrom(...OPS),
          pct: fc.integer({ min: 1, max: 100 }),
          gap: fc.integer({ min: 0, max: 200 }),
        }),
        { maxLength: 20 },
      ),
      fc.integer({ min: -30, max: 6000 }), // as-of a little before the first op, through ~16 years
      (ops, asOfDay) => {
        const events = build(ops);
        for (const asOf of [iso(asOfDay), "9999-12-31"])
          expect(checkInvariants(reduce(events, asOf))).toEqual([]);
      },
    ),
    { numRuns: 10_000 },
  );
}, 300_000);
