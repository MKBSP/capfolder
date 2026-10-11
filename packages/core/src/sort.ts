// Document sorting (F-09, docs/06): rules → nearest confirmed documents → (AI, in the app) → match to a cap-table
// row. Pure: text in, a proposal out. Only a rule or kNN type with an exact, uncontradicted match files itself.
import { parseDate } from "./import/build";
import { fmtInt, parseDec, parseLocalNumber, subDec } from "./num";
import { normName } from "./text";
import type { Security, State } from "./types";

export const SORT_TYPES = [
  "safe",
  "option_grant",
  "spa",
  "83b",
  "ciiaa",
  "board_consent",
  "plan",
  "company_certificate",
  "company_bylaws",
  "other",
  "not_equity",
] as const;
export type SortType = (typeof SORT_TYPES)[number];

/** Extracted values: plain numbers ("250000", "0.20"), ISO dates, names. "unreadable" = present but not legible. */
export interface Fields {
  name?: string;
  company?: string;
  amount?: string;
  cap?: string;
  discount?: string;
  shares?: string;
  price?: string;
  date?: string;
}
export type FieldName = keyof Fields;
export const UNREADABLE = "unreadable";

export interface Check {
  field: FieldName;
  state: "match" | "differs" | "unreadable" | "missing";
  found?: string;
  expected?: string;
}

export interface SortResult {
  status: "auto" | "review" | "skip";
  type: SortType | null;
  by: "rule" | "knn" | "ai" | null;
  rule?: string;
  fields: Fields;
  targets: string[]; // links when filed (auto, or confirmed in review)
  suggestion?: string; // a likely holding when it can't file itself
  checks: Check[]; // the fields compared with the matched or suggested holding
  problems: string[]; // why it needs the founder, in plain language
  person: string; // for the file name
  date?: string; // for the file name
  draft?: string; // what makes it look unsigned ("DRAFT", "[Investor Name]"…): filed only as a draft unless the founder says it's signed
}

// ---------- classify ----------

/** Phrases per type (regex sources, matched on lower-cased text, multi-line). The rules pack can replace them. */
export interface DocRule {
  type: SortType;
  phrases: string[];
}
export const DOC_RULES: DocRule[] = [
  { type: "83b", phrases: ["section 83\\s?\\(b\\)", "83\\s?\\(b\\) election"] },
  { type: "safe", phrases: ["simple agreement for future equity", "\\bsafe\\b.*purchase amount"] },
  {
    type: "option_grant",
    phrases: ["stock option grant notice", "notice of stock option grant", "stock option agreement"],
  },
  { type: "spa", phrases: ["stock purchase agreement"] },
  {
    type: "ciiaa",
    phrases: ["invention assignment", "proprietary information and inventions?", "\\bciiaa\\b|\\bpiiaa?\\b"],
  },
  {
    type: "board_consent",
    phrases: [
      "written consent of the (board|directors)",
      "consent of the board of directors",
      "board resolutions",
    ],
  },
  { type: "company_certificate", phrases: ["certificate of incorporation"] },
  { type: "company_bylaws", phrases: ["^\\s*(amended and restated )?bylaws\\b"] },
  { type: "plan", phrases: ["equity incentive plan", "stock (option )?plan\\b"] },
  { type: "not_equity", phrases: ["\\b(invoice|receipt|order confirmation|total due|amount paid|vat)\\b"] },
];
const compiled = new WeakMap<DocRule[], { type: SortType; res: RegExp[] }[]>();
const compile = (rules: DocRule[]) => {
  let c = compiled.get(rules);
  if (!c) {
    c = rules.map((r) => ({ type: r.type, res: r.phrases.map((p) => new RegExp(p, "m")) }));
    compiled.set(rules, c);
  }
  return c;
};

const clean = (text: string) =>
  text
    .replace(/[“”„]/g, '"')
    .replace(/[‘’]/g, "'")
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");

