// Person history: the events that touch a stakeholder, in plain sentences (docs/08 copy rules).
import { liveEvents, type State, type VaultEvent } from "@capfolder/core";
import { money, moneyShort, shares } from "./fmt";

export interface HistoryItem {
  event: VaultEvent; // the original line (as written)
  date: string;
  text: string;
  reversed: boolean;
  correctable: boolean; // OCF transactions can be corrected or reversed
}

const n = (q: unknown) => (typeof q === "string" ? shares(BigInt(q.split(".")[0]!)) : "");

export function describe(e: VaultEvent, s: State): string {
  const d = e.data;
  const sec = s.securities.get(d.security_id);
  const cls = sec?.classId ? (s.classes.get(sec.classId)?.data.name ?? "") : "";
  switch (e.type) {
    case "STAKEHOLDER":
      return `Added ${d.name?.legal_name}${d.contact_info?.emails?.[0] ? ` · ${d.contact_info.emails[0].email_address}` : ""}`;
    case "TX_STOCK_ISSUANCE":
      return `Issued ${n(d.quantity)} ${cls || "shares"} at ${money(d.share_price?.amount, d.share_price?.currency)} (${d.security_id})`;
    case "TX_EQUITY_COMPENSATION_ISSUANCE":
    case "TX_PLAN_SECURITY_ISSUANCE":
      return `Granted ${n(d.quantity)} options at ${money(d.exercise_price?.amount, d.exercise_price?.currency)} (${d.security_id})`;
    case "TX_VESTING_START":
      return `Vesting started on ${d.security_id}`;
    case "TX_CONVERTIBLE_ISSUANCE": {
      const m = d.conversion_triggers?.[0]?.conversion_right?.conversion_mechanism;
      return `SAFE ${money(d.investment_amount?.amount, d.investment_amount?.currency)}${m?.conversion_valuation_cap ? `, cap ${moneyShort(m.conversion_valuation_cap.amount, m.conversion_valuation_cap.currency)}` : ""} (${d.security_id})`;
    }
    case "TX_EQUITY_COMPENSATION_CANCELLATION":
    case "TX_STOCK_CANCELLATION":
      return `Cancelled ${n(d.quantity)} unvested on ${d.security_id}${d.reason_text ? ` · ${d.reason_text}` : ""}`;
    case "TX_STOCK_PLAN_RETURN_TO_POOL":
      return `${n(d.quantity)} returned to the pool`;
    case "TX_EQUITY_COMPENSATION_EXERCISE":
      return `Exercised ${n(d.quantity)} options on ${d.security_id}`;
    case "TX_STOCK_REPURCHASE":
      return `Repurchased ${n(d.quantity)} shares of ${d.security_id}${d.price ? ` at ${money(d.price.amount, d.price.currency)}` : ""}`;
    case "TX_CONVERTIBLE_TRANSFER":
      return `Transferred ${money(d.amount?.amount, d.amount?.currency)} of ${d.security_id}`;
    case "doc_added":
      return `Filed ${d.path}`;
    case "doc_linked":
      return `Linked a document to ${d.target}`;
    case "doc_removed":
      return `Moved a document to ${d.moved_to}`;
    case "correction":
      return `Corrected ${d.field}: ${String(d.old)} → ${String(d.new)} · ${d.reason}`;
    case "reversal":
      return `Reversed an entry · ${d.reason}`;
    default:
      return e.type;
  }
}

/** Events for one stakeholder: their own object, their securities' transactions, linked docs, corrections. */
export function historyFor(events: VaultEvent[], s: State, stakeholderId: string): HistoryItem[] {
  const secIds = new Set(
    [...s.securities.values()].filter((x) => x.stakeholderId === stakeholderId).map((x) => x.id),
  );
  const live = new Set(liveEvents(events).map((e) => e.id));
  const docIds = new Set(
    events
      .filter(
        (e) => e.type === "doc_linked" && (secIds.has(e.data.target) || e.data.target === stakeholderId),
      )
      .map((e) => e.data.doc_id),
  );
  const mine = new Set<string>();
  for (const e of events) {
    const d = e.data;
    if (
      (e.type === "STAKEHOLDER" && d.id === stakeholderId) ||
      (e.type.startsWith("TX_") && secIds.has(d.security_id))
    )
      mine.add(e.id);
    if (e.type.startsWith("doc_") && docIds.has(d.doc_id)) mine.add(e.id);
  }
  for (const e of events)
    if ((e.type === "correction" || e.type === "reversal") && mine.has(e.data.target)) mine.add(e.id);
  return events
    .filter((e) => mine.has(e.id))
    .map((e) => ({
      event: e,
      date: typeof e.data.date === "string" ? e.data.date : e.ts.slice(0, 10),
      text: describe(e, s),
      reversed: !live.has(e.id) && e.type !== "correction" && e.type !== "reversal",
      correctable: e.kind === "ocf" && e.type.startsWith("TX_"),
    }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Fields a founder can correct per transaction type: label → dot path. */
export const CORRECTABLE: Record<string, { label: string; path: string }[]> = {
  TX_STOCK_ISSUANCE: [
    { label: "Shares", path: "quantity" },
    { label: "Price per share", path: "share_price.amount" },
    { label: "Date", path: "date" },
  ],
  TX_EQUITY_COMPENSATION_ISSUANCE: [
    { label: "Options", path: "quantity" },
    { label: "Strike price", path: "exercise_price.amount" },
    { label: "Date", path: "date" },
  ],
  TX_CONVERTIBLE_ISSUANCE: [
    { label: "Amount", path: "investment_amount.amount" },
    {
      label: "Valuation cap",
      path: "conversion_triggers.0.conversion_right.conversion_mechanism.conversion_valuation_cap.amount",
    },
    { label: "Date", path: "date" },
  ],
  TX_VESTING_START: [{ label: "Vesting start date", path: "date" }],
};

export function getPath(obj: unknown, path: string): unknown {
  let o: any = obj;
  for (const k of path.split(".")) o = o?.[k];
  return o;
}
