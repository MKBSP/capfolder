// Generic spreadsheet → OCF drafts (docs/04 §3–5): one position per row, people deduped, vesting built or marked unknown.
import * as b from "../builders";
import { checkInvariants } from "../invariants";
import { fmtInt, parseLocalNumber, subDec, sumDec } from "../num";
import { validateOcf } from "../ocf/validate";
import { reduce } from "../reduce";
import { capTableRows } from "../rows";
import { normName } from "../text";
import { capTableTotals } from "../totals";
import type { EventDraft, Row, VaultEvent } from "../types";
import { vestedAt } from "../vesting";
import type { Field } from "./fields";

export { normName };

export interface ImportInput {
  header: string[];
  rows: string[][];
  mapping: (Field | null)[];
  firstRow: number; // spreadsheet row number of rows[0], for messages
  exportDate: string; // date of the export: used when a row has no issue date
  authorized?: Record<string, string>; // per class name; default = issued (+ the pool for the plan's class)
  preferred?: Record<string, boolean>; // per class name: the founder's override of common/preferred
  poolReserved?: string; // the plan's total reserve; default = granted + the sheet's "available" pool row
  date1904?: boolean; // the workbook counts serial dates from 1904 (old Mac Excel)
  decimalMark?: "." | ","; // the founder's own, used when the file doesn't make it clear
  currency?: string; // the company currency for prices and SAFE amounts (default USD)
}

export interface ImportSummary {
  fullyDiluted: bigint;
  stakeholders: number;
  safeTotal: string;
  perClass: { name: string; outstanding: bigint }[];
  optionsOutstanding: bigint;
  poolAvailable: bigint;
}

export interface ImportResult {
  drafts: EventDraft[];
  issues: string[];
  warnings: string[]; // shown, but don't block saving
  summary: ImportSummary;
  classes: { name: string; issued: bigint; preferred: boolean }[];
  defaultAuthorized: Record<string, bigint>;
  optionsGranted: bigint;
  poolAvailable: bigint; // from the sheet's pool row(s)
  rows: Row[]; // the cap table this import would give
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const DATE_FIELDS: Field[] = ["issueDate", "vestingStart"];
const NUMBER_FIELDS: Field[] = ["shares", "price", "strike", "vested", "safeAmount", "safeCap"];
const INSTITUTION =
  /\b(inc|llc|l\.?l\.?c|l\.?p|ltd|limited|gmbh|s\.?a|corp|corporation|company|co|fund|ventures?|capital|partners|holdings|combinator|trust|foundation|bank|group|labs|spv)\b\.?/i;
const PREFERRED_CLASS = /prefer|\bseries\b|\bseed\b/i;
const TOTAL_ROW = /^(sub-?|grand\s+)?totals?\b/i;
const POOL_NAME = /option pool|pool \(?available|unallocated|unissued|available for grant/i;
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) =>
  m >= 1 && m <= 12 && d >= 1 && d <= new Date(Date.UTC(y, m, 0)).getUTCDate()
    ? `${y}-${pad(m)}-${pad(d)}`
    : null;
const numericParts = (v: string) => /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(v.trim());

/** A spreadsheet date → ISO. Numeric a/b/yyyy is month-first unless the column is day-first. */
export function parseDate(raw: string, dayFirst: boolean, date1904: boolean): string | null {
  const v = raw.trim().toLowerCase().replace(/,/g, " ").replace(/\s+/g, " ");
  if (!v) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[t ].*)?$/.exec(v);
  if (m) return iso(+m[1]!, +m[2]!, +m[3]!);
  m = numericParts(v);
  if (m) return dayFirst ? iso(+m[3]!, +m[2]!, +m[1]!) : iso(+m[3]!, +m[1]!, +m[2]!);
  if (/^\d{5}(\.\d+)?$/.test(v)) {
    // Excel serial: 1900 system (with its 1900-leap-year quirk) or 1904 system
    const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
    return new Date(epoch + Math.floor(Number(v)) * 86400000).toISOString().slice(0, 10);
  }
  const month = (s: string) => MONTHS.findIndex((x) => s.startsWith(x)) + 1;
  m = /^([a-z]{3,9})\.? (\d{1,2}) (\d{4})$/.exec(v); // Mar 14 2023
  if (m && month(m[1]!)) return iso(+m[3]!, month(m[1]!), +m[2]!);
  m = /^(\d{1,2}) ([a-z]{3,9})\.? (\d{4})$/.exec(v); // 14 Mar 2023
  if (m && month(m[2]!)) return iso(+m[3]!, month(m[2]!), +m[1]!);
  return null;
}

