import canonicalize from "canonicalize";
import { expect, test } from "vitest";
import { type AppendCtx, appendEvent } from "../src/append";
import { hashEvent, verifyChain } from "../src/chain";
import type { VaultEvent } from "../src/types";
import { readFix } from "./helpers";

const log = readFix("events.jsonl");
const ctx: AppendCtx = {
  now: () => new Date("2026-10-09T12:00:00.123Z"),
  newId: () => "evt_TEST",
  deviceId: "dev_test",
};
const stakeholder = {
  kind: "ocf" as const,
  type: "STAKEHOLDER",
  data: {
    object_type: "STAKEHOLDER",
    id: "sh_new",
    name: { legal_name: "New Person" },
    stakeholder_type: "INDIVIDUAL",
  },
};

/** Writes a line directly (bypassing appendEvent), as an outside tool or old import would. */
async function rawAppend(text: string, e: Omit<VaultEvent, "seq" | "prev" | "hash">): Promise<string> {
  const last = JSON.parse(text.trim().split("\n").at(-1)!);
  const raw = { ...e, seq: last.seq + 1, prev: last.hash };
  return `${text}${canonicalize({ ...raw, hash: await hashEvent(raw) })}\n`;
}

test("appends a valid event and the chain still verifies", async () => {
  const r = await appendEvent(log, stakeholder, ctx);
  if (!r.ok) throw new Error(r.errors.join("; "));
  expect(r.event).toMatchObject({
    seq: 31,
    id: "evt_TEST",
    ts: "2026-10-09T12:00:00Z",
    meta: { source: "app", device_id: "dev_test" },
  });
  expect((await verifyChain(`${log}${r.line}\n`)).ok).toBe(true);
});
test("rejects schema-invalid OCF", async () => {
  const r = await appendEvent(log, { ...stakeholder, data: { object_type: "STAKEHOLDER", id: "x" } }, ctx);
  expect(r.ok).toBe(false);
});
test("rejects a broken chain", async () => {
  const r = await appendEvent(log.replace("Acme Inc.", "Acme Corp."), stakeholder, ctx);
  expect(r).toEqual({
    ok: false,
    errors: ["The record is broken at line 1: hash does not match the line's content"],
  });
});
test("rejects a new invariant violation", async () => {
  const r = await appendEvent(
    log,
    {
      kind: "ocf",
      type: "TX_STOCK_ISSUANCE",
      data: {
        object_type: "TX_STOCK_ISSUANCE",
        id: "n1",
        date: "2026-01-01",
        security_id: "CS-9",
        custom_id: "CS-9",
        stakeholder_id: "sh_steve",
        stock_class_id: "sc_common",
        quantity: "4000000",
        share_price: { amount: "1", currency: "USD" },
        stock_legend_ids: [],
        security_law_exemptions: [],
      },
    },
    ctx,
  );
  expect(r).toEqual({
    ok: false,
    errors: ["Issued would exceed authorized for Common (11,000,000 > 10,000,000)"],
  });
});
test("an existing violation does not block unrelated appends", async () => {
  const broken = await rawAppend(log, {
    id: "evt_BAD",
    ts: "2026-10-09T00:00:00Z",
    kind: "app",
    type: "doc_linked",
    data: { doc_id: "doc_yc_safe", target: "SAFE-99" },
    meta: { source: "test" },
  });
  expect((await verifyChain(broken)).ok).toBe(true);
  const r = await appendEvent(broken, stakeholder, ctx);
  expect(r.ok).toBe(true);
});
test("rejects a correction that makes the target schema-invalid", async () => {
  const r = await appendEvent(
    log,
    {
      kind: "app",
      type: "correction",
      data: { target: "evt_0012", field: "quantity", old: "4000000", new: "abc", reason: "x" },
    },
    ctx,
  );
  expect(r.ok).toBe(false);
});
test("rejects a correction aimed at a missing event", async () => {
  const r = await appendEvent(
    log,
    {
      kind: "app",
      type: "correction",
      data: { target: "evt_nope", field: "quantity", old: "1", new: "2", reason: "x" },
    },
    ctx,
  );
  expect(r).toEqual({ ok: false, errors: ["Correction target evt_nope doesn't exist"] });
});

test("a reversal can't be reversed (it would look like an undo but do nothing)", async () => {
  const first = await appendEvent(
    log,
    { kind: "app", type: "reversal", data: { target: "evt_0018", reason: "dup" } },
    { ...ctx, newId: () => "evt_REV" },
  );
  if (!first.ok) throw new Error(first.errors.join());
  const r = await appendEvent(
    `${log}${first.line}\n`,
    { kind: "app", type: "reversal", data: { target: "evt_REV", reason: "undo" } },
    { ...ctx, newId: () => "evt_REV2" },
  );
  expect(r).toEqual({
    ok: false,
    errors: ["A reversal can't be reversed. Enter what you need again instead."],
  });
});

test("OCF records the engine can't apply yet are refused up front, all listed, nothing written", async () => {
  const { appendEvents } = await import("../src/append");
  const tx = (type: string, id: string) => ({
    kind: "ocf" as const,
    type,
    data: { object_type: type, id, date: "2026-01-01", security_id: "SAFE-1" },
  });
  const r = await appendEvents(
    log,
    [
      stakeholder,
      tx("TX_CONVERTIBLE_CONVERSION", "c1"),
      tx("TX_CONVERTIBLE_CONVERSION", "c2"),
      tx("TX_STOCK_CLASS_SPLIT", "s1"),
    ],
    ctx,
  );
  expect(r).toEqual({
    ok: false,
    errors: [
      "Capfolder can't apply these records yet, so nothing was saved: TX_CONVERTIBLE_CONVERSION (2), TX_STOCK_CLASS_SPLIT (1). Priced rounds, SAFE conversions and splits are coming; until then the cap table would be wrong.",
    ],
  });
});
