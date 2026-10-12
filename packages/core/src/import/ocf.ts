import { unappliedError } from "../append";
import { fromOcfExport } from "../ocf-import";
import type { EventDraft } from "../types";

/** OCF files → drafts for an existing vault: the imported ISSUER takes the vault's issuer id, so it updates the company. */
export function ocfImportDrafts(
  files: Record<string, string>,
  vaultIssuerId: string | undefined,
): { drafts: EventDraft[] } | { errors: string[] } {
  const r = fromOcfExport(files);
  if ("errors" in r) return r;
  const unapplied = unappliedError(r.drafts);
  if (unapplied) return { errors: [unapplied] };
  if (!vaultIssuerId) return r;
  return {
    drafts: r.drafts.map((d) => (d.type === "ISSUER" ? { ...d, data: { ...d.data, id: vaultIssuerId } } : d)),
  };
}
