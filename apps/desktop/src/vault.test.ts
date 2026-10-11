import { builders as b, reduce, verifyChain } from "@capfolder/core";
import { beforeEach, describe, expect, test } from "vitest";
import { MemoryFs } from "./fs/memory";
import {
  appendToVault,
  attachDocument,
  createVault,
  exportCsv,
  openVault,
  removeDocument,
  renameDocument,
  replaceDocument,
  type Vault,
} from "./vault";

let i = 0;
const ctx = {
  now: () => new Date("2026-10-09T12:00:00Z"),
  newId: () => `evt_V${String(i++).padStart(6, "0")}`,
  deviceId: "dev_t",
};
const company = { name: "Test Co", formationDate: "2026-01-02", type: "DE_CCORP" as const };
let fs: MemoryFs;
beforeEach(() => {
  fs = new MemoryFs();
  fs.mkdirSync("/Users/me/Documents");
});

async function founded(): Promise<Vault> {
  const v = await createVault(fs, ctx, { parent: "/Users/me/Documents", company });
  const s = reduce(v.events, "9999-12-31");
  const r = await appendToVault(
    fs,
    v,
    [
      b.stockClass({ id: "sc_c", name: "Common", authorized: "10000000", parValue: "0.00001" }),
      b.stakeholder({ id: "sh_a", name: "Ana", type: "INDIVIDUAL" }),
      ...b.stockIssuance({
        state: s,
        stakeholderId: "sh_a",
        classId: "sc_c",
        quantity: "4000000",
        price: "0.00001",
        date: "2026-01-02",
      }),
    ],
    ctx,
  );
  if (!r.ok) throw new Error(r.errors.join("; "));
  return r.vault;
}

describe("createVault", () => {
  test("writes the vault files and a valid chain", async () => {
    const v = await createVault(fs, ctx, { parent: "/Users/me/Documents", company });
    expect(v.root).toBe("/Users/me/Documents/Test Co");
    for (const f of ["README.txt", "capfolder.json", "events.jsonl", "captable.csv", "ocf/Manifest.ocf.json"])
      expect(fs.existsSync(`${v.root}/${f}`)).toBe(true);
    for (const d of [
      "company",
      "founders",
      "employees",
      "grants",
      "safes",
      "consents",
      "83b",
      "_imports",
      "_removed",
      "_voided",
    ])
      expect(fs.existsSync(`${v.root}/docs/${d}`)).toBe(true);
    expect(fs.readSync(`${v.root}/README.txt`)).toContain("Test Co");
    expect((await verifyChain(fs.readSync(`${v.root}/events.jsonl`))).ok).toBe(true);
    expect(v.events.map((e) => e.type)).toEqual(["vault_created", "ISSUER"]);
  });
  test("a non-empty target folder gets a vault folder inside, never overwritten", async () => {
    fs.writeSync("/Users/me/Documents/Test Co/notes.txt", "mine");
    const v = await createVault(fs, ctx, { parent: "/Users/me/Documents", company });
    expect(v.root).toBe("/Users/me/Documents/Test Co/Test Co");
    expect(fs.readSync("/Users/me/Documents/Test Co/notes.txt")).toBe("mine");
  });
});

describe("append", () => {
  test("appends lines, regenerates captable.csv and ocf/", async () => {
    const v = await founded();
    expect(fs.readSync(`${v.root}/events.jsonl`).trim().split("\n")).toHaveLength(5);
    expect(fs.readSync(`${v.root}/captable.csv`)).toContain("Ana,common,Common,4000000,100.00");
    expect(fs.readSync(`${v.root}/ocf/Stakeholders.ocf.json`)).toContain("sh_a");
  });
  test("an invalid change writes nothing", async () => {
    const v = await founded();
    const before = fs.readSync(`${v.root}/events.jsonl`);
    const r = await appendToVault(
      fs,
      v,
      [
        b.stakeholder({ id: "sh_b", name: "B", type: "INDIVIDUAL" }),
        { kind: "ocf", type: "STAKEHOLDER", data: { object_type: "STAKEHOLDER", id: "x" } },
      ],
      ctx,
    );
    expect(r.ok).toBe(false);
    expect(fs.readSync(`${v.root}/events.jsonl`)).toBe(before);
  });
  test("refuses when the folder changed outside the app", async () => {
    const v = await founded();
    fs.writeSync(`${v.root}/events.jsonl`, `${fs.readSync(`${v.root}/events.jsonl`)}\n`);
    const r = await appendToVault(fs, v, [b.stakeholder({ name: "B", type: "INDIVIDUAL" })], ctx);
    expect(r).toEqual({
      ok: false,
      errors: ["The folder changed outside the app. Reopen it to see the latest."],
    });
  });
});

