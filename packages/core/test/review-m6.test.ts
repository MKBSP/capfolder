// Regression tests for the M6 final-review findings.
import { describe, expect, test } from "vitest";
import { defaultCtx } from "../src/append";
import * as builders from "../src/builders";
import { lawyerDocPaths, lawyerPackage } from "../src/export/lawyer";
import { sheets } from "../src/export/sheets";
import { toOcfExport } from "../src/ocf-export";
import { fromOcfExport } from "../src/ocf-import";
import { acmeEvents, ev } from "./helpers";

const base = acmeEvents();

test("event ids sort in creation order, even within one millisecond", () => {
  const ctx = defaultCtx("d");
  const ids = Array.from({ length: 2000 }, () => ctx.newId());
  expect([...ids].sort()).toEqual(ids);
  const app = Array.from({ length: 2000 }, () => builders.newId("evt")); // the desktop app's ctx
  expect([...app].sort()).toEqual(app);
});

describe("fromOcfExport returns errors, never throws", () => {
  const ok = toOcfExport(base, { asOf: "2026-10-07", generatedAt: "2026-10-10T00:00:00Z" });
  const manifest = JSON.parse(ok["Manifest.ocf.json"]!);
  const withManifest = (m: object, extra: Record<string, string> = {}) => ({
    ...ok,
    "Manifest.ocf.json": JSON.stringify({ ...manifest, ...m }),
    ...extra,
  });
  test.each([
    ["null file entry", withManifest({ stakeholders_files: [null] })],
    ["filepath not a string", withManifest({ stakeholders_files: [{ md5: "x" }] })],
    [
      "items not an array",
      { ...ok, "Stakeholders.ocf.json": JSON.stringify({ file_type: "OCF_STAKEHOLDERS_FILE", items: 5 }) },
    ],
    ["no issuer", withManifest({ issuer: undefined })],
  ])("%s", (_name, files) => {
    const r = fromOcfExport(files);
    expect("errors" in r && r.errors.length > 0).toBe(true);
  });
});

describe("one-person scope", () => {
  const shared = [
    ...base,
    ev("doc_added", {
      doc_id: "doc_shared",
      doc_type: "board_consent",
      path: "docs/consents/2025-10-07_mads-and-lisa.pdf",
      sha256: "x",
      fields: {},
      flags: [],
    }),
    ev("doc_linked", { doc_id: "doc_shared", target: "OPT-1" }),
    ev("doc_linked", { doc_id: "doc_shared", target: "CS-1" }),
  ];
  test("a document linked to someone else too is left out, and counted in the README", async () => {
    const scope = { kind: "person", stakeholderId: "sh_lisa" } as const;
    const paths = lawyerDocPaths(shared, scope);
    expect(paths).toEqual(["docs/grants/2025-10-07_lisa-moreau.pdf"]);
    const files = await lawyerPackage({
      events: shared,
      asOf: "2026-10-07",
      scope,
      generatedAt: "2026-10-10T00:00:00Z",
      docs: Object.fromEntries(paths.map((p) => [p, new Uint8Array([1])])),
    });
    expect(Object.keys(files).join("|")).not.toContain("tim");
    expect(files["README.txt"]).toContain("1 document is shared with other people and was left out");
  });
  test("no company totals that would reveal other holdings", () => {
    const flat = sheets(base, "2026-10-07", { stakeholderId: "sh_lisa" }).flatMap((s) =>
      s.rows.map((r) => String(r[0])),
    );
    for (const k of ["Fully diluted", "Option pool available", "SAFEs outstanding (USD)"])
      expect(flat).not.toContain(k);
  });
});
