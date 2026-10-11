// docs/11 launch dashboard: pass/fail 30 days after Show HN.
// node --experimental-strip-types src/dashboard.ts <pings.jsonl> <github.csv> <donations>
import { readFileSync } from "node:fs";
import type { PingRow } from "./app.ts";

export interface Signal {
  signal: string;
  value: number;
  pass: number;
  ok: boolean;
}

export function dashboard(pingsJsonl: string, githubCsv: string, donations: number): Signal[] {
  const rows = pingsJsonl.split("\n").flatMap((l) => {
    try {
      return [JSON.parse(l) as PingRow];
    } catch {
      return []; // a line cut short by a crash mid-write
    }
  });
  const installs = (f: (r: PingRow) => boolean) => new Set(rows.filter(f).map((r) => r.install_id)).size;
  const last = githubCsv.trim().split("\n").slice(1).at(-1)?.split(",") ?? [];
  const row = (signal: string, value: number, pass: number) => ({ signal, value, pass, ok: value >= pass });
  return [
    row("Downloads", Number(last[1] ?? 0), 300),
    row(
      "Installs (first_run)",
      installs((r) => r.event === "first_run"),
      100,
    ),
    row(
      "Activated (imported or has_documents)",
      installs((r) => r.imported || r.has_documents),
      15,
    ),
    // ponytail: the ping only says whether an install sent anything, so this counts installs, not envelopes
    row(
      "Installs that sent for signature",
      installs((r) => r.sent_envelope),
      3,
    ),
    row("GitHub stars", Number(last[2] ?? 0), 250),
    row("Donations", donations, 1),
  ];
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [pings, github, donations = "0"] = process.argv.slice(2);
  if (!pings || !github) throw new Error("usage: dashboard.ts <pings.jsonl> <github.csv> [donations]");
  for (const s of dashboard(readFileSync(pings, "utf8"), readFileSync(github, "utf8"), Number(donations)))
    console.log(`${s.ok ? "PASS" : "miss"}  ${s.signal}: ${s.value} (pass ≥ ${s.pass})`);
}