/** True when the file writes decimals with a comma (1.000.000 / 0,50), as European Excel does. Ties: the founder's own. */
function usesDecimalComma(values: string[], fallback: boolean): boolean {
  let comma = 0;
  let dot = 0;
  for (const raw of values) {
    const v = raw.replace(/[$€£\s]/g, "");
    if (/\.\d{3}\.|\.\d{3},\d|^\d+,\d{1,2}$|^0,\d+$/.test(v)) comma++; // "250.000" alone is ambiguous
    if (/,\d{3},|,\d{3}\.\d|^\d+\.\d{1,2}$|^0\.\d+$/.test(v)) dot++; // so is "250,000"
  }
  return comma === dot ? fallback : comma > dot;
}

/** "$1,000.50" / "1.000,50" → "1000.50"; null when it isn't a plain non-negative number. */
const parseAmount = (raw: string, decimalComma: boolean) => parseLocalNumber(raw, decimalComma ? "," : ".");

/** Whole shares: "1,000,000" and "1000.00" are fine, "1.5" isn't. */
function parseWhole(raw: string, decimalComma: boolean): bigint | null {
  const v = parseAmount(raw, decimalComma);
  if (!v || !/^\d+(\.0+)?$/.test(v)) return null;
  const n = BigInt(v.split(".")[0]!);
  return n > 0n ? n : null;
}

function kindOf(raw: string, has: { safe: boolean; strike: boolean }) {
  const k = raw.toLowerCase();
  if (!k) return has.safe ? "safe" : has.strike ? "option" : "stock";
  if (/\bpool\b|available for grant|unallocated|unissued/.test(k)) return "pool";
  if (/\bsafe\b/.test(k)) return "safe";
  if (/option|\biso\b|\bnso\b|\bnqso\b/.test(k)) return "option";
  if (/prefer/.test(k)) return "preferred";
  if (/common|ordinary|stock|share|founder/.test(k)) return "stock";
  return `unsupported:${raw}`;
}

