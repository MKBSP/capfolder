// F-30: everything a lawyer needs, as a file map the caller zips. Nothing is uploaded.
import { captableCsv } from "../captable-csv";
import { canonicalLine } from "../chain";
import { MAX_DATE } from "../dates";
import { computeGaps } from "../gaps";
import { toOcfExport } from "../ocf-export";
import { reduce } from "../reduce";
import type { State, VaultEvent } from "../types";
import { toPdf } from "./pdf";
import { DISCLAIMER, sheets } from "./sheets";
import { toXlsx } from "./xlsx";

export type LawyerScope = { kind: "all" } | { kind: "person"; stakeholderId: string };

/** Ids that belong to the scope: the person and every security (and its issuance) they hold. */
function scopeIds(s: State, scope: LawyerScope): Set<string> | null {
  if (scope.kind === "all") return null;
  const ids = new Set([scope.stakeholderId]);
  for (const x of s.securities.values())
    if (x.stakeholderId === scope.stakeholderId) {
      ids.add(x.id);
      ids.add(x.txId);
    }
  return ids;
}

/** Vault-relative paths of the attached (not removed) documents in scope, so the caller reads only those. */
export function lawyerDocPaths(events: VaultEvent[], scope: LawyerScope): string[] {
  const s = reduce(events, MAX_DATE);
  const ids = scopeIds(s, scope);
  return [...s.docs.values()]
    .filter((d) => !d.removed && typeof d.data.path === "string")
    .filter((d) => !ids || [...d.links].some((t) => ids.has(t)))
    .map((d) => d.data.path as string);
}

export async function lawyerPackage(p: {
  events: VaultEvent[];
  asOf: string;
  docs: Record<string, Uint8Array | null>; // from lawyerDocPaths; null = the file couldn't be read
  scope: LawyerScope;
  generatedAt: string;
}): Promise<Record<string, Uint8Array | string>> {
  const s = reduce(p.events, p.asOf);
  const ids = scopeIds(reduce(p.events, MAX_DATE), p.scope);
  const person = p.scope.kind === "person" ? p.scope.stakeholderId : undefined;
  const company = s.issuer?.legal_name ?? "Company";
  const who = person ? (s.stakeholders.get(person)?.name?.legal_name ?? person) : undefined;
  const tabs = sheets(p.events, p.asOf, { stakeholderId: person });
  const out: Record<string, Uint8Array | string> = {
    "cap-table.xlsx": toXlsx(tabs),
    "cap-table.pdf": await toPdf(tabs, `${company}${who ? ` · ${who}` : ""} · cap table as of ${p.asOf}`),
  };

  const gaps = computeGaps(s).filter((g) => !ids || ids.has(g.target));
  out["whats-missing.txt"] = gaps.length
    ? `What's missing as of ${p.asOf}\n\n${gaps.map((g) => `- ${g.text}`).join("\n")}\n`
    : `Nothing missing as of ${p.asOf}.\n`;

  if (!person) {
    out["cap-table.csv"] = captableCsv(p.events, p.asOf);
    out["events.jsonl"] = p.events.map((e) => `${canonicalLine(e)}\n`).join("");
    for (const [name, text] of Object.entries(
      toOcfExport(p.events, { asOf: p.asOf, generatedAt: p.generatedAt }),
    ))
      out[`ocf/${name}`] = text;
  }

  const missing: string[] = [];
  for (const [path, bytes] of Object.entries(p.docs)) {
    if (bytes) out[`documents/${path}`] = bytes;
    else missing.push(path);
  }

  const head = p.events.at(-1);
  out["README.txt"] = [
    `${company}${who ? `: documents for ${who}` : ""}`,
    `As of ${p.asOf}. Made with Capfolder on ${p.generatedAt.slice(0, 10)}.`,
    "",
    "What's inside",
    "- cap-table.xlsx: Summary, By person, Vesting and SAFEs tabs",
    "- cap-table.pdf: the same, printable",
    ...(person
      ? []
      : [
          "- cap-table.csv: the cap table in plain CSV",
          "- events.jsonl: the full record of every change, one per line, hash-chained",
          "- ocf/: the same record in Open Cap Table Format 1.2.0, readable by other cap table tools",
        ]),
    "- whats-missing.txt: documents and filings the company still needs",
    "- documents/: the signed documents on file",
    "",
    ...(person
      ? []
      : [
          "Record check",
          `${p.events.length} events. The last event's hash is ${head?.hash ?? "(none)"}.`,
          "Each line's hash covers the line before it, so any edit to events.jsonl breaks the chain.",
          "",
        ]),
    ...(missing.length
      ? [
          "Files that couldn't be read (they're listed in the record but weren't found):",
          ...missing.map((m) => `Missing file: ${m}`),
          "",
        ]
      : []),
    DISCLAIMER,
    "",
  ].join("\n");
  return out;
}
