// Labels for Home/Person derived from core output. No cap-table math here: every number comes from core.
import { type Gap, nextVest, type Row, type Security, type State, vestingSchedule } from "@capfolder/core";
import { day, month } from "./fmt";

/** Founder = holder of common stock issued on the formation date or with vesting (ponytail: until roles exist). */
export function isFounder(s: State, x: Security | undefined): boolean {
  if (x?.kind !== "stock") return false;
  return x.date === s.issuer?.formation_date || !!x.vestingTermsId || !!x.vestings?.length;
}

export function typeLabel(s: State, r: Row): string {
  if (r.group === 2) return "Pool";
  const x = s.securities.get(r.securityId);
  if (r.group === 3) return x?.timing === "POST_MONEY" ? "Post-money SAFE" : "SAFE";
  const cls = r.class || "Common";
  if (r.group === 1) return `Employee · ${r.type === "option" ? "Option" : r.type.toUpperCase()}`;
  return isFounder(s, x) ? `Founder · ${cls}` : cls;
}

export type DocChip = { tone: "green" | "amber" | "red"; text: string };

/** Most important document problem for a row, from "What's missing". */
export function docChip(s: State, r: Row, gaps: Gap[]): DocChip | null {
  if (r.group === 2)
    return gaps.some((g) => g.kind === "no_plan_documents" && g.target === r.securityId)
      ? { tone: "amber", text: "Plan documents missing" }
      : { tone: "green", text: "Signed · Plan" };
  const x = s.securities.get(r.securityId);
  const mine = gaps.filter((g) => g.target === r.securityId || (x && g.target === x.stakeholderId));
  if (mine.some((g) => g.kind === "no_signed_doc")) return { tone: "red", text: "No signed doc" };
  if (mine.some((g) => g.kind === "missing_83b")) return { tone: "amber", text: "83(b) missing" };
  if (mine.some((g) => g.kind === "no_ip_assignment"))
    return { tone: "amber", text: "IP assignment missing" };
  if (mine.some((g) => g.kind === "no_board_consent"))
    return { tone: "amber", text: "Board consent missing" };
  if (mine.some((g) => g.kind === "vesting_unknown")) return { tone: "amber", text: "Vesting unknown" };
  return {
    tone: "green",
    text: r.group === 1 ? "Signed · Grant" : r.group === 0 ? "Signed · SPA" : "Signed",
  };
}

/** Vesting cell: bar fraction + label ("75%", "Cliff Mar 2027", "—"). */
export function vestingCell(s: State, r: Row): { fraction: number; label: string } | null {
  if (r.group > 1 || r.shares === null) return null;
  if (r.vested === null) return { fraction: 0, label: "unknown" };
  const x = s.securities.get(r.securityId);
  if (r.shares === 0n) return { fraction: 0, label: "—" };
  const pct = Number((r.vested * 10000n) / r.shares) / 100;
  if (r.vested === 0n && x) {
    const next = nextVest(x, s, s.asOf);
    if (next) return { fraction: 0, label: `Cliff ${month(next.date)}` };
  }
  return { fraction: pct / 100, label: `${Math.round(pct)}%` };
}

/** "4 years · 1-year cliff (passed Oct 7, 2026) · monthly" */
export function scheduleText(s: State, x: Security): string {
  const pts = vestingSchedule(x, s);
  if (!pts) return x.vestingTermsId ? "Vesting unknown" : "No vesting schedule";
  const cliff = pts.find((p) => p.cumulative > 0n);
  const years = pts.length % 12 === 0 ? `${pts.length / 12} years` : `${pts.length} months`;
  const cliffIdx = cliff ? pts.indexOf(cliff) + 1 : 0;
  const cliffText =
    cliff && cliffIdx > 1
      ? ` · ${cliffIdx % 12 === 0 ? `${cliffIdx / 12}-year` : `${cliffIdx}-month`} cliff (${cliff.date <= s.asOf ? "passed" : "on"} ${day(cliff.date)})`
      : "";
  return `${years}${cliffText} · monthly`;
}