export function buildImport(p: ImportInput): ImportResult {
  const col = new Map(p.mapping.flatMap((f, i) => (f ? [[f, i] as const] : [])));
  const cell = (r: string[], f: Field) => (col.has(f) ? (r[col.get(f)!] ?? "").trim() : "");
  const dayFirst = new Map(
    DATE_FIELDS.map((f) => [f, p.rows.some((r) => Number(numericParts(cell(r, f))?.[1] ?? 0) > 12)]),
  );
  const decimalComma = usesDecimalComma(
    p.rows.flatMap((r) => NUMBER_FIELDS.map((f) => cell(r, f))),
    p.decimalMark === ",",
  );
  const amount = (r: string[], f: Field) => parseAmount(cell(r, f), decimalComma);
  const date = (raw: string, f: Field) => parseDate(raw, dayFirst.get(f)!, !!p.date1904);
  const issues: string[] = [];
  const warnings: string[] = [];
  type Person = { id: string; name: string; email: string; type: "INSTITUTION" | "INDIVIDUAL" };
  const people = new Map<string, Person>();
  const terms = new Map<string, EventDraft>();
  type Vest = { terms: string; start: string };
  const stock: {
    label: string;
    holder: string;
    cls: string;
    preferredRow: boolean;
    qty: bigint;
    price: string;
    date: string;
    snapshot: boolean;
    vest?: Vest;
  }[] = [];
  const grants: {
    label: string;
    holder: string;
    cls: string;
    qty: bigint;
    strike: string;
    date: string;
    snapshot: boolean;
    vest?: Vest;
  }[] = [];
  const safes: { label: string; draft: (id: string) => EventDraft; snapshot: boolean }[] = [];
  let poolAvailable = 0n;
  const empty = reduce([], "9999-12-31");

  /** Same email = same person, if the names agree; no email: same normalized name. */
  const person = (name: string, email: string, typeCell: string, label: string): string | null => {
    const nKey = `n:${normName(name)}`;
    const eKey = email ? `e:${email.toLowerCase()}` : "";
    const byEmail = eKey ? people.get(eKey) : undefined;
    if (byEmail) {
      if (normName(byEmail.name) === normName(name)) return byEmail.id;
      issues.push(
        `${label}: same email as ${byEmail.name} (${email}). Use one name, or give each its own email.`,
      );
      return null;
    }
    const byName = people.get(nKey);
    if (byName && (!email || !byName.email)) {
      if (eKey) {
        byName.email = email;
        people.set(eKey, byName);
      }
      return byName.id;
    }
    const t = typeCell.toLowerCase();
    const type = /individual|person|natural|employee|founder/.test(t)
      ? "INDIVIDUAL"
      : /entity|institution|company|corporat|fund|llc|trust|partnership|organi/.test(t)
        ? "INSTITUTION"
        : INSTITUTION.test(name)
          ? "INSTITUTION"
          : "INDIVIDUAL";
    const rec: Person = { id: b.newId("sh"), name, email, type };
    if (!byName) people.set(nKey, rec);
    if (eKey) people.set(eKey, rec);
    return rec.id;
  };

  const vestingFor = (r: string[], qty: bigint, issue: string, label: string): Vest | undefined | false => {
    const vested = cell(r, "vested") ? (parseWhole(cell(r, "vested"), decimalComma) ?? 0n) : null;
    if (vested !== null && vested > qty) {
      issues.push(`${label}: ${fmtInt(vested)} vested is more than the ${fmtInt(qty)} granted`);
      return false;
    }
    const months = cell(r, "vestingMonths");
    const startRaw = cell(r, "vestingStart");
    if (startRaw && !months) {
      issues.push(`${label}: vesting start given but no vesting length (months)`);
      return false;
    }
    if (months) {
      const start = startRaw ? date(startRaw, "vestingStart") : issue;
      const m = Number(months);
      const cliff = Number(cell(r, "cliffMonths") || "0");
      if (!start) {
        issues.push(`${label}: vesting start "${startRaw}" isn't a date`);
        return false;
      }
      if (!Number.isInteger(m) || m < 1 || !Number.isInteger(cliff) || cliff < 0 || cliff >= m) {
        issues.push(
          `${label}: vesting length ${months} months with a ${cliff || 0}-month cliff doesn't work`,
        );
        return false;
      }
      const key = `${m}/${cliff}`;
      if (!terms.has(key)) terms.set(key, b.vestingTerms({ months: m, cliffMonths: cliff }));
      const ours = vested === null ? null : vestedAt(qty, terms.get(key)!.data, start, p.exportDate).vested;
      // ponytail: 1 share of rounding allowed (tools round months differently)
      if (ours !== null && vested !== null && (ours - vested > 1n || vested - ours > 1n))
        warnings.push(
          `${label}: the file says ${fmtInt(vested)} vested, Capfolder works out ${fmtInt(ours)}. Check the vesting start or cliff.`,
        );
      return { terms: terms.get(key)!.data.id as string, start };
    }
    if (vested !== null && vested < qty) {
      if (!terms.has("unknown")) terms.set("unknown", b.vestingTermsUnknown());
      return { terms: terms.get("unknown")!.data.id as string, start: issue };
    }
    return undefined;
  };

  for (const [i, r] of p.rows.entries()) {
    if (r.every((c) => !c.trim())) continue;
    const name = cell(r, "name");
    if (TOTAL_ROW.test(name)) continue;
    const at = `Row ${p.firstRow + i}`;
    const label = name ? `${at} (${name})` : at;
    const cls = cell(r, "class");
    const safeRaw = cell(r, "safeAmount");
    const strikeRaw = cell(r, "strike");
    const kind = kindOf(cell(r, "kind"), { safe: !!safeRaw, strike: !!strikeRaw });
    const sharesRaw = cell(r, "shares");
    if (kind === "pool" || POOL_NAME.test(name)) {
      const q = parseWhole(sharesRaw, decimalComma);
      if (q) poolAvailable += q;
      else if (sharesRaw) issues.push(`${label}: pool size "${sharesRaw}" isn't a whole number`);
      continue;
    }
    if (kind.startsWith("unsupported:")) {
      issues.push(
        `${label}: "${kind.slice(12)}" isn't supported yet (common, preferred, options and SAFEs are)`,
      );
      continue;
    }
    if (!name) {
      issues.push(`${at}: name missing`);
      continue;
    }
    const dateRaw = cell(r, "issueDate");
    const parsed = dateRaw ? date(dateRaw, "issueDate") : null;
    if (dateRaw && !parsed) {
      issues.push(`${label}: issue date "${dateRaw}" isn't a date`);
      continue;
    }
    const issued = parsed ?? p.exportDate;
    const snapshot = !parsed;
    const holder = person(name, cell(r, "email"), cell(r, "holderType"), label);
    if (!holder) continue;

    if (kind === "safe") {
      const amt = amount(r, "safeAmount");
      if (!safeRaw) {
        issues.push(`${label}: SAFE amount missing`);
        continue;
      }
      if (!amt) {
        issues.push(`${label}: SAFE amount "${safeRaw}" isn't a number`);
        continue;
      }
      const capRaw = cell(r, "safeCap");
      const cap = capRaw ? amount(r, "safeCap") : null;
      if (capRaw && !cap) {
        issues.push(`${label}: valuation cap "${capRaw}" isn't a number`);
        continue;
      }
      const discRaw = cell(r, "safeDiscount").replace(/\s/g, "");
      let discount: string | undefined;
      if (discRaw) {
        // "20%" and "20" are percents; "0.2" is a fraction (same rule as the New SAFE form)
        const n = discRaw.replace("%", "").replace(",", ".");
        if (!/^\d+(\.\d+)?$/.test(n) || Number(n) > 100) {
          issues.push(`${label}: discount "${discRaw}" isn't a number`);
          continue;
        }
        discount =
          discRaw.endsWith("%") || !n.includes(".")
            ? (Number(n) / 100).toFixed(4).replace(/(\.\d\d\d*?)0+$/, "$1")
            : n;
      }
      const mfn = /^(y|yes|true|x|1|✓|sim)$/i.test(cell(r, "safeMfn"));
      safes.push({
        label,
        snapshot,
        draft: (securityId) =>
          b.safe({
            state: empty,
            currency: p.currency,
            stakeholderId: holder,
            amount: amt,
            cap: cap ?? undefined,
            discount,
            mfn,
            date: issued,
            securityId,
          }),
      });
      continue;
    }

    const qty = parseWhole(sharesRaw, decimalComma);
    if (!qty) {
      issues.push(`${label}: shares must be a whole number above 0, got "${sharesRaw}"`);
      continue;
    }
    const vest = vestingFor(r, qty, issued, label);
    if (vest === false) continue;
    if (kind === "option") {
      if (!strikeRaw) {
        issues.push(`${label}: strike price missing`);
        continue;
      }
      const strike = amount(r, "strike");
      if (!strike) {
        issues.push(`${label}: strike price "${strikeRaw}" isn't a number`);
        continue;
      }
      grants.push({ label, holder, cls, qty, strike, date: issued, snapshot, vest });
      continue;
    }
    const priceRaw = cell(r, "price");
    const price = priceRaw ? amount(r, "price") : "0";
    if (!price) {
      issues.push(`${label}: price "${priceRaw}" isn't a number`);
      continue;
    }
    const preferredRow = kind === "preferred";
    stock.push({
      label,
      holder,
      cls: cls || (preferredRow ? "Preferred" : "Common"),
      preferredRow,
      qty,
      price,
      date: issued,
      snapshot,
      vest,
    });
  }

  // Classes: preferred if the founder says so, else if any of its rows or its name says so.
  const classes = new Map<string, { id: string; name: string; issued: bigint; preferred: boolean }>();
  for (const s of stock) {
    const c = classes.get(s.cls) ?? { id: b.newId("sc"), name: s.cls, issued: 0n, preferred: false };
    c.issued += s.qty;
    c.preferred ||= s.preferredRow || PREFERRED_CLASS.test(s.cls);
    classes.set(s.cls, c);
  }
  for (const c of classes.values())
    if (p.preferred && c.name in p.preferred) c.preferred = !!p.preferred[c.name];

  // Options and the pool live in a stock plan on a common class: the option's own class, else the first common one.
  const optionsGranted = grants.reduce((a, g) => a + g.qty, 0n);
  const planDrafts: EventDraft[] = [];
  let planClass: { id: string; name: string } | undefined;
  let planReserve = 0n;
  if (grants.length || poolAvailable > 0n || p.poolReserved?.trim()) {
    for (const g of grants)
      if (g.cls && classes.get(g.cls)?.preferred)
        issues.push(`${g.label}: options are on common stock, but ${g.cls} is preferred`);
    const named = grants.find((g) => g.cls && !classes.get(g.cls)?.preferred)?.cls;
    const common = [...classes.values()].find((c) => !c.preferred);
    const name = named ?? common?.name ?? "Common";
    if (!classes.has(name)) classes.set(name, { id: b.newId("sc"), name, issued: 0n, preferred: false });
    planClass = classes.get(name)!;
    const reserved = p.poolReserved?.replace(/[,\s.]/g, "") || String(optionsGranted + poolAvailable);
    if (!/^\d+$/.test(reserved)) issues.push(`Option pool "${p.poolReserved}" isn't a whole number`);
    else planReserve = BigInt(reserved);
    const planId = b.newId("plan");
    const firstGrant = grants.map((g) => g.date).sort()[0] ?? p.exportDate;
    planDrafts.push(
      b.stockPlan({
        id: planId,
        name: "Equity Incentive Plan",
        reserved: String(planReserve),
        boardApprovalDate: firstGrant,
        classId: planClass.id,
      }),
    );
  }

  const snap = (d: EventDraft, yes: boolean): EventDraft =>
    yes ? { ...d, meta: { note: "imported snapshot" } } : d;
  const txs: { row: string; drafts: EventDraft[] }[] = [];
  const seq = { CS: 0, PS: 0, OPT: 0, SAFE: 0 };
  for (const s of stock) {
    const c = classes.get(s.cls)!;
    const prefix = c.preferred ? "PS" : "CS";
    const d = b.stockIssuance({
      state: empty,
      currency: p.currency,
      stakeholderId: s.holder,
      classId: c.id,
      quantity: String(s.qty),
      price: s.price,
      date: s.date,
      securityId: `${prefix}-${++seq[prefix]}`,
      vestingTermsId: s.vest?.terms,
      vestingStart: s.vest?.start,
    });
    txs.push({ row: s.label, drafts: d.map((x, j) => (j === 0 ? snap(x, s.snapshot) : x)) });
  }
  for (const g of grants) {
    const d = b.optionGrant({
      state: empty,
      currency: p.currency,
      stakeholderId: g.holder,
      planId: planDrafts[0]!.data.id,
      classId: planClass!.id,
      quantity: String(g.qty),
      strike: g.strike,
      date: g.date,
      securityId: `OPT-${++seq.OPT}`,
      vestingTermsId: g.vest?.terms,
      vestingStart: g.vest?.start,
    });
    txs.push({ row: g.label, drafts: d.map((x, j) => (j === 0 ? snap(x, g.snapshot) : x)) });
  }
  for (const s of safes)
    txs.push({ row: s.label, drafts: [snap(s.draft(`SAFE-${++seq.SAFE}`), s.snapshot)] });

  const defaultAuthorized = (c: { name: string; issued: bigint }) => {
    const n = c.issued + (c.name === planClass?.name ? planReserve : 0n);
    return n > 0n ? n : 1n;
  };
  const classDrafts = [...classes.values()].map((c) =>
    b.stockClass({
      id: c.id,
      name: c.name,
      preferred: c.preferred,
      authorized: p.authorized?.[c.name]?.replace(/[,\s.]/g, "") || String(defaultAuthorized(c)),
    }),
  );
  const uniquePeople = [...new Set(people.values())];
  const drafts = [
    ...classDrafts,
    ...uniquePeople.map((x) =>
      b.stakeholder({ id: x.id, name: x.name, email: x.email || undefined, type: x.type }),
    ),
    ...terms.values(),
    ...planDrafts,
    ...txs.flatMap((t) => t.drafts),
  ];

  for (const t of txs)
    for (const d of t.drafts) for (const e of validateOcf(d.data)) issues.push(`${t.row}: ${e}`);
  for (const d of [...classDrafts, ...planDrafts])
    for (const e of validateOcf(d.data)) issues.push(`${d.data.name ?? d.data.plan_name}: ${e}`);

  const preview = previewDrafts(drafts, p.exportDate);
  for (const v of preview.violations) if (!issues.includes(v)) issues.push(v);
  const { rows, totals } = preview;
  return {
    drafts,
    issues,
    warnings,
    summary: {
      fullyDiluted: totals.fullyDiluted,
      stakeholders: uniquePeople.length,
      safeTotal: sumDec(rows.filter((r) => r.group === 3).map((r) => r.safeAmount)),
      perClass: [...classes.values()].map((c) => ({ name: c.name, outstanding: c.issued })),
      optionsOutstanding: rows.filter((r) => r.group === 1).reduce((a, r) => a + (r.shares ?? 0n), 0n),
      poolAvailable: totals.poolAvailable,
    },
    classes: [...classes.values()].map(({ name, issued, preferred }) => ({ name, issued, preferred })),
    defaultAuthorized: Object.fromEntries([...classes.values()].map((c) => [c.name, defaultAuthorized(c)])),
    optionsGranted,
    poolAvailable,
    rows,
  };
}

