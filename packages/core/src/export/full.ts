// F-29: the full cap table, laid out like the Pulley/Carta exports lawyers and investors already know: Summary,
// Ownership, a ledger per stock class and per equity plan, Convertibles, Voting Ownership, plus every holding on one tab.
// Columns OCF has no data for stay, empty, so the layout is the familiar one (docs/03-data-model.md, "Export columns").
import { csvCell } from "../captable-csv";
import { parseDec, ratioFixed, sumDec, toInt } from "../num";
import { liveEvents, reduce, txType } from "../reduce";
import { capTableRows, securityVested } from "../rows";
import { capTableTotals } from "../totals";
import type { Data, Security, State, VaultEvent } from "../types";
import { overviewTabs } from "./overview";
import { type Cell, cellText, type Sheet } from "./sheets";

const num = (s?: string): Cell => (s ? { num: s } : "");
const date = (s?: string): Cell => (s ? { date: s.slice(0, 10) } : "");
/** part ÷ whole as a fraction (Excel shows it as %), trailing zeros dropped. */
const pct = (part: bigint, whole: bigint): Cell =>
  whole > 0n ? { pct: ratioFixed(part, whole, 8).replace(/\.?0+$/, "") || "0" } : "";
const dec = (s: string) => (s.includes(".") ? s.replace(/\.?0+$/, "") : s);
/** An exact decimal times a whole number ("0.00001" × 4000000 = "40"). */
function times(d: string, q: bigint): string {
  const { v, scale } = parseDec(d);
  const p = (v * q).toString().padStart(scale + 1, "0");
  return dec(scale ? `${p.slice(0, -scale)}.${p.slice(-scale)}` : p);
}
const words = (s?: string) =>
  s
    ? s
        .toLowerCase()
        .replaceAll("_", " ")
        .replace(/^\w/, (c) => c.toUpperCase())
    : "";
const yesNo = (b?: boolean) => (b ? "Yes" : "No");
/** OCF compensation_type as people say it: OPTION_ISO → "Option (ISO)". */
const award = (t = "OPTION") =>
  t.startsWith("OPTION_") ? `Option (${t.slice(7)})` : t.length <= 4 ? t : words(t);
const sum = (xs: bigint[]) => xs.reduce((a, b) => a + b, 0n);

