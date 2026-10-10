import Papa from "papaparse";

/** CSV text → rows of cells (papaparse; handles quotes, commas in cells, CRLF, a BOM). */
export function parseCsv(text: string): string[][] {
  const r = Papa.parse<string[]>(text.replace(/^﻿/, ""), { skipEmptyLines: false });
  const rows = r.data.map((row) => row.map((c) => String(c ?? "")));
  while (rows.length && rows.at(-1)!.every((c) => c.trim() === "")) rows.pop();
  return rows;
}
