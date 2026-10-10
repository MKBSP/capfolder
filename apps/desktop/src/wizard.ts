// F-08 "Start from zero": the wizard's answers → one batch of drafts (pure, so the live preview and the save agree).
import { builders as b, type EventDraft, nextSecurityIdNumber, type State } from "@capfolder/core";

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

/** "20" → "0.2"; "" → undefined. */
export const discountFraction = (pct: string) => {
  const n = Number(pct);
  return pct.trim() && n > 0 ? String(n / 100) : undefined;
};
const digits = (s: string) => s.replace(/[,\s$]/g, "");

export function wizardDrafts(latest: State, w: WizardInput): EventDraft[] {
  const classId = b.newId("sc");
  const termsId = b.newId("vt");
  const drafts: EventDraft[] = [
    b.stockClass({ id: classId, name: "Common", authorized: digits(w.authorized), parValue: w.par }),
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
        state: latest,
        stakeholderId: sh.data.id,
        classId,
        quantity: digits(f.shares),
        price: w.par,
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
