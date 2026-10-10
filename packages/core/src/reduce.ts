import { datePart } from "./dates";
import { fmtInt, parseDec, subDec, toInt } from "./num";
import { securityVested } from "./rows";
import type { Data, Security, State, VaultEvent } from "./types";

const APP_IGNORED = new Set([
  "vault_created",
  "stakeholder_alias",
  "note",
  "rebaseline",
  "schema_migrated",
  "envelope_sent",
  "envelope_signed",
  "envelope_voided",
  "doc_replaced",
]);

function setPath(obj: Data, path: string, value: unknown): void {
  const keys = path.split(".");
  let o: any = obj;
  for (const k of keys.slice(0, -1)) o = o[k];
  o[keys.at(-1)!] = value;
}

/** Drop reversed events and reversals, apply corrections (in file order) to copies of their targets. */
export function liveEvents(events: VaultEvent[]): VaultEvent[] {
  const reversed = new Set(events.filter((e) => e.type === "reversal").map((e) => e.data.target));
  const kept = events.filter((e) => e.type !== "reversal" && !reversed.has(e.id));
  const byId = new Map(kept.map((e) => [e.id, { ...e, data: structuredClone(e.data) }]));
  for (const e of kept) {
    if (e.type !== "correction") continue;
    const target = byId.get(e.data.target);
    if (target) setPath(target.data, e.data.field, e.data.new);
  }
  return [...byId.values()].filter((e) => e.type !== "correction");
}

const isTx = (e: VaultEvent) => e.kind === "ocf" && e.type.startsWith("TX_");
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
// OCF 1.2.0 still accepts the deprecated TX_PLAN_SECURITY_* names for equity compensation.
const txType = (t: string) => t.replace(/^TX_PLAN_SECURITY_/, "TX_EQUITY_COMPENSATION_");