const LEDGER = [
  "Certificate ID",
  "Stakeholder Name",
  "Stakeholder External ID",
  "Issue Date",
  "Shares Issued",
  "Shares Outstanding",
  "Price Per Share",
  "Vesting Start Date",
  "Vesting Schedule",
  "Shares Vested",
  "Shares Unvested",
  "Capital Contribution",
  "Debt Cancelled",
  "Value of IP Contribution",
  "Shares Repurchased",
  "Repurchase Date",
  "Amount Paid for Repurchase",
  "Shares Transferred",
  "Transfer Date",
  "Transferred To",
  "Amount Paid for Transfer",
  "Transfer Reason",
  "Shares Cancelled",
  "Cancellation Date",
  "Cancellation Reason",
  "Converted From",
  "Conversion Date",
  "Source",
  "Federal Exemption",
  "State Exemption",
  "Domicile - State of Residence",
  "Rule 144 Date",
  "Board Approval Date",
  "Equity Plan Name",
  "Acceleration",
  "Acceleration Provisions",
  "Documents",
  "Comments",
];
const PLAN = [
  "Certificate ID",
  "Stakeholder Name",
  "Stakeholder External ID",
  "Grant Date",
  "Expiration Date",
  "Equity Plan",
  "Grant Type",
  "Exercise Price",
  "Granted",
  "Outstanding",
  "Vested",
  "Unvested",
  "Exercised",
  "Dates of Exercise",
  "Amount Cancelled",
  "Date of Cancellation",
  "Cancellation Reason",
  "Termination Date",
  "Domicile - State of Residence",
  "Board Approval Date",
  "Share Class Name",
  "Vesting Schedule",
  "Vesting Start Date",
  "Early Exercise",
  "Federal Exemption",
  "State Exemption",
  "Acceleration",
  "Acceleration Provisions",
  "Documents",
  "Comments",
  "Transfer Reason",
  "Voluntary Termination",
  "Involuntary Termination",
  "Termination With Cause",
  "Death",
  "Disability",
  "Retirement",
];
const CONVERTIBLES = [
  "Convertible ID",
  "Stakeholder",
  "Stakeholder External ID",
  "Grant Date",
  "Principal Issued",
  "Principal Outstanding",
  "Interest Rate",
  "Interest",
  "Interest Outstanding",
  "Total",
  "Total Outstanding",
  "Valuation Cap",
  "Conversion Discount",
  "MFN",
  "MFN Date",
  "Converted Date",
  "Converted To",
  "Maturity Date",
  "Cancellation Date",
  "Cancellation Reason",
  "Federal Exemption",
  "State Exemption",
  "Domicile - State of Residence",
  "Status",
  "Conversion Type",
  "Documents",
  "Comments",
];
const HOLDINGS = [
  "Security ID",
  "Stakeholder",
  "Stakeholder Type",
  "Kind",
  "Class or Plan",
  "Issue Date",
  "Issued",
  "Outstanding",
  "Vested",
  "Unvested",
  "Exercised",
  "Cancelled",
  "Repurchased",
  "Transferred",
  "Price",
  "Currency",
  "Capital Contribution",
  "Vesting Schedule",
  "Vesting Start",
  "Expiration Date",
  "Amount",
  "Valuation Cap",
  "Discount",
  "MFN",
  "Status",
  "FD %",
  "Documents",
];
// OCF termination_exercise_windows reasons → Pulley's columns
const WINDOWS: [string, string[]][] = [
  ["Voluntary Termination", ["VOLUNTARY_OTHER", "VOLUNTARY_GOOD_CAUSE"]],
  ["Involuntary Termination", ["INVOLUNTARY_OTHER"]],
  ["Termination With Cause", ["INVOLUNTARY_WITH_CAUSE"]],
  ["Death", ["INVOLUNTARY_DEATH"]],
  ["Disability", ["INVOLUNTARY_DISABILITY"]],
  ["Retirement", ["VOLUNTARY_RETIREMENT"]],
];

