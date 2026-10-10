import { fmtInt } from "./num";
import { capTableRows } from "./rows";
import type { State } from "./types";

/** Plain-language list of everything that breaks docs/03 invariants 1–7. Empty means the state is consistent. */
export function checkInvariants(s: State): string[] {
  // From the reducer: 3 (explicit vestings ≤ granted; vesting terms can't exceed by construction), 4 (exercise ≤ vested),
  // 5 (≤ balance), bad numbers, unknown or duplicate references.
  const out = [...s.violations];
  for (const [id, c] of s.classes) {
    const issued = [...s.securities.values()]
      .filter((x) => x.kind === "stock" && x.classId === id)
      .reduce((a, x) => a + x.quantity, 0n);
    if (issued > c.authorized)
      out.push(
        `Issued would exceed authorized for ${c.data.name} (${fmtInt(issued)} > ${fmtInt(c.authorized)})`,
      );
  }
  const rows = capTableRows(s);
  for (const r of rows.filter((x) => x.group === 2 && x.shares! < 0n))
    out.push(
      `Pool ${s.plans.get(r.securityId)!.data.plan_name} would go negative (${fmtInt(r.shares!)} available)`,
    );
  const fd = rows.filter((r) => r.group <= 2);
  const sum = fd.reduce((a, r) => a + BigInt(r.fdPercent.replace(".", "")), 0n);
  // Skipped when a pool is negative: invariant 2 already reports that, and percentages of a negative row are meaningless.
  if (fd.every((r) => r.shares! >= 0n) && fd.some((r) => r.shares! > 0n) && sum !== 10000n)
    out.push(`Fully diluted percentages sum to ${sum} basis points, not 100.00%`);
  const ids = new Set<string>(
    [
      ...s.stakeholders.keys(),
      ...s.plans.keys(),
      s.issuer?.id,
      ...[...s.securities.values()].flatMap((x) => [x.id, x.txId]),
    ].filter(Boolean) as string[],
  );
  for (const [docId, d] of s.docs)
    for (const t of d.links)
      if (!ids.has(t)) out.push(`Document ${docId} is linked to ${t}, which doesn't exist`);
  return out;
}