/** What the founder copied from the old tool. Only fully diluted is required; the rest is checked when typed. */
export interface Theirs {
  fullyDiluted: string;
  perClass?: Record<string, string>;
  optionsOutstanding?: string;
  poolAvailable?: string;
  safeTotal?: string;
  stakeholders?: string;
}
export interface TieLine {
  label: string;
  key: string; // where the founder types it: "fullyDiluted", "class:Common", …
  ours: string;
  ok: boolean | null; // null: left empty
  gap?: string;
}

/** Our totals vs the numbers the old tool shows (docs/04 §5: exact, to the share and the cent). */
export function reconcile(
  s: ImportSummary,
  theirs: Theirs,
  tool = "your old tool",
): { ok: boolean; text: string; lines: TieLine[] } {
  const usd = (v: string) =>
    `$${fmtInt(BigInt(v.split(".")[0]!))}${v.includes(".") && /[1-9]/.test(v.split(".")[1]!) ? `.${v.split(".")[1]}` : ""}`;
  const lines: TieLine[] = [];
  const parts: string[] = [];
  let ok = true;
  const whole = (key: string, label: string, ours: bigint, typed = "", plural = false) => {
    const line: TieLine = { label, key, ours: fmtInt(ours), ok: null };
    lines.push(line);
    if (!typed.trim()) return;
    const digits = typed.replace(/[,\s.]/g, "");
    if (!/^\d+$/.test(digits)) {
      line.ok = ok = false;
      parts.push(`Type ${label} as a whole number`);
      return;
    }
    const want = BigInt(digits);
    if (want === ours) {
      line.ok = true;
      parts.push(`${label} ${plural ? "match" : "matches"}: ${fmtInt(want)}`);
      return;
    }
    const diff = want - ours;
    line.ok = ok = false;
    line.gap = `${fmtInt(diff < 0n ? -diff : diff)} ${diff > 0n ? "short" : "over"}`;
    parts.push(`${label} is ${fmtInt(ours)} here but ${fmtInt(want)} in ${tool} (${line.gap})`);
  };
  if (!theirs.fullyDiluted.trim()) {
    ok = false;
    parts.push(`Type the fully diluted total from ${tool}`);
  }
  whole("fullyDiluted", "Fully diluted", s.fullyDiluted, theirs.fullyDiluted);
  for (const c of s.perClass)
    whole(`class:${c.name}`, `${c.name} shares`, c.outstanding, theirs.perClass?.[c.name], true);
  if (s.optionsOutstanding || s.poolAvailable) {
    whole("optionsOutstanding", "Options outstanding", s.optionsOutstanding, theirs.optionsOutstanding, true);
    whole("poolAvailable", "Pool available", s.poolAvailable, theirs.poolAvailable);
  }
  if (s.safeTotal !== "0") {
    const line: TieLine = { label: "SAFE total", key: "safeTotal", ours: usd(s.safeTotal), ok: null };
    lines.push(line);
    const typed = (theirs.safeTotal ?? "").replace(/[$\s,]/g, "");
    if (typed && !/^\d+(\.\d+)?$/.test(typed)) {
      line.ok = ok = false;
      parts.push("Type the SAFE total as a number");
    } else if (typed) {
      line.ok = /^-?0(\.0+)?$/.test(subDec(typed, s.safeTotal || "0"));
      if (line.ok) parts.push(`SAFE total matches: ${usd(s.safeTotal)}`);
      else {
        ok = false;
        line.gap = "differs";
        parts.push(`SAFE total is ${usd(s.safeTotal)} here but ${usd(typed)} in ${tool}`);
      }
    }
  }
  whole("stakeholders", "Stakeholders", BigInt(s.stakeholders), theirs.stakeholders, true);
  return { ok, text: parts.join(". "), lines };
}

/** The cap table these drafts would give, and any invariant they'd break, without writing anything. */
export function previewDrafts(drafts: EventDraft[], asOf: string, before: VaultEvent[] = []) {
  const events: VaultEvent[] = [
    ...before,
    ...drafts.map((d, i) => ({
      seq: before.length + i + 1,
      id: `evt_preview_${String(i).padStart(6, "0")}`,
      ts: `${asOf}T00:00:00Z`,
      kind: d.kind,
      type: d.type,
      data: d.data,
      meta: { source: "preview", ...d.meta },
      prev: "",
      hash: "",
    })),
  ];
  const rows = capTableRows(reduce(events, "9999-12-31"));
  return { rows, totals: capTableTotals(rows), violations: checkInvariants(reduce(events, "9999-12-31")) };
}