/** Everything a ledger row needs about one security, read from the state and its own transactions. */
function facts(s: State, txs: VaultEvent[]) {
  const bySec = new Map<string, VaultEvent[]>();
  for (const e of txs) {
    const id = e.data.security_id;
    if (typeof id === "string") bySec.set(id, [...(bySec.get(id) ?? []), e]);
  }
  const of = (x: Security, ...types: string[]) =>
    (bySec.get(x.id) ?? []).filter((e) => types.includes(txType(e.type))).map((e) => e.data as Data);
  const qty = (ds: Data[]) => sum(ds.map((d) => (d.quantity ? toInt(d.quantity) : 0n)));
  const dates = (ds: Data[]) => ds.map((d) => d.date as string).join("; ");
  const person = (id: string) => s.stakeholders.get(id);
  const holderOf = (secId: string) => {
    const x = s.securities.get(secId);
    return x ? String(person(x.stakeholderId)?.name?.legal_name ?? x.stakeholderId) : secId;
  };
  return (x: Security) => {
    const issue = (of(
      x,
      "TX_STOCK_ISSUANCE",
      "TX_EQUITY_COMPENSATION_ISSUANCE",
      "TX_CONVERTIBLE_ISSUANCE",
    )[0] ?? {}) as Data;
    const repurchases = of(x, "TX_STOCK_REPURCHASE");
    const transfers = of(x, "TX_STOCK_TRANSFER", "TX_CONVERTIBLE_TRANSFER");
    const cancels = of(
      x,
      "TX_STOCK_CANCELLATION",
      "TX_EQUITY_COMPENSATION_CANCELLATION",
      "TX_CONVERTIBLE_CANCELLATION",
    );
    const exercises = of(x, "TX_EQUITY_COMPENSATION_EXERCISE");
    const conversions = of(x, "TX_CONVERTIBLE_CONVERSION");
    const repurchased = qty(repurchases);
    const transferred = qty(of(x, "TX_STOCK_TRANSFER"));
    // ponytail: a cancellation without a quantity (or a balance re-issued as a new security) counts as the remainder
    const cancelled = cancels.length
      ? (() => {
          const r = x.originalQuantity - x.quantity - repurchased - transferred - x.exercised;
          return r > 0n ? r : 0n;
        })()
      : 0n;
    const p = person(x.stakeholderId) ?? {};
    const terms = x.vestingTermsId ? s.vestingTerms.get(x.vestingTermsId) : undefined;
    const v = x.kind === "convertible" ? null : securityVested(x, s, s.asOf);
    const docs = [...s.docs.values()]
      .filter((d) => !d.removed && (d.links.has(x.id) || d.links.has(x.txId)))
      .map((d) =>
        String(d.data.path ?? "")
          .split("/")
          .at(-1),
      )
      .join("; ");
    const status =
      x.kind !== "convertible"
        ? x.quantity > 0n
          ? "Outstanding"
          : cancelled > 0n
            ? "Cancelled"
            : "Closed"
        : conversions.length
          ? "Converted"
          : cancels.length
            ? "Cancelled"
            : x.amount && parseDec(x.amount).v === 0n
              ? "Transferred"
              : "Outstanding";
    return {
      name: String(p.name?.legal_name ?? x.stakeholderId),
      extId: String(p.issuer_assigned_id ?? ""),
      type: words(p.current_relationship ?? p.stakeholder_type),
      domicile: String(p.addresses?.[0]?.country_subdivision ?? ""),
      issue,
      schedule: x.vestings?.length ? "Custom vesting dates" : String(terms?.description ?? terms?.name ?? ""),
      vested: v?.vested ?? null,
      unvested: v?.unvested ?? null,
      capital: x.price && x.kind === "stock" ? times(x.price, x.originalQuantity) : "",
      repurchased,
      repurchaseDates: dates(repurchases),
      repurchasePaid:
        repurchases.length && repurchases.every((d) => d.price?.amount && d.quantity)
          ? sumDec(repurchases.map((d) => times(d.price.amount, toInt(d.quantity))))
          : "",
      transferred,
      transferDates: dates(transfers),
      transferredTo: transfers.flatMap((d) => (d.resulting_security_ids ?? []).map(holderOf)).join("; "),
      cancelled,
      cancelDates: dates(cancels),
      cancelReasons: cancels
        .map((d) => d.reason_text ?? "")
        .filter(Boolean)
        .join("; "),
      exerciseDates: dates(exercises),
      conversionDates: dates(conversions),
      convertedTo: conversions.flatMap((d) => (d.resulting_security_ids ?? []).map(String)).join("; "),
      exemptions: (issue.security_law_exemptions ?? []).map((e: Data) => e.description).join("; "),
      comments: (issue.comments ?? []).join("; "),
      docs,
      status,
    };
  };
}

const header = (company: string, title: string, asOf: string, columns: string[]): Cell[][] => [
  [`${company} ${title}`],
  [`Generated by Capfolder, data to ${asOf}`],
  [],
  columns,
];

