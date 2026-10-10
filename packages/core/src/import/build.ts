// Generic spreadsheet → OCF drafts (docs/04 §3–5): one position per row, people deduped, vesting built or marked unknown.
import * as b from "../builders";
import { checkInvariants } from "../invariants";
import { fmtInt, parseDec, sumDec } from "../num";
import { validateOcf } from "../ocf/validate";
import { reduce } from "../reduce";
import { capTableRows } from "../rows";
import { capTableTotals } from "../totals";
import type { EventDraft, Row, VaultEvent } from "../types";
import type { Field } from "./fields";

export interface ImportInput {
  header: string[];
  rows: string[][];
  mapping: (Field | null)[];
  firstRow: number; // spreadsheet row number of rows[0], for messages
  exportDate: string; // date of the export: used when a row has no issue date
  authorized?: Record<string, string>; // per class name; default = issued
  poolReserved?: string; // the plan's total reserve; default = granted + the sheet's "available" pool row
}

export interface ImportSummary {
  fullyDiluted: bigint;
  stakeholders: number;
  safeTotal: string;
  perClass: { name: string; outstanding: bigint }[];
}

export interface ImportResult {
  drafts: EventDraft[];
  issues: string[];
  summary: ImportSummary;
  classes: { name: string; issued: bigint; preferred: boolean }[];
  defaultAuthorized: Record<string, bigint>;
  optionsGranted: bigint;
  poolAvailable: bigint; // from the sheet's pool row(s)
  rows: Row[]; // the cap table this import would give
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const DATE_FIELDS: Field[] = ["issueDate", "vestingStart"];
const INSTITUTION =
  /\b(inc|llc|l\.?l\.?c|l\.?p|ltd|limited|gmbh|s\.?a|corp|corporation|company|co|fund|ventures?|capital|partners|holdings|combinator|trust|foundation|bank|group|labs|spv)\b\.?/i;
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) =>
  m >= 1 && m <= 12 && d >= 1 && d <= new Date(Date.UTC(y, m, 0)).getUTCDate()
    ? `${y}-${pad(m)}-${pad(d)}`
    : null;
const numericParts = (v: string) => /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(v.trim());

/** A spreadsheet date → ISO. Numeric a/b/yyyy is month-first unless the column is day-first. */
function parseDate(raw: string, dayFirst: boolean): string | null {
  const v = raw.trim().toLowerCase().replace(/,/g, " ").replace(/\s+/g, " ");
  if (!v) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[t ].*)?$/.exec(v);
  if (m) return iso(+m[1]!, +m[2]!, +m[3]!);
  m = numericParts(v);
  if (m) return dayFirst ? iso(+m[3]!, +m[2]!, +m[1]!) : iso(+m[3]!, +m[1]!, +m[2]!);
  if (/^\d{4,5}(\.\d+)?$/.test(v)) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(v)) * 86400000); // Excel serial (1900 system)
    return d.toISOString().slice(0, 10);
  }
  const month = (s: string) => MONTHS.findIndex((x) => s.startsWith(x)) + 1;
  m = /^([a-z]{3,9})\.? (\d{1,2}) (\d{4})$/.exec(v); // Mar 14 2023
  if (m && month(m[1]!)) return iso(+m[3]!, month(m[1]!), +m[2]!);
  m = /^(\d{1,2}) ([a-z]{3,9})\.? (\d{4})$/.exec(v); // 14 Mar 2023
  if (m && month(m[2]!)) return iso(+m[3]!, month(m[2]!), +m[1]!);
  return null;
}

const money = (raw: string) => raw.replace(/[$€£\s,]/g, "").replace(/^usd/i, "");
const isNum = (s: string) => /^\d+(\.\d+)?$/.test(s);
const normName = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

