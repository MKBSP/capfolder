// Regression tests for the final whole-branch review findings.
import canonicalize from "canonicalize";
import { describe, expect, test } from "vitest";
import { type AppendCtx, appendEvent } from "../src/append";
import { hashEvent, verifyChain } from "../src/chain";
import { checkInvariants } from "../src/invariants";
import { reduce } from "../src/reduce";
import { capTableRows } from "../src/rows";
import type { VaultEvent } from "../src/types";
import { acmeEvents, ev, readFix } from "./helpers";

const base = acmeEvents();
const log = readFix("events.jsonl");
let n = 0;
const ctx: AppendCtx = {
  now: () => new Date("2026-10-09T12:00:00Z"),
  newId: () => `evt_H${n++}`,
  deviceId: "dev_test",
};
const stockTx = (over: Record<string, unknown>) => ({
  object_type: "TX_STOCK_ISSUANCE",
  id: "n1",
  date: "2026-01-01",
  security_id: "CS-9",
  custom_id: "CS-9",
  stakeholder_id: "sh_steve",
  stock_class_id: "sc_common",
  quantity: "100",
  share_price: { amount: "1", currency: "USD" },
  stock_legend_ids: [],
  security_law_exemptions: [],
  ...over,
});
const grantTx = (over: Record<string, unknown>) => ({
  object_type: "TX_EQUITY_COMPENSATION_ISSUANCE",
  id: "g1",
  date: "2026-04-01",
  security_id: "OPT-9",
  custom_id: "OPT-9",
  stakeholder_id: "sh_woz",
  stock_plan_id: "plan_2025",
  stock_class_id: "sc_common",
  compensation_type: "OPTION_ISO",
  exercise_price: { amount: "0.1", currency: "USD" },
  quantity: "2000000",
  expiration_date: "2036-01-01",
  termination_exercise_windows: [],
  security_law_exemptions: [],
  ...over,
});
const poolTx = (id: string, date: string, reserved: string) => ({
  object_type: "TX_STOCK_PLAN_POOL_ADJUSTMENT",
  id,
  date,
  stock_plan_id: "plan_2025",
  shares_reserved: reserved,
});

/** Writes a line directly (bypassing appendEvent), as an outside tool or an old import would. */
async function rawAppend(text: string, e: Omit<VaultEvent, "seq" | "prev" | "hash">): Promise<string> {
  const last = JSON.parse(text.trim().split("\n").at(-1)!);
  const raw = { ...e, seq: last.seq + 1, prev: last.hash };
  return `${text}${canonicalize({ ...raw, hash: await hashEvent(raw) })}\n`;
}
const reduceAt = (extra: VaultEvent[], asOf = "2026-10-07") => reduce([...base, ...extra], asOf);

describe("critical: duplicate security ids", () => {
  test("re-issuing an existing security_id is a violation and keeps the original holding", async () => {
    const r = await appendEvent(
      log,
      { kind: "ocf", type: "TX_STOCK_ISSUANCE", data: stockTx({ security_id: "CS-1" }) },
      ctx,
    );
    expect(r).toEqual({ ok: false, errors: ["TX_STOCK_ISSUANCE n1: security CS-1 already exists"] });
    const s = reduceAt([ev("TX_STOCK_ISSUANCE", stockTx({ security_id: "CS-1" }))]);
    expect(capTableRows(s).find((x) => x.stakeholder === "Tim Apple")!.shares).toBe(4000000n);
  });
});

describe("critical: schema-valid numbers never crash the reducer", () => {
  test("fractional authorized / reserved become violations", () => {
    const s = reduce(
      base.map((e) =>
        e.type === "STOCK_CLASS"
          ? { ...e, data: { ...e.data, initial_shares_authorized: "1.5" } }
          : e.type === "STOCK_PLAN"
            ? { ...e, data: { ...e.data, initial_shares_reserved: "2.5" } }
            : e,
      ),
      "2026-10-07",
    );
    expect(s.violations).toContain('STOCK_CLASS sc_common: Expected a whole number, got "1.5"');
    expect(s.violations).toContain('STOCK_PLAN plan_2025: Expected a whole number, got "2.5"');
  });
  test("a zero SAFE cap is a violation, not a division by zero", () => {
    const zero = structuredClone(base.find((e) => e.data.security_id === "SAFE-1")!);
    zero.data.conversion_triggers[0].conversion_right.conversion_mechanism.conversion_valuation_cap.amount =
      "0";
    const s = reduce(
      base.map((e) => (e.id === zero.id ? zero : e)),
      "2026-10-07",
    );
    expect(s.violations).toContain(
      "TX_CONVERTIBLE_ISSUANCE tx_safe_yc: valuation cap must be greater than 0",
    );
    expect(capTableRows(s).find((x) => x.stakeholder === "Y Combinator")!.asConverted).toBe("");
  });
  test("a zero portion denominator is 'vesting unknown'", () => {
    const bad = structuredClone(base.find((e) => e.type === "VESTING_TERMS")!);
    bad.data.vesting_conditions[1].portion.denominator = "0";
    const s = reduce(
      base.map((e) => (e.id === bad.id ? bad : e)),
      "2026-10-07",
    );
    expect(capTableRows(s).find((x) => x.stakeholder === "Tim Apple")!.vested).toBeNull();
  });
  test("a malformed transaction is a violation, not an exception", () => {
    const s = reduceAt([
      ev("TX_CONVERTIBLE_ISSUANCE", { id: "m1", date: "2026-01-01", security_id: "SAFE-9" }),
    ]);
    expect(s.violations[0]).toMatch(/^TX_CONVERTIBLE_ISSUANCE m1: /);
  });
});

