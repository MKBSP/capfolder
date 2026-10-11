// F-08 "Start from zero": the wizard's answers → one batch of drafts (pure, so the live preview and the save agree).
import { builders as b, type EventDraft, nextSecurityIdNumber, type State } from "@capfolder/core";
import { num } from "./fmt";

export interface FounderInput {
  name: string;
  email: string;
  shares: string;
  issueDate: string;
  vesting: boolean;
  vestingStart: string;
}
export interface SafeInput {
  investor: string;
  amount: string;
  cap: string;
  discount: string; // "20" means 20%
  mfn: boolean;
  date: string;
}
export interface WizardInput {
  authorized: string;
  par: string;
  founders: FounderInput[];
  pool: { size: string; name: string; approved: string } | null;
  safes: SafeInput[];
}

/** "20" → "0.2", "33,3" → "0.333" (exact, in the founder's decimal mark); "" → undefined. */
export const discountFraction = (pct: string) => {
  const v = num(pct);
  if (!/^\d+(\.\d+)?$/.test(v) || !/[1-9]/.test(v)) return undefined;
  const [i, f = ""] = v.split(".");
  const d = i!.padStart(3, "0");
  return `${d.slice(0, -2).replace(/^0+(?=\d)/, "")}.${d.slice(-2)}${f}`.replace(/\.?0+$/, "");
};
const digits = num; // the founder's decimal mark (Settings → Your country)

export function wizardDrafts(latest: State, w: WizardInput, currency = "USD"): EventDraft[] {
  const classId = b.newId("sc");
  const termsId = b.newId("vt");
  const drafts: EventDraft[] = [
    b.stockClass({
      id: classId,
      name: "Common",
      authorized: digits(w.authorized),
      parValue: digits(w.par),
      currency,
    }),
  ];
  const vesting = w.founders.some((f) => f.vesting);
  if (vesting) drafts.push(b.vestingTerms4y1y(termsId));
  let cs = nextSecurityIdNumber(latest, "CS");
  for (const f of w.founders.filter((x) => x.name.trim())) {
    const sh = b.stakeholder({ name: f.name.trim(), email: f.email.trim() || undefined, type: "INDIVIDUAL" });
    drafts.push(sh);
    // The vesting terms aren't in `latest` yet, so the start condition id is the builder's default ("vesting-start").
    drafts.push(
      ...b.stockIssuance({
        currency,
        state: latest,
        stakeholderId: sh.data.id,
        classId,
        quantity: digits(f.shares),
        price: digits(w.par),
        date: f.issueDate,
        securityId: `CS-${cs++}`,
        ...(f.vesting ? { vestingTermsId: termsId, vestingStart: f.vestingStart } : {}),
      }),
    );
  }
  if (w.pool && digits(w.pool.size))
    drafts.push(
      b.stockPlan({
        name: w.pool.name,
        reserved: digits(w.pool.size),
        boardApprovalDate: w.pool.approved,
        classId,
      }),
    );
  let safe = nextSecurityIdNumber(latest, "SAFE");
  for (const s of w.safes.filter((x) => x.investor.trim())) {
    const sh = b.stakeholder({ name: s.investor.trim(), type: "INSTITUTION" });
    drafts.push(
      sh,
      b.safe({
        currency,
        state: latest,
        stakeholderId: sh.data.id,
        amount: digits(s.amount),
        cap: digits(s.cap) || undefined,
        discount: discountFraction(s.discount),
        mfn: s.mfn,
        date: s.date,
        securityId: `SAFE-${safe++}`,
      }),
    );
  }
  return drafts;
}
