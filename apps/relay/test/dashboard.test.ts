import { expect, test } from "vitest";
import { dashboard } from "../src/dashboard.ts";

const ping = (id: string, event: string, extra: object = {}) =>
  JSON.stringify({
    day: "2026-12-01",
    install_id: id,
    event,
    app_version: "0.1.0",
    os: "macos",
    imported: false,
    has_documents: false,
    sent_envelope: false,
    ...extra,
  });

test("the docs/11 pass/fail table from pings, GitHub snapshots and donations", () => {
  const pings = [
    ping("a", "first_run"),
    ping("a", "first_run"), // a retry counts once
    ping("b", "first_run", { imported: true }),
    ping("b", "weekly", { imported: true, sent_envelope: true }),
    ping("c", "weekly", { has_documents: true }),
  ].join("\n");
  const github = "date,downloads,stars\n2026-11-30,120,90\n2026-12-01,310,260\n";
  const rows = dashboard(pings, github, 2);
  expect(rows).toEqual([
    { signal: "Downloads", value: 310, pass: 300, ok: true },
    { signal: "Installs (first_run)", value: 2, pass: 100, ok: false },
    { signal: "Activated (imported or has_documents)", value: 2, pass: 15, ok: false },
    { signal: "Installs that sent for signature", value: 1, pass: 3, ok: false },
    { signal: "GitHub stars", value: 260, pass: 250, ok: true },
    { signal: "Donations", value: 2, pass: 1, ok: true },
  ]);
});

test("a truncated last line (a crash mid-write) is skipped, not fatal", () => {
  const good = JSON.stringify({
    day: "2026-12-01",
    install_id: "a",
    event: "first_run",
    app_version: "0.1.0",
    os: "macos",
    imported: false,
    has_documents: false,
    sent_envelope: false,
  });
  expect(dashboard(`${good}\n{"day":"2026-12-0`, "date,downloads,stars\n", 0)[1]!.value).toBe(1);
});
