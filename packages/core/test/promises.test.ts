import { expect, test } from "vitest";
import { type AppendCtx, appendEvents } from "../src/append";
import * as b from "../src/builders";
import { verifyChain } from "../src/chain";
import { MAX_DATE } from "../src/dates";
import { previewDrafts } from "../src/import/build";
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

test("no share class, shares or pool before incorporation", async () => {
  const log = await planned([]);
  const common = b.stockClass({ id: "sc_c", name: "Common", authorized: "1000" });
  expect(await appendEvents(log, [common], ctx)).toEqual({ ok: false, errors: [NOT_INCORPORATED] });
  const issue = await appendEvents(
    log,
    [
      common,
      ...b.stockIssuance({
        state: await state(log),
        stakeholderId: "sh_tim",
        classId: "sc_c",
        quantity: "10",
        price: "0",
        date: "2026-03-03",
      }),
    ],
    ctx,
  );
  expect(issue).toEqual({ ok: false, errors: [NOT_INCORPORATED] });
  const pool = await appendEvents(
    log,
    [
      common,
      b.stockPlan({ name: "Plan", reserved: "100", boardApprovalDate: "2026-03-03", classId: "sc_c" }),
    ],
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

test("incorporation needs vesting terms when a promise vests", async () => {
  const log = await planned(timAndSteve());
  const s = await state(log);
  const p = { state: s, issuerId: "iss_A", name: "Acme, Inc.", country: "US", subdivision: "DE" };
  const base = { ...p, date: "2026-03-03", authorized: "10000000", parValue: "0.00001" };
  expect(() => b.incorporation({ ...base, terms: null })).toThrow(
    "Vesting terms are needed for promises that vest.",
  );
});

test("a promise to an unknown person, or with an unknown vesting, is a violation", async () => {
  const bad = [
    b.sharesPromised({ stakeholderId: "sh_nobody", quantity: "10", vesting: "none" }),
    b.sharesPromised({ stakeholderId: "sh_tim", quantity: "10", vesting: "none" }),
    b.sharesPromised({ stakeholderId: "sh_tim", quantity: "x", vesting: "none" }),
  ];
  bad[1]!.data.vesting = "2y";
  const [a, c, d] = bad.map((x) => x.data.promise_id);
  const s = reduce(
    [
      ...(await events(await planned([]))),
      ...bad.map((x, i) => ({
        seq: 100 + i,
        id: `evt_bad${i}`,
        ts: "2026-10-10T00:00:00Z",
        kind: "app" as const,
        type: x.type,
        data: x.data,
        meta: { source: "test" },
        prev: "",
        hash: "",
      })),
    ],
    MAX_DATE,
  );
  expect(s.promises.size).toBe(0);
  expect(s.violations).toEqual([
    `shares_promised ${a} refers to unknown stakeholder sh_nobody`,
    `shares_promised ${c}: vesting must be 4y_1y_cliff or none`,
    expect.stringMatching(new RegExp(`^shares_promised ${d}: `)),
  ]);
});

test("an import preview into a not-incorporated vault reports it", () => {
  const drafts = [
    b.stakeholder({ id: "sh_tim", name: "Tim Apple", type: "INDIVIDUAL" }),
    b.stockClass({ id: "sc_c", name: "Common", authorized: "1000" }),
    ...b.stockIssuance({
      state: reduce([], MAX_DATE),
      stakeholderId: "sh_tim",
      classId: "sc_c",
      quantity: "10",
      price: "0",
      date: "2026-03-03",
    }),
  ];
  expect(previewDrafts(drafts, "2026-03-03", [], false).violations).toEqual([NOT_INCORPORATED]);
  expect(previewDrafts(drafts, "2026-03-03").violations).toEqual([]);
});
