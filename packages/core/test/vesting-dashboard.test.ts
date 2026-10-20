// The Vesting screen: pool totals, the 409A share price (FMV), money from shares × price, and the graph's points.
import { expect, test } from "vitest";
import { appendEvents } from "../src/append";
import { termination, valuation409a } from "../src/builders";
import { mulDec } from "../src/num";
import { reduce } from "../src/reduce";
import { fmv, poolOverview, vestingSchedule } from "../src/schedule";
import type { VaultEvent } from "../src/types";
import { acmeEvents, ev, readFix } from "./helpers";

const s = reduce(acmeEvents(), "2026-10-07");

test("pool overview on the sample company: Woz is past his cliff, Bill isn't", () => {
  expect(poolOverview(s)).toEqual({
    name: "2025 Equity Incentive Plan",
    approved: "2025-09-30",
    reserved: 1000000n,
    allocated: 80000n,
    vested: 10000n,
    available: 920000n,
    returned: 0n,
    people: 2,
  });
});

test("a leaver: the unvested part goes back to the pool, what vested stays vested", () => {
  const drafts = termination({ state: s, securityId: "OPT-1", date: "2026-11-07", reason: "Left" });
  const events: VaultEvent[] = [
    ...acmeEvents(),
    ...drafts.map((d, i) => ev(d.type, d.data, { ts: "2026-11-07T10:00:00Z", id: `evt_term${i}` })),
  ];
  const t = reduce(events, "2027-01-01");
  expect(poolOverview(t)).toMatchObject({
    allocated: 50833n,
    vested: 10833n,
    returned: 29167n,
    available: 949167n,
  });
  // the graph stops: flat after the last day
  const pts = vestingSchedule(t.securities.get("OPT-1")!, t)!;
  expect(pts.find((p) => p.date === "2026-10-07")?.cumulative).toBe(10000n); // the cliff jump
  expect(pts.find((p) => p.date === "2026-09-07")?.cumulative).toBe(0n); // 0 before the cliff
  expect(pts.at(-1)?.cumulative).toBe(10833n);
});

test("FMV is the latest 409A on or before the as-of date", () => {
  const v = (date: string, amount: string) =>
    ev("VALUATION", {
      id: `val_${date}`,
      valuation_type: "409A",
      effective_date: date,
      price_per_share: { amount, currency: "USD" },
      stock_class_id: "sc_common",
    });
  const base = acmeEvents().filter((e) => e.type !== "VALUATION"); // without the sample's own 409A
  const events = [...base, v("2025-06-01", "0.20"), v("2026-06-01", "0.42"), v("2027-01-01", "0.90")];
  expect(fmv(reduce(events, "2026-10-07"))).toEqual({ amount: "0.42", currency: "USD", date: "2026-06-01" });
  expect(fmv(reduce(events, "2025-01-01"))).toBeNull();
  expect(fmv(reduce(base, "2026-10-07"))).toBeNull();
  expect(fmv(s)).toEqual({ amount: "0.42", currency: "USD", date: "2026-06-15" }); // the sample company's 409A
});

test("a recorded 409A is valid OCF", async () => {
  const draft = valuation409a({
    price: "0.42",
    date: "2026-06-01",
    classId: "sc_common",
    provider: "Acme Valuations",
  });
  const ctx = { now: () => new Date("2026-10-09T12:00:00Z"), newId: () => "evt_val", deviceId: "dev" };
  const r = await appendEvents(readFix("events.jsonl"), [draft], ctx);
  expect(r.ok).toBe(true);
});

test("shares × price, rounded to cents", () => {
  expect(mulDec(10000n, "0.10")).toBe("1000.00");
  expect(mulDec(3n, "0.425")).toBe("1.28");
  expect(mulDec(0n, "0.42")).toBe("0.00");
});
