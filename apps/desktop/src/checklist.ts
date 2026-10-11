// Documents.html "Due-diligence ready": which papers a company should have, computed from the cap table (pure).
import { type Gap, isHoldingProof, type State } from "@capfolder/core";
import { moneyShort } from "./fmt";
import { isFounder } from "./views";

export interface CheckItem {
  label: string;
  ok: boolean;
  path?: string; // filed copy, relative to the vault
  docId?: string;
  target?: string; // what a new document would be linked to
  docType: string;
  note?: string;
}
export interface CheckGroup {
  title: string;
  items: CheckItem[];
}

export function checklist(s: State, gaps: Gap[]): { groups: CheckGroup[]; done: number; total: number } {
  const name = (id: string) => s.stakeholders.get(id)?.name?.legal_name ?? id;
  const docs = [...s.docs.entries()].filter(([, d]) => !d.removed);
  /** First filed document linked to any of `targets`: of `type`, or (no type) the holding's own agreement. */
  const find = (targets: string[], type?: string) => {
    const hit = docs.find(
      ([, d]) =>
        targets.some((t) => d.links.has(t)) &&
        (type ? d.data.doc_type === type : isHoldingProof(d.data.doc_type)),
    );
    return hit ? { docId: hit[0], path: hit[1].data.path as string } : null;
  };
  const byType = (type: string) => {
    const hit = docs.find(([, d]) => d.data.doc_type === type);
    return hit ? { docId: hit[0], path: hit[1].data.path as string } : null;
  };
  const item = (
    label: string,
    docType: string,
    hit: { docId: string; path: string } | null,
    target?: string,
    note?: string,
  ): CheckItem =>
    hit ? { label, ok: true, docType, ...hit, target } : { label, ok: false, docType, target, note };

  const open = [...s.securities.values()].filter((x) =>
    x.kind === "convertible" ? x.amount && x.amount !== "0" : x.quantity > 0n,
  );
  const company: CheckItem[] = [
    item("Certificate of Incorporation", "company_certificate", byType("company_certificate")),
    item("Bylaws", "company_bylaws", byType("company_bylaws")),
    ...[...s.plans.entries()].map(([id, p]) =>
      item(
        `${p.data.plan_name} + board & stockholder approval`,
        "plan",
        find([id], "plan") ?? find([id], "board_consent"),
        id,
      ),
    ),
  ];
  if (!s.plans.size)
    company.push(item("Equity Incentive Plan + board & stockholder approval", "plan", byType("plan")));

  const founders: CheckItem[] = [];
  const founderStock = open.filter((x) => isFounder(s, x));
  for (const x of founderStock)
    founders.push(
      item(`Stock purchase agreement · ${name(x.stakeholderId)}`, "spa", find([x.id, x.txId]), x.id),
    );
  for (const id of new Set(founderStock.map((x) => x.stakeholderId)))
    founders.push(item(`IP assignment · ${name(id)}`, "ciiaa", find([id], "ciiaa"), id));
  for (const x of founderStock.filter((x) => x.vestingTermsId || x.vestings?.length)) {
    const missing83b = gaps.some((g) => g.kind === "missing_83b" && g.target === x.id);
    founders.push(
      item(
        `83(b) election · ${name(x.stakeholderId)}`,
        "83b",
        find([x.id], "83b"),
        x.id,
        missing83b
          ? "Due within 30 days of the stock grant."
          : "Usually mailed to the IRS within 30 days of the stock grant.",
      ),
    );
  }

  const employees: CheckItem[] = [];
  const grants = open.filter((x) => x.kind === "equity");
  for (const x of grants)
    employees.push(
      item(`Option grant · ${name(x.stakeholderId)}`, "option_grant", find([x.id, x.txId]), x.id),
    );
  for (const id of new Set(grants.map((x) => x.stakeholderId)))
    employees.push(item(`IP assignment · ${name(id)}`, "ciiaa", find([id], "ciiaa"), id));

  const investors = open
    .filter((x) => x.kind === "convertible")
    .map((x) =>
      item(
        `${name(x.stakeholderId)} · ${moneyShort(x.amount)}`,
        "safe",
        find([x.id, x.txId]),
        x.id,
        "On the cap table, no signed document",
      ),
    );

  const groups = [
    { title: "Company", items: company },
    { title: "Founders", items: founders },
    { title: "Employees", items: employees },
    { title: "Investors · SAFEs", items: investors },
  ];
  const all = groups.flatMap((g) => g.items);
  return { groups, done: all.filter((i) => i.ok).length, total: all.length };
}
