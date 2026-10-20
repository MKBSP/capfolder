import { expect, test } from "vitest";
import { appendEvents } from "../src/append";
import { verifyChain } from "../src/chain";
import { reduce } from "../src/reduce";
import { fullyVestedOn, nextVest, vestingSchedule } from "../src/schedule";
import { acmeEvents, ev, readFix } from "./helpers";

const s = reduce(acmeEvents(), "2026-10-07");
const woz = s.securities.get("OPT-1")!;

test("Woz's next vest is 833 on Nov 7", () => {
  expect(nextVest(woz, s, "2026-10-07")).toEqual({ date: "2026-11-07", quantity: 833n });
});
test("Bill's next vest is the cliff", () => {
  expect(nextVest(s.securities.get("OPT-2")!, s, "2026-10-07")).toEqual({
    date: "2027-03-02",
    quantity: 10000n,
  });
});
test("fully vested on month 48", () => expect(fullyVestedOn(woz, s)).toBe("2029-10-07"));
test("schedule has 48 monthly points, cliff at month 12", () => {
  const pts = vestingSchedule(woz, s)!;
  expect(pts).toHaveLength(48);
  expect(pts[0]).toEqual({ date: "2025-11-07", cumulative: 0n });
  expect(pts[11]).toEqual({ date: "2026-10-07", cumulative: 10000n });
  expect(pts[47]).toEqual({ date: "2029-10-07", cumulative: 40000n });
});
test("no schedule for a SAFE; nothing next after termination", () => {
  expect(vestingSchedule(s.securities.get("SAFE-1")!, s)).toBeNull();
  const t = reduce(
    [
      ...acmeEvents(),
      ev("TX_EQUITY_COMPENSATION_CANCELLATION", {
        id: "c1",
        date: "2026-11-07",
        security_id: "OPT-1",
        quantity: "29167",
      }),
    ],
    "2026-12-01",
  );
  expect(nextVest(t.securities.get("OPT-1")!, t, "2026-12-01")).toBeNull();
});

const ctx = {
  now: () => new Date("2026-10-09T12:00:00Z"),
  newId: (() => {
    let i = 0;
    return () => `evt_M${i++}`;
  })(),
  deviceId: "dev",
};
const person = (id: string) => ({
  kind: "ocf" as const,
  type: "STAKEHOLDER",
  data: { object_type: "STAKEHOLDER", id, name: { legal_name: id }, stakeholder_type: "INDIVIDUAL" },
});
test("appendEvents: all valid → one text block that verifies", async () => {
  const log = readFix("events.jsonl");
  const r = await appendEvents(log, [person("sh_a"), person("sh_b")], ctx);
  if (!r.ok) throw new Error(r.errors.join("; "));
  expect(r.events.map((e) => e.seq)).toEqual([31, 32]);
  expect(r.text.endsWith("\n")).toBe(true);
  expect((await verifyChain(log + r.text)).ok).toBe(true);
});
test("appendEvents: second draft invalid → nothing, with its errors", async () => {
  const r = await appendEvents(
    readFix("events.jsonl"),
    [person("sh_a"), { ...person("x"), data: { object_type: "STAKEHOLDER", id: "x" } }],
    ctx,
  );
  expect(r.ok).toBe(false);
});