/** The workbook as of `asOf`. Numbers come from the same engine as the cap table screen. */
export function fullCapTable(events: VaultEvent[], asOf: string, opts: { currency?: string } = {}): Sheet[] {
  const s = reduce(events, asOf);
  const rows = capTableRows(s);
  const totals = capTableTotals(rows);
  const fd = totals.fullyDiluted;
  const company = String(s.issuer?.legal_name ?? "Company");
  const txs = liveEvents(events).filter(
    (e) => e.kind === "ocf" && e.type.startsWith("TX_") && e.data?.date <= asOf,
  );
  const fact = facts(s, txs);
  const secs = [...s.securities.values()].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1,
  );
  const stock = secs.filter((x) => x.kind === "stock");
  const equity = secs.filter((x) => x.kind === "equity");
  const convertibles = secs.filter((x) => x.kind === "convertible");
  const classOf = (x: Security) =>
    x.classId ?? (x.planId ? s.plans.get(x.planId)?.data.stock_class_ids?.[0] : undefined);
  const available = (planId: string) =>
    rows.find((r) => r.group === 2 && r.securityId === planId)?.shares ?? 0n;
  const outstandingStock = sum(stock.map((x) => x.quantity));
  const sheet = (name: string, r: Cell[][], bold: number[] = []): Sheet => ({
    name,
    rows: r,
    header: [3, ...bold],
    freeze: 4,
  });

  // Summary
  const sumRows = header(company, "Summary Capitalization Table", asOf, [
    "",
    "",
    "",
    "Authorized",
    "Issued and Outstanding",
    "Available Shares",
    "Capital Contribution",
    "Issued and Outstanding % Ownership",
    "Stock Options",
    "Fully Diluted",
    "Fully Diluted % Ownership",
  ]);
  const bold: number[] = [];
  const label = (r: Cell[]) => {
    bold.push(sumRows.length);
    sumRows.push(r);
  };
  label(["Stock"]);
  let auth = 0n;
  let capital: string[] = [];
  for (const kind of ["COMMON", "PREFERRED"]) {
    sumRows.push(["", `${words(kind)} Stock classes`]);
    for (const [id, c] of s.classes) {
      if ((c.data.class_type ?? "COMMON") !== kind) continue;
      const out = sum(stock.filter((x) => x.classId === id).map((x) => x.quantity));
      const opts = sum(equity.filter((x) => classOf(x) === id).map((x) => x.quantity));
      const pool = sum(
        [...s.plans.keys()].filter((p) => s.plans.get(p)!.data.stock_class_ids?.[0] === id).map(available),
      );
      const cap = stock
        .filter((x) => x.classId === id)
        .map((x) => fact(x).capital)
        .filter(Boolean);
      auth += c.authorized;
      capital = [...capital, ...cap];
      sumRows.push([
        "",
        "",
        String(c.data.name ?? id),
        c.authorized,
        out,
        c.authorized - out,
        num(cap.length ? sumDec(cap) : ""),
        pct(out, outstandingStock),
        opts + pool,
        out + opts + pool,
        pct(out + opts + pool, fd),
      ]);
    }
  }
  label([
    "Total Stock",
    "",
    "",
    auth,
    outstandingStock,
    "",
    num(capital.length ? sumDec(capital) : ""),
    pct(outstandingStock, outstandingStock),
    fd - outstandingStock,
    fd,
    pct(fd, fd),
  ]);
  sumRows.push([]);
  label([`SAFEs and Convertibles (${opts.currency ?? "USD"})`]);
  sumRows.push(["", "Outstanding", "", "", "", "", num(totals.safeAmount)]);
  label(["Total SAFEs and Convertibles", "", "", "", "", "", num(totals.safeAmount)]);
  for (const [id, p] of s.plans) {
    const mine = equity.filter((x) => x.planId === id);
    const options = sum(mine.filter((x) => x.compensationType?.startsWith("OPTION")).map((x) => x.quantity));
    const rsus = sum(mine.filter((x) => x.compensationType === "RSU").map((x) => x.quantity));
    const other = sum(mine.map((x) => x.quantity)) - options - rsus;
    sumRows.push([]);
    label([String(p.data.plan_name ?? id)]);
    const line = (a: string, b: string, n: bigint): Cell[] => [
      "",
      a,
      b,
      "",
      n,
      "",
      "",
      "",
      "",
      "",
      pct(n, fd),
    ];
    sumRows.push(line("Plan Size", "", p.reserved));
    sumRows.push(line("", "Options Outstanding", options));
    sumRows.push(line("", "Restricted Stock Units Outstanding", rsus));
    if (other) sumRows.push(line("", "Other Awards Outstanding", other));
    sumRows.push(line("Shares Available", "", available(id)));
  }
  sumRows.push([]);
  label(["Total Fully Diluted Shares", "", "", "", fd]);
  const summary = sheet("Summary", sumRows, bold);

  // Ownership: one column per stock class
  const classes = [...s.classes.entries()];
  const ownRows = header(company, "Ownership", asOf, [
    "Stakeholder",
    "Stakeholder Type",
    "Stakeholder External ID",
    ...classes.map(([id, c]) => String(c.data.name ?? id)),
    "Issued and Outstanding",
    "Stock Options",
    "Fully Diluted",
    "Issued and Outstanding % Ownership",
    "Fully Diluted % Ownership",
  ]);
  const holders = [...s.stakeholders.keys()]
    .filter((id) => [...stock, ...equity].some((x) => x.stakeholderId === id && x.quantity > 0n))
    .map((id) => ({ id, f: fact(secs.find((x) => x.stakeholderId === id)!) }))
    .sort((a, b) => a.f.name.localeCompare(b.f.name));
  for (const { id, f } of holders) {
    const byClass = classes.map(([c]) =>
      sum(stock.filter((x) => x.stakeholderId === id && x.classId === c).map((x) => x.quantity)),
    );
    const out = sum(byClass);
    const opts = sum(equity.filter((x) => x.stakeholderId === id).map((x) => x.quantity));
    ownRows.push([
      f.name,
      f.type,
      f.extId,
      ...byClass,
      out,
      opts,
      out + opts,
      pct(out, outstandingStock),
      pct(out + opts, fd),
    ]);
  }
  for (const [id, p] of s.plans) {
    const a = available(id);
    ownRows.push([
      `${p.data.plan_name ?? id} Available`,
      "",
      "",
      ...classes.map(() => ""),
      "",
      "",
      a,
      "",
      pct(a, fd),
    ]);
  }
  const optionsOut = sum(equity.map((x) => x.quantity));
  const ownTotal = ownRows.length;
  ownRows.push([
    "Total",
    "",
    "",
    ...classes.map(([c]) => sum(stock.filter((x) => x.classId === c).map((x) => x.quantity))),
    outstandingStock,
    optionsOut,
    fd,
    pct(outstandingStock, outstandingStock),
    pct(fd, fd),
  ]);
  const ownership = sheet("Ownership", ownRows, [ownTotal]);

  // A ledger per stock class
  const classLedgers = classes.map(([cid, c]) => {
    const prefix = String(c.data.default_id_prefix ?? "").replace(/[-_\s]+$/, "");
    const title = `${c.data.name ?? cid}${prefix ? ` (${prefix})` : ""} Ledger`;
    const r = header(company, title, asOf, LEDGER);
    const mine = stock.filter((x) => x.classId === cid);
    for (const x of mine) {
      const f = fact(x);
      r.push([
        x.id,
        f.name,
        f.extId,
        date(x.date),
        x.originalQuantity,
        x.quantity,
        num(x.price),
        date(x.vestingStart?.date),
        f.schedule,
        f.vested,
        f.unvested,
        num(f.capital),
        "",
        "",
        f.repurchased || "",
        f.repurchaseDates,
        num(f.repurchasePaid),
        f.transferred || "",
        f.transferDates,
        f.transferredTo,
        "",
        "",
        f.cancelled || "",
        f.cancelDates,
        f.cancelReasons,
        "",
        "",
        "",
        f.exemptions,
        "",
        f.domicile,
        "",
        date(f.issue.board_approval_date),
        x.planId ? String(s.plans.get(x.planId)?.data.plan_name ?? "") : "",
        "",
        "",
        f.docs,
        f.comments,
      ]);
    }
    const t = r.length;
    const caps = mine.map((x) => fact(x).capital).filter(Boolean);
    r.push([
      "Total",
      "",
      "",
      "",
      sum(mine.map((x) => x.originalQuantity)),
      sum(mine.map((x) => x.quantity)),
      "",
      "",
      "",
      sum(mine.map((x) => fact(x).vested ?? 0n)),
      sum(mine.map((x) => fact(x).unvested ?? 0n)),
      num(caps.length ? sumDec(caps) : ""),
    ]);
    return sheet(title, r, [t]);
  });

  // A ledger per equity plan, with the plan summary under it
  const planLedgers = [...s.plans.entries()].map(([pid, p]) => {
    const planName = String(p.data.plan_name ?? pid);
    const r = header(company, planName, asOf, PLAN);
    const mine = equity.filter((x) => x.planId === pid);
    for (const x of mine) {
      const f = fact(x);
      const windows = (f.issue.termination_exercise_windows ?? []) as Data[];
      const cls = classOf(x);
      r.push([
        x.id,
        f.name,
        f.extId,
        date(x.date),
        date(f.issue.expiration_date),
        planName,
        String(f.issue.option_grant_type ?? words(x.compensationType)),
        num(x.price),
        x.originalQuantity,
        x.quantity,
        f.vested,
        f.unvested,
        x.exercised || "",
        f.exerciseDates,
        f.cancelled || "",
        f.cancelDates,
        f.cancelReasons,
        "",
        f.domicile,
        date(f.issue.board_approval_date),
        cls ? String(s.classes.get(cls)?.data.name ?? cls) : "",
        f.schedule,
        date(x.vestingStart?.date),
        yesNo(x.earlyExercisable),
        f.exemptions,
        "",
        "",
        "",
        f.docs,
        f.comments,
        "",
        ...WINDOWS.map(([, reasons]) => {
          const w = windows.find((w) => reasons.includes(w.reason));
          return w ? `${w.period} ${String(w.period_type ?? "").toLowerCase()}` : "";
        }),
      ]);
    }
    const t = r.length;
    const cancelled = sum(mine.map((x) => fact(x).cancelled));
    r.push([
      "Total",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      sum(mine.map((x) => x.originalQuantity)),
      sum(mine.map((x) => x.quantity)),
      sum(mine.map((x) => fact(x).vested ?? 0n)),
      sum(mine.map((x) => fact(x).unvested ?? 0n)),
      sum(mine.map((x) => x.exercised)),
      "",
      cancelled,
    ]);
    const net = (pred: (x: Security) => boolean) =>
      sum(mine.filter(pred).map((x) => x.originalQuantity - fact(x).cancelled));
    const s0 = r.length + 2;
    r.push(
      [],
      [`Summary of ${planName}`],
      [],
      ["Authorized Shares", "", p.reserved],
      [],
      ["Options Granted", "", net((x) => !!x.compensationType?.startsWith("OPTION"))],
      ["RSUs Granted", "", net((x) => x.compensationType === "RSU")],
      [
        "Other Awards Granted",
        "",
        net((x) => !x.compensationType?.startsWith("OPTION") && x.compensationType !== "RSU"),
      ],
      [],
      ["Returned to Pool", "", p.returned],
      ["Cancelled", "", cancelled],
      [],
      ["Available for Issuance", "", available(pid)],
    );
    return sheet(`${planName} Ledger`, r, [t, s0 - 1, r.length - 1]);
  });

  // Convertibles
  const cvRows = header(company, "Convertibles", asOf, CONVERTIBLES);
  for (const x of convertibles) {
    const f = fact(x);
    const principal = String(f.issue.investment_amount?.amount ?? x.amount ?? "");
    cvRows.push([
      x.id,
      f.name,
      f.extId,
      date(x.date),
      num(principal),
      num(x.amount),
      "",
      "",
      "",
      num(principal),
      num(x.amount),
      num(x.cap),
      x.discount ? { pct: dec(x.discount) } : "",
      yesNo(x.mfn),
      x.mfn ? date(x.date) : "",
      f.conversionDates,
      f.convertedTo,
      date(f.issue.maturity_date),
      f.cancelDates,
      f.cancelReasons,
      f.exemptions,
      "",
      f.domicile,
      f.status,
      x.timing === "POST_MONEY"
        ? "Post-money SAFE"
        : x.timing === "PRE_MONEY"
          ? "Pre-money SAFE"
          : words(x.convertibleType),
      f.docs,
      f.comments,
    ]);
  }
  const cvTotal = cvRows.length;
  const issued = convertibles.map((x) => String(fact(x).issue.investment_amount?.amount ?? x.amount ?? "0"));
  const outstanding = convertibles.map((x) => x.amount ?? "0");
  cvRows.push([
    "Total",
    "",
    "",
    "",
    num(sumDec(issued)),
    num(sumDec(outstanding)),
    "",
    "",
    "",
    num(sumDec(issued)),
    num(sumDec(outstanding)),
  ]);
  const cvSheet = sheet("Convertibles", cvRows, [cvTotal]);

  // Voting: outstanding shares × votes per share of their class
  const votesOf = (x: Security) => {
    const per = String(s.classes.get(x.classId ?? "")?.data.votes_per_share ?? "1");
    return times(per, x.quantity);
  };
  const voteRows = header(company, "Voting Ownership", asOf, [
    "Stakeholder Name",
    "Stakeholder External ID",
    "Votes",
    "Voting Ownership Percentage",
  ]);
  const allVotes = sumDec(stock.map(votesOf));
  const [vn, vd] = [parseDec(allVotes).v, 10n ** BigInt(parseDec(allVotes).scale)];
  for (const { id, f } of holders) {
    const mine = stock.filter((x) => x.stakeholderId === id && x.quantity > 0n);
    if (!mine.length) continue;
    const v = sumDec(mine.map(votesOf));
    const p = parseDec(v);
    voteRows.push([f.name, f.extId, num(dec(v)), vn > 0n ? pct(p.v * vd, vn * 10n ** BigInt(p.scale)) : ""]);
  }
  const vTotal = voteRows.length;
  voteRows.push(["Totals", "", num(dec(allVotes)), vn > 0n ? { pct: "1" } : ""]);
  const voting = sheet("Voting Ownership", voteRows, [vTotal]);

  const extra = overviewTabs(s, rows, totals, company, asOf, opts.currency ?? "USD");
  return [
    extra.overview,
    summary,
    ownership,
    ...classLedgers,
    ...planLedgers,
    cvSheet,
    voting,
    extra.vesting,
    extra.missing,
    holdingsSheet(s, secs, fact, rows), // last: holdingsCsv reads it
  ];
}

