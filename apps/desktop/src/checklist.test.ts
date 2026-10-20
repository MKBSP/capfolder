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
  const woz = c.groups[2]!.items.find((i) => i.label === "Option grant · Steve Wozniak")!;
  expect(woz).toMatchObject({
    ok: true,
    path: "docs/grants/2025-10-07_steve-wozniak.pdf",
    docId: "doc_woz_grant",
  });
  const fundx = c.groups[3]!.items.find((i) => i.label.startsWith("Fund X"))!;
  expect(fundx).toMatchObject({
    ok: false,
    target: "SAFE-3",
    docType: "safe",
    note: "On the cap table, no signed document",
  });
});

test("an 83(b) or a consent linked to a holding doesn't tick its agreement (M4 review I6)", () => {
  const link = (doc: string, type: string, target: string) => [
    {
      type: "doc_added",
      kind: "app",
      ts: "2026-10-01T00:00:00Z",
      id: `e_${doc}`,
      data: { doc_id: doc, path: `docs/x/${doc}.pdf`, sha256: doc, doc_type: type },
      meta: {},
    },
    {
      type: "doc_linked",
      kind: "app",
      ts: "2026-10-01T00:00:01Z",
      id: `l_${doc}`,
      data: { doc_id: doc, target },
      meta: {},
    },
  ];
  const s = reduce(
    [...events, ...link("d83b", "83b", "CS-2"), ...link("dcon", "board_consent", "OPT-2")],
    "2026-10-07",
  );
  const items = checklist(s, computeGaps(s)).groups.flatMap((g) => g.items);
  expect(items.find((i) => i.label === "Stock purchase agreement · Steve Jobs")?.ok).toBe(false);
  expect(items.find((i) => i.label === "Option grant · Bill Gates")?.ok).toBe(false);
});
