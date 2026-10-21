// F-29: the cap table as plain sheet data (Summary, By person, Vesting, SAFEs). xlsx and pdf are drawn from this.
import { sumDec } from "../num";
import { reduce } from "../reduce";
import { capTableRows, securityVested } from "../rows";
import { fullyVestedOn, nextVest } from "../schedule";
import { capTableTotals, percentOf } from "../totals";
import type { Row, State, VaultEvent } from "../types";

/**
 * A cell: text, a whole number, an exact decimal written as a number ({num: "1.88"}), a fraction shown as a
 * percentage ({pct: "0.5"} is 50%), or an ISO date shown as a date.
 */
export type Cell = string | bigint | { num: string } | { pct: string } | { date: string } | null;
export interface Sheet {
  name: string;
  rows: Cell[][];
  header: number[]; // row indexes drawn bold
  freeze?: number; // rows kept in view while scrolling (title rows + the column header)
  charts?: Chart[]; // real Excel charts drawn on this tab (xlsx only)
}

/** One series of a chart: cell ranges as Excel writes them ('Tab'!$A$1:$A$4) plus their values for the cache. */
export interface Chart {
  kind: "doughnut" | "line";
  title: string;
  series: string;
  cat: { ref: string; values: string[] };
  val: { ref: string; values: string[] };
  at: { col: number; row: number; cols: number; rows: number }; // where it sits, in cells (0-based)
}

/** A cell as plain text (no thousands separators): what a CSV or a reader sees. */
export const cellText = (c: Cell): string =>
  c === null ? "" : typeof c === "object" ? ("num" in c ? c.num : "pct" in c ? c.pct : c.date) : String(c);

export const DISCLAIMER =
  "Capfolder is software, not a law firm. It does not give legal, tax or financial advice. Templates come from public sources such as Y Combinator and are provided as is. Have a lawyer review your documents.";

const num = (s: string): Cell => (s === "" ? "" : { num: s });
const capHeader = (cur: string) => [
  "Stakeholder",
  "Type",
  "Class",
  "Shares",
  "FD %",
  "Vested",
  "Unvested",
  `SAFE amount (${cur})`,
  "Valuation cap",
  "Discount",
  "As-converted %",
  "Document",
];

const capRow = (r: Row): Cell[] => [
  r.stakeholder,
  r.type,
  r.class,
  r.shares,
  num(r.fdPercent),
  r.vested,
  r.unvested,
  num(r.safeAmount),
  num(r.safeCap),
  num(r.safeDiscount),
  num(r.asConverted),
  r.docStatus,
];

const holderOf = (s: State, r: Row) => s.securities.get(r.securityId)?.stakeholderId;

/** The four tabs as of `asOf`. With stakeholderId, only that person's rows (company totals still show). */
export function sheets(
  events: VaultEvent[],
  asOf: string,
  opts: { stakeholderId?: string; currency?: string } = {},
): Sheet[] {
  const cur = opts.currency ?? "USD";
  const s = reduce(events, asOf);
  const all = capTableRows(s);
  const totals = capTableTotals(all);
  const mine = (r: Row) => !opts.stakeholderId || holderOf(s, r) === opts.stakeholderId;
  const rows = all.filter(mine);

  // One person's sheet leaves out company totals: with few holders they reveal other people's numbers.
  const summary: Cell[][] = [
    ["Company", s.issuer?.legal_name ?? ""],
    ["As of", asOf],
    ...(opts.stakeholderId
      ? []
      : [
          ["Fully diluted", totals.fullyDiluted],
          ["Option pool available", totals.poolAvailable],
          [`SAFEs outstanding (${cur})`, num(totals.safeAmount)],
        ]),
    [],
    [DISCLAIMER],
    [],
    capHeader(cur),
    ...rows.map(capRow),
  ];

  const people: Cell[][] = [
    ["Name", "Email", "Shares & options", "FD %", "Vested", "Unvested", `SAFE amount (${cur})`],
  ];
  for (const [id, p] of s.stakeholders) {
    if (opts.stakeholderId && id !== opts.stakeholderId) continue;
    const held = all.filter((r) => holderOf(s, r) === id);
    const eq = held.filter((r) => r.group <= 1);
    if (!held.length) continue;
    const shares = eq.reduce((a, r) => a + (r.shares ?? 0n), 0n);
    const safes = held.filter((r) => r.group === 3).map((r) => r.safeAmount);
    people.push([
      p.name?.legal_name ?? id,
      p.contact_info?.emails?.[0]?.email_address ?? "",
      eq.length ? shares : null,
      eq.length ? num(percentOf(shares, totals.fullyDiluted)) : "",
      eq.length ? eq.reduce((a, r) => a + (r.vested ?? 0n), 0n) : null,
      eq.length ? eq.reduce((a, r) => a + (r.unvested ?? 0n), 0n) : null,
      safes.length ? num(sumDec(safes)) : "",
    ]);
  }

  const vesting: Cell[][] = [
    [
      "Holder",
      "Security",
      "Type",
      "Granted",
      "Outstanding",
      "Vested",
      "Unvested",
      "Vesting start",
      "Next vest",
      "Next vest shares",
      "Fully vested on",
      "How",
    ],
  ];
  for (const r of rows.filter((x) => x.group <= 1)) {
    const x = s.securities.get(r.securityId)!;
    if (!x.vestingTermsId && !x.vestings?.length) continue;
    const next = nextVest(x, s, asOf);
    vesting.push([
      r.stakeholder,
      x.id,
      r.type,
      x.originalQuantity,
      x.quantity,
      r.vested,
      r.unvested,
      x.vestingStart?.date ?? "",
      next?.date ?? "",
      next?.quantity ?? null,
      fullyVestedOn(x, s) ?? "",
      securityVested(x, s, asOf).math,
    ]);
  }

  const safes: Cell[][] = [
    ["Holder", "Type", `Amount (${cur})`, "Valuation cap", "Discount", "Post-money %", "Document"],
    ...rows
      .filter((r) => r.group === 3)
      .map((r) => [
        r.stakeholder,
        r.type,
        num(r.safeAmount),
        num(r.safeCap),
        num(r.safeDiscount),
        num(r.asConverted),
        r.docStatus,
      ]),
  ];

  return [
    { name: "Summary", rows: summary, header: [summary.length - rows.length - 1] },
    { name: "By person", rows: people, header: [0] },
    { name: "Vesting", rows: vesting, header: [0] },
    { name: "SAFEs", rows: safes, header: [0] },
  ];
}
