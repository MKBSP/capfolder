import { TRANSFER_NOTE } from "./builders";
import { parseDec } from "./num";
import { securityVested } from "./rows";
import type { Security, State } from "./types";

export interface Gap {
  kind: string;
  target: string;
  text: string;
  severity: "red" | "amber";
}

/** Documents about a holding that aren't its own signed agreement (an 83(b), a consent, an IP assignment…). */
export const SIDE_DOC_TYPES = new Set([
  "83b",
  "ciiaa",
  "board_consent",
  "plan",
  "company_certificate",
  "company_bylaws",
]);
/** A signed document for the holding itself: not a side document (consent, 83(b)…) and not filed as a draft. */
export const isHoldingProof = (docType: unknown, flags?: unknown) =>
  !SIDE_DOC_TYPES.has(String(docType ?? "")) && !(Array.isArray(flags) && flags.includes("draft"));

// doc_type values used for gap checks (docs/03): 83b, ciiaa, board_consent, plus any doc linked to a plan id.
export function computeGaps(s: State): Gap[] {
  const gaps: Gap[] = [];
  const name = (id: string) => s.stakeholders.get(id)?.name?.legal_name ?? id;
  const linked = (target: string, type?: string) =>
    [...s.docs.values()].some(
      (d) =>
        !d.removed &&
        d.links.has(target) &&
        (!type || d.data.doc_type === type) &&
        !d.data.flags?.includes?.("draft"),
    );
  const proof = (target: string) =>
    [...s.docs.values()].some(
      (d) => !d.removed && d.links.has(target) && isHoldingProof(d.data.doc_type, d.data.flags),
    );
  const label = (x: Security) =>
    x.kind === "convertible"
      ? (x.convertibleType ?? "convertible")
      : x.kind === "equity"
        ? "grant"
        : "shares";
  const open = [...s.securities.values()].filter((x) =>
    x.kind === "convertible" ? parseDec(x.amount!).v > 0n : x.quantity > 0n,
  );
  const plus30 = (d: string) =>
    new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10) + 30)).toISOString().slice(0, 10);
  const people = new Set<string>();
  for (const x of open) {
    const who = name(x.stakeholderId);
    if (!proof(x.id) && !proof(x.txId))
      gaps.push({
        kind: "no_signed_doc",
        target: x.id,
        severity: "red",
        text: `No signed document for ${who}'s ${label(x)}`,
      });
    if (x.kind === "equity" && !linked(x.id, "board_consent") && !linked(x.txId, "board_consent"))
      gaps.push({
        kind: "no_board_consent",
        target: x.id,
        severity: "amber",
        text: `No board consent for ${who}'s grant`,
      });
    // 83(b) is due 30 days after issuance; flag only while the deadline hasn't passed (a missed one is lawyer work).
    if (
      x.kind === "stock" &&
      (x.vestingTermsId || x.vestings?.length) &&
      plus30(x.date) >= s.asOf &&
      !x.note?.startsWith(TRANSFER_NOTE) &&
      !linked(x.id, "83b")
    )
      gaps.push({
        kind: "missing_83b",
        target: x.id,
        severity: "amber",
        text: `File ${who}'s 83(b) by ${plus30(x.date)}`,
      });
    if (x.kind !== "convertible") {
      if (s.stakeholders.get(x.stakeholderId)?.stakeholder_type === "INDIVIDUAL") people.add(x.stakeholderId);
      const v = securityVested(x, s, s.asOf);
      if (v.unknownReason)
        gaps.push({
          kind: "vesting_unknown",
          target: x.id,
          severity: "amber",
          text: `Vesting unknown for ${who}: ${v.unknownReason}`,
        });
    }
    if (x.note === "imported snapshot")
      gaps.push({
        kind: "imported_snapshot",
        target: x.id,
        severity: "amber",
        text: `History before import not available for ${who}`,
      });
  }
  for (const p of people)
    if (!linked(p, "ciiaa"))
      gaps.push({
        kind: "no_ip_assignment",
        target: p,
        severity: "amber",
        text: `No IP assignment for ${name(p)}`,
      });
  for (const [id, p] of s.plans)
    if (!linked(id))
      gaps.push({
        kind: "no_plan_documents",
        target: id,
        severity: "amber",
        text: `No plan document or approvals for ${p.data.plan_name}`,
      });
  return gaps;
}
