// OCF 1.2.0 export (manifest + files) → event drafts for an empty vault. Used by the M6 round trip and M2's import screen.
// ponytail: manifest md5s aren't checked (hand-edited exports would fail); every object is schema-validated instead.
import { validateOcf } from "./ocf/validate";
import type { Data, EventDraft } from "./types";

const DEF_ORDER = [
  "ISSUER",
  "STAKEHOLDER",
  "STOCK_CLASS",
  "VESTING_TERMS",
  "STOCK_PLAN",
  "VALUATION",
  "STOCK_LEGEND_TEMPLATE",
];

const dirOf = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/") + 1) : "");
const resolve = (dir: string, rel: string) => `${dir}${rel.replace(/^\.\//, "")}`;

/** files: path → JSON text (e.g. an unzipped OCF zip). Paths may sit in a folder. */
export function fromOcfExport(
  files: Record<string, string>,
): { drafts: EventDraft[] } | { errors: string[] } {
  const parsed = new Map<string, Data>();
  for (const [path, text] of Object.entries(files)) {
    if (!path.endsWith(".json")) continue;
    try {
      parsed.set(path, JSON.parse(text));
    } catch {
      // a non-JSON file next to the export is ignored unless the manifest points at it
    }
  }
  const manifestPath = [...parsed].find(([, d]) => d?.file_type === "OCF_MANIFEST_FILE")?.[0];
  if (!manifestPath) return { errors: ["No OCF manifest found (a file with file_type OCF_MANIFEST_FILE)"] };
  const manifest = parsed.get(manifestPath)!;
  const errors = validateOcf(manifest).map((e) => `${manifestPath}: ${e}`);

  const objects: Data[] = [manifest.issuer];
  const dir = dirOf(manifestPath);
  for (const [key, list] of Object.entries(manifest)) {
    if (!key.endsWith("_files") || !Array.isArray(list)) continue;
    for (const f of list as { filepath: string }[]) {
      const path = resolve(dir, f.filepath);
      const name = path.slice(dir.length);
      const file = parsed.get(path);
      if (!file) {
        errors.push(`${name}: listed in the manifest but missing or not valid JSON`);
        continue;
      }
      for (const o of file.items ?? []) {
        const errs = validateOcf(o);
        if (errs.length) errors.push(`${name}: ${o?.object_type} ${o?.id}: ${errs.join("; ")}`);
        else objects.push(o);
      }
    }
  }
  if (errors.length) return { errors };

  const rank = (t: string) =>
    t.startsWith("TX_")
      ? DEF_ORDER.length + 1
      : DEF_ORDER.indexOf(t) < 0
        ? DEF_ORDER.length
        : DEF_ORDER.indexOf(t);
  const ordered = objects
    .map((o, i) => ({ o, i }))
    .sort((a, b) => {
      const r = rank(a.o.object_type) - rank(b.o.object_type);
      if (r) return r;
      if (a.o.object_type.startsWith("TX_") && a.o.date !== b.o.date) return a.o.date < b.o.date ? -1 : 1;
      return a.i - b.i; // file order within a date
    });
  return {
    drafts: ordered.map(({ o }) => ({
      kind: "ocf",
      type: o.object_type,
      data: o,
      meta: { source: "import_ocf" },
    })),
  };
}
