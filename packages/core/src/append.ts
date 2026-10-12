import canonicalize from "canonicalize";
import { newId } from "./builders";
import { GENESIS, hashEvent, verifyChain } from "./chain";
import { MAX_DATE } from "./dates";
import { checkInvariants } from "./invariants";
import { validateOcf } from "./ocf/validate";
import { liveEvents, reduce, txType } from "./reduce";
import type { EventDraft, VaultEvent } from "./types";

export interface AppendCtx {
  now(): Date;
  newId(): string;
  deviceId: string;
}
export const defaultCtx = (deviceId: string): AppendCtx => ({
  now: () => new Date(),
  newId: () => newId("evt"),
  deviceId,
});

export type AppendResult = { ok: true; event: VaultEvent; line: string } | { ok: false; errors: string[] };

/** The only write path: checks the chain, the OCF schema and invariants, then returns the line to append (+ "\n"). */
export async function appendEvent(log: string, draft: EventDraft, ctx: AppendCtx): Promise<AppendResult> {
  const chain = await verifyChain(log);
  if (!chain.ok)
    return { ok: false, errors: [`The record is broken at line ${chain.line}: ${chain.reason}`] };
  const events = chain.events;
  // the reducer ignores reversals of reversals, so accepting one would record an "undo" that does nothing
  if (draft.type === "reversal" && events.some((e) => e.id === draft.data.target && e.type === "reversal"))
    return { ok: false, errors: ["A reversal can't be reversed. Enter what you need again instead."] };
  const last = events.at(-1);
  const base = {
    seq: (last?.seq ?? 0) + 1,
    id: ctx.newId(),
    ts: ctx
      .now()
      .toISOString()
      .replace(/\.\d{3}Z$/, "Z"),
    kind: draft.kind,
    type: draft.type,
    data: draft.data,
    meta: { source: "app", device_id: ctx.deviceId, ...draft.meta },
    prev: last?.hash ?? GENESIS,
  };
  const event: VaultEvent = { ...base, hash: await hashEvent(base) };
  const next = [...events, event];

  if (draft.kind === "ocf" && txType(draft.type) !== txType(String(draft.data?.object_type)))
    return {
      ok: false,
      errors: [`Event type ${draft.type} doesn't match object_type ${draft.data?.object_type}`],
    };
  let schemaErrors: string[] = [];
  if (draft.kind === "ocf") schemaErrors = validateOcf(draft.data);
  else if (draft.type === "correction") {
    const target = liveEvents(next).find((e) => e.id === draft.data.target);
    if (!target) return { ok: false, errors: [`Correction target ${draft.data.target} doesn't exist`] };
    if (target.kind === "ocf") schemaErrors = validateOcf(target.data);
  }
  if (schemaErrors.length) return { ok: false, errors: schemaErrors };

  // Check every as-of the event can affect: its own date and each later transaction date (all dates for corrections
  // and reversals, which can move history), plus the end of time.
  const own = draft.kind === "ocf" && typeof draft.data.date === "string" ? draft.data.date : undefined;
  const rewritesHistory = draft.type === "correction" || draft.type === "reversal";
  const dates = new Set<string>([MAX_DATE]);
  if (own) dates.add(own);
  for (const e of next)
    if (e.type.startsWith("TX_") && (rewritesHistory || (own && e.data.date >= own))) dates.add(e.data.date);

  // Block only violations this event introduces, so an already-broken import can still be fixed. Violations are
  // compared without their trailing "(numbers)", so improving an existing problem is allowed.
  // ponytail: making an existing problem worse (e.g. a pool already negative goes more negative) is also allowed.
  const key = (v: string) => v.replace(/ \([^)]*\)$/, "");
  const added = new Set<string>();
  for (const d of [...dates].sort()) {
    const before = new Set(checkInvariants(reduce(events, d)).map(key));
    for (const v of checkInvariants(reduce(next, d))) if (!before.has(key(v))) added.add(v);
  }
  if (added.size) return { ok: false, errors: [...added] };
  return { ok: true, event, line: canonicalize(event)! };
}

/** Several drafts as one change: all are appended or none (e.g. a grant + its vesting start). */
/** Why these drafts can't be saved: OCF types the reducer would skip. Asks the reducer itself, so it can't drift. */
export function unappliedError(drafts: EventDraft[]): string | undefined {
  const ocf = drafts.filter((d) => d.kind === "ocf");
  const probe = ocf.map((d, i) => ({
    seq: i,
    id: `probe_${i}`,
    ts: "0000-01-01T00:00:00Z",
    kind: "ocf" as const,
    type: d.type,
    data: { ...d.data, date: "0000-01-01" },
    meta: { source: "probe" },
    prev: "",
    hash: "",
  }));
  const unknown = reduce(probe, MAX_DATE).unknownEventTypes;
  if (!unknown.length) return undefined;
  const list = unknown.map((t) => `${t} (${ocf.filter((d) => d.type === t).length})`).join(", ");
  return `Capfolder can't apply these records yet, so nothing was saved: ${list}. Priced rounds, SAFE conversions and splits are coming; until then the cap table would be wrong.`;
}

export async function appendEvents(
  log: string,
  drafts: EventDraft[],
  ctx: AppendCtx,
): Promise<{ ok: true; events: VaultEvent[]; text: string } | { ok: false; errors: string[] }> {
  const unapplied = unappliedError(drafts);
  if (unapplied) return { ok: false, errors: [unapplied] };
  let text = "";
  const events: VaultEvent[] = [];
  for (const draft of drafts) {
    const r = await appendEvent(log + text, draft, ctx);
    if (!r.ok) return r;
    events.push(r.event);
    text += `${r.line}\n`;
  }
  return { ok: true, events, text };
}
