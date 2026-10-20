import { describe, expect, test } from "vitest";
import { type AppendCtx, appendEvents } from "../src/append";
import * as b from "../src/builders";
import { MAX_DATE } from "../src/dates";
import { computeGaps } from "../src/gaps";
import { reduce } from "../src/reduce";
import { capTableRows, securityVested } from "../src/rows";
import type { EventDraft, VaultEvent } from "../src/types";
import { readFix } from "./helpers";

const log = readFix("events.jsonl");
let n = 0;
const ctx: AppendCtx = {
  now: () => new Date("2026-10-09T12:00:00Z"),
  newId: () => `evt_m${String(n++).padStart(6, "0")}`,
  deviceId: "dev_test",
};
/** Appends through the real write path (schema + invariants), returning the whole log's events. */
async function write(drafts: EventDraft[], base = log): Promise<{ events: VaultEvent[]; log: string }> {
  const r = await appendEvents(base, drafts, ctx);
  if (!r.ok) throw new Error(r.errors.join("; "));
  const text = base + r.text;
  return {
    log: text,
    events: text
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l)),
  };
}
const acme = () =>
  reduce(
    readFix("events.jsonl")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l)),
    MAX_DATE,
  );
const holder = (name: string) => b.stakeholder({ id: "sh_trust", name, type: "INSTITUTION" });
const rowsOf = (events: VaultEvent[], who: string, asOf = "2026-10-07") =>
  capTableRows(reduce(events, asOf)).filter((r) => r.stakeholder === who);

describe("transfer (F-20)", () => {
  test("part of Tim' vesting shares to a trust: both keep the schedule, totals unchanged", async () => {
    const t = b.transfer({
      state: acme(),
      securityId: "CS-1",
      toStakeholderId: "sh_trust",
      quantity: "1000000",
      date: "2026-01-01",
    });
    if ("error" in t) throw new Error(t.error);
    const { events } = await write([holder("Apple Family Trust"), ...t.drafts]);
    const trust = rowsOf(events, "Apple Family Trust")[0]!;
    const tim = rowsOf(events, "Tim Apple")[0]!;
    expect([trust.shares, tim.shares]).toEqual([1000000n, 3000000n]);
    // same start date, same 4y/1y schedule: 36/48 vested on both
    expect([trust.vested, tim.vested]).toEqual([750000n, 2250000n]);
    expect(reduce(events, "2026-10-07").violations).toEqual([]);
  });

  test("all of a holding: no balance security", async () => {
    const t = b.transfer({
      state: acme(),
      securityId: "CS-2",
      toStakeholderId: "sh_trust",
      quantity: "3000000",
      date: "2026-01-01",
    });
    if ("error" in t) throw new Error(t.error);
    expect(t.drafts.filter((d) => d.type === "TX_STOCK_ISSUANCE")).toHaveLength(1);
    const { events } = await write([holder("Jobs Holdings"), ...t.drafts]);
    expect(rowsOf(events, "Steve Jobs")).toEqual([]);
    expect(rowsOf(events, "Jobs Holdings")[0]!.shares).toBe(3000000n);
  });

  test("the transfer date is when it happens: before it, the old holder still has everything", async () => {
    const t = b.transfer({
      state: acme(),
      securityId: "CS-2",
      toStakeholderId: "sh_trust",
      quantity: "1000",
      date: "2026-06-01",
    });
    if ("error" in t) throw new Error(t.error);
    const { events } = await write([holder("Jobs Holdings"), ...t.drafts]);
    expect(rowsOf(events, "Steve Jobs", "2026-05-31")[0]!.shares).toBe(3000000n);
    expect(rowsOf(events, "Jobs Holdings", "2026-05-31")).toEqual([]);
  });

  test("part of a SAFE: the amount moves, cap and discount come along", async () => {
    const t = b.transfer({
      state: acme(),
      securityId: "SAFE-2",
      toStakeholderId: "sh_trust",
      amount: "50000",
      date: "2026-01-01",
    });
    if ("error" in t) throw new Error(t.error);
    const { events } = await write([holder("Angel A SPV"), ...t.drafts]);
    expect(rowsOf(events, "Angel A").map((r) => [r.safeAmount, r.safeCap, r.safeDiscount])).toEqual([
      ["100000", "8000000", "0.20"],
    ]);
    expect(rowsOf(events, "Angel A SPV").map((r) => [r.safeAmount, r.safeCap, r.safeDiscount])).toEqual([
      ["50000", "8000000", "0.20"],
    ]);
  });

  test("refused: more than outstanding, nothing, options, a custom schedule split, a stopped grant's unvested", () => {
    const s = acme();
    const err = (p: Partial<Parameters<typeof b.transfer>[0]>) => {
      const r = b.transfer({
        state: s,
        securityId: "CS-1",
        toStakeholderId: "sh_steve",
        date: "2026-01-01",
        ...p,
      });
      return "error" in r ? r.error : "ok";
    };
    expect(err({ quantity: "5000000" })).toBe("Only 4,000,000 shares are outstanding on CS-1.");
    expect(err({ quantity: "0" })).toBe("Enter how many shares move.");
    expect(err({ securityId: "SAFE-1", amount: "600000" })).toBe("Only 500,000 of this SAFE is outstanding.");
    expect(err({ securityId: "OPT-1", quantity: "10" })).toBe(
      "Options can't be transferred. Record an exercise first, then transfer the shares.",
    );
    expect(err({ toStakeholderId: "sh_tim", quantity: "10" })).toBe("Pick someone other than the holder.");
  });

  test("a transferred holding needs its own paperwork", async () => {
    const t = b.transfer({
      state: acme(),
      securityId: "CS-2",
      toStakeholderId: "sh_trust",
      quantity: "1000",
      date: "2026-01-01",
    });
    if ("error" in t) throw new Error(t.error);
    const { events } = await write([holder("Jobs Holdings"), ...t.drafts]);
    const gaps = computeGaps(reduce(events, "2026-10-07")).filter((g) => g.kind === "no_signed_doc");
    expect(gaps.map((g) => g.text)).toContain("No signed document for Jobs Holdings's shares");
    // the 83(b) was the original holder's to file, at the original issuance
    expect(computeGaps(reduce(events, "2026-01-05")).filter((g) => g.kind === "missing_83b")).toEqual([]);
  });

  test("after a repurchase stopped vesting, what's left moves fully vested", async () => {
    const s0 = acme();
    const rep = b.repurchaseUnvested({
      state: reduce(acmeEvents(), "2026-10-07"),
      securityId: "CS-1",
      date: "2026-10-07",
    });
    const first = await write(rep);
    const t = b.transfer({
      state: reduce(first.events, MAX_DATE),
      securityId: "CS-1",
      toStakeholderId: "sh_trust",
      quantity: "1000000",
      date: "2026-11-01",
    });
    expect(s0.securities.get("CS-1")!.quantity).toBe(4000000n);
    if ("error" in t) throw new Error(t.error);
    const { events } = await write([holder("Trust"), ...t.drafts], first.log);
    const s = reduce(events, "2030-01-01");
    for (const x of [...s.securities.values()].filter((x) => x.kind === "stock" && x.quantity > 0n))
      expect(securityVested(x, s, "2030-01-01").unvested).toBe(0n);
    expect(rowsOf(events, "Tim Apple", "2030-01-01")[0]!.shares).toBe(2000000n);
  });
});

