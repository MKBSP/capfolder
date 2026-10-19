import { expect, test } from "vitest";
import { reduce } from "../src/reduce";
import { capTableRows } from "../src/rows";
import { acmeEvents, ev } from "./helpers";

const state = reduce(acmeEvents(), "2026-10-07");
const rows = capTableRows(state);

test("no violations or unknown types in acme", () => {
  expect(state.violations).toEqual([]);
  expect(state.unknownEventTypes).toEqual([]);
});
test("row order and core numbers", () => {
  expect(rows.map((r) => [r.stakeholder, r.type, r.shares, r.fdPercent, r.vested, r.unvested])).toEqual([
    ["Tim Apple", "common", 4000000n, "50.00", 3000000n, 1000000n],
    ["Ana Ribeiro", "common", 3000000n, "37.50", 2250000n, 750000n],
    ["Lisa Moreau", "option", 40000n, "0.50", 10000n, 30000n],
    ["João Silva", "option", 40000n, "0.50", 0n, 40000n],
    ["Option pool (available)", "pool", 920000n, "11.50", null, null],
    ["Y Combinator", "safe", null, "", null, null],
    ["Angel A", "safe", null, "", null, null],
    ["Fund X", "safe", null, "", null, null],
  ]);
});
test("SAFE columns", () => {
  expect(
    rows.slice(5).map((r) => [r.safeAmount, r.safeCap, r.safeDiscount, r.asConverted, r.docStatus]),
  ).toEqual([
    ["500000", "10000000", "", "5.00", "signed"],
    ["150000", "8000000", "0.20", "1.88", "signed"],
    ["250000", "10000000", "", "2.50", "missing"],
  ]);
});
test("every number shows its math", () => {
  expect(rows[0]!.math.vested).toBe("3,000,000 = floor(4,000,000 × 36/48), as of 2026-10-07");
  expect(rows[4]!.math.shares).toBe("920,000 = 1,000,000 reserved − 80,000 granted + 0 returned");
  expect(rows[0]!.math.fd_percent).toBe("4,000,000 ÷ 8,000,000 fully diluted (largest-remainder rounding)");
  expect(rows[6]!.math.as_converted).toBe("150,000 ÷ 8,000,000 post-money cap");
});
test("deprecated TX_PLAN_SECURITY_* names are read as equity compensation", () => {
  const lisa = acmeEvents().find((e) => e.id === "evt_0020")!;
  const old = {
    ...lisa,
    data: { ...lisa.data, object_type: "TX_PLAN_SECURITY_ISSUANCE" },
    type: "TX_PLAN_SECURITY_ISSUANCE",
  };
  const s = reduce([...acmeEvents().filter((e) => e.id !== "evt_0020"), old], "2026-10-07");
  expect(s.securities.get("OPT-1")?.kind).toBe("equity");
  expect(s.unknownEventTypes).toEqual([]);
});
test("unknown event types are listed, not applied", () => {
  const s = reduce(
    [...acmeEvents(), ev("TX_WARRANT_ISSUANCE", { id: "w1", date: "2026-01-01" }), ev("future_thing", {})],
    "2026-10-07",
  );
  expect(s.unknownEventTypes).toEqual(["TX_WARRANT_ISSUANCE", "future_thing"]);
});

test("rows carry each SAFE's own currency (M5 review)", () => {
  expect(rows.filter((r) => r.group === 3).map((r) => r.currency)).toEqual(["USD", "USD", "USD"]);
});
