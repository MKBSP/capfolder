import { describe, expect, test } from "vitest";
import * as b from "../src/builders";
import { validateOcf } from "../src/ocf/validate";
import { reduce } from "../src/reduce";
import { capTableRows } from "../src/rows";
import type { EventDraft, VaultEvent } from "../src/types";
import { acmeEvents } from "./helpers";

const acme = acmeEvents();
const state = (asOf = "2026-10-07", extra: VaultEvent[] = []) => reduce([...acme, ...extra], asOf);
let n = 0;
/** Drafts → unhashed events, so they can be replayed without the chain. */
const asEvents = (drafts: EventDraft[]): VaultEvent[] =>
  drafts.map((d) => ({
    seq: 0,
    id: `evt_b${String(n++).padStart(6, "0")}`,
    ts: "2026-10-09T00:00:00Z",
    kind: d.kind,
    type: d.type,
    data: d.data,
    meta: { source: "test" },
    prev: "",
    hash: "",
  }));
const ocfErrors = (drafts: EventDraft[]) =>
  drafts.filter((d) => d.kind === "ocf").flatMap((d) => validateOcf(d.data).map((e) => `${d.type}: ${e}`));

describe("every builder produces schema-valid OCF", () => {
  const s = state();
  const all: EventDraft[] = [
    b.issuer({ name: "Test Co", formationDate: "2026-01-02" }),
    b.stockClass({ name: "Common", authorized: "10000000", parValue: "0.00001" }),
    b.stakeholder({ name: "Pat", email: "pat@x.com", type: "INDIVIDUAL" }),
    b.stakeholder({ name: "Fund Y", type: "INSTITUTION" }),
    b.vestingTerms4y1y(),
    ...b.stockIssuance({
      state: s,
      stakeholderId: "sh_ana",
      classId: "sc_common",
      quantity: "1000",
      price: "0.00001",
      date: "2026-10-01",
      vestingTermsId: "vt_4y1c_monthly",
      vestingStart: "2026-10-01",
    }),
    b.stockPlan({
      name: "2026 Plan",
      reserved: "500000",
      boardApprovalDate: "2026-01-02",
      classId: "sc_common",
    }),
    b.poolAdjustment({ planId: "plan_2025", newTotal: "1500000", date: "2026-10-01" }),
    ...b.optionGrant({
      state: s,
      stakeholderId: "sh_joao",
      planId: "plan_2025",
      classId: "sc_common",
      quantity: "10000",
      strike: "0.12",
      date: "2026-10-01",
      vestingTermsId: "vt_4y1c_monthly",
    }),
    b.safe({
      state: s,
      stakeholderId: "sh_fundx",
      amount: "200000",
      cap: "10000000",
      discount: "0.2",
      mfn: true,
      date: "2026-10-01",
    }),
    ...b.termination({ state: state("2026-11-07"), securityId: "OPT-1", date: "2026-11-07", reason: "left" }),
    ...b.exercise({ state: state("2026-11-01"), securityId: "OPT-1", quantity: "5000", date: "2026-11-01" }),
    ...b.repurchaseUnvested({ state: s, securityId: "CS-1", date: "2026-10-07" }),
    b.stakeholderUpdate({ previous: s.stakeholders.get("sh_ana")!, name: "Ana R. Ribeiro" }),
  ];
  test("no schema errors", () => expect(ocfErrors(all)).toEqual([]));
  test("draft type matches object_type", () =>
    expect(all.filter((d) => d.kind === "ocf" && d.type !== d.data.object_type)).toEqual([]));
});

describe("builders produce the right numbers", () => {
  test("nextSecurityId", () => {
    expect(b.nextSecurityId(state(), "CS")).toBe("CS-3");
    expect(b.nextSecurityId(state(), "OPT")).toBe("OPT-3");
    expect(b.nextSecurityId(state(), "SAFE")).toBe("SAFE-4");
  });
  test("a 10,000 grant takes the pool to 910,000", () => {
    const g = b.optionGrant({
      state: state(),
      stakeholderId: "sh_joao",
      planId: "plan_2025",
      classId: "sc_common",
      quantity: "10000",
      strike: "0.12",
      date: "2026-10-01",
      vestingTermsId: "vt_4y1c_monthly",
    });
    const pool = capTableRows(state("2026-10-07", asEvents(g))).find((r) => r.group === 2)!;
    expect(pool.shares).toBe(910000n);
  });
  test("termination of Lisa at month 13 cancels and returns 29,167", () => {
    const t = b.termination({
      state: state("2026-11-07"),
      securityId: "OPT-1",
      date: "2026-11-07",
      reason: "left",
    });
    expect(t.map((d) => [d.type, d.data.quantity])).toEqual([
      ["TX_EQUITY_COMPENSATION_CANCELLATION", "29167"],
      ["TX_STOCK_PLAN_RETURN_TO_POOL", "29167"],
    ]);
    const lisa = capTableRows(state("2027-10-07", asEvents(t))).find((r) => r.securityId === "OPT-1")!;
    expect([lisa.shares, lisa.vested, lisa.unvested]).toEqual([10833n, 10833n, 0n]);
  });
  test("termination with nothing unvested is empty", () => {
    expect(
      b.termination({ state: state("2030-01-01"), securityId: "OPT-1", date: "2030-01-01", reason: "x" }),
    ).toEqual([]);
  });
  test("exercise creates common stock for the holder", () => {
    const x = b.exercise({
      state: state("2026-11-01"),
      securityId: "OPT-1",
      quantity: "5000",
      date: "2026-11-01",
    });
    expect(x.map((d) => d.type)).toEqual(["TX_EQUITY_COMPENSATION_EXERCISE", "TX_STOCK_ISSUANCE"]);
    expect(x[1]!.data).toMatchObject({ security_id: "CS-3", stakeholder_id: "sh_lisa", quantity: "5000" });
    expect(x[0]!.data.resulting_security_ids).toEqual(["CS-3"]);
    const s = state("2026-11-02", asEvents(x));
    expect(s.violations).toEqual([]);
  });
  test("repurchase of Tim's unvested shares", () => {
    const r = b.repurchaseUnvested({ state: state(), securityId: "CS-1", date: "2026-10-07" });
    expect(r.map((d) => [d.type, d.data.quantity])).toEqual([["TX_STOCK_REPURCHASE", "1000000"]]);
  });
  test("a SAFE shows up as-converted", () => {
    const sh = b.stakeholder({ id: "sh_fy", name: "Fund Y", type: "INSTITUTION" });
    const sf = b.safe({
      state: state(),
      stakeholderId: "sh_fy",
      amount: "200000",
      cap: "10000000",
      mfn: false,
      date: "2026-10-01",
    });
    const row = capTableRows(state("2026-10-07", asEvents([sh, sf]))).find(
      (r) => r.stakeholder === "Fund Y",
    )!;
    expect(row.asConverted).toBe("2.00");
  });
});

test("a reversed security's id is never reused", () => {
  const x = acme.find((e) => e.data.security_id === "SAFE-3")!;
  const s = reduce(
    [...acme, { ...x, id: "evt_rev", type: "reversal", kind: "app", data: { target: x.id, reason: "dup" } }],
    "2026-10-07",
  );
  expect(b.nextSecurityId(s, "SAFE")).toBe("SAFE-4");
});
