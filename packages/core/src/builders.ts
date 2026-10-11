// Pure builders: one function per founder action, returning OCF/app event drafts ready for appendEvents.
// They never write anything; appendEvents validates and checks invariants.
import { monotonicFactory } from "ulid";
import { addMonths } from "./dates";
import { securityVested } from "./rows";
import type { Data, EventDraft, State } from "./types";
import { startConditionId } from "./vesting";

/** OCF Monetary. The company currency comes from the vault (capfolder.json); USD when not given. */
const money = (amount: string, currency = "USD") => ({ amount, currency });
const ocf = (type: string, data: Data): EventDraft => ({
  kind: "ocf",
  type,
  data: { object_type: type, ...data },
});
const app = (type: string, data: Data): EventDraft => ({ kind: "app", type, data });
const START_DAY = "VESTING_START_DAY_OR_LAST_DAY_OF_MONTH";

// Monotonic: ids made in the same millisecond still sort in creation order (the reducer's last tie-break).
const ulid = monotonicFactory();
export const newId = (prefix: string): string => `${prefix}_${ulid()}`;

/** Next free number for "CS-n" / "OPT-n" / "SAFE-n", across every security in the log (not just the as-of view). */
export function nextSecurityIdNumber(state: State, prefix: "CS" | "OPT" | "SAFE"): number {
  let max = 0;
  for (const id of state.allSecurityIds) {
    const m = new RegExp(`^${prefix}-(\\d+)$`).exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}
export const nextSecurityId = (state: State, prefix: "CS" | "OPT" | "SAFE"): string =>
  `${prefix}-${nextSecurityIdNumber(state, prefix)}`;

export function issuer(p: {
  name: string;
  formationDate: string;
  country?: string;
  subdivision?: string;
}): EventDraft {
  return ocf("ISSUER", {
    id: newId("iss"),
    legal_name: p.name,
    formation_date: p.formationDate,
    country_of_formation: p.country ?? "US",
    ...(p.subdivision === "" ? {} : { country_subdivision_of_formation: p.subdivision ?? "DE" }),
  });
}

export function stockClass(p: {
  currency?: string;
  id?: string;
  name: string;
  authorized: string;
  parValue?: string; // unknown on import: left out (OCF allows that)
  preferred?: boolean;
}): EventDraft {
  return ocf("STOCK_CLASS", {
    id: p.id ?? newId("sc"),
    name: p.name,
    class_type: p.preferred ? "PREFERRED" : "COMMON",
    default_id_prefix: p.preferred ? "PS-" : "CS-",
    initial_shares_authorized: p.authorized,
    votes_per_share: "1",
    seniority: p.preferred ? "2" : "1",
    ...(p.parValue
      ? { par_value: money(p.parValue, p.currency), price_per_share: money(p.parValue, p.currency) }
      : {}),
  });
}

export function stakeholder(p: {
  id?: string;
  name: string;
  email?: string;
  type: "INDIVIDUAL" | "INSTITUTION";
}): EventDraft {
  return ocf("STAKEHOLDER", {
    id: p.id ?? newId("sh"),
    name: { legal_name: p.name },
    stakeholder_type: p.type,
    ...(p.email ? { contact_info: { emails: [{ email_address: p.email, email_type: "BUSINESS" }] } } : {}),
  });
}

/** N months, monthly, with an optional cliff: start → cliff (cliff/N) → monthly (1/N). OCF's official sample shape. */
export function vestingTerms(p: { months: number; cliffMonths: number; id?: string }): EventDraft {
  const { months, cliffMonths: cliff } = p;
  const rel = (length: number, occurrences: number, from: string) => ({
    type: "VESTING_SCHEDULE_RELATIVE",
    relative_to_condition_id: from,
    period: { type: "MONTHS", length, occurrences, day_of_month: START_DAY },
  });
  const span = (m: number) => (m % 12 === 0 ? `${m / 12} year${m === 12 ? "" : "s"}` : `${m} months`);
  const monthly = (from: string, occurrences: number) => ({
    id: "monthly",
    description: `1/${months} each month thereafter`,
    portion: { numerator: "1", denominator: String(months) },
    trigger: rel(1, occurrences, from),
    next_condition_ids: [],
  });
  return ocf("VESTING_TERMS", {
    id: p.id ?? newId("vt"),
    name: `${span(months)}, ${
      cliff
        ? `${span(cliff)
            .replace(/ years?$/, "-year")
            .replace(/ months$/, "-month")} cliff`
        : "no cliff"
    }, monthly`,
    description: `${months} months, ${cliff ? `${cliff}-month cliff, monthly thereafter` : "monthly"}`,
    allocation_type: "CUMULATIVE_ROUND_DOWN",
    vesting_conditions: cliff
      ? [
          {
            id: "vesting-start",
            quantity: "0",
            trigger: { type: "VESTING_START_DATE" },
            next_condition_ids: ["cliff"],
          },
          {
            id: "cliff",
            description: `${Number(((cliff / months) * 100).toFixed(2))}% at ${span(cliff)}`,
            portion: { numerator: String(cliff), denominator: String(months) },
            trigger: rel(cliff, 1, "vesting-start"),
            next_condition_ids: ["monthly"],
          },
          monthly("cliff", months - cliff),
        ]
      : [
          {
            id: "vesting-start",
            quantity: "0",
            trigger: { type: "VESTING_START_DATE" },
            next_condition_ids: ["monthly"],
          },
          monthly("vesting-start", months),
        ],
  });
}

/** 4 years, 1-year cliff, monthly: the official OCF sample shape (same as the acme fixture). */
export const vestingTerms4y1y = (id?: string): EventDraft =>
  vestingTerms({ months: 48, cliffMonths: 12, id });

/** A schedule we don't know (an import gave only "vested so far"): the cap table shows "vesting unknown", never a guess. */
export function vestingTermsUnknown(id?: string): EventDraft {
  return ocf("VESTING_TERMS", {
    id: id ?? newId("vt"),
    name: "Unknown schedule (imported)",
    description: "The import had no vesting schedule. Record the real schedule with a correction.",
    allocation_type: "CUMULATIVE_ROUND_DOWN",
    vesting_conditions: [
      {
        id: "vesting-start",
        quantity: "0",
        trigger: { type: "VESTING_START_DATE" },
        next_condition_ids: ["unknown"],
      },
      {
        id: "unknown",
        description: "Schedule not imported",
        portion: { numerator: "1", denominator: "1" },
        trigger: { type: "VESTING_EVENT" },
        next_condition_ids: [],
      },
    ],
  });
}

function vestingStartDraft(state: State, securityId: string, termsId: string, date: string): EventDraft {
  const terms = state.vestingTerms.get(termsId);
  return ocf("TX_VESTING_START", {
    id: newId("tx"),
    date,
    security_id: securityId,
    vesting_condition_id: (terms && startConditionId(terms)) ?? "vesting-start",
  });
}

export function stockIssuance(p: {
  currency?: string;
  state: State;
  stakeholderId: string;
  classId: string;
  quantity: string;
  price: string;
  date: string;
  vestingTermsId?: string;
  vestingStart?: string;
  securityId?: string;
}): EventDraft[] {
  const securityId = p.securityId ?? nextSecurityId(p.state, "CS");
  const issue = ocf("TX_STOCK_ISSUANCE", {
    id: newId("tx"),
    date: p.date,
    security_id: securityId,
    custom_id: securityId,
    stakeholder_id: p.stakeholderId,
    stock_class_id: p.classId,
    quantity: p.quantity,
    share_price: money(p.price, p.currency),
    stock_legend_ids: [],
    security_law_exemptions: [],
    ...(p.vestingTermsId ? { vesting_terms_id: p.vestingTermsId } : {}),
  });
  if (!p.vestingTermsId) return [issue];
  return [issue, vestingStartDraft(p.state, securityId, p.vestingTermsId, p.vestingStart ?? p.date)];
}

export function stockPlan(p: {
  id?: string;
  name: string;
  reserved: string;
  boardApprovalDate: string;
  classId: string;
}): EventDraft {
  return ocf("STOCK_PLAN", {
    id: p.id ?? newId("plan"),
    plan_name: p.name,
    initial_shares_reserved: p.reserved,
    board_approval_date: p.boardApprovalDate,
    stock_class_ids: [p.classId],
  });
}

export function poolAdjustment(p: { planId: string; newTotal: string; date: string }): EventDraft {
  return ocf("TX_STOCK_PLAN_POOL_ADJUSTMENT", {
    id: newId("tx"),
    date: p.date,
    stock_plan_id: p.planId,
    shares_reserved: p.newTotal,
  });
}

export function optionGrant(p: {
  currency?: string;
  state: State;
  stakeholderId: string;
  planId: string;
  classId: string;
  quantity: string;
  strike: string;
  date: string;
  vestingTermsId?: string;
  vestingStart?: string;
  type?: "OPTION_ISO" | "OPTION_NSO";
  securityId?: string;
}): EventDraft[] {
  const securityId = p.securityId ?? nextSecurityId(p.state, "OPT");
  const type = p.type ?? "OPTION_ISO";
  const grant = ocf("TX_EQUITY_COMPENSATION_ISSUANCE", {
    id: newId("tx"),
    date: p.date,
    security_id: securityId,
    custom_id: securityId,
    stakeholder_id: p.stakeholderId,
    stock_plan_id: p.planId,
    stock_class_id: p.classId,
    compensation_type: type,
    option_grant_type: type === "OPTION_ISO" ? "ISO" : "NSO",
    quantity: p.quantity,
    exercise_price: money(p.strike, p.currency),
    expiration_date: addMonths(p.date, 120, START_DAY),
    termination_exercise_windows: [],
    security_law_exemptions: [],
    ...(p.vestingTermsId ? { vesting_terms_id: p.vestingTermsId } : {}),
  });
  if (!p.vestingTermsId) return [grant];
  return [grant, vestingStartDraft(p.state, securityId, p.vestingTermsId, p.vestingStart ?? p.date)];
}

export function safe(p: {
  currency?: string;
  state: State;
  stakeholderId: string;
  amount: string;
  cap?: string;
  discount?: string;
  mfn: boolean;
  date: string;
  securityId?: string;
}): EventDraft {
  const securityId = p.securityId ?? nextSecurityId(p.state, "SAFE");
  return ocf("TX_CONVERTIBLE_ISSUANCE", {
    id: newId("tx"),
    date: p.date,
    security_id: securityId,
    custom_id: securityId,
    stakeholder_id: p.stakeholderId,
    convertible_type: "SAFE",
    investment_amount: money(p.amount, p.currency),
    seniority: 1,
    security_law_exemptions: [],
    conversion_triggers: [
      {
        trigger_id: `${securityId}.TRIG.1`,
        type: "AUTOMATIC_ON_CONDITION",
        trigger_condition: "Equity financing, liquidity event or dissolution event, as defined in the SAFE",
        conversion_right: {
          type: "CONVERTIBLE_CONVERSION_RIGHT",
          converts_to_future_round: true,
          conversion_mechanism: {
            type: "SAFE_CONVERSION",
            conversion_mfn: p.mfn,
            conversion_timing: "POST_MONEY",
            ...(p.cap ? { conversion_valuation_cap: money(p.cap, p.currency) } : {}),
            ...(p.discount ? { conversion_discount: p.discount } : {}),
          },
        },
      },
    ],
  });
}

/** F-22: cancel what is unvested on the last day and return it to the pool. Empty when nothing is unvested. */
export function termination(p: {
  state: State;
  securityId: string;
  date: string;
  reason: string;
}): EventDraft[] {
  const x = p.state.securities.get(p.securityId);
  if (!x) return [];
  const unvested = securityVested(x, p.state, p.date).unvested ?? 0n;
  if (unvested <= 0n) return [];
  const q = unvested.toString();
  const out = [
    ocf(x.kind === "stock" ? "TX_STOCK_CANCELLATION" : "TX_EQUITY_COMPENSATION_CANCELLATION", {
      id: newId("tx"),
      date: p.date,
      security_id: x.id,
      quantity: q,
      reason_text: p.reason,
    }),
  ];
  if (x.planId)
    out.push(
      ocf("TX_STOCK_PLAN_RETURN_TO_POOL", {
        id: newId("tx"),
        date: p.date,
        security_id: x.id, // OCF requires the security the shares came back from
        stock_plan_id: x.planId,
        quantity: q,
        reason_text: p.reason,
      }),
    );
  return out;
}

/** F-23: options become common stock (a new CS-n for the same holder, at the strike price). */
export function exercise(p: {
  state: State;
  securityId: string;
  quantity: string;
  date: string;
}): EventDraft[] {
  const x = p.state.securities.get(p.securityId);
  if (!x) return [];
  const stockId = nextSecurityId(p.state, "CS");
  const classId = x.classId ?? p.state.plans.get(x.planId ?? "")?.data.stock_class_ids?.[0];
  return [
    ocf("TX_EQUITY_COMPENSATION_EXERCISE", {
      id: newId("tx"),
      date: p.date,
      security_id: x.id,
      quantity: p.quantity,
      resulting_security_ids: [stockId],
    }),
    ...stockIssuance({
      state: p.state,
      stakeholderId: x.stakeholderId,
      classId,
      quantity: p.quantity,
      price: x.price ?? "0",
      currency: x.priceCurrency,
      date: p.date,
      securityId: stockId,
    }),
  ];
}

/** F-24: buy back unvested founder shares at the original price. Empty when nothing is unvested. */
export function repurchaseUnvested(p: { state: State; securityId: string; date: string }): EventDraft[] {
  const x = p.state.securities.get(p.securityId);
  if (x?.kind !== "stock") return [];
  const unvested = securityVested(x, p.state, p.date).unvested ?? 0n;
  if (unvested <= 0n) return [];
  return [
    ocf("TX_STOCK_REPURCHASE", {
      id: newId("tx"),
      date: p.date,
      security_id: x.id,
      quantity: unvested.toString(),
      ...(x.price ? { price: money(x.price, x.priceCurrency) } : {}),
    }),
  ];
}

/** The company's own details changed (name, where it's incorporated): the ISSUER is re-emitted with the same id. */
export function issuerUpdate(p: {
  previous: Data;
  name?: string;
  country?: string;
  subdivision?: string;
}): EventDraft {
  const { object_type: _t, ...prev } = structuredClone(p.previous);
  if (p.name) prev.legal_name = p.name;
  if (p.country) prev.country_of_formation = p.country;
  if (p.subdivision !== undefined) {
    if (p.subdivision) prev.country_subdivision_of_formation = p.subdivision;
    else delete prev.country_subdivision_of_formation;
  }
  return ocf("ISSUER", prev);
}

/** F-19: same person or entity, new name and/or email. The full object is re-emitted with the same id. */
export function stakeholderUpdate(p: { previous: Data; name?: string; email?: string }): EventDraft {
  const { object_type: _t, ...prev } = structuredClone(p.previous);
  if (p.name) prev.name = { ...prev.name, legal_name: p.name };
  if (p.email !== undefined)
    prev.contact_info = p.email
      ? { emails: [{ email_address: p.email, email_type: "BUSINESS" }] }
      : undefined;
  if (!prev.contact_info) delete prev.contact_info;
  return ocf("STAKEHOLDER", prev);
}

export const correction = (p: {
  target: string;
  field: string;
  old: unknown;
  new: unknown;
  reason: string;
}) => app("correction", { target: p.target, field: p.field, old: p.old, new: p.new, reason: p.reason });
export const reversal = (p: { target: string; reason: string }) => app("reversal", p);
export const note = (p: { text: string }) => app("note", p);
export const docAdded = (p: {
  docId: string;
  path: string;
  sha256: string;
  docType: string;
  originalName: string;
  fields?: Data;
  flags?: string[];
}) =>
  app("doc_added", {
    doc_id: p.docId,
    path: p.path,
    sha256: p.sha256,
    doc_type: p.docType,
    original_name: p.originalName,
    fields: p.fields ?? {},
    flags: p.flags ?? [],
  });
export const docLinked = (p: { docId: string; target: string }) =>
  app("doc_linked", { doc_id: p.docId, target: p.target });
export const stakeholderAlias = (p: { stakeholderId: string; alias: string }) =>
  app("stakeholder_alias", { stakeholder_id: p.stakeholderId, alias: p.alias });
export const docRemoved = (p: { docId: string; movedTo: string }) =>
  app("doc_removed", { doc_id: p.docId, moved_to: p.movedTo });
