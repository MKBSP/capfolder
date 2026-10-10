import { builders as b, type EventDraft, type State } from "@capfolder/core";

/** The standard 4y / 1y-cliff / monthly terms: reuse the vault's copy, or create one (with a caller-stable id). */
export function standardTerms(s: State, newId: string): { id: string; drafts: EventDraft[] } {
  for (const [id, t] of s.vestingTerms)
    if (t.name === "4 years, 1-year cliff, monthly") return { id, drafts: [] };
  return { id: newId, drafts: [b.vestingTerms4y1y(newId)] };
}
