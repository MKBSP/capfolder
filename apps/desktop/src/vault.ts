// The one module that reads and writes a vault folder (docs/03). All file access goes through Fs;
// all rules (chain, schema, invariants) live in @capfolder/core.
import {
  type AppendCtx,
  appendEvents,
  builders as b,
  captableCsv,
  type Data,
  type EventDraft,
  type LawyerScope,
  lawyerDocPaths,
  lawyerPackage,
  MAX_DATE,
  nextSecurityIdNumber,
  reduce,
  sha256Hex,
  sheets,
  toOcfExport,
  toXlsx,
  type VaultEvent,
  verifyChain,
  withSignaturePage,
  zip,
} from "@capfolder/core";
import { day } from "./fmt";
import { baseName, type Fs, join } from "./fs/types";
import type { Envelope, RelayClient } from "./signing";

export interface Vault {
  root: string;
  meta: Record<string, unknown>;
  log: string;
  events: VaultEvent[];
  broken?: { line: number; reason: string };
  csvEdited: boolean;
  missingDocs: string[];
}
export type Result = { ok: true; vault: Vault } | { ok: false; errors: string[] };
export type CompanyInput = {
  name: string;
  formationDate: string;
  type?: "DE_CCORP" | "OTHER"; // DE_CCORP = US + Delaware (older callers); otherwise country/subdivision
  country?: string; // ISO 3166-1 alpha-2
  subdivision?: string; // e.g. a US state code; "" for none
  currency?: string; // ISO 4217, stored in capfolder.json; default USD
};

const DOC_DIRS = [
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
];
/** Where each document type is filed inside docs/. */
export const DOC_FOLDER: Record<string, string> = {
  safe: "safes",
  option_grant: "grants",
  spa: "founders",
  "83b": "83b",
  ciiaa: "employees",
  board_consent: "consents",
  plan: "consents",
  company_certificate: "company",
  company_bylaws: "company",
  other: "company",
};

/** A document path from events.jsonl is untrusted: it must stay inside the vault's docs/ folder. */
export const isSafeDocPath = (rel: unknown): rel is string =>
  typeof rel === "string" &&
  rel.startsWith("docs/") &&
  !rel.includes("\\") &&
  !rel.split("/").some((part) => part === ".." || part === "." || part === "");

const today = (ctx: AppendCtx) => ctx.now().toISOString().slice(0, 10);
const slug = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "doc";

const readme = (company: string) => `THIS FOLDER IS A CAPFOLDER VAULT
=================================

It holds the cap table records of ${company}. You don't need Capfolder to read it.

events.jsonl   The record. One line per change, oldest first. Lines are never
               edited or deleted; mistakes are fixed by later lines. Each line
               contains the hash of the previous line, so edits are detectable.
               Equity data follows the Open Cap Table Format (OCF).
captable.csv   The current cap table, regenerated from events.jsonl. Opens in Excel.
ocf/           The same data as a standard OCF export, readable by other tools.
docs/          Signed documents, sorted by type. docs/_removed/ holds documents
               removed in the app (never deleted automatically).

Capfolder is open source (AGPL-3.0). Capfolder is software, not a law firm. It does
not give legal, tax or financial advice. Templates come from public sources such as
Y Combinator and are provided as is. Have a lawyer review your documents.
`;