describe("important: negative money", () => {
  test("negative transfer amount", () => {
    const s = reduceAt([
      ev("TX_CONVERTIBLE_TRANSFER", {
        id: "t1",
        date: "2026-01-01",
        security_id: "SAFE-1",
        amount: { amount: "-100000", currency: "USD" },
      }),
    ]);
    expect(s.violations).toEqual(["TX_CONVERTIBLE_TRANSFER t1: amount must be greater than 0"]);
    expect(capTableRows(s).find((x) => x.stakeholder === "Y Combinator")!.safeAmount).toBe("500000");
  });
  test("negative investment amount", () => {
    const safe = base.find((e) => e.data.security_id === "SAFE-1")!.data;
    const s = reduceAt([
      ev("TX_CONVERTIBLE_ISSUANCE", {
        ...safe,
        id: "m2",
        security_id: "SAFE-8",
        investment_amount: { amount: "-500", currency: "USD" },
      }),
    ]);
    expect(s.violations).toEqual(["TX_CONVERTIBLE_ISSUANCE m2: investment amount must be greater than 0"]);
    expect(s.securities.has("SAFE-8")).toBe(false);
  });
  test("negative explicit vesting amounts", () => {
    const s = reduceAt([
      ev("TX_STOCK_ISSUANCE", stockTx({ vestings: [{ date: "2026-02-01", amount: "-5" }] })),
    ]);
    expect(s.violations).toEqual(["TX_STOCK_ISSUANCE n1: vesting amount must be 0 or more"]);
  });
});

describe("important: invariant 3 (vested ≤ granted) can fire", () => {
  test("explicit vestings larger than the grant", () => {
    const s = reduceAt([
      ev("TX_STOCK_ISSUANCE", stockTx({ vestings: [{ date: "2026-02-01", amount: "500" }] })),
    ]);
    expect(checkInvariants(s)).toContain(
      "TX_STOCK_ISSUANCE n1: vestings add up to 500, more than the 100 granted",
    );
  });
});

describe("important: appendEvent", () => {
  test("a step that improves an existing violation is allowed", async () => {
    const broken = await rawAppend(log, {
      id: "evt_RAW",
      ts: "2026-10-08T00:00:00Z",
      kind: "ocf",
      type: "TX_STOCK_PLAN_POOL_ADJUSTMENT",
      data: poolTx("a0", "2026-10-01", "50000"),
      meta: { source: "test" },
    });
    const chain = await verifyChain(broken);
    if (!chain.ok) throw new Error("chain");
    expect(checkInvariants(reduce(chain.events, "9999-12-31"))[0]).toMatch(/would go negative \(-30,000/);
    const fix = await appendEvent(
      broken,
      { kind: "ocf", type: "TX_STOCK_PLAN_POOL_ADJUSTMENT", data: poolTx("a1", "2026-10-02", "60000") },
      ctx,
    );
    expect(fix.ok).toBe(true);
  });
  test("a back-dated event that breaks an earlier as-of is rejected", async () => {
    const up = await appendEvent(
      log,
      { kind: "ocf", type: "TX_STOCK_PLAN_POOL_ADJUSTMENT", data: poolTx("a1", "2026-06-01", "3000000") },
      ctx,
    );
    if (!up.ok) throw new Error(up.errors.join("; "));
    const r = await appendEvent(
      `${log}${up.line}\n`,
      { kind: "ocf", type: "TX_EQUITY_COMPENSATION_ISSUANCE", data: grantTx({}) },
      ctx,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/would go negative/);
  });
  test("draft type must match the payload's object_type", async () => {
    const r = await appendEvent(
      log,
      {
        kind: "ocf",
        type: "STOCK_CLASS",
        data: {
          object_type: "STAKEHOLDER",
          id: "sh_x",
          name: { legal_name: "X" },
          stakeholder_type: "INDIVIDUAL",
        },
      },
      ctx,
    );
    expect(r).toEqual({
      ok: false,
      errors: ["Event type STOCK_CLASS doesn't match object_type STAKEHOLDER"],
    });
  });
  test("issuances must point at existing stakeholders, classes and plans", async () => {
    const r = await appendEvent(
      log,
      { kind: "ocf", type: "TX_STOCK_ISSUANCE", data: stockTx({ stakeholder_id: "sh_ghost" }) },
      ctx,
    );
    expect(r).toEqual({ ok: false, errors: ["TX_STOCK_ISSUANCE n1 refers to unknown stakeholder sh_ghost"] });
    const s = reduceAt([
      ev("TX_EQUITY_COMPENSATION_ISSUANCE", grantTx({ stock_plan_id: "plan_ghost", quantity: "10" })),
    ]);
    expect(s.violations).toEqual(["TX_EQUITY_COMPENSATION_ISSUANCE g1 refers to unknown plan plan_ghost"]);
  });
});

describe("verifyChain on non-object lines", () => {
  test.each(["null", "42", "[]", '"x"'])("line %s is reported, not thrown", async (line) => {
    expect(await verifyChain(`${log}${line}\n`)).toEqual({
      ok: false,
      line: 31,
      reason: "not an event object",
    });
  });
});