/** The document type by rules: a phrase in the title counts double; ties go to the more specific type. */
/** Mostly capitals ("ELECTION UNDER SECTION 83(b)" counts). */
const caps = (l: string) => {
  const letters = l.replace(/[^\p{L}]/gu, "");
  const upper = letters.replace(/[^\p{Lu}]/gu, "").length;
  return letters.length > 0 && upper / letters.length >= 0.9;
};
/** A heading-like line: short, or all capitals; no "label:", no trailing comma or sentence end (short names may). */
const headingLike = (l: string) =>
  !l.includes(":") &&
  !/[,;]$/.test(l) &&
  (l.length <= 60 ? !(l.length > 25 && /\.$/.test(l)) : caps(l) && l.length <= 100);

/**
 * The heading block near the top. Real PDFs wrap paragraphs into lines, so a run of long all-capital lines is a
 * legend, not a heading (skipped), and the block ends at the first line that reads like body text.
 */
function titleOf(t: string): string {
  const lines = t.split("\n").slice(0, 30);
  const longCaps = (i: number) => (lines[i]?.length ?? 0) > 60 && caps(lines[i]!);
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    // a long capital line wrapped onto another capital line, or continuing one, is a legend paragraph
    const legend =
      (longCaps(i) && (caps(lines[i + 1] ?? "") || longCaps(i - 1))) ||
      (caps(l) && longCaps(i - 1) && !out.length);
    if (!legend && headingLike(l)) out.push(l);
    else if (out.length) break;
    if (out.length >= 8) break;
  }
  return out.join("\n");
}

/** Lines joined back into paragraphs where a PDF wrapped them (no sentence end, or the next starts lower-case). */
function paragraphs(t: string): string[] {
  const out: string[] = [];
  for (const l of t.split("\n")) {
    const prev = out.at(-1);
    if (prev !== undefined && (/^[a-z(]/.test(l) || (prev.length > 60 && !/[.:;!?]$/.test(prev))))
      out[out.length - 1] = `${prev} ${l}`;
    else out.push(l);
  }
  return out;
}

/** Title words that mean "related to, but not, the document itself": these always go to the founder. */
const CAUTION =
  /\b(amendments?|amending|side letter|letter|exercise|offer letter|stock certificate|secretary'?s certificate|awards?|rsus?|restricted stock units?|termination|waiver|joinder|spousal|repurchase|transfer|mfn|most favou?red|pro rata|addendum|supplement|rider|acknowledge?ment|cancell?ation)\b/;

export interface Classified {
  type: SortType;
  rule: string;
  inTitle: boolean; // a phrase in the title, not only somewhere in the text
  caution?: string; // a title word that makes it something else (amendment, exercise, side letter…)
}

export function classify(text: string, rules: DocRule[] = DOC_RULES): Classified | null {
  const c = clean(text);
  const t = c.toLowerCase();
  const title = titleOf(c).toLowerCase(); // on the original case: capitals tell headings and legends apart
  const all = compile(rules);
  let best: { type: SortType; rule: string; score: number } | null = null;
  for (const r of all) {
    if (r.type === "not_equity") continue;
    for (const p of r.res) {
      const score = p.test(title) ? 2 : p.test(t) ? 1 : 0;
      if (score > (best?.score ?? 0)) best = { type: r.type, rule: p.source, score };
    }
  }
  if (best) {
    const caution =
      CAUTION.exec(title)?.[0] ??
      // a heading like "2025 EQUITY INCENTIVE PLAN" also tops grant notices and award letters
      (best.type === "plan"
        ? /\b(notice|grant|award|exercise|agreement|option)\b/.exec(
            title.replace(/stock option plan/g, ""),
          )?.[0]
        : undefined);
    return { type: best.type, rule: best.rule, inTitle: best.score === 2, caution };
  }
  // not equity only when nothing equity-like matched (an invoice for drafting an SPA is still about the SPA)
  for (const r of all.filter((x) => x.type === "not_equity"))
    for (const p of r.res)
      if (p.test(t)) return { type: "not_equity", rule: p.source, inTitle: p.test(title) };
  return null;
}

// ---------- signed or draft ----------

/** Marks an e-signature service, a conformed signature or a signing certificate leaves on a signed copy. */
const SIGNED =
  /(\/s\/ *\p{L}|docusign envelope id|docusigned by|signed with documenso|electronically signed|signature certificate|certificate of completion|audit trail|dropbox sign|hellosign|adobe (acrobat )?sign|pandadoc|digitally signed by)/iu;

/**
 * Why this text looks like an unsigned draft, or undefined. A scanned signature can't be read as text, so blank
 * signature lines prove nothing; only explicit draft markers count, and any sign of signing outweighs them.
 */
export function unsignedSignal(text: string, opts: { signedPdf?: boolean } = {}): string | undefined {
  if (opts.signedPdf || SIGNED.test(text)) return undefined;
  const title = titleOf(clean(text));
  return (
    /\bDRAFT\b/.exec(text)?.[0] ??
    /\bdraft\b/i.exec(title)?.[0].toLowerCase() ??
    /\bform of\b/i.exec(title)?.[0].toLowerCase() ??
    /\b(for discussion purposes|not for execution|subject to (further )?(review|revision))/i
      .exec(text)?.[0]
      .toLowerCase() ??
    // template blanks: [Investor Name], [Date], [●], [•], [_____]
    /\[(?:[^\]\n]{0,30}\b(?:name|date|amount|address|title|company|investor)\b[^\]\n]{0,20}|[●•]|_{3,}|\s*)\]/i.exec(
      text,
    )?.[0]
  );
}

