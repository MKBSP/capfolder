import { expect, test } from "vitest";
import { computeGaps } from "../src/gaps";
import { reduce } from "../src/reduce";
import { acmeEvents, ev } from "./helpers";

const gaps = computeGaps(reduce(acmeEvents(), "2026-10-07"));
const targets = (kind: string) =>
  gaps
    .filter((g) => g.kind === kind)
    .map((g) => g.target)
    .sort();

test("acme gaps", () => {
  expect(targets("no_signed_doc")).toEqual(["CS-1", "CS-2", "OPT-2", "SAFE-3"]);
  expect(targets("no_ip_assignment")).toEqual(["sh_ana", "sh_joao", "sh_lisa", "sh_mads"]);
  expect(targets("no_board_consent")).toEqual(["OPT-1", "OPT-2"]);
  expect(targets("no_plan_documents")).toEqual(["plan_2025"]);
  expect(targets("missing_83b")).toEqual([]);
  expect(gaps.find((g) => g.target === "SAFE-3")).toMatchObject({
    severity: "red",
    text: "No signed document for Fund X's SAFE",
  });
});
test("83(b) within 30 days of a vesting stock issuance", () => {
  const extra = [
    ev("TX_STOCK_ISSUANCE", {
      id: "i9",
      date: "2026-10-01",
      security_id: "CS-9",
      stakeholder_id: "sh_ana",
      stock_class_id: "sc_common",
      quantity: "1000",
      share_price: { amount: "0.01", currency: "USD" },
      stock_legend_ids: [],
      vesting_terms_id: "vt_4y1c_monthly",
    }),
    ev("TX_VESTING_START", {
      id: "v9",
      date: "2026-10-01",
      security_id: "CS-9",
      vesting_condition_id: "vesting-start",
    }),
  ];
  const g = computeGaps(reduce([...acmeEvents(), ...extra], "2026-10-07"));
  expect(g.find((x) => x.kind === "missing_83b")).toMatchObject({
    target: "CS-9",
    text: "File Ana Ribeiro's 83(b) by 2026-10-31",
  });
  expect(
    computeGaps(reduce([...acmeEvents(), ...extra], "2026-11-01")).some((x) => x.kind === "missing_83b"),
  ).toBe(false);
});
test("imported snapshot and unknown vesting are gaps", () => {
  const snap = ev("TX_STOCK_ISSUANCE", {
    id: "i8",
    date: "2026-01-01",
    security_id: "CS-8",
    stakeholder_id: "sh_ana",
    stock_class_id: "sc_common",
    quantity: "1000",
    share_price: { amount: "0.01", currency: "USD" },
    stock_legend_ids: [],
    vesting_terms_id: "vt_missing",
  });
  snap.meta.note = "imported snapshot";
  const g = computeGaps(reduce([...acmeEvents(), snap], "2026-10-07"));
  expect(g.filter((x) => x.target === "CS-8").map((x) => x.kind)).toEqual([
    "no_signed_doc",
    "vesting_unknown",
    "imported_snapshot",
  ]);
});
