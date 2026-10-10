import { appendEvents, capTableRows, reduce } from "@capfolder/core";
import { expect, test } from "vitest";
import { MemoryFs } from "./fs/memory";
import { createVault } from "./vault";
import { type WizardInput, wizardDrafts } from "./wizard";

const ctx = {
  now: () => new Date("2026-10-09T12:00:00Z"),
  newId: (() => {
    let i = 0;
    return () => `evt_W${String(i++).padStart(5, "0")}`;
  })(),
  deviceId: "d",
};
const input: WizardInput = {
  authorized: "10000000",
  par: "0.00001",
  founders: [
    {
      name: "Ana",
      email: "ana@x.com",
      shares: "4000000",
      issueDate: "2026-01-02",
      vesting: true,
      vestingStart: "2026-01-02",
    },
    {
      name: "Bo",
      email: "",
      shares: "3000000",
      issueDate: "2026-01-02",
      vesting: false,
      vestingStart: "2026-01-02",
    },
  ],
  pool: { size: "1000000", name: "2026 Equity Incentive Plan", approved: "2026-02-01" },
  safes: [
    {
      investor: "Y Combinator",
      amount: "500000",
      cap: "10000000",
      discount: "",
      mfn: false,
      date: "2026-03-01",
    },
  ],
};

test("wizard drafts build the whole cap table in one valid batch", async () => {
  const v = await createVault(new MemoryFs(), ctx, {
    parent: "/d",
    company: { name: "W", formationDate: "2026-01-02", type: "DE_CCORP" },
  });
  const drafts = wizardDrafts(reduce(v.events, "9999-12-31"), input);
  const r = await appendEvents(v.log, drafts, ctx);
  if (!r.ok) throw new Error(r.errors.join("; "));
  const rows = capTableRows(reduce([...v.events, ...r.events], "2026-10-07"));
  expect(rows.map((x) => [x.stakeholder, x.securityId, x.fdPercent, x.asConverted])).toEqual([
    ["Ana", "CS-1", "50.00", ""],
    ["Bo", "CS-2", "37.50", ""],
    ["Option pool (available)", rows[2]!.securityId, "12.50", ""],
    ["Y Combinator", "SAFE-1", "", "5.00"],
  ]);
  expect(rows[0]!.vested).toBe(0n); // before the cliff
  expect(rows[1]!.vested).toBe(3000000n); // no vesting
});

test("over-issuing is reported by core, not written", async () => {
  const v = await createVault(new MemoryFs(), ctx, {
    parent: "/d",
    company: { name: "W", formationDate: "2026-01-02", type: "DE_CCORP" },
  });
  const big = { ...input, founders: [{ ...input.founders[0]!, shares: "12000000" }], pool: null, safes: [] };
  const r = await appendEvents(v.log, wizardDrafts(reduce(v.events, "9999-12-31"), big), ctx);
  expect(r).toEqual({
    ok: false,
    errors: ["Issued would exceed authorized for Common (12,000,000 > 10,000,000)"],
  });
});