// ---------- extract ----------

const DATE = String.raw`([A-Z][a-z]+\.? \d{1,2},? \d{4})`;
const LABELS: [RegExp, FieldName | "discountRate"][] = [
  [
    /^(investor|investor name|optionholder|optionee|participant|grantee|purchaser|name of taxpayer|taxpayer|employee|holder)$/,
    "name",
  ],
  [/^company$/, "company"],
  [/^(purchase amount|investment amount|amount)$/, "amount"],
  [/^(post-money valuation cap|valuation cap|cap)$/, "cap"],
  [/^discount rate$/, "discountRate"],
  [/^discount$/, "discount"],
  [/^(number of shares( subject to option)?|shares|total shares|number of option shares)$/, "shares"],
  [
    /^(exercise price|exercise price per share|price per share|purchase price per share|strike price)$/,
    "price",
  ],
  [/^(date of grant|grant date|date|effective date|date of safe|dated)$/, "date"],
];
const PROSE: [RegExp, FieldName | "discountRate"][] = [
  [
    /([^()"\n]{2,120}?)\s*\(the "(?:Investor|Purchaser|Optionholder|Optionee|Participant|Employee|Holder)"\)/,
    "name",
  ],
  [
    /([A-Z][\w&.' -]{1,80}?),? an? [A-Z][a-z]+(?: [A-Z][a-z]+)? (?:corporation|company)\s*\(the "Company"\)/,
    "company",
  ],
  [/of \$\s*(\S+?)\s*\(the "Purchase Amount"\)/, "amount"],
  [/"Post-Money Valuation Cap" is \$?\s*(\S+)/, "cap"],
  [/"Discount Rate" is (\S+?)%/, "discountRate"],
  [/([\d,]+) shares of (?:the )?(?:Company's )?(?:Common |Capital |Preferred )?Stock/i, "shares"],
  [/at a price of \$\s*([\d.,]+) per share/, "price"],
  [new RegExp(`"Purchase Amount"\\) on or about ${DATE}`), "date"],
  [new RegExp(`entered into as of ${DATE}`), "date"],
  [new RegExp(`property was transferred (?:is|was)?:?\\s*${DATE}`), "date"],
  [new RegExp(`effective ${DATE}`, "i"), "date"],
];
const FIELDS_FOR: Record<SortType, FieldName[]> = {
  safe: ["name", "company", "amount", "date", "cap", "discount"],
  option_grant: ["name", "shares", "price", "date"],
  spa: ["name", "shares", "price", "date"],
  "83b": ["name", "shares", "date"],
  ciiaa: ["name", "date"],
  board_consent: ["date", "company"],
  plan: ["date", "company"],
  company_certificate: ["company"],
  company_bylaws: ["company"],
  other: ["name", "date"],
  not_equity: [],
};

const num = (raw: string) => parseLocalNumber(raw.replace(/\.$/, ""), ".");
const whole = (raw: string) => {
  const v = num(raw);
  return v && /^\d+(\.0+)?$/.test(v) && !/^0+$/.test(v) ? v.split(".")[0]! : null;
};
/** "20" → "0.20": a percentage as a fraction, without floating point. */
const fraction = (pct: string) => {
  const { v, scale } = parseDec(pct);
  const sc = scale + 2;
  const s = v.toString().padStart(sc + 1, "0");
  return `${s.slice(0, -sc)}.${s.slice(-sc)}`;
};
const personName = (raw: string) => {
  const cut = raw.split(/\b(?:by|and|to|between)\s+/).at(-1)!;
  const v = cut.replace(/^[\s,]+|[\s,]+$/g, "");
  return v && !/^you$/i.test(v) && v.length <= 80 ? v : null;
};
const PARSE: Record<FieldName | "discountRate", (raw: string) => string | null> = {
  name: personName,
  company: (raw) => raw.trim() || null,
  amount: num,
  cap: num,
  price: num,
  shares: whole,
  date: (raw) => parseDate(raw, false, false),
  discount: (raw) => {
    const v = num(raw.replace(/%$/, ""));
    return v ? fraction(v) : null;
  },
  discountRate: (raw) => {
    const v = num(raw);
    return v && parseDec(subDec("100", v)).v >= 0n ? fraction(subDec("100", v)) : null;
  },
};

/** The fields this type of document carries: labelled lines first ("Optionholder: Lisa"), then template prose. */
export function extract(type: SortType, text: string): Fields {
  const t = clean(text);
  const want = new Set<string>(FIELDS_FOR[type]);
  if (want.has("discount")) want.add("discountRate");
  const out: Record<string, string> = {};
  const put = (field: FieldName | "discountRate", raw: string) => {
    const key = field === "discountRate" ? "discount" : field;
    if (!want.has(field) || out[key] !== undefined) return;
    const v = PARSE[field](raw);
    // a template phrase that was found but whose value didn't parse is unreadable (OCR damage), never guessed;
    // a name that doesn't look like one ("you") is just not there
    if (v) out[key] = v;
    else if (field !== "name") out[key] = UNREADABLE;
  };
  for (const line of t.split("\n")) {
    const m = /^([A-Za-z][A-Za-z ()/'-]{1,60}?)\s*:\s*(.+)$/.exec(line);
    if (!m) continue;
    const label = m[1]!
      .toLowerCase()
      .replace(/\(.*?\)/g, "")
      .replace(/\s+/g, " ")
      .trim();
    for (const [re, field] of LABELS) if (re.test(label)) put(field, m[2]!);
  }
  const flat = t.replace(/\n/g, " ");
  for (const [re, field] of PROSE) {
    const m = re.exec(flat);
    if (m) put(field, m[1]!);
  }
  return out as Fields;
}

// ---------- nearest confirmed documents (kNN) ----------

export interface CorpusEntry {
  type: SortType;
  terms: Record<string, number>;
}

/** Word counts for similarity: words of 3+ letters, numbers and names' case ignored. */
export function termCounts(text: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const w of text.toLowerCase().match(/\p{L}{3,}/gu) ?? []) out[w] = (out[w] ?? 0) + 1;
  return out;
}

const cosine = (a: Record<string, number>, b: Record<string, number>) => {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [k, v] of Object.entries(a)) {
    na += v * v;
    dot += v * (b[k] ?? 0);
  }
  for (const v of Object.values(b)) nb += v * v;
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
};

/**
 * The type most of the 5 nearest confirmed documents share, if at least 4 of them do (docs/06).
 * ponytail: word counts, not embeddings; use a local model's embed() once one is connected.
 */
export function nearest(
  terms: Record<string, number>,
  corpus: CorpusEntry[],
  minSim = 0.35,
): SortType | null {
  const near = corpus
    .map((c) => ({ type: c.type, sim: cosine(terms, c.terms) }))
    .filter((x) => x.sim >= minSim)
    .sort((a, b) => b.sim - a.sim)
    .slice(0, 5);
  const votes = new Map<SortType, number>();
  for (const x of near) votes.set(x.type, (votes.get(x.type) ?? 0) + 1);
  for (const [type, n] of votes) if (n >= 4) return type;
  return null;
}

// ---------- match ----------

const isoDate = (d?: string) => (d && /^\d{4}-\d\d-\d\d$/.test(d) ? d : undefined);
const sameDec = (a: string, b: string) => /^-?0(\.0+)?$/.test(subDec(a, b));
const daysApart = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 864e5;
const isOpen = (x: Security) => (x.kind === "convertible" ? !!x.amount && x.amount !== "0" : x.quantity > 0n);

/** Documents already filed for a target, of this type ("safe" also covers "safe_custom" etc.). */
function hasDoc(s: State, targets: string[], type: string): boolean {
  for (const d of s.docs.values()) {
    const t = String(d.data.doc_type ?? "");
    if (!d.removed && (t === type || t.startsWith(`${type}_`)) && targets.some((x) => d.links.has(x)))
      return true;
  }
  return false;
}

export function sortText(
  text: string,
  s: State,
  opts: {
    corpus?: CorpusEntry[];
    proposal?: { type: SortType; fields: Fields };
    rules?: DocRule[];
    signedPdf?: boolean; // the PDF carries a digital signature
  } = {},
): SortResult {
  const draft = unsignedSignal(text, { signedPdf: opts.signedPdf });
  const rule = opts.proposal ? null : classify(text, opts.rules);
  const knn = rule || opts.proposal ? null : nearest(termCounts(text), opts.corpus ?? []);
  const type: SortType | null = opts.proposal?.type ?? rule?.type ?? knn;
  const by = opts.proposal ? "ai" : rule ? "rule" : knn ? "knn" : null;
  const fields = opts.proposal?.fields ?? (type ? extract(type, text) : {});
  const base = {
    type,
    by,
    rule: rule?.rule,
    fields,
    targets: [] as string[],
    checks: [] as Check[],
    ...(draft ? { draft } : {}),
  } as const;
  const name = (id: string) => String(s.stakeholders.get(id)?.name?.legal_name ?? id);
  const nameIs = (id: string) =>
    !!fields.name &&
    fields.name !== UNREADABLE &&
    (normName(fields.name) === normName(name(id)) || s.aliases.get(normName(fields.name)) === id);
  const review = (problems: string[], extra: Partial<SortResult> = {}): SortResult => ({
    ...base,
    status: "review",
    problems: [
      ...(draft
        ? [
            `This looks like an unsigned draft ("${draft}"). File the signed copy, or file this one as a draft.`,
          ]
        : []),
      ...problems,
    ],
    person: extra.suggestion ? personOf(extra.suggestion) : (fields.name ?? "company"),
    date: isoDate(fields.date),
    ...extra,
  });
  const personOf = (target: string) => {
    const x = s.securities.get(target);
    return x ? name(x.stakeholderId) : s.stakeholders.has(target) ? name(target) : "company";
  };
  // Only a rule that matched the title, with no "amendment / exercise / side letter" there, may file by itself
  const gate = [
    ...(rule && !rule.inTitle ? ["Its kind was found only in the text, not in the title."] : []),
    ...(rule?.caution ? [`The title says "${rule.caution}": check what this document is.`] : []),
  ];
  // AI never files: everything it proposes goes through the founder (CLAUDE.md)
  const done = (targets: string[], found: string[], checks: Check[] = []): SortResult => {
    const problems = [...gate, ...found];
    return problems.length || by === "ai" || draft
      ? review(problems.length || by !== "ai" ? problems : ["Sorted by AI: check it before filing."], {
          suggestion: targets.length === 1 ? targets[0] : undefined,
          checks,
        })
      : {
          ...base,
          status: "auto",
          targets,
          checks,
          problems: [],
          person: targets.length ? personOf(targets[0]!) : "company",
          date: isoDate(fields.date) ?? s.securities.get(targets[0] ?? "")?.date,
        };
  };

  if (!type || type === "other") return review(["Couldn't tell what kind of document this is."]);
  if (type === "not_equity")
    // only a rule may drop a file unseen; AI or past choices saying "not equity" still ask
    return by === "rule"
      ? { ...base, status: "skip", problems: [], person: "company" }
      : review(["This looks like it isn't an equity document."]);
  const unreadable = (Object.keys(fields) as FieldName[]).filter((f) => fields[f] === UNREADABLE);
  const unreadableProblem = unreadable.length ? [`Couldn't read: ${unreadable.join(", ")}.`] : [];
  const flat = normName(text);

  if (type === "company_certificate" || type === "company_bylaws") {
    const company = String(s.issuer?.legal_name ?? "");
    if (!company || !flat.includes(normName(company)))
      return review([`${company || "The company"}'s name isn't in it.`]);
    return done([], hasType(s, type) ? ["The company already has one filed."] : []);
  }
  if (type === "plan") {
    const named = [...s.plans.entries()].filter(([, p]) => flat.includes(normName(String(p.data.plan_name))));
    if (named.length !== 1)
      return review(["Couldn't tell which plan this is."], {
        suggestion: s.plans.size === 1 ? [...s.plans.keys()][0] : undefined,
      });
    const id = named[0]![0];
    return done([id], hasDoc(s, [id], "plan") ? ["That plan already has its document filed."] : []);
  }
  if (type === "board_consent") {
    // Each resolution on its own: a grant is linked only when its holder and its exact share count are in the same
    // resolution (a director's name elsewhere, or 40,000 inside 140,000, must not link it); a plan when one adopts it.
    const resolutions = paragraphs(clean(text))
      .flatMap((p) => p.split(/(?=\bresolved\b)/i))
      // a resolution that cancels, reprices or amends a grant isn't its approval
      .filter((seg) => !/\b(cancel|terminat|repric|amend|forfeit)/i.test(seg))
      .map((seg) => ({ raw: seg, norm: ` ${normName(seg)} ` }));
    const count = (n: bigint) => new RegExp(`(?<![\\d.,])(${fmtInt(n)}|${n})(?![\\d]|[.,]\\d)`);
    const targets = [
      ...[...s.plans.entries()]
        .filter(([, p]) =>
          resolutions.some(
            (r) => r.norm.includes(normName(String(p.data.plan_name))) && /adopt|approv/.test(r.norm),
          ),
        )
        .map(([id]) => id),
      ...[...s.securities.values()]
        .filter(
          (x) =>
            x.kind === "equity" &&
            isOpen(x) &&
            resolutions.some(
              (r) =>
                r.norm.includes(normName(name(x.stakeholderId))) && count(x.originalQuantity).test(r.raw),
            ),
        )
        .map((x) => x.id),
    ];
    const r = done(targets, unreadableProblem);
    return r.status === "review" ? { ...r, targets, suggestion: undefined } : r;
  }
  if (type === "ciiaa") {
    const people = [...s.stakeholders.keys()].filter(
      (id) => s.stakeholders.get(id)?.stakeholder_type === "INDIVIDUAL" && nameIs(id),
    );
    if (people.length !== 1)
      return review([fields.name ? `No one named ${fields.name} on the cap table.` : "No name found."]);
    return done(
      people,
      hasDoc(s, people, "ciiaa") ? [`${name(people[0]!)} already has an IP assignment filed.`] : [],
    );
  }

  // A holding: SAFE, grant notice, SPA or 83(b)
  const kind = type === "safe" ? "convertible" : type === "option_grant" ? "equity" : "stock";
  const key: FieldName = type === "safe" ? "amount" : "shares";
  const candidates = [...s.securities.values()].filter((x) => x.kind === kind && isOpen(x));
  const value = (x: Security) => (type === "safe" ? (x.amount ?? "") : x.originalQuantity.toString());
  const keyOk = fields[key] && fields[key] !== UNREADABLE;
  const byNum = keyOk ? candidates.filter((x) => sameDec(value(x), fields[key]!)) : [];
  const byName = candidates.filter((x) => nameIs(x.stakeholderId));
  const both = byNum.filter((x) => byName.includes(x));
  const what = type === "safe" ? "amount" : "share count";
  if (both.length !== 1) {
    const guess = byNum.length === 1 ? byNum[0] : byName.length === 1 ? byName[0] : undefined;
    const problems =
      byNum.length === 1
        ? [
            `The ${what} matches ${name(byNum[0]!.stakeholderId)}'s, but the name is ${fields.name ?? "missing"}.`,
          ]
        : byName.length === 1
          ? [`${name(byName[0]!.stakeholderId)} is on the cap table, but the ${what} doesn't match.`]
          : [`No holding matches this ${what} and name.`];
    return review([...problems, ...unreadableProblem], {
      suggestion: guess?.id,
      checks: guess ? compare(guess) : [],
    });
  }
  const x = both[0]!;
  const checks = compare(x);
  const siblings = candidates.filter((y) => y.stakeholderId === x.stakeholderId).length;
  const problems = [
    ...(!isoDate(fields.date) && siblings > 1
      ? [`No date found, and ${name(x.stakeholderId)} has ${siblings} of these: check it's the right one.`]
      : []),
    ...checks
      .filter((c) => c.state === "differs")
      .map((c) => `The ${c.field} in the document (${c.found}) differs from the cap table (${c.expected}).`),
    ...unreadableProblem,
    ...(hasDoc(s, [x.id, x.txId], type)
      ? [`${name(x.stakeholderId)}'s ${x.id} already has this kind of document.`]
      : []),
  ];
  return done([x.id], problems, checks);

  function compare(x: Security): Check[] {
    const pairs: (readonly [FieldName, string | undefined, (a: string, b: string) => boolean])[] = [
      [key, value(x), sameDec],
      ["date", x.date, (a, b) => daysApart(a, b) <= 3],
      ...(type === "safe"
        ? ([
            ["cap", x.cap, sameDec],
            ["discount", x.discount, sameDec],
          ] as const)
        : type === "option_grant"
          ? ([["price", x.price, sameDec]] as const)
          : []),
    ];
    const out: Check[] = [
      {
        field: "name",
        state: nameIs(x.stakeholderId) ? "match" : "differs",
        found: fields.name,
        expected: name(x.stakeholderId),
      },
    ];
    for (const [field, expected, eq] of pairs) {
      const found = fields[field];
      if (!found) out.push({ field, state: "missing", expected });
      else if (found === UNREADABLE) out.push({ field, state: "unreadable", expected });
      else if (expected && !eq(found, expected)) out.push({ field, state: "differs", found, expected });
      else if (expected) out.push({ field, state: "match", found, expected });
    }
    return out;
  }
}

function hasType(s: State, type: string): boolean {
  for (const d of s.docs.values()) if (!d.removed && d.data.doc_type === type) return true;
  return false;
}