function acmeEvents(): VaultEvent[] {
  return log
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
}

describe("transfer refusals that protect vesting (review)", () => {
  test("a stopped holding that still has unvested shares can't move (they'd turn vested)", async () => {
    const part = { log, events: acmeEvents() };
    const s0 = reduce(part.events, MAX_DATE);
    const cancel = await write(
      [
        {
          kind: "ocf",
          type: "TX_STOCK_REPURCHASE",
          data: {
            object_type: "TX_STOCK_REPURCHASE",
            id: "tx_rp",
            date: "2025-01-01",
            security_id: "CS-1",
            quantity: "100000",
            price: { amount: "0.00001", currency: "USD" },
          },
        },
      ],
      part.log,
    );
    expect(s0.securities.get("CS-1")).toBeTruthy();
    const t = b.transfer({
      state: reduce(cancel.events, MAX_DATE),
      securityId: "CS-1",
      toStakeholderId: "sh_steve",
      quantity: "1000000",
      date: "2026-01-01",
    });
    expect("error" in t && t.error).toMatch(/unvested/);
  });
  test("vesting terms but no recorded start: refused, not invented", () => {
    const s = acme();
    const x = s.securities.get("CS-1")!;
    delete x.vestingStart;
    const t = b.transfer({
      state: s,
      securityId: "CS-1",
      toStakeholderId: "sh_steve",
      quantity: "10",
      date: "2026-01-01",
    });
    expect("error" in t && t.error).toMatch(/vesting start/);
  });
});

describe("merge duplicate people (F-21)", () => {
  test("an import made 'Angel A' and 'Angela A.': one person, holdings and documents moved, old name remembered", async () => {
    const dup = await write([
      b.stakeholder({ id: "sh_dup", name: "Angela A.", type: "INDIVIDUAL" }),
      b.safe({
        state: acme(),
        stakeholderId: "sh_dup",
        amount: "25000",
        cap: "8000000",
        mfn: false,
        date: "2026-02-01",
      }),
      b.docAdded({
        docId: "doc_dup",
        path: "docs/x.pdf",
        sha256: "a".repeat(64),
        docType: "side_letter",
        originalName: "x.pdf",
      }),
      b.docLinked({ docId: "doc_dup", target: "sh_dup" }),
    ]);
    const drafts = b.mergePeople({ events: dup.events, fromId: "sh_dup", intoId: "sh_angela" });
    const { events } = await write(drafts, dup.log);
    const s = reduce(events, MAX_DATE);
    expect(s.stakeholders.has("sh_dup")).toBe(false);
    expect(
      [...s.securities.values()].filter((x) => x.stakeholderId === "sh_angela").map((x) => x.id),
    ).toEqual(["SAFE-2", "SAFE-4"]);
    expect(s.docs.get("doc_dup")!.links).toEqual(new Set(["sh_angela"]));
    expect(s.aliases.get("angela a")).toBe("sh_angela");
    expect(s.violations).toEqual([]);
  });

  test("a merged person's later name edits don't bring them back", async () => {
    const dup = await write([
      b.stakeholder({ id: "sh_dup", name: "Angela", type: "INDIVIDUAL" }),
      b.stakeholderUpdate({
        previous: {
          object_type: "STAKEHOLDER",
          id: "sh_dup",
          name: { legal_name: "Angela" },
          stakeholder_type: "INDIVIDUAL",
        },
        name: "Angela X",
      }),
    ]);
    const { events } = await write(
      b.mergePeople({ events: dup.events, fromId: "sh_dup", intoId: "sh_angela" }),
      dup.log,
    );
    expect(reduce(events, MAX_DATE).stakeholders.has("sh_dup")).toBe(false);
  });

  test("merging into yourself or an unknown person records nothing", () => {
    expect(b.mergePeople({ events: acmeEvents(), fromId: "sh_steve", intoId: "sh_steve" })).toEqual([]);
    expect(b.mergePeople({ events: acmeEvents(), fromId: "sh_nobody", intoId: "sh_steve" })).toEqual([]);
  });
});
