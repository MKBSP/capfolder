import { reduce } from "./reduce";
import { capTableRows } from "./rows";
import type { Row, VaultEvent } from "./types";

const HEADER =
  "stakeholder,type,class,shares,fd_percent,vested,unvested,safe_amount,safe_cap,safe_discount,as_converted_percent,doc_status";

const text = (v: string) => (/^[=+\-@]/.test(v) ? `'${v}` : v); // stop spreadsheet formula execution
const cell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);
const n = (v: bigint | null) => (v === null ? "" : v.toString());

export function toCaptableCsv(rows: Row[]): string {
  const lines = rows.map((r) =>
    [
      text(r.stakeholder),
      r.type,
      text(r.class),
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
