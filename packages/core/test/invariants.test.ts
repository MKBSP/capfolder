import { expect, test } from "vitest";
import { checkInvariants } from "../src/invariants";
import { reduce } from "../src/reduce";
import { acmeEvents, ev } from "./helpers";

const base = acmeEvents();
const check = (...extra: ReturnType<typeof ev>[]) =>
  checkInvariants(reduce([...base, ...extra], "9999-12-31"));
const issue = (q: string) =>
  ev("TX_STOCK_ISSUANCE", {
    id: "n1",
    date: "2026-01-01",
    security_id: "CS-9",
    stakeholder_id: "sh_ana",
    stock_class_id: "sc_common",
    quantity: q,
    share_price: { amount: "1", currency: "USD" },
    stock_legend_ids: [],
  });

test("acme holds every invariant", () => expect(check()).toEqual([]));
test("1: issued over authorized", () => {
  expect(check(issue("4000000"))).toEqual([
    "Issued would exceed authorized for Common (11,000,000 > 10,000,000)",
  ]);
});
test("2: pool negative", () => {
  expect(
    check(
      ev("TX_STOCK_PLAN_POOL_ADJUSTMENT", {
        id: "a1",
        date: "2026-10-01",
        stock_plan_id: "plan_2025",
        shares_reserved: "50000",
      }),
    ),
  ).toEqual(["Pool 2025 Equity Incentive Plan would go negative (-30,000 available)"]);
});
test("7: doc linked to nothing", () => {
  expect(check(ev("doc_linked", { doc_id: "doc_yc_safe", target: "SAFE-99" }))).toEqual([
    "Document doc_yc_safe is linked to SAFE-99, which doesn't exist",
  ]);
});
test("4/5 come from the reducer", () => {
  expect(
    check(
      ev("TX_EQUITY_COMPENSATION_CANCELLATION", {
        id: "c1",
        date: "2026-06-01",
        security_id: "OPT-1",
        quantity: "50000",
      }),
    )[0],
  ).toMatch(/more than the 40,000 outstanding/);
});
