import { describe, expect, test } from "vitest";
import { reduce } from "../src/reduce";
import { capTableRows } from "../src/rows";
import type { VaultEvent } from "../src/types";
import { acmeEvents, ev } from "./helpers";

const base = acmeEvents();
const rows = (extra: VaultEvent[], asOf: string) => capTableRows(reduce([...base, ...extra], asOf));
const find = (r: ReturnType<typeof rows>, who: string) => r.find((x) => x.stakeholder === who);
const pool = (r: ReturnType<typeof rows>) => find(r, "Option pool (available)")!.shares;
const stock = (id: string, security: string, who: string, q: string, date = "2026-01-01") =>
  ev("TX_STOCK_ISSUANCE", {
    id,
    date,
    security_id: security,
    stakeholder_id: who,
    stock_class_id: "sc_common",
    quantity: q,
    share_price: { amount: "1", currency: "USD" },
    stock_legend_ids: [],
  });

describe("termination (F-22)", () => {
  test("before the cliff: everything returns to the pool", () => {
    const r = rows(
      [
        ev("TX_EQUITY_COMPENSATION_CANCELLATION", {
          id: "c1",
          date: "2026-06-01",
          security_id: "OPT-1",
          quantity: "40000",
          reason_text: "left",
        }),
        ev("TX_STOCK_PLAN_RETURN_TO_POOL", {
          id: "r1",
          date: "2026-06-01",
          stock_plan_id: "plan_2025",
          quantity: "40000",
        }),
      ],
      "2026-10-07",
    );
    expect(find(r, "Steve Wozniak")).toBeUndefined();
    expect(pool(r)).toBe(960000n);
    expect(find(r, "Option pool (available)")!.fdPercent).toBe("12.00");
  });
  test("after the cliff: vested is frozen at the last day", () => {
    const r = rows(
      [
        ev("TX_EQUITY_COMPENSATION_CANCELLATION", {
          id: "c1",
          date: "2026-11-07",
          security_id: "OPT-1",
          quantity: "29167",
          reason_text: "left",
        }),
        ev("TX_STOCK_PLAN_RETURN_TO_POOL", {
          id: "r1",
          date: "2026-11-07",
          stock_plan_id: "plan_2025",
          quantity: "29167",
        }),
      ],
      "2027-10-07",
    );
    expect(find(r, "Steve Wozniak")).toMatchObject({ shares: 10833n, vested: 10833n, unvested: 0n });
  });
  test("cancelling more than outstanding is a violation", () => {
    const s = reduce(
      [
        ...base,
        ev("TX_EQUITY_COMPENSATION_CANCELLATION", {
          id: "c1",
          date: "2026-06-01",
          security_id: "OPT-1",
          quantity: "50000",
        }),
      ],
      "2026-10-07",
    );
    expect(s.violations[0]).toMatch(/50,000 is more than the 40,000 outstanding on OPT-1/);
  });
});

describe("exercise then repurchase (F-23, F-24)", () => {
  const exercise = [
    ev("TX_EQUITY_COMPENSATION_EXERCISE", {
      id: "x1",
      date: "2026-11-01",
      security_id: "OPT-1",
      quantity: "10000",
      resulting_security_ids: ["CS-3"],
    }),
    stock("i3", "CS-3", "sh_woz", "10000", "2026-11-01"),
  ];
  test("exercise converts options to common", () => {
    const r = rows(exercise, "2026-11-02");
    expect(
      r.filter((x) => x.stakeholder === "Steve Wozniak").map((x) => [x.type, x.shares, x.vested]),
    ).toEqual([
      ["common", 10000n, 10000n],
      ["option", 30000n, 0n],
    ]);
  });
  test("then a full repurchase removes the shares", () => {
    const r = rows(
      [
        ...exercise,
        ev("TX_STOCK_REPURCHASE", {
          id: "p1",
          date: "2026-12-01",
          security_id: "CS-3",
          quantity: "10000",
          price: { amount: "0.12", currency: "USD" },
        }),
      ],
      "2026-12-02",
    );
    expect(r.filter((x) => x.stakeholder === "Steve Wozniak").map((x) => x.type)).toEqual(["option"]);
  });
  test("exercising more than vested is a violation", () => {
    const s = reduce(
      [
        ...base,
        ev("TX_EQUITY_COMPENSATION_EXERCISE", {
          id: "x1",
          date: "2026-11-01",
          security_id: "OPT-1",
          quantity: "20000",
        }),
      ],
      "2026-11-02",
    );
    expect(s.violations[0]).toMatch(/20,000 is more than the 10,000 vested/);
    expect(s.securities.get("OPT-1")!.exercised).toBe(0n);
  });
});

describe("founder repurchase of unvested (F-24)", () => {
  test("Tim leaves at month 36: unvested 1,000,000 repurchased", () => {
    const r = rows(
      [
        ev("TX_STOCK_REPURCHASE", {
          id: "p1",
          date: "2026-10-07",
          security_id: "CS-1",
          quantity: "1000000",
          price: { amount: "0.00001", currency: "USD" },
        }),
      ],
      "2027-10-07",
    );
    expect(find(r, "Tim Apple")).toMatchObject({ shares: 3000000n, vested: 3000000n, unvested: 0n });
  });
});