/** Every security on one tab, one row each: what the CSV export holds. */
function holdingsSheet(
  s: State,
  secs: Security[],
  fact: ReturnType<typeof facts>,
  rows: ReturnType<typeof capTableRows>,
): Sheet {
  const order = { stock: 0, equity: 1, convertible: 2 };
  const out: Cell[][] = [HOLDINGS];
  for (const x of [...secs].sort((a, b) => order[a.kind] - order[b.kind])) {
    const f = fact(x);
    const where = x.planId
      ? String(s.plans.get(x.planId)?.data.plan_name ?? x.planId)
      : x.classId
        ? String(s.classes.get(x.classId)?.data.name ?? x.classId)
        : "";
    const conv = x.kind === "convertible";
    out.push([
      x.id,
      f.name,
      f.type,
      conv ? "SAFE / convertible" : x.kind === "equity" ? award(x.compensationType) : "Stock",
      where,
      date(x.date),
      conv ? "" : x.originalQuantity,
      conv ? "" : x.quantity,
      f.vested,
      f.unvested,
      x.exercised || "",
      f.cancelled || "",
      f.repurchased || "",
      f.transferred || "",
      num(x.price),
      String((conv ? x.currency : x.priceCurrency) ?? ""),
      num(f.capital),
      f.schedule,
      date(x.vestingStart?.date),
      date(f.issue.expiration_date),
      num(x.amount),
      num(x.cap),
      x.discount ? { pct: dec(x.discount) } : "",
      conv ? yesNo(x.mfn) : "",
      f.status,
      rows.find((r) => r.securityId === x.id)?.fdPercent ?? "",
      f.docs,
    ]);
  }
  return { name: "All holdings", rows: out, header: [0], freeze: 1 };
}

/** The CSV export: every holding with the full ledger columns (captable.csv in the vault stays the short one). */
export function holdingsCsv(events: VaultEvent[], asOf: string): string {
  const tab = fullCapTable(events, asOf).at(-1)!;
  return `${tab.rows.map((r) => r.map((c) => csvCell(cellText(c))).join(",")).join("\n")}\n`;
}
