import { expect, test } from "vitest";
import { type AppendCtx, appendEvents } from "../src/append";
import * as b from "../src/builders";
import { verifyChain } from "../src/chain";
import { MAX_DATE } from "../src/dates";
import { checkInvariants } from "../src/invariants";
import { reduce } from "../src/reduce";
import { promisedTable } from "../src/rows";
import type { EventDraft, VaultEvent } from "../src/types";
import { acmeEvents } from "./helpers";

let n = 0;
const ctx: AppendCtx = {
  now: () => new Date("2026-10-09T12:00:00Z"),
  newId: () => `evt_P${String(n++).padStart(6, "0")}`,
  deviceId: "dev_test",
};
const NOT_INCORPORATED =
  "The company isn't incorporated yet. Record the incorporation first; until then shares can only be promised.";

async function add(log: string, drafts: EventDraft[]) {
  const r = await appendEvents(log, drafts, ctx);
  if (!r.ok) throw new Error(r.errors.join("; "));
  return log + r.text;
}
const events = async (log: string): Promise<VaultEvent[]> => {
  const c = await verifyChain(log);
  if (!c.ok) throw new Error(c.reason);
  return c.events;
};
const state = async (log: string) => reduce(await events(log), MAX_DATE);

/** Acme before incorporation: Tim Apple and Steve Wozniak, plus the given promises. */
async function planned(promises: EventDraft[]) {
  return add("", [
    {
      kind: "app",
      type: "vault_created",
      data: { name: "Acme", country: "US", subdivision: "DE", issuer_id: "iss_A", created_by: "founder" },
    },
    b.stakeholder({ id: "sh_tim", name: "Tim Apple", type: "INDIVIDUAL" }),
    b.stakeholder({ id: "sh_woz", name: "Steve Wozniak", type: "INDIVIDUAL" }),
    ...promises,
  ]);
}
const timAndSteve = () => [
  b.sharesPromised({ stakeholderId: "sh_tim", quantity: "6000000", vesting: "4y_1y_cliff" }),
  b.sharesPromised({ stakeholderId: "sh_woz", quantity: "4000000", vesting: "none" }),
];
const incorporate = async (log: string) => {
  const s = await state(log);
  return b.incorporation({
    state: s,
    issuerId: s.planned!.issuer_id,
    name: "Acme, Inc.",
    country: "US",
    subdivision: "DE",
    date: "2026-03-03",
    authorized: "10000000",
    parValue: "0.00001",
    terms: { id: "vt_1", drafts: [b.vestingTerms4y1y("vt_1")] },
  });
};

test("promises before incorporation", async () => {
  const s = await state(await planned(timAndSteve()));
  expect(s.issuer).toBeUndefined();
  expect(s.planned?.issuer_id).toBe("iss_A");
  expect(s.promises.size).toBe(2);
  expect(promisedTable(s).map((r) => [r.name, r.shares, r.percent])).toEqual([
    ["Tim Apple", 6000000n, "60.00"],
    ["Steve Wozniak", 4000000n, "40.00"],
  ]);
});

test("no shares or pool before incorporation", async () => {
  const log = await add(await planned([]), [
    b.stockClass({ id: "sc_c", name: "Common", authorized: "1000" }),
  ]);
  const s = await state(log);
  const issue = await appendEvents(
    log,
    b.stockIssuance({
      state: s,
      stakeholderId: "sh_tim",
      classId: "sc_c",
      quantity: "10",
      price: "0",
      date: "2026-03-03",
    }),
    ctx,
  );
  expect(issue).toEqual({ ok: false, errors: [NOT_INCORPORATED] });
  const pool = await appendEvents(
    log,
    [b.stockPlan({ name: "Plan", reserved: "100", boardApprovalDate: "2026-03-03", classId: "sc_c" })],
    ctx,
  );
  expect(pool).toEqual({ ok: false, errors: [NOT_INCORPORATED] });
});

test("incorporation turns each promise into shares", async () => {
  const before = await planned(timAndSteve());
  const s = await state(await add(before, await incorporate(before)));
  expect(s.issuer).toMatchObject({ id: "iss_A", formation_date: "2026-03-03" });
  expect(s.securities.get("CS-1")).toMatchObject({
    stakeholderId: "sh_tim",
    quantity: 6000000n,
    vestingTermsId: "vt_1",
    vestingStart: { date: "2026-03-03" },
  });
  expect(s.securities.get("CS-2")).toMatchObject({ stakeholderId: "sh_woz", quantity: 4000000n });
  expect(s.securities.get("CS-2")!.vestingTermsId).toBeUndefined();
  expect(s.promises.size).toBe(0);
  expect(checkInvariants(s)).toEqual([]);
});

test("incorporation skips withdrawn promises", async () => {
  let log = await planned(timAndSteve());
  const woz = (await events(log)).find(
    (e) => e.type === "shares_promised" && e.data.stakeholder_id === "sh_woz",
  )!;
  log = await add(log, [b.reversal({ target: woz.id, reason: "Steve Wozniak is out" })]);
  const s = await state(await add(log, await incorporate(log)));
  expect([...s.securities.keys()]).toEqual(["CS-1"]);
});

test("two promises to one person become two securities", async () => {
  const promise = () => b.sharesPromised({ stakeholderId: "sh_tim", quantity: "1000", vesting: "none" });
  const before = await planned([promise(), promise()]);
  const s = await state(await add(before, await incorporate(before)));
  expect([...s.securities.values()].map((x) => [x.id, x.stakeholderId])).toEqual([
    ["CS-1", "sh_tim"],
    ["CS-2", "sh_tim"],
  ]);
});

test("an incorporated vault is unchanged", () => {
  const s = reduce(acmeEvents(), MAX_DATE);
  expect(s.planned).toBeUndefined();
  expect(s.promises.size).toBe(0);
});