describe("pool increase (F-25)", () => {
  test("shares_reserved is the new total", () => {
    const r = rows(
      [
        ev("TX_STOCK_PLAN_POOL_ADJUSTMENT", {
          id: "a1",
          date: "2026-10-01",
          stock_plan_id: "plan_2025",
          shares_reserved: "1500000",
        }),
      ],
      "2026-10-07",
    );
    expect(pool(r)).toBe(1420000n);
  });
});

describe("partial SAFE transfer (F-20)", () => {
  test("Fund X moves 100k to an SPV", () => {
    const r = rows(
      [
        ev("STAKEHOLDER", {
          id: "sh_spv",
          name: { legal_name: "Fund X SPV I" },
          stakeholder_type: "INSTITUTION",
        }),
        ev("TX_CONVERTIBLE_TRANSFER", {
          id: "t1",
          date: "2026-10-01",
          security_id: "SAFE-3",
          amount: { amount: "100000", currency: "USD" },
          resulting_security_ids: ["SAFE-4"],
        }),
        ev("TX_CONVERTIBLE_ISSUANCE", {
          ...base.find((e) => e.data.security_id === "SAFE-3")!.data,
          id: "tx_safe_spv",
          security_id: "SAFE-4",
          custom_id: "SAFE-4",
          stakeholder_id: "sh_spv",
          date: "2026-10-01",
          investment_amount: { amount: "100000", currency: "USD" },
        }),
      ],
      "2026-10-07",
    );
    expect(r.filter((x) => x.group === 3).map((x) => [x.stakeholder, x.safeAmount, x.asConverted])).toEqual([
      ["Y Combinator", "500000", "5.00"],
      ["Angel A", "150000", "1.88"],
      ["Fund X", "150000", "1.50"],
      ["Fund X SPV I", "100000", "1.00"],
    ]);
  });
});

describe("correction and reversal (F-18)", () => {
  test("correction changes the cap, history keeps both", () => {
    const fix = ev("correction", {
      target: "evt_0017",
      field: "conversion_triggers.0.conversion_right.conversion_mechanism.conversion_valuation_cap.amount",
      old: "8000000",
      new: "9000000",
      reason: "typo",
    });
    expect(find(rows([fix], "2026-10-07"), "Angel A")!.asConverted).toBe("1.67");
    expect(
      base.find((e) => e.id === "evt_0017")!.data.conversion_triggers[0].conversion_right.conversion_mechanism
        .conversion_valuation_cap.amount,
    ).toBe("8000000");
  });
  test("reversal removes the row", () => {
    expect(
      find(rows([ev("reversal", { target: "evt_0018", reason: "duplicate" })], "2026-10-07"), "Fund X"),
    ).toBeUndefined();
  });
});

describe("as-of replay", () => {
  test("before anything was issued: no rows", () => expect(rows([], "2021-09-13")).toEqual([]));
  test("2023-01-01: founders and YC only, no pool before plan approval", () => {
    expect(rows([], "2023-01-01").map((x) => x.stakeholder)).toEqual([
      "Tim Apple",
      "Steve Jobs",
      "Y Combinator",
    ]);
  });
  test("every as-of between events has FD summing to 100.00", () => {
    for (const d of [
      "2021-09-14",
      "2022-01-10",
      "2023-02-20",
      "2023-03-14",
      "2025-09-30",
      "2025-10-07",
      "2026-03-02",
      "2026-10-07",
    ]) {
      const fd = rows([], d).filter((x) => x.group <= 2);
      const sum = fd.reduce((a, x) => a + BigInt(x.fdPercent.replace(".", "")), 0n);
      expect([d, sum]).toEqual([d, 10000n]);
    }
  });
});

describe("bad numbers", () => {
  test("negative and fractional quantities are violations, not math", () => {
    const s = reduce(
      [...base, stock("n1", "CS-8", "sh_steve", "-5"), stock("n2", "CS-9", "sh_steve", "1.5")],
      "2026-10-07",
    );
    expect(s.violations).toEqual([
      "TX_STOCK_ISSUANCE n1: quantity must be greater than 0",
      'TX_STOCK_ISSUANCE n2: Expected a whole number, got "1.5"',
    ]);
  });
});

describe("untrusted vault data", () => {
  test("a correction cannot pollute Object.prototype", () => {
    for (const field of ["__proto__.polluted", "constructor.prototype.polluted", "data.__proto__.polluted"]) {
      const s = reduce(
        [...base, ev("correction", { target: "evt_0012", field, old: "", new: "yes", reason: "x" })],
        "2026-10-07",
      );
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
      expect(s.violations.some((v) => v.includes("not allowed"))).toBe(true);
    }
  });
  test("a correction path through a missing key is a violation, not a crash", () => {
    const s = reduce(
      [
        ...base,
        ev("correction", { target: "evt_0012", field: "nope.deeper", old: "", new: "1", reason: "x" }),
      ],
      "2026-10-07",
    );
    expect(s.violations[0]).toMatch(/Correction .* field nope\.deeper/);
  });
});
