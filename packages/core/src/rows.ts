import { decFraction, fmtInt, largestRemainder, parseDec, ratioFixed, toInt } from "./num";
import type { Row, Security, State } from "./types";
import { startConditionId, type VestingResult, vestedAt } from "./vesting";

/** Vested of what is still outstanding, as of `at`. Vesting is measured on the original grant and stops at stoppedAt. */
export function securityVested(
  x: Security,
  s: State,
  at: string,
): VestingResult & { unvested: bigint | null } {
  const t = x.stoppedAt && x.stoppedAt < at ? x.stoppedAt : at;
  let r: VestingResult;
  if (x.vestings?.length) {
    const sum = x.vestings.filter((v) => v.date <= t).reduce((a, v) => a + toInt(v.amount), 0n);
    r = { vested: sum, math: `${fmtInt(sum)} = sum of explicit vesting dates up to ${t}` };
  } else if (x.vestingTermsId) {
    const terms = s.vestingTerms.get(x.vestingTermsId);
    if (!terms)
      r = {
        vested: null,
        math: "vesting unknown: vesting terms not found",
        unknownReason: "terms not found",
      };
    else if (!x.vestingStart)
      r = { vested: 0n, math: "0: vesting has not started (no vesting start recorded)" };
    else if (x.vestingStart.conditionId !== startConditionId(terms))
      r = {
        vested: null,
        math: "vesting unknown: starts at a non-start condition",
        unknownReason: "non-start condition",
      };
    else r = vestedAt(x.originalQuantity, terms, x.vestingStart.date, t);
  } else
    r = {
      vested: x.originalQuantity,
      math: `${fmtInt(x.originalQuantity)}: no vesting schedule, fully vested`,
    };
  if (r.vested === null) return { ...r, unvested: null };
  let v = r.vested - x.exercised;
  if (v < 0n) v = 0n;
  if (v > x.quantity) v = x.quantity;
  return { ...r, vested: v, unvested: x.quantity - v };
}

const name = (s: State, id: string) => s.stakeholders.get(id)?.name?.legal_name ?? id;
const className = (s: State, id?: string) => (id ? (s.classes.get(id)?.data.name ?? id) : "");
const docStatus = (s: State, x: Security): "signed" | "missing" =>
  [...s.docs.values()].some((d) => !d.removed && (d.links.has(x.id) || d.links.has(x.txId)))
    ? "signed"
    : "missing";
const whole = (amount: string) => fmtInt(BigInt(amount.split(".")[0]!));

/** Cap table rows as of state.asOf, in display order, with fully diluted percentages. */
export function capTableRows(s: State): Row[] {
  const rows: Row[] = [];
  const blank = { fdPercent: "", safeAmount: "", safeCap: "", safeDiscount: "", asConverted: "" };
  for (const x of s.securities.values()) {
    if (x.kind === "convertible") {
      if (!x.amount || parseDec(x.amount).v === 0n) continue;
      const post = x.timing === "POST_MONEY" && x.cap ? x.cap : undefined;
      const [n, d] = post ? decFraction(x.amount, post) : [0n, 1n];
      rows.push({
        ...blank,
        group: 3,
        date: x.date,
        securityId: x.id,
        stakeholder: name(s, x.stakeholderId),
        type: (x.convertibleType ?? "convertible").toLowerCase(),
        class: "",
        shares: null,
        vested: null,
        unvested: null,
        safeAmount: x.amount,
        currency: x.currency ?? "USD",
        safeCap: x.cap ?? "",
        safeDiscount: x.discount ?? "",
        asConverted: post ? ratioFixed(n * 100n, d, 2) : "",
        docStatus: docStatus(s, x),
        math: {
          as_converted: post
            ? `${whole(x.amount)} ÷ ${whole(post)} post-money cap`
            : "converts at next round",
        },
      });
      continue;
    }
    if (x.quantity === 0n) continue;
    const v = securityVested(x, s, s.asOf);
    const isOption = x.kind === "equity";
    const classId = x.classId ?? (x.planId ? s.plans.get(x.planId)?.data.stock_class_ids?.[0] : undefined);
    const type = isOption
      ? x.compensationType?.startsWith("OPTION")
        ? "option"
        : (x.compensationType ?? "equity").toLowerCase()
      : (s.classes.get(x.classId!)?.data.class_type ?? "common").toLowerCase();
    rows.push({
      ...blank,
      group: isOption ? 1 : 0,
      date: x.date,
      securityId: x.id,
      stakeholder: name(s, x.stakeholderId),
      type,
      class: className(s, classId),
      shares: x.quantity,
      vested: v.vested,
      unvested: v.unvested,
      docStatus: docStatus(s, x),
      math: { vested: v.math },
    });
  }
  for (const [id, p] of s.plans) {
    const granted = [...s.securities.values()]
      .filter((x) => x.planId === id)
      .reduce((a, x) => a + x.originalQuantity, 0n);
    const available = p.reserved - granted + p.returned;
    rows.push({
      ...blank,
      group: 2,
      date: p.data.board_approval_date ?? "",
      securityId: id,
      stakeholder:
        s.plans.size === 1 ? "Option pool (available)" : `Option pool: ${p.data.plan_name} (available)`,
      type: "pool",
      class: className(s, p.data.stock_class_ids?.[0]),
      shares: available,
      vested: null,
      unvested: null,
      docStatus: "",
      math: {
        shares: `${fmtInt(available)} = ${fmtInt(p.reserved)} reserved − ${fmtInt(granted)} granted + ${fmtInt(p.returned)} returned`,
      },
    });
  }
  rows.sort(
    (a, b) =>
      a.group - b.group ||
      (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) ||
      (a.securityId < b.securityId ? -1 : a.securityId > b.securityId ? 1 : 0),
  );
  const fdRows = rows.filter((r) => r.group <= 2);
  const fd = fdRows.reduce((a, r) => a + r.shares!, 0n);
  largestRemainder(
    fdRows.map((r) => r.shares!),
    2,
  ).forEach((pct, i) => {
    const r = fdRows[i]!;
    r.fdPercent = pct;
    r.math.fd_percent = `${fmtInt(r.shares!)} ÷ ${fmtInt(fd)} fully diluted (largest-remainder rounding)`;
  });
  return rows;
}

/** Founder = holder of common stock issued on the formation date or with vesting (ponytail: until roles exist). */
export function isFounder(s: State, x: Security | undefined): boolean {
  if (x?.kind !== "stock") return false;
  return x.date === s.issuer?.formation_date || !!x.vestingTermsId || !!x.vestings?.length;
}
