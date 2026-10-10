import { reduce } from "./reduce";
import { capTableRows } from "./rows";
import type { Row, VaultEvent } from "./types";

const HEADER =
  "stakeholder,type,class,shares,fd_percent,vested,unvested,safe_amount,safe_cap,safe_discount,as_converted_percent,doc_status";

// Vault data is untrusted: anything that isn't a plain number and starts like a formula gets a leading '.
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;
const safe = (v: string) => (/^[=+\-@\t\r]/.test(v) && !PLAIN_NUMBER.test(v) ? `'${v}` : v);
const cell = (v: string) => {
  const s = safe(v);
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};
const n = (v: bigint | null) => (v === null ? "" : v.toString());

export function toCaptableCsv(rows: Row[]): string {
  const lines = rows.map((r) =>
    [
      r.stakeholder,
      r.type,
      r.class,
      n(r.shares),
      r.fdPercent,
      n(r.vested),
      n(r.unvested),
      r.safeAmount,
      r.safeCap,
      r.safeDiscount,
      r.asConverted,
      r.docStatus,
    ]
      .map(cell)
      .join(","),
  );
  return `${[HEADER, ...lines].join("\n")}\n`;
}

export const captableCsv = (events: VaultEvent[], asOf: string): string =>
  toCaptableCsv(capTableRows(reduce(events, asOf)));
