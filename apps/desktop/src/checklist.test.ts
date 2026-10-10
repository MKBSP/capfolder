import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { computeGaps, reduce } from "@capfolder/core";
import { expect, test } from "vitest";
import { checklist } from "./checklist";

const events = readFileSync(resolve(process.cwd(), "../../fixtures/acme-vault/events.jsonl"), "utf8")
  .trim()
  .split("\n")
  .map((l) => JSON.parse(l));

test("acme due-diligence checklist", () => {
  const s = reduce(events, "2026-10-07");
  const c = checklist(s, computeGaps(s));
  expect(c.groups.map((g) => [g.title, g.items.filter((i) => i.ok).length, g.items.length])).toEqual([
    ["Company", 0, 3],
    ["Founders", 0, 6],
    ["Employees", 1, 4],
    ["Investors · SAFEs", 2, 3],
  ]);
  expect([c.done, c.total]).toEqual([3, 16]);
  const lisa = c.groups[2]!.items.find((i) => i.label === "Option grant · Lisa Moreau")!;
  expect(lisa).toMatchObject({
    ok: true,
    path: "docs/grants/2025-10-07_lisa-moreau.pdf",
    docId: "doc_lisa_grant",
  });
  const fundx = c.groups[3]!.items.find((i) => i.label.startsWith("Fund X"))!;
  expect(fundx).toMatchObject({
    ok: false,
    target: "SAFE-3",
    docType: "safe",
    note: "On the cap table, no signed document",
  });
});