function kindOf(raw: string, has: { safe: boolean; strike: boolean }, cls: string) {
  const k = raw.toLowerCase();
  if (/pool|available|unallocated|unissued|reserved/.test(k)) return "pool";
  if (/safe/.test(k)) return "safe";
  if (/option|iso|nso|\bso\b/.test(k)) return "option";
  if (/prefer/.test(k)) return "preferred";
  if (/common|ordinary|stock|share|founder/.test(k)) return /prefer/i.test(cls) ? "preferred" : "common";
  if (k) return `unsupported:${raw}`;
  if (has.safe) return "safe";
  if (has.strike) return "option";
  return /prefer/i.test(cls) ? "preferred" : "common";
}

export function buildImport(p: ImportInput): ImportResult {
  const col = new Map(p.mapping.flatMap((f, i) => (f ? [[f, i] as const] : [])));
  const cell = (r: string[], f: Field) => (col.has(f) ? (r[col.get(f)!] ?? "").trim() : "");
  const dayFirst = new Map(
    DATE_FIELDS.map((f) => [f, p.rows.some((r) => Number(numericParts(cell(r, f))?.[1] ?? 0) > 12)]),
  );
  const issues: string[] = [];
  const people = new Map<
    string,
    { id: string; name: string; email: string; type: "INSTITUTION" | "INDIVIDUAL" }
  >();
  const classes = new Map<string, { id: string; name: string; issued: bigint; preferred: boolean }>();
  const terms = new Map<string, EventDraft>();
  const txs: { row: string; drafts: EventDraft[] }[] = [];
  const grants: {
    holder: string;
    qty: string;
    strike: string;
    date: string;
    snapshot: boolean;
    vest?: { terms: string; start: string };
    row: string;
  }[] = [];
  let poolAvailable = 0n;
  const seq = { CS: 0, PS: 0, OPT: 0, SAFE: 0 };
  const empty = reduce([], "9999-12-31");

  /** Same email = same person; else same normalized name (unless both have different emails). */
  const person = (name: string, email: string) => {
    const eKey = email ? `e:${email.toLowerCase()}` : "";
    const nKey = `n:${normName(name)}`;
    const byName = people.get(nKey);
    const found = (eKey && people.get(eKey)) || (byName && (!email || !byName.email) ? byName : undefined);
    if (found) {
      if (eKey && !found.email) {
        found.email = email;
        people.set(eKey, found);
      }
      return found.id;
    }
    const id = b.newId("sh");
    const holderType = INSTITUTION.test(name) ? "INSTITUTION" : "INDIVIDUAL";
    const rec = { id, name, email, type: holderType as "INSTITUTION" | "INDIVIDUAL" };
    if (!byName) people.set(nKey, rec);
    if (eKey) people.set(eKey, rec);
    return id;
  };
  const vestingFor = (r: string[], qty: bigint, issue: string, label: string) => {
    const months = cell(r, "vestingMonths");
    const startRaw = cell(r, "vestingStart");
    const vested = money(cell(r, "vested"));
    if (months && startRaw) {
      const start = parseDate(startRaw, dayFirst.get("vestingStart")!);
      const m = Number(months);
      const cliff = Number(cell(r, "cliffMonths") || "0");
      if (!start) return void issues.push(`${label}: vesting start "${startRaw}" isn't a date`);
      if (!Number.isInteger(m) || m < 1 || !Number.isInteger(cliff) || cliff < 0 || cliff >= m)
        return void issues.push(
          `${label}: vesting length ${months} months with a ${cliff || 0}-month cliff doesn't work`,
        );
      const key = `${m}/${cliff}`;
      if (!terms.has(key)) terms.set(key, b.vestingTerms({ months: m, cliffMonths: cliff }));
      return { terms: terms.get(key)!.data.id as string, start };
    }
    if (vested && isNum(vested) && parseDec(vested).v < qty * 10n ** BigInt(parseDec(vested).scale)) {
      if (!terms.has("unknown")) terms.set("unknown", b.vestingTermsUnknown());
      return { terms: terms.get("unknown")!.data.id as string, start: issue };
    }
    return undefined;
  };

  for (const [i, r] of p.rows.entries()) {
    if (r.every((c) => !c.trim())) continue;
    const name = cell(r, "name");
    const at = `Row ${p.firstRow + i}`;
    const label = name ? `${at} (${name})` : at;
    const clsName = cell(r, "class");
    const safeAmount = money(cell(r, "safeAmount"));
    const strike = money(cell(r, "strike"));
    const kind = kindOf(cell(r, "kind"), { safe: !!safeAmount, strike: !!strike }, clsName);
    const sharesRaw = money(cell(r, "shares"));
    const isPoolName = /option pool|pool \(?available|unallocated|unissued|available for grant/i.test(name);
    if (kind === "pool" || isPoolName) {
      if (sharesRaw && /^\d+$/.test(sharesRaw)) poolAvailable += BigInt(sharesRaw);
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
    const parsed = dateRaw ? parseDate(dateRaw, dayFirst.get("issueDate")!) : null;
    if (dateRaw && !parsed) {
      issues.push(`${label}: issue date "${dateRaw}" isn't a date`);
      continue;
    }
    const date = parsed ?? p.exportDate;
    const snapshot = !parsed;
    const meta = snapshot ? { note: "imported snapshot" } : undefined;
    const holder = person(name, cell(r, "email"));

    if (kind === "safe") {
      if (!safeAmount) {
        issues.push(`${label}: SAFE amount missing`);
        continue;
      }
      if (!isNum(safeAmount)) {
        issues.push(`${label}: SAFE amount "${cell(r, "safeAmount")}" isn't a number`);
        continue;
      }
      const cap = money(cell(r, "safeCap"));
      if (cap && !isNum(cap)) {
        issues.push(`${label}: valuation cap "${cell(r, "safeCap")}" isn't a number`);
        continue;
      }
      const discRaw = cell(r, "safeDiscount").replace(/\s/g, "");
      let discount: string | undefined;
      if (discRaw) {
        const pct = discRaw.endsWith("%");
        const n = discRaw.replace("%", "");
        if (!isNum(n)) {
          issues.push(`${label}: discount "${discRaw}" isn't a number`);
          continue;
        }
        discount = pct || Number(n) > 1 ? (Number(n) / 100).toFixed(4).replace(/(\.\d\d\d*?)0+$/, "$1") : n;
      }
      const mfn = /^(y|yes|true|x|1|✓)$/i.test(cell(r, "safeMfn"));
      const securityId = `SAFE-${++seq.SAFE}`;
      const d = b.safe({
        state: empty,
        stakeholderId: holder,
        amount: safeAmount,
        cap: cap || undefined,
        discount,
        mfn,
        date,
        securityId,
      });
      txs.push({ row: label, drafts: [{ ...d, meta }] });
      continue;
    }

    if (!/^\d+$/.test(sharesRaw) || BigInt(sharesRaw) === 0n) {
      issues.push(`${label}: shares must be a whole number above 0, got "${cell(r, "shares")}"`);
      continue;
    }
    const qty = BigInt(sharesRaw);
    const vest = vestingFor(r, qty, date, label);
    if (kind === "option") {
      if (!strike) {
        issues.push(`${label}: strike price missing`);
        continue;
      }
      if (!isNum(strike)) {
        issues.push(`${label}: strike price "${cell(r, "strike")}" isn't a number`);
        continue;
      }
      grants.push({ holder, qty: sharesRaw, strike, date, snapshot, vest: vest || undefined, row: label });
      const c = clsName || "Common";
      if (!classes.has(c)) classes.set(c, { id: b.newId("sc"), name: c, issued: 0n, preferred: false });
      continue;
    }
    const preferred = kind === "preferred";
    const c = clsName || (preferred ? "Preferred" : "Common");
    if (!classes.has(c)) classes.set(c, { id: b.newId("sc"), name: c, issued: 0n, preferred });
    const cls = classes.get(c)!;
    cls.issued += qty;
    const price = money(cell(r, "price"));
    if (price && !isNum(price)) {
      issues.push(`${label}: price "${cell(r, "price")}" isn't a number`);
      continue;
    }
    const prefix = cls.preferred ? "PS" : "CS";
    const securityId = `${prefix}-${++seq[prefix]}`;
    const d = b.stockIssuance({
      state: empty,
      stakeholderId: holder,
      classId: cls.id,
      quantity: sharesRaw,
      price: price || "0",
      date,
      securityId,
      vestingTermsId: vest ? vest.terms : undefined,
      vestingStart: vest ? vest.start : undefined,
    });
    txs.push({ row: label, drafts: d.map((x, j) => (j === 0 ? { ...x, meta } : x)) });
  }

  // Options need a plan: its reserve is the founder's input, else granted + the sheet's "available" row.
  const optionsGranted = grants.reduce((a, g) => a + BigInt(g.qty), 0n);
  const planDrafts: EventDraft[] = [];
  let planClassName = "";
  let planReserve = 0n;
  if (grants.length) {
    const planClass = [...classes.values()].find((c) => !c.preferred)!;
    planClassName = planClass.name;
    const planId = b.newId("plan");
    const reserved = p.poolReserved?.replace(/[,\s]/g, "") || String(optionsGranted + poolAvailable);
    if (!/^\d+$/.test(reserved)) issues.push(`Option pool "${p.poolReserved}" isn't a whole number`);
    else planReserve = BigInt(reserved);
    planDrafts.push(
      b.stockPlan({
        id: planId,
        name: "Equity Incentive Plan",
        reserved,
        boardApprovalDate: grants.map((g) => g.date).sort()[0]!,
        classId: planClass.id,
      }),
    );
    for (const g of grants) {
      const securityId = `OPT-${++seq.OPT}`;
      const d = b.optionGrant({
        state: empty,
        stakeholderId: g.holder,
        planId,
        classId: planClass.id,
        quantity: g.qty,
        strike: g.strike,
        date: g.date,
        securityId,
        vestingTermsId: g.vest?.terms,
        vestingStart: g.vest?.start,
      });
      txs.push({
        row: g.row,
        drafts: d.map((x, j) => (j === 0 && g.snapshot ? { ...x, meta: { note: "imported snapshot" } } : x)),
      });
    }
  }

  const defaultAuthorized = (c: { name: string; issued: bigint }) => {
    const n = c.issued + (c.name === planClassName ? planReserve : 0n);
    return n > 0n ? n : 1n;
  };
  const classDrafts = [...classes.values()].map((c) =>
    b.stockClass({
      id: c.id,
      name: c.name,
      preferred: c.preferred,
      authorized: p.authorized?.[c.name]?.replace(/[,\s]/g, "") || String(defaultAuthorized(c)),
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
    summary: {
      fullyDiluted: totals.fullyDiluted,
      stakeholders: uniquePeople.length,
      safeTotal: sumDec(rows.filter((r) => r.group === 3).map((r) => r.safeAmount)),
      perClass: [...classes.values()].map((c) => ({ name: c.name, outstanding: c.issued })),
    },
    classes: [...classes.values()].map(({ name, issued, preferred }) => ({ name, issued, preferred })),
    defaultAuthorized: Object.fromEntries([...classes.values()].map((c) => [c.name, defaultAuthorized(c)])),
    optionsGranted,
    poolAvailable,
    rows,
  };
}

/** The cap table these drafts would give (as of `asOf`), and any invariant they'd break, without writing anything. */
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

/** Our fully diluted vs the number the old tool shows (docs/04 §5: exact). */
export function reconcile(s: ImportSummary, expected: string): { ok: boolean; text: string } {
  const digits = expected.replace(/[,\s]/g, "");
  if (!/^\d+$/.test(digits)) return { ok: false, text: "Type the fully diluted total from your old tool" };
  const want = BigInt(digits);
  if (want === s.fullyDiluted) return { ok: true, text: `Fully diluted matches: ${fmtInt(want)}` };
  const diff = want - s.fullyDiluted;
  return {
    ok: false,
    text: `Fully diluted is ${fmtInt(s.fullyDiluted)} here but ${fmtInt(want)} in your old tool (${fmtInt(diff < 0n ? -diff : diff)} ${diff > 0n ? "short" : "over"})`,
  };
}