describe("openVault (F-31)", () => {
  test("reopens what was written", async () => {
    const v = await founded();
    const o = await openVault(fs, v.root, ctx);
    expect(o.events).toHaveLength(5);
    expect(o.broken).toBeUndefined();
    expect(o.csvEdited).toBe(false);
  });
  test("not a vault", async () => {
    await expect(openVault(fs, "/Users/me/Documents", ctx)).rejects.toMatchObject({
      message: "This folder isn't a Capfolder vault (no capfolder.json).",
    });
  });
  test("hand-edited captable.csv is kept aside and regenerated", async () => {
    const v = await founded();
    fs.writeSync(`${v.root}/captable.csv`, "stakeholder\nme,1\n");
    const o = await openVault(fs, v.root, ctx);
    expect(o.csvEdited).toBe(true);
    expect(fs.readSync(`${v.root}/captable.edited.csv`)).toBe("stakeholder\nme,1\n");
    expect(fs.readSync(`${v.root}/captable.csv`)).toContain("Ana,common");
  });
  test("a CSV regenerated on another day is not reported as edited", async () => {
    const v = await founded();
    const later = { ...ctx, now: () => new Date("2027-05-01T12:00:00Z") };
    expect((await openVault(fs, v.root, later)).csvEdited).toBe(false);
  });
  test("tampered line → broken, read-only", async () => {
    const v = await founded();
    const lines = fs.readSync(`${v.root}/events.jsonl`).split("\n");
    lines[1] = lines[1]!.replace("Test Co", "Evil Co");
    fs.writeSync(`${v.root}/events.jsonl`, lines.join("\n"));
    const o = await openVault(fs, v.root, ctx);
    expect(o.broken).toEqual({ line: 2, reason: "hash does not match the line's content" });
    expect(o.events).toHaveLength(1);
    const r = await appendToVault(fs, o, [b.stakeholder({ name: "B", type: "INDIVIDUAL" })], ctx);
    expect(r.ok).toBe(false);
  });
});

describe("documents (F-26, F-27)", () => {
  const pdf = new TextEncoder().encode("%PDF-1.4 fake");
  test("attach copies, hashes and links", async () => {
    const v = await founded();
    const r = await attachDocument(fs, v, ctx, {
      originalName: "spa.pdf",
      bytes: pdf,
      docType: "spa",
      date: "2026-01-02",
      person: "Ana",
      target: "CS-1",
    });
    if (r.ok !== true) throw new Error(JSON.stringify(r));
    expect(fs.existsSync(`${v.root}/docs/founders/2026-01-02_ana_spa.pdf`)).toBe(true);
    expect(r.vault.events.slice(-2).map((e) => e.type)).toEqual(["doc_added", "doc_linked"]);
    expect(r.vault.events.at(-2)!.data.path).toBe("docs/founders/2026-01-02_ana_spa.pdf");
  });
  test("same content twice is a duplicate, not a second copy", async () => {
    const v = await founded();
    const a = await attachDocument(fs, v, ctx, {
      originalName: "spa.pdf",
      bytes: pdf,
      docType: "spa",
      date: "2026-01-02",
      person: "Ana",
      target: "CS-1",
    });
    if (a.ok !== true) throw new Error("attach");
    const d = await attachDocument(fs, a.vault, ctx, {
      originalName: "copy.pdf",
      bytes: pdf,
      docType: "spa",
      date: "2026-01-02",
      person: "Ana",
    });
    expect(d.ok).toBe("duplicate");
  });
  test("remove moves to docs/_removed and records it; a missing file is flagged on open", async () => {
    const v = await founded();
    const a = await attachDocument(fs, v, ctx, {
      originalName: "spa.pdf",
      bytes: pdf,
      docType: "spa",
      date: "2026-01-02",
      person: "Ana",
      target: "CS-1",
    });
    if (a.ok !== true) throw new Error("attach");
    const docId = a.vault.events.at(-2)!.data.doc_id as string;
    const r = await removeDocument(fs, a.vault, ctx, docId);
    if (!r.ok) throw new Error(r.errors.join("; "));
    expect(fs.existsSync(`${v.root}/docs/_removed/2026-01-02_ana_spa.pdf`)).toBe(true);
    expect(r.vault.events.at(-1)!.type).toBe("doc_removed");

    const b2 = await attachDocument(fs, r.vault, ctx, {
      originalName: "x.pdf",
      bytes: new TextEncoder().encode("other"),
      docType: "safe",
      date: "2026-02-01",
      person: "Ana",
    });
    if (b2.ok !== true) throw new Error("attach 2");
    fs.deleteSync(`${v.root}/docs/safes/2026-02-01_ana_safe.pdf`);
    expect((await openVault(fs, v.root, ctx)).missingDocs).toHaveLength(1);
  });
});

