import { datePart } from "./dates";
import { fmtInt, parseDec, subDec, toInt } from "./num";
import { securityVested } from "./rows";
import { normName } from "./text";
import type { Data, Security, State, VaultEvent } from "./types";

const APP_IGNORED = new Set([
  "vault_created",
  "note",
  "rebaseline",
  "schema_migrated",
  "envelope_sent",
  "envelope_signed",
  "envelope_voided",
  "wire_sent",
  "doc_replaced",
]);

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** Sets a dot path (numeric parts index arrays). Returns a problem string instead of writing when the path is unsafe or missing. */
function setPath(obj: Data, path: string, value: unknown): string | undefined {
  const keys = String(path).split(".");
  if (keys.some((k) => FORBIDDEN_KEYS.has(k))) return "is not allowed";
  let o: any = obj;
  for (const k of keys.slice(0, -1)) {
    if (o === null || typeof o !== "object" || !Object.hasOwn(o, k)) return "does not exist on the target";
    o = o[k];
  }
  if (o === null || typeof o !== "object") return "does not exist on the target";
  o[keys.at(-1)!] = value;
  return undefined;
}

/** Drop reversed events and reversals, apply corrections (in file order) to copies of their targets. */
export function liveEvents(events: VaultEvent[], problems: string[] = []): VaultEvent[] {
  const reversed = new Set(events.filter((e) => e.type === "reversal").map((e) => e.data.target));
  const kept = events.filter((e) => e.type !== "reversal" && !reversed.has(e.id));
  const byId = new Map(kept.map((e) => [e.id, { ...e, data: structuredClone(e.data) }]));
  for (const e of kept) {
    if (e.type !== "correction") continue;
    const target = byId.get(e.data.target);
    const problem = target && setPath(target.data, e.data.field, e.data.new);
    if (problem) problems.push(`Correction ${e.id}: field ${e.data.field} ${problem}`);
  }
  return [...byId.values()].filter((e) => e.type !== "correction");
}

const isTx = (e: VaultEvent) => e.kind === "ocf" && e.type.startsWith("TX_");
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
// OCF 1.2.0 still accepts the deprecated TX_PLAN_SECURITY_* names for equity compensation.
export const txType = (t: string) => t.replace(/^TX_PLAN_SECURITY_/, "TX_EQUITY_COMPENSATION_");

