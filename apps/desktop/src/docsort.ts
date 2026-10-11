// F-09 in the app: read → sort (core) → file what's certain, queue the rest for "Needs you".
import {
  type AppendCtx,
  type CorpusEntry,
  type DocRule,
  type EventDraft,
  type Fields,
  MAX_DATE,
  reduce,
  type SortResult,
  type SortType,
  sortText,
  termCounts,
} from "@capfolder/core";
import { aiSort, PROVIDERS } from "./ai";
import { isReadable, readText } from "./docread";
import { type Fs, join } from "./fs/types";
import type { Platform } from "./platform";
import type { Settings } from "./settings";
import { attachDocument, sha256Bytes, type Vault } from "./vault";

export interface SortItem {
  path: string;
  name: string;
  status: "waiting" | "reading" | "filed" | "review" | "duplicate" | "skipped" | "error";
  result?: SortResult;
  text?: string;
  ocr?: boolean;
  sha256?: string;
  filed?: string; // vault-relative path
  error?: string;
  ai?: string; // "Ollama · llama3.1" when a model typed it
}

// ---------- learning (per computer, never in the vault) ----------

const CORPUS = "sorting.json";
const MAX_CORPUS = 500;
const MAX_TERMS = 300;

export async function loadCorpus(fs: Fs, dir: string): Promise<(CorpusEntry & { sha256: string })[]> {
  try {
    const j = JSON.parse(await fs.readText(join(dir, CORPUS)));
    return Array.isArray(j.docs) ? j.docs : [];
  } catch {
    return []; // missing or unreadable: sorting just starts without learned examples
  }
}

/** A document the founder confirmed becomes an example for next time (docs/06 "Learn"). */
export async function learn(fs: Fs, dir: string, e: { sha256: string; type: SortType; text: string }) {
  const terms = Object.fromEntries(
    Object.entries(termCounts(e.text))
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_TERMS),
  );
  const docs = (await loadCorpus(fs, dir)).filter((d) => d.sha256 !== e.sha256);
  docs.push({ sha256: e.sha256, type: e.type, terms });
  await fs.writeText(join(dir, CORPUS), `${JSON.stringify({ version: 1, docs: docs.slice(-MAX_CORPUS) })}\n`);
}

// ---------- finding files ----------

const SKIP_DIRS = /^(\.|node_modules$|_removed$|_voided$|_imports$)/;

const MAX_FILES = 500;
/** Names that are surely files: not worth asking the disk whether they are folders. */
const OTHER_FILE =
  /\.(txt|rtf|docx?|xlsx?|csv|zip|json|md|pptx?|key|pages|numbers|eml|msg|html?|gif|heic|tiff?|mp4|mov)$/i;

/**
 * Readable files in a folder and its subfolders. A name like "Fund X Ventures I, L.P" may be a folder, so anything
 * that isn't a known file type is tried as one. ponytail: stops at 500 files (`truncated` tells the screen).
 */
export async function walk(
  fs: Fs,
  dir: string,
  skip: string | null,
): Promise<{ files: { path: string; name: string }[]; truncated: boolean }> {
  const files: { path: string; name: string }[] = [];
  let truncated = false;
  const visit = async (d: string, depth: number): Promise<void> => {
    if (depth > 6 || d === skip || truncated) return;
    let names: string[];
    try {
      names = await fs.list(d);
    } catch {
      return; // a file, or a folder we can't read
    }
    for (const name of names.sort()) {
      if (files.length >= MAX_FILES) {
        truncated = true;
        return;
      }
      const path = join(d, name);
      if (isReadable(name)) files.push({ path, name });
      else if (!SKIP_DIRS.test(name) && !OTHER_FILE.test(name)) await visit(path, depth + 1);
    }
  };
  await visit(dir, 0);
  return { files, truncated };
}

// ---------- one file ----------

export interface SortDeps {
  platform: Platform;
  rules?: DocRule[]; // from the rules pack
  settings: Settings;
  ctx: AppendCtx;
  corpus: CorpusEntry[];
}

/** Reads and sorts one file; files it when sorting is certain. Returns the item and the vault after any write. */
export async function sortOne(
  d: SortDeps,
  vault: Vault,
  file: { path: string; name: string },
  seen: Set<string>,
): Promise<{ item: SortItem; vault: Vault }> {
  const item: SortItem = { ...file, status: "reading" };
  try {
    const bytes = await d.platform.fs.readBytes(file.path);
    item.sha256 = await sha256Bytes(bytes);
    const state = reduce(vault.events, MAX_DATE);
    if (
      seen.has(item.sha256) ||
      [...state.docs.values()].some((x) => !x.removed && x.data.sha256 === item.sha256)
    )
      return { item: { ...item, status: "duplicate" }, vault };
    seen.add(item.sha256);
    const read = await readText(bytes, file.name, d.platform.ocr);
    item.text = read.text;
    item.ocr = read.ocr;
    let result = sortText(read.text, state, { corpus: d.corpus, rules: d.rules });
    const ai = d.settings.ai;
    if (!result.type && ai.sortWithAi && ai.provider && ai.model && read.text.trim()) {
      const proposal = await aiSort(d.platform, { provider: ai.provider, model: ai.model }, read.text);
      if (proposal) {
        result = sortText(read.text, state, { proposal });
        item.ai = `${PROVIDERS[ai.provider].label} · ${ai.model}`;
      }
    }
    item.result = result;
    if (result.status === "skip") return { item: { ...item, status: "skipped" }, vault };
    if (result.status === "review") return { item: { ...item, status: "review" }, vault };
    const r = await fileDoc(d, vault, item, bytes, {
      type: result.type!,
      fields: result.fields,
      targets: result.targets,
      person: result.person,
      date: result.date,
    });
    return r.ok
      ? { item: { ...item, status: "filed", filed: r.filed }, vault: r.vault }
      : { item: { ...item, status: "error", error: r.errors.join(" ") }, vault };
  } catch (e) {
    return { item: { ...item, status: "error", error: (e as Error).message ?? String(e) }, vault };
  }
}

/** Copies the file into docs/ and links it. Shared by automatic filing and the founder's "Confirm & file". */
export async function fileDoc(
  d: SortDeps,
  vault: Vault,
  item: SortItem,
  bytes: Uint8Array,
  p: {
    type: SortType;
    fields: Fields;
    targets: string[];
    person: string;
    date?: string;
    by?: string;
    extra?: EventDraft[];
  },
): Promise<{ ok: true; vault: Vault; filed: string } | { ok: false; errors: string[] }> {
  const r = await attachDocument(d.platform.fs, vault, d.ctx, {
    originalName: item.name,
    bytes,
    docType: p.type,
    date: p.date ?? d.ctx.now().toISOString().slice(0, 10),
    person: p.person,
    targets: p.targets,
    fields: p.fields as Record<string, string>,
    flags: [`sorted:${p.by ?? item.result?.by ?? "founder"}`, ...(item.ocr ? ["ocr"] : [])],
    extra: p.extra,
  });
  if (r.ok === "duplicate")
    return { ok: false, errors: ["This file is already in your folder (same content)."] };
  if (!r.ok) return r;
  const doc = reduce(r.vault.events, MAX_DATE).docs;
  const filed = [...doc.values()].find((x) => x.data.sha256 === item.sha256)?.data.path as string;
  return { ok: true, vault: r.vault, filed };
}