/** Rewrites the derived files (captable.csv, ocf/) as of today and records that date in capfolder.json. */
async function writeDerived(
  fs: Fs,
  root: string,
  meta: Record<string, unknown>,
  events: VaultEvent[],
  ctx: AppendCtx,
) {
  const asOf = today(ctx);
  await fs.writeText(join(root, "captable.csv"), captableCsv(events, asOf));
  await fs.mkdir(join(root, "ocf"));
  const files = toOcfExport(events, { asOf, generatedAt: ctx.now().toISOString() });
  for (const [name, text] of Object.entries(files)) await fs.writeText(join(root, "ocf", name), text);
  const next = { ...meta, captable_as_of: asOf };
  await fs.writeText(join(root, "capfolder.json"), `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

async function isEmptyDir(fs: Fs, path: string) {
  return !(await fs.exists(path)) || (await fs.list(path)).length === 0;
}

/** F-05. Creates <parent>/<Company>; if that folder already has files, the vault goes one level deeper. */
export async function createVault(
  fs: Fs,
  ctx: AppendCtx,
  p: { parent: string; company: CompanyInput },
): Promise<Vault> {
  if (/[/\\]/.test(p.company.name) || p.company.name.startsWith("."))
    throw new Error("A company name can't contain / or \\ or start with a dot.");
  let root = join(p.parent, p.company.name);
  if (!(await isEmptyDir(fs, root))) root = join(root, p.company.name);
  if (!(await isEmptyDir(fs, root))) throw new Error(`${root} already has files in it. Pick another folder.`);

  const iss = b.issuer({
    name: p.company.name,
    formationDate: p.company.formationDate,
    country: p.company.type === "DE_CCORP" ? "US" : (p.company.country ?? "US"),
    subdivision: p.company.type === "DE_CCORP" ? "DE" : (p.company.subdivision ?? ""),
  });
  const drafts: EventDraft[] = [
    { kind: "app", type: "vault_created", data: { name: p.company.name, created_by: "founder" } },
    iss,
  ];
  const r = await appendEvents("", drafts, ctx);
  if (!r.ok) throw new Error(r.errors.join("; "));

  await fs.mkdir(root);
  for (const d of DOC_DIRS) await fs.mkdir(join(root, "docs", d));
  await fs.writeText(join(root, "README.txt"), readme(p.company.name));
  await fs.writeText(join(root, "events.jsonl"), r.text);
  const meta = await writeDerived(
    fs,
    root,
    {
      vault_id: b.newId("vlt"),
      format_version: 1,
      created_at: ctx.now().toISOString(),
      issuer_id: iss.data.id,
      ocf_version: "1.2.0",
      currency: p.company.currency ?? "USD",
    },
    r.events,
    ctx,
  );
  return { root, meta, log: r.text, events: r.events, csvEdited: false, missingDocs: [] };
}

/** F-31 / F-32. Verifies the chain, regenerates derived files, and reports outside edits and missing documents. */
export async function openVault(fs: Fs, root: string, ctx: AppendCtx): Promise<Vault> {
  if (!(await fs.exists(join(root, "capfolder.json"))) || !(await fs.exists(join(root, "events.jsonl"))))
    throw new Error("This folder isn't a Capfolder vault (no capfolder.json).");
  const meta = JSON.parse(await fs.readText(join(root, "capfolder.json")));
  const log = await fs.readText(join(root, "events.jsonl"));
  const chain = await verifyChain(log);
  if (!chain.ok) {
    // Read-only: show what came before the broken line, never write.
    const before = log
      .split("\n")
      .slice(0, chain.line - 1)
      .join("\n");
    const prefix = await verifyChain(before);
    return {
      root,
      meta,
      log,
      events: prefix.ok ? prefix.events : [],
      broken: { line: chain.line, reason: chain.reason },
      csvEdited: false,
      missingDocs: [],
    };
  }
  const events = chain.events;
  const csvPath = join(root, "captable.csv");
  let csvEdited = false;
  if (await fs.exists(csvPath)) {
    const found = await fs.readText(csvPath);
    const asOf = typeof meta.captable_as_of === "string" ? meta.captable_as_of : today(ctx);
    if (found !== captableCsv(events, asOf)) {
      await fs.writeText(join(root, "captable.edited.csv"), found);
      csvEdited = true;
    }
  }
  const nextMeta = await writeDerived(fs, root, meta, events, ctx);
  const missingDocs: string[] = [];
  for (const [id, d] of reduce(events, MAX_DATE).docs)
    if (!d.removed && (!isSafeDocPath(d.data.path) || !(await fs.exists(join(root, d.data.path)))))
      missingDocs.push(id);
  return { root, meta: nextMeta, log, events, csvEdited, missingDocs };
}

/** One write at a time per vault folder: two saves racing would both pass the freshness check and fork the chain. */
const locks = new Map<string, Promise<unknown>>();
function exclusive<T>(root: string, work: () => Promise<T>): Promise<T> {
  const prev = locks.get(root) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(work);
  locks.set(root, next);
  return next;
}

/** Why this vault can't be written to right now, or null. */
async function writeBlocked(fs: Fs, v: Vault): Promise<string[] | null> {
  if (v.broken)
    return [`The record is broken at line ${v.broken.line}. Restore the folder from your backup.`];
  if ((await fs.readText(join(v.root, "events.jsonl"))) !== v.log)
    return ["The folder changed outside the app. Reopen it to see the latest."];
  return null;
}

async function appendUnlocked(fs: Fs, v: Vault, drafts: EventDraft[], ctx: AppendCtx): Promise<Result> {
  const blocked = await writeBlocked(fs, v);
  if (blocked) return { ok: false, errors: blocked };
  const r = await appendEvents(v.log, drafts, ctx);
  if (!r.ok) return r;
  await fs.appendText(join(v.root, "events.jsonl"), r.text);
  const events = [...v.events, ...r.events];
  const meta = await writeDerived(fs, v.root, v.meta, events, ctx);
  return { ok: true, vault: { ...v, meta, log: v.log + r.text, events } };
}

/** The only write path for events: all drafts or none, then the derived files are refreshed. */
export const appendToVault = (fs: Fs, v: Vault, drafts: EventDraft[], ctx: AppendCtx): Promise<Result> =>
  exclusive(v.root, () => appendUnlocked(fs, v, drafts, ctx));

async function freePath(fs: Fs, dir: string, name: string): Promise<string> {
  const dot = name.lastIndexOf(".");
  const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
  for (let n = 1; ; n++) {
    const candidate = join(dir, n === 1 ? name : `${stem}-${n}${ext}`);
    if (!(await fs.exists(candidate))) return candidate;
  }
}

export async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/** F-26. Copies the file into docs/<type>/<date>_<person>_<type>.<ext>, then records doc_added (+ doc_linked). */
export function attachDocument(
  fs: Fs,
  v: Vault,
  ctx: AppendCtx,
  p: {
    originalName: string;
    bytes: Uint8Array;
    docType: string;
    date: string;
    person: string;
    target?: string;
    targets?: string[]; // F-09: a board consent can prove several things
    fields?: Data; // what sorting read from it (F-09)
    flags?: string[];
    extra?: EventDraft[]; // recorded in the same write, e.g. a stakeholder_alias the founder asked to remember
  },
): Promise<Result | { ok: "duplicate"; docId: string }> {
  return exclusive(v.root, async () => {
    const blocked = await writeBlocked(fs, v); // checked before any file is written
    if (blocked) return { ok: false, errors: blocked };
    const sha256 = await sha256Bytes(p.bytes);
    for (const [id, d] of reduce(v.events, MAX_DATE).docs)
      if (!d.removed && d.data.sha256 === sha256) return { ok: "duplicate", docId: id };
    const ext = /\.[a-z0-9]+$/i.exec(p.originalName)?.[0].toLowerCase() ?? ".pdf";
    const folder = DOC_FOLDER[p.docType] ?? "company";
    const abs = await freePath(
      fs,
      join(v.root, "docs", folder),
      `${p.date}_${slug(p.person)}_${slug(p.docType)}${ext}`,
    );
    const rel = abs.slice(v.root.length + 1);
    await fs.writeBytes(abs, p.bytes);
    const docId = b.newId("doc");
    const targets = [...new Set([...(p.target ? [p.target] : []), ...(p.targets ?? [])])];
    const drafts = [
      ...(p.extra ?? []),
      b.docAdded({
        docId,
        path: rel,
        sha256,
        docType: p.docType,
        originalName: p.originalName,
        fields: p.fields,
        flags: p.flags,
      }),
      ...targets.map((target) => b.docLinked({ docId, target })),
    ];
    const undo = async () =>
      fs.rename(abs, await freePath(fs, join(v.root, "docs", "_removed"), baseName(abs)));
    try {
      const r = await appendUnlocked(fs, v, drafts, ctx);
      if (!r.ok) await undo();
      return r;
    } catch (e) {
      await undo().catch(() => {});
      throw e;
    }
  });
}

/** F-27. Never deletes: a doc_removed event is written first, then the file moves to docs/_removed/. */
export function removeDocument(fs: Fs, v: Vault, ctx: AppendCtx, docId: string): Promise<Result> {
  return exclusive(v.root, async () => {
    const doc = reduce(v.events, MAX_DATE).docs.get(docId);
    if (!doc || doc.removed) return { ok: false, errors: ["That document isn't in the folder."] };
    if (!isSafeDocPath(doc.data.path))
      return { ok: false, errors: ["That document's path isn't inside docs/, so it was left alone."] };
    const from = join(v.root, doc.data.path);
    const to = await freePath(fs, join(v.root, "docs", "_removed"), baseName(from));
    const r = await appendUnlocked(
      fs,
      v,
      [b.docRemoved({ docId, movedTo: to.slice(v.root.length + 1) })],
      ctx,
    );
    if (r.ok && (await fs.exists(from))) await fs.rename(from, to);
    return r;
  });
}

/** F-29. The cap table as of any date, in captable.csv format. */
export const exportCsv = (v: Vault, asOf: string): string => captableCsv(v.events, asOf);

export type ExportFormat = "xlsx" | "csv" | "ocf";

const companySlug = (v: Vault) =>
  slug(String(reduce(v.events, MAX_DATE).issuer?.legal_name ?? baseName(v.root)));

/** F-29. The file to save for an as-of export, or why it can't be made. */
export function exportFile(
  v: Vault,
  asOf: string,
  format: ExportFormat,
  ctx: AppendCtx,
): { name: string; data: Uint8Array | string } | { error: string } {
  const formed = reduce(v.events, MAX_DATE).issuer?.formation_date;
  if (formed && asOf < formed)
    return { error: `The company didn't exist yet on ${day(asOf)} (incorporated ${day(formed)}).` };
  const co = companySlug(v);
  if (format === "csv") return { name: `${co}-cap-table-${asOf}.csv`, data: exportCsv(v, asOf) };
  if (format === "xlsx")
    return { name: `${co}-cap-table-${asOf}.xlsx`, data: toXlsx(sheets(v.events, asOf)) };
  return {
    name: `${co}-ocf-${asOf}.zip`,
    data: zip(toOcfExport(v.events, { asOf, generatedAt: ctx.now().toISOString() })),
  };
}

/**
 * F-07. Saves an import in one batch (source = the file), keeps the original in docs/_imports/, and records the
 * founder's note when totals were accepted without matching. Only for a folder with no cap table yet.
 */
export async function importIntoVault(
  fs: Fs,
  v: Vault,
  p: { drafts: EventDraft[]; fileName: string; bytes: Uint8Array; note?: string },
  ctx: AppendCtx,
): Promise<Result> {
  const s = reduce(v.events, MAX_DATE);
  if (s.securities.size || s.stakeholders.size || s.classes.size || s.plans.size)
    return {
      ok: false,
      errors: [
        "Import works on a new company folder, and this one already has a cap table. Create a new company first.",
      ],
    };
  // Keep the original first (a safe name on every OS); if that fails, nothing has been recorded yet.
  const safeName =
    baseName(p.fileName)
      .replace(/[^\w.-]/g, "_")
      .replace(/^\.+/, "") || "import";
  try {
    await fs.mkdir(join(v.root, "docs", "_imports"));
    await fs.writeBytes(join(v.root, "docs", "_imports", `${today(ctx)}_${safeName}`), p.bytes);
  } catch (e) {
    return {
      ok: false,
      errors: [
        `Couldn't keep a copy of ${baseName(p.fileName)} in docs/_imports: ${(e as Error).message ?? e}`,
      ],
    };
  }
  const source = `import:${baseName(p.fileName)}`;
  const drafts: EventDraft[] = [
    ...p.drafts.map((d) => ({ ...d, meta: { ...d.meta, source } })),
    ...(p.note ? [b.note({ text: `Import totals accepted without matching: ${p.note}` })] : []),
  ];
  return appendToVault(fs, v, drafts, ctx);
}

/** Inside docs/, and no part of the path is a symlink (which could point anywhere the app may read). */
async function isPlainDocPath(fs: Fs, root: string, rel: string): Promise<boolean> {
  if (!isSafeDocPath(rel)) return false;
  const parts = rel.split("/");
  for (let i = 1; i <= parts.length; i++)
    if (await fs.isSymlink(join(root, ...parts.slice(0, i))).catch(() => true)) return false;
  return true;
}

/** Company currency for new records (capfolder.json). Records already made keep their own currency. */
export async function setCompanyCurrency(fs: Fs, v: Vault, currency: string): Promise<Vault> {
  const meta = { ...v.meta, currency };
  await fs.writeText(join(v.root, "capfolder.json"), `${JSON.stringify(meta, null, 2)}\n`);
  return { ...v, meta };
}

/** F-30. The lawyer zip. Documents are read from the vault; unreadable or unsafe paths are listed as missing. */
export async function lawyerZip(
  fs: Fs,
  v: Vault,
  asOf: string,
  scope: LawyerScope,
  ctx: AppendCtx,
): Promise<{ name: string; data: Uint8Array }> {
  const docs: Record<string, Uint8Array | null> = {};
  for (const rel of lawyerDocPaths(v.events, scope)) {
    docs[rel] = (await isPlainDocPath(fs, v.root, rel))
      ? await fs.readBytes(join(v.root, rel)).catch(() => null)
      : null;
  }
  const files = await lawyerPackage({
    events: v.events,
    asOf,
    docs,
    scope,
    generatedAt: ctx.now().toISOString(),
  });
  const who =
    scope.kind === "person"
      ? `-${slug(String(reduce(v.events, MAX_DATE).stakeholders.get(scope.stakeholderId)?.name?.legal_name ?? "person"))}`
      : "";
  return { name: `${companySlug(v)}${who}-for-lawyer-${asOf}.zip`, data: zip(files) };
}

export { sha256Hex };

// ---- Signing (M5, docs/05). The relay never sees the vault; these record what was sent and file what comes back.

const isOutbox = (rel: unknown): rel is string => typeof rel === "string" && rel.startsWith("docs/_outbox/");

/** F-11/F-16: adds the signature page, sends it, keeps the sent copy in docs/_outbox/ and records envelope_sent. */
export async function sendForSignature(
  fs: Fs,
  v: Vault,
  ctx: AppendCtx,
  client: RelayClient,
  p: {
    pdf: Uint8Array;
    title: string;
    signers: { name: string; email: string }[];
    docType: string;
    person: string;
    target?: string;
    onSigned?: EventDraft[]; // recorded only once everyone has signed (e.g. the SAFE itself)
    relayUrl: string;
  },
): Promise<Result> {
  const blocked = await writeBlocked(fs, v);
  if (blocked) return { ok: false, errors: blocked };
  if (p.onSigned?.length) {
    const dry = await appendEvents(v.log, p.onSigned, ctx); // would it be valid? (fitted again when filing)
    if (!dry.ok) return dry;
  }
  let page: Awaited<ReturnType<typeof withSignaturePage>>;
  try {
    page = await withSignaturePage(p.pdf, { title: p.title, signers: p.signers });
  } catch {
    return { ok: false, errors: ["That file isn't a PDF Capfolder can read."] };
  }
  let id: string;
  try {
    id = (await client.send(page.pdf, { title: p.title, signers: p.signers, fields: page.fields })).id;
  } catch (e) {
    return { ok: false, errors: [(e as Error).message] };
  }
  // From here the signers have their emails: if this computer can't record the send, withdraw it.
  const withdraw = async (why: string): Promise<Result> => {
    const gone = await client.remove(id).then(
      () => true,
      () => false,
    );
    return {
      ok: false,
      errors: [
        `${why} ${gone ? "The signing request was withdrawn." : "Cancel it from the relay when you're online."}`,
      ],
    };
  };
  let rel: string;
  try {
    await fs.mkdir(join(v.root, "docs", "_outbox"));
    const abs = await freePath(
      fs,
      join(v.root, "docs", "_outbox"),
      `${today(ctx)}_${slug(p.title)}_${slug(id)}.pdf`,
    );
    await fs.writeBytes(abs, page.pdf);
    rel = abs.slice(v.root.length + 1);
  } catch (e) {
    return withdraw(`Couldn't keep the sent copy in docs/_outbox (${(e as Error).message ?? e}).`);
  }
  const recorded = await appendToVault(
    fs,
    v,
    [
      {
        kind: "app",
        type: "envelope_sent",
        data: {
          envelope_id: id,
          relay: p.relayUrl,
          title: p.title,
          doc_type: p.docType,
          person: p.person,
          ...(p.target ? { target: p.target } : {}),
          signers: p.signers,
          outbox: rel,
          original_pages: page.originalPages,
          original_sha256: await sha256Bytes(p.pdf),
          on_signed: p.onSigned ?? [],
        },
      },
    ],
    ctx,
  ).catch((e: Error): Result => ({ ok: false, errors: [e.message] }));
  return recorded.ok ? recorded : withdraw(`Couldn't record the send: ${recorded.errors.join(" ")}`);
}

/**
 * The records an envelope decided (e.g. the SAFE), fitted to the record as it is now: anything already recorded is
 * skipped (a filing that broke halfway can finish), and a security id taken since sending gets the next free one.
 */
function fitOnSigned(v: Vault, drafts: EventDraft[], target?: string) {
  const s = reduce(v.events, MAX_DATE);
  const recorded = new Set(v.events.map((e) => e.data?.id).filter(Boolean));
  const taken = new Set(s.allSecurityIds);
  const renamed = new Map<string, string>();
  const out: EventDraft[] = [];
  for (const d of drafts) {
    if (d.kind === "ocf" && recorded.has(d.data.id)) continue;
    const old = d.data.security_id as string | undefined;
    if (old && d.type.endsWith("_ISSUANCE") && taken.has(old) && !renamed.has(old)) {
      const prefix = old.replace(/-\d+$/, "") as "CS" | "OPT" | "SAFE";
      let n = Math.max(nextSecurityIdNumber(s, prefix), 1);
      while (taken.has(`${prefix}-${n}`)) n++;
      renamed.set(old, `${prefix}-${n}`);
    }
    if (old) taken.add(renamed.get(old) ?? old);
    let json = JSON.stringify(d.data);
    for (const [a, c] of renamed) json = json.split(`"${a}"`).join(`"${c}"`).split(`"${a}.`).join(`"${c}.`);
    out.push({ ...d, data: JSON.parse(json) });
  }
  return { drafts: out, target: target ? (renamed.get(target) ?? target) : undefined };
}

/**
 * Everyone signed: check the sealed copy against what was sent, then ONE write: what the envelope decided, the
 * filed document and its link, and envelope_signed. If the decided records no longer fit, the PDF is still filed
 * and `warning` tells the founder to record them by hand.
 */
export async function fileSigned(
  fs: Fs,
  v: Vault,
  ctx: AppendCtx,
  env: Envelope,
  signed: Uint8Array,
): Promise<{ ok: true; vault: Vault; warning?: string } | { ok: false; errors: string[] }> {
  if (!isOutbox(env.outbox) || !(await isPlainDocPath(fs, v.root, env.outbox)))
    return {
      ok: false,
      errors: ["The copy you sent isn't in docs/_outbox, so the signed one can't be checked."],
    };
  const sent = await fs.readBytes(join(v.root, env.outbox)).catch(() => null);
  if (!sent)
    return {
      ok: false,
      errors: ["The copy you sent is missing from docs/_outbox, so the signed one can't be checked."],
    };
  const { verifySigned } = await import("./pdfverify");
  const check = await verifySigned(sent, signed, env.originalPages);
  if (!check.ok)
    return {
      ok: false,
      errors: [`Signed copy doesn't match what you sent. ${check.reason} It wasn't filed.`],
    };
  return exclusive(v.root, async () => {
    const blocked = await writeBlocked(fs, v);
    if (blocked) return { ok: false as const, errors: blocked };
    const fit = fitOnSigned(v, env.onSigned, env.target);
    const folder = DOC_FOLDER[env.docType] ?? "company";
    const abs = await freePath(
      fs,
      join(v.root, "docs", folder),
      `${today(ctx)}_${slug(env.person)}_${slug(env.docType)}.pdf`,
    );
    await fs.writeBytes(abs, signed);
    const docId = b.newId("doc");
    const sha256 = await sha256Bytes(signed);
    const doc = (target?: string): EventDraft[] => [
      b.docAdded({
        docId,
        path: abs.slice(v.root.length + 1),
        sha256,
        docType: env.docType,
        originalName: `${env.title}.pdf`,
      }),
      ...(target ? [b.docLinked({ docId, target })] : []),
    ];
    const closed = (extra: Record<string, unknown> = {}): EventDraft => ({
      kind: "app",
      type: "envelope_signed",
      data: { envelope_id: env.id, doc_id: docId, ...extra },
    });
    let r = await appendUnlocked(fs, v, [...fit.drafts, ...doc(fit.target), closed()], ctx);
    let warning: string | undefined;
    if (!r.ok && fit.drafts.length) {
      warning = `Filed the signed PDF, but couldn't add it to the cap table: ${r.errors.join(" ")} Record it with + New.`;
      r = await appendUnlocked(fs, v, [...doc(), closed({ not_recorded: r.errors })], ctx);
    }
    if (!r.ok) {
      await fs
        .rename(abs, await freePath(fs, join(v.root, "docs", "_removed"), baseName(abs)))
        .catch(() => {});
      return r;
    }
    await fs
      .rename(
        join(v.root, env.outbox),
        await freePath(fs, join(v.root, "docs", "_removed"), baseName(env.outbox)),
      )
      .catch(() => {});
    return { ok: true as const, vault: r.vault, warning };
  });
}

/** F-17: cancelled before everyone signed. The sent copy moves to docs/_voided/ (never deleted). */
export async function voidEnvelope(
  fs: Fs,
  v: Vault,
  ctx: AppendCtx,
  env: Envelope,
  reason: string,
): Promise<Result> {
  const r = await appendToVault(
    fs,
    v,
    [{ kind: "app", type: "envelope_voided", data: { envelope_id: env.id, reason } }],
    ctx,
  );
  if (r.ok && isOutbox(env.outbox) && (await isPlainDocPath(fs, v.root, env.outbox)))
    await fs
      .rename(
        join(v.root, env.outbox),
        await freePath(fs, join(v.root, "docs", "_voided"), baseName(env.outbox)),
      )
      .catch(() => {});
  return r;
}