export function reduce(events: VaultEvent[], asOf: string): State {
  const s: State = {
    asOf,
    stakeholders: new Map(),
    classes: new Map(),
    plans: new Map(),
    vestingTerms: new Map(),
    securities: new Map(),
    docs: new Map(),
    unknownEventTypes: [],
    violations: [],
  };
  const live = liveEvents(events);
  const unknown = (t: string) => {
    if (!s.unknownEventTypes.includes(t)) s.unknownEventTypes.push(t);
  };
  const qty = (e: VaultEvent, field: string): bigint | undefined => {
    try {
      const q = toInt(e.data[field]);
      if (q <= 0n) throw new Error(`${field} must be greater than 0`);
      return q;
    } catch (err) {
      s.violations.push(`${e.type} ${e.data.id}: ${(err as Error).message}`);
      return undefined;
    }
  };

  // 1. Definitions (no date): always present, except plans approved after asOf.
  for (const e of live) {
    if (e.kind !== "ocf" || isTx(e)) continue;
    const d = e.data;
    switch (e.type) {
      case "ISSUER":
        s.issuer = d;
        break;
      case "STAKEHOLDER":
        s.stakeholders.set(d.id, d);
        break;
      case "STOCK_CLASS":
        s.classes.set(d.id, { data: d, authorized: toInt(d.initial_shares_authorized) });
        break;
      case "STOCK_PLAN":
        if (!d.board_approval_date || d.board_approval_date <= asOf)
          s.plans.set(d.id, { data: d, reserved: toInt(d.initial_shares_reserved), returned: 0n });
        break;
      case "VESTING_TERMS":
        s.vestingTerms.set(d.id, d);
        break;
      case "VALUATION":
      case "STOCK_LEGEND_TEMPLATE":
      case "DOCUMENT":
        break;
      default:
        unknown(e.type);
    }
  }

  // 2. Transactions up to asOf, in deterministic order (never by seq).
  const txs = live
    .filter((e) => isTx(e) && e.data.date <= asOf)
    .sort((a, b) => cmp(a.data.date, b.data.date) || cmp(a.ts, b.ts) || cmp(a.id, b.id));
  const sec = (e: VaultEvent): Security | undefined => {
    const x = s.securities.get(e.data.security_id);
    if (!x) s.violations.push(`${e.type} ${e.data.id} refers to unknown security ${e.data.security_id}`);
    return x;
  };
  const consume = (e: VaultEvent, x: Security, q: bigint, stopsVesting: boolean): boolean => {
    if (q > x.quantity) {
      s.violations.push(
        `${e.type} ${e.data.id}: ${fmtInt(q)} is more than the ${fmtInt(x.quantity)} outstanding on ${x.id}`,
      );
      return false;
    }
    // Strict OCF: with balance_security_id the remainder is re-issued as a new security, so the source closes.
    x.quantity = e.data.balance_security_id ? 0n : x.quantity - q;
    if (stopsVesting) x.stoppedAt = e.data.date;
    return true;
  };

  for (const e of txs) {
    const d = e.data;
    switch (txType(e.type)) {
      case "TX_STOCK_ISSUANCE":
      case "TX_EQUITY_COMPENSATION_ISSUANCE": {
        const q = qty(e, "quantity");
        if (q === undefined) break;
        const stock = e.type === "TX_STOCK_ISSUANCE";
        s.securities.set(d.security_id, {
          id: d.security_id,
          txId: d.id,
          kind: stock ? "stock" : "equity",
          stakeholderId: d.stakeholder_id,
          date: d.date,
          classId: d.stock_class_id,
          planId: d.stock_plan_id,
          compensationType: d.compensation_type,
          originalQuantity: q,
          quantity: q,
          exercised: 0n,
          vestingTermsId: d.vesting_terms_id,
          vestings: d.vestings,
          earlyExercisable: d.early_exercisable === true,
          note: e.meta?.note,
        });
        break;
      }
      case "TX_CONVERTIBLE_ISSUANCE": {
        const mech = (d.conversion_triggers ?? [])
          .map((t: Data) => t.conversion_right?.conversion_mechanism)
          .find((m: Data | undefined) => m?.type === "SAFE_CONVERSION");
        s.securities.set(d.security_id, {
          id: d.security_id,
          txId: d.id,
          kind: "convertible",
          stakeholderId: d.stakeholder_id,
          date: d.date,
          convertibleType: d.convertible_type,
          originalQuantity: 0n,
          quantity: 0n,
          exercised: 0n,
          amount: d.investment_amount.amount,
          cap: mech?.conversion_valuation_cap?.amount,
          discount: mech?.conversion_discount,
          timing: mech?.conversion_timing,
          earlyExercisable: false,
          note: e.meta?.note,
        });
        break;
      }
      case "TX_VESTING_START": {
        const x = sec(e);
        if (x) x.vestingStart = { date: d.date, conditionId: d.vesting_condition_id };
        break;
      }
      case "TX_STOCK_CANCELLATION":
      case "TX_EQUITY_COMPENSATION_CANCELLATION":
      case "TX_STOCK_REPURCHASE": {
        const x = sec(e);
        const q = d.quantity === undefined && x ? x.quantity : qty(e, "quantity");
        if (x && q !== undefined) consume(e, x, q, true);
        break;
      }
      case "TX_EQUITY_COMPENSATION_EXERCISE": {
        const x = sec(e);
        const q = qty(e, "quantity");
        if (!x || q === undefined) break;
        const v = securityVested(x, s, d.date);
        if (!x.earlyExercisable && v.vested !== null && q > v.vested)
          s.violations.push(
            `Exercise ${d.id}: ${fmtInt(q)} is more than the ${fmtInt(v.vested)} vested on ${d.date}`,
          );
        else if (consume(e, x, q, false)) x.exercised += q;
        break;
      }
      case "TX_CONVERTIBLE_TRANSFER": {
        const x = sec(e);
        if (!x) break;
        const left = subDec(x.amount!, d.amount.amount);
        if (parseDec(left).v < 0n)
          s.violations.push(
            `Transfer ${d.id}: ${d.amount.amount} is more than the ${x.amount} outstanding on ${x.id}`,
          );
        else x.amount = d.balance_security_id ? "0" : left;
        break;
      }
      case "TX_STOCK_PLAN_POOL_ADJUSTMENT": {
        const p = s.plans.get(d.stock_plan_id);
        const q = qty(e, "shares_reserved");
        if (p && q !== undefined) p.reserved = q; // OCF: the new total, not a delta
        break;
      }
      case "TX_STOCK_PLAN_RETURN_TO_POOL": {
        const p = s.plans.get(d.stock_plan_id);
        const q = qty(e, "quantity");
        if (p && q !== undefined) p.returned += q;
        break;
      }
      case "TX_STOCK_CLASS_AUTHORIZED_SHARES_ADJUSTMENT": {
        const c = s.classes.get(d.stock_class_id);
        const q = qty(e, "new_shares_authorized");
        if (c && q !== undefined) c.authorized = q;
        break;
      }
      default:
        unknown(e.type);
    }
  }

  // 3. App events up to asOf.
  const apps = live
    .filter((e) => e.kind === "app" && datePart(e.ts) <= asOf)
    .sort((a, b) => cmp(a.ts, b.ts) || cmp(a.id, b.id));
  for (const e of apps) {
    const d = e.data;
    const doc = s.docs.get(d.doc_id);
    switch (e.type) {
      case "doc_added":
        s.docs.set(d.doc_id, { data: d, links: new Set(), removed: false });
        break;
      case "doc_linked":
        doc?.links.add(d.target);
        break;
      case "doc_unlinked":
        doc?.links.delete(d.target);
        break;
      case "doc_removed":
        if (doc) doc.removed = true;
        break;
      default:
        if (!APP_IGNORED.has(e.type)) unknown(e.type);
    }
  }
  return s;
}