export function reduce(events: VaultEvent[], asOf: string): State {
  const s: State = {
    asOf,
    stakeholders: new Map(),
    classes: new Map(),
    plans: new Map(),
    vestingTerms: new Map(),
    valuations: [],
    securities: new Map(),
    docs: new Map(),
    aliases: new Map(),
    unknownEventTypes: [],
    violations: [],
    allSecurityIds: new Set(),
  };
  const live = liveEvents(events, s.violations);
  // From every event, reversed ones included: a reversed CS-3 must not be handed out again (its docs still point at it).
  for (const e of events)
    if (isTx(e) && typeof e.data?.security_id === "string") s.allSecurityIds.add(e.data.security_id);
  const unknown = (t: string) => {
    if (!s.unknownEventTypes.includes(t)) s.unknownEventTypes.push(t);
  };
  const fail = (e: VaultEvent, msg: string) => s.violations.push(`${e.type} ${e.data?.id}: ${msg}`);
  /** A whole share count ≥ min, or a violation. */
  const qty = (e: VaultEvent, field: string, min = 1n): bigint | undefined => {
    try {
      const q = toInt(e.data[field]);
      if (q < min) throw new Error(`${field} must be ${min === 1n ? "greater than 0" : "0 or more"}`);
      return q;
    } catch (err) {
      fail(e, (err as Error).message);
      return undefined;
    }
  };
  /** A money amount > 0 (kept as its OCF string), or a violation. */
  const money = (e: VaultEvent, value: unknown, label: string): string | undefined => {
    try {
      if (parseDec(value as string).v > 0n) return value as string;
      fail(e, `${label} must be greater than 0`);
    } catch (err) {
      fail(e, (err as Error).message);
    }
    return undefined;
  };
  /** Schema-valid data can still be unusable; one bad event becomes a violation instead of breaking the vault. */
  const guard = (e: VaultEvent, apply: () => void) => {
    try {
      apply();
    } catch (err) {
      fail(e, `could not be read (${(err as Error).message})`);
    }
  };
  const refsOk = (e: VaultEvent): boolean => {
    const d = e.data;
    const missing =
      (!s.stakeholders.has(d.stakeholder_id) && `stakeholder ${d.stakeholder_id}`) ||
      (d.stock_class_id !== undefined && !s.classes.has(d.stock_class_id) && `class ${d.stock_class_id}`) ||
      (d.stock_plan_id !== undefined && !s.plans.has(d.stock_plan_id) && `plan ${d.stock_plan_id}`);
    if (missing) s.violations.push(`${e.type} ${d.id} refers to unknown ${missing}`);
    if (!missing && s.securities.has(d.security_id)) fail(e, `security ${d.security_id} already exists`);
    return !missing && !s.securities.has(d.security_id);
  };

  // 1. Definitions (no date): always present, except plans approved after asOf.
  for (const e of live) {
    if (e.kind !== "ocf" || isTx(e)) continue;
    guard(e, () => defineObject(e));
  }
  function defineObject(e: VaultEvent): void {
    const d = e.data;
    switch (e.type) {
      case "ISSUER":
        s.issuer = d;
        break;
      case "STAKEHOLDER":
        s.stakeholders.set(d.id, d);
        break;
      case "STOCK_CLASS": {
        const authorized = qty(e, "initial_shares_authorized", 0n);
        if (authorized !== undefined) s.classes.set(d.id, { data: d, authorized });
        break;
      }
      case "STOCK_PLAN": {
        if (d.board_approval_date && d.board_approval_date > asOf) break;
        const reserved = qty(e, "initial_shares_reserved", 0n);
        if (reserved !== undefined) s.plans.set(d.id, { data: d, reserved, returned: 0n });
        break;
      }
      case "VESTING_TERMS":
        s.vestingTerms.set(d.id, d);
        break;
      case "VALUATION":
        if (d.effective_date <= asOf) s.valuations.push(d);
        break;
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

  // A vesting start may be dated before the grant (vesting commencement before the board approved it, or shares
  // that moved by transfer and keep their old schedule): it waits for the issuance of its security.
  const issuedLater = new Set(
    live
      .filter(isTx)
      .filter((e) => /_ISSUANCE$/.test(txType(e.type)))
      .map((e) => e.data.security_id as string),
  );
  const pendingStart = new Map<string, Security["vestingStart"]>();
  for (const e of txs) guard(e, () => applyTx(e));
  function applyTx(e: VaultEvent): void {
    const d = e.data;
    switch (txType(e.type)) {
      case "TX_STOCK_ISSUANCE":
      case "TX_EQUITY_COMPENSATION_ISSUANCE": {
        const q = qty(e, "quantity");
        if (q === undefined || !refsOk(e)) break;
        let vested = 0n;
        for (const v of d.vestings ?? []) {
          const a = toInt(v.amount);
          if (a < 0n) return void fail(e, "vesting amount must be 0 or more");
          vested += a;
        }
        if (vested > q)
          return void fail(e, `vestings add up to ${fmtInt(vested)}, more than the ${fmtInt(q)} granted`);
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
          price: (stock ? d.share_price : d.exercise_price)?.amount,
          priceCurrency: (stock ? d.share_price : d.exercise_price)?.currency,
          expires: d.expiration_date,
          vestingStart: pendingStart.get(d.security_id),
        });
        break;
      }
      case "TX_CONVERTIBLE_ISSUANCE": {
        const amount = money(e, d.investment_amount?.amount, "investment amount");
        if (amount === undefined || !refsOk(e)) break;
        const mech = (d.conversion_triggers ?? [])
          .map((t: Data) => t.conversion_right?.conversion_mechanism)
          .find((m: Data | undefined) => m?.type === "SAFE_CONVERSION");
        const rawCap = mech?.conversion_valuation_cap?.amount;
        const cap = rawCap === undefined ? undefined : money(e, rawCap, "valuation cap");
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
          amount,
          currency: d.investment_amount?.currency,
          cap,
          discount: mech?.conversion_discount,
          timing: mech?.conversion_timing,
          mfn: mech?.conversion_mfn === true,
          earlyExercisable: false,
          note: e.meta?.note,
        });
        break;
      }
      case "TX_VESTING_START": {
        const start = { date: d.date, conditionId: d.vesting_condition_id };
        if (!s.securities.has(d.security_id) && issuedLater.has(d.security_id))
          pendingStart.set(d.security_id, start);
        else {
          const x = sec(e);
          if (x) x.vestingStart = start;
        }
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
      case "TX_STOCK_TRANSFER": {
        // the new holder's shares (and any balance) are issued by their own TX_STOCK_ISSUANCE
        const x = sec(e);
        const q = qty(e, "quantity");
        if (x && q !== undefined) consume(e, x, q, false);
        break;
      }
      case "TX_CONVERTIBLE_TRANSFER": {
        const amount = money(e, d.amount?.amount, "amount");
        const x = amount === undefined ? undefined : sec(e);
        if (!x) break;
        const left = subDec(x.amount!, amount!);
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
  for (const e of apps) guard(e, () => applyApp(e));
  function applyApp(e: VaultEvent): void {
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
      case "doc_renamed":
        if (doc && typeof d.path === "string") doc.data = { ...doc.data, path: d.path };
        break;
      case "stakeholder_alias":
        if (typeof d.alias === "string" && typeof d.stakeholder_id === "string")
          s.aliases.set(normName(d.alias), d.stakeholder_id);
        break;
      default:
        if (!APP_IGNORED.has(e.type)) unknown(e.type);
    }
  }
  return s;
}