test("exportCsv as of a date", async () => {
  const v = await founded();
  expect(exportCsv(v, "2025-12-31").trim().split("\n")).toHaveLength(1); // header only before issuance
});

describe("untrusted paths", () => {
  test("a document path outside docs/ is never touched", async () => {
    const v = await founded();
    fs.writeSync("/Users/me/.ssh/id_rsa", "secret");
    const r = await appendToVault(
      fs,
      v,
      [
        b.docAdded({
          docId: "doc_evil",
          path: "docs/../../../.ssh/id_rsa",
          sha256: "x",
          docType: "other",
          originalName: "x",
        }),
      ],
      ctx,
    );
    if (!r.ok) throw new Error(r.errors.join("; "));
    const removed = await removeDocument(fs, r.vault, ctx, "doc_evil");
    expect(removed).toEqual({
      ok: false,
      errors: ["That document's path isn't inside docs/, so it was left alone."],
    });
    expect(fs.readSync("/Users/me/.ssh/id_rsa")).toBe("secret");
    const o = await openVault(fs, v.root, ctx);
    expect(o.missingDocs).toEqual(["doc_evil"]);
  });
  test("company names can't escape the chosen folder", async () => {
    await expect(
      createVault(fs, ctx, { parent: "/Users/me/Documents", company: { ...company, name: "../../evil" } }),
    ).rejects.toMatchObject({ message: "A company name can't contain / or \\ or start with a dot." });
  });
});

describe("rename and replace a document (F-28)", () => {
  const pdf = new TextEncoder().encode("%PDF-1.4 draft");
  const signed = new TextEncoder().encode("%PDF-1.4 signed");
  async function withDoc() {
    const v = await founded();
    const a = await attachDocument(fs, v, ctx, {
      originalName: "spa.pdf",
      bytes: pdf,
      docType: "spa",
      date: "2026-01-02",
      person: "Ana",
      target: "CS-1",
      flags: ["draft"],
    });
    if (a.ok !== true) throw new Error("attach");
    const docId = a.vault.events.find((e) => e.type === "doc_added")!.data.doc_id as string;
    return { v: a.vault, docId };
  }

  test("rename renames the file in its folder, keeps the extension, and records the new path", async () => {
    const { v, docId } = await withDoc();
    const r = await renameDocument(fs, v, ctx, docId, "Ana SPA (countersigned)");
    if (!r.ok) throw new Error(r.errors.join());
    expect(fs.existsSync(`${v.root}/docs/founders/2026-01-02_ana_spa.pdf`)).toBe(false);
    expect(fs.existsSync(`${v.root}/docs/founders/Ana SPA (countersigned).pdf`)).toBe(true);
    expect(reduce(r.vault.events, "9999-12-31").docs.get(docId)!.data.path).toBe(
      "docs/founders/Ana SPA (countersigned).pdf",
    );
  });

  test("rename refuses path tricks and empty names", async () => {
    const { v, docId } = await withDoc();
    const r = await renameDocument(fs, v, ctx, docId, "../../evil");
    if (!r.ok) throw new Error(r.errors.join());
    expect(reduce(r.vault.events, "9999-12-31").docs.get(docId)!.data.path).toBe("docs/founders/evil.pdf");
    expect((await renameDocument(fs, v, ctx, docId, "  ")).ok).toBe(false);
  });

  test("replace files the new copy with the same links, retires the old one to _removed", async () => {
    const { v, docId } = await withDoc();
    const r = await replaceDocument(fs, v, ctx, docId, { originalName: "spa-signed.pdf", bytes: signed });
    if (!r.ok) throw new Error(r.errors.join());
    const s = reduce(r.vault.events, "9999-12-31");
    const old = s.docs.get(docId)!;
    const fresh = [...s.docs.entries()].find(([id, d]) => id !== docId && !d.removed)!;
    expect(old.removed).toBe(true);
    expect(fresh[1].links).toEqual(new Set(["CS-1"]));
    expect(fresh[1].data.flags).not.toContain("draft");
    expect(fs.existsSync(`${v.root}/${fresh[1].data.path}`)).toBe(true);
    expect(fs.existsSync(`${v.root}/docs/_removed/2026-01-02_ana_spa.pdf`)).toBe(true);
    expect(r.vault.events.map((e) => e.type)).toContain("doc_replaced");
    expect((await verifyChain(r.vault.log)).ok).toBe(true);
  });

  test("replacing with the same file is refused", async () => {
    const { v, docId } = await withDoc();
    const r = await replaceDocument(fs, v, ctx, docId, { originalName: "same.pdf", bytes: pdf });
    expect(r).toEqual({ ok: false, errors: ["That's the same file."] });
  });
});
