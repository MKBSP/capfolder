import { md5 } from "js-md5";
import { liveEvents } from "./reduce";
import type { Data, VaultEvent } from "./types";

const FILES: [name: string, fileType: string, manifestKey: string, match: (t: string) => boolean][] = [
  ["Stakeholders.ocf.json", "OCF_STAKEHOLDERS_FILE", "stakeholders_files", (t) => t === "STAKEHOLDER"],
  ["StockClasses.ocf.json", "OCF_STOCK_CLASSES_FILE", "stock_classes_files", (t) => t === "STOCK_CLASS"],
  ["StockPlans.ocf.json", "OCF_STOCK_PLANS_FILE", "stock_plans_files", (t) => t === "STOCK_PLAN"],
  ["VestingTerms.ocf.json", "OCF_VESTING_TERMS_FILE", "vesting_terms_files", (t) => t === "VESTING_TERMS"],
  ["Valuations.ocf.json", "OCF_VALUATIONS_FILE", "valuations_files", (t) => t === "VALUATION"],
  [
    "StockLegends.ocf.json",
    "OCF_STOCK_LEGEND_TEMPLATES_FILE",
    "stock_legend_templates_files",
    (t) => t === "STOCK_LEGEND_TEMPLATE",
  ],
  ["Transactions.ocf.json", "OCF_TRANSACTIONS_FILE", "transactions_files", (t) => t.startsWith("TX_")],
];
const json = (o: unknown) => `${JSON.stringify(o, null, 2)}\n`;

// ponytail: DOCUMENT objects need an md5 of the file bytes; they're exported once doc_added carries md5 (M3 files them).
/** The vault as a standard OCF 1.2.0 export: file name → JSON text (manifest + one file per object type). */
export function toOcfExport(
  events: VaultEvent[],
  opts: { asOf: string; generatedAt: string },
): Record<string, string> {
  const live = liveEvents(events).filter(
    (e) => e.kind === "ocf" && (!e.type.startsWith("TX_") || e.data.date <= opts.asOf),
  );
  const latest = new Map<string, Data>(); // a later object with the same id (e.g. a stakeholder update) replaces it
  for (const e of live) latest.set(e.data.id, e.data);
  const objects = [...latest.values()];
  const out: Record<string, string> = {};
  const manifest: Data = {
    ocf_version: "1.2.0",
    file_type: "OCF_MANIFEST_FILE",
    issuer: objects.find((o) => o.object_type === "ISSUER"),
    as_of: opts.asOf,
    generated_at: opts.generatedAt,
  };
  for (const [name, fileType, key, match] of FILES) {
    out[name] = json({ file_type: fileType, items: objects.filter((o) => match(o.object_type)) });
    manifest[key] = [{ filepath: `./${name}`, md5: md5(out[name]) }];
  }
  out["Manifest.ocf.json"] = json(manifest);
  return out;
}
