import Ajv, { type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import schemas from "./schemas-1.2.0.json" with { type: "json" };

type SchemaDoc = {
  $id: string;
  properties?: { object_type?: { const?: string }; file_type?: { const?: string } };
};

let validators: Map<string, ValidateFunction> | undefined;

function init(): Map<string, ValidateFunction> {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const docs = schemas as SchemaDoc[];
  for (const s of docs) ajv.addSchema(s);
  const map = new Map<string, ValidateFunction>();
  for (const s of docs) {
    if (s.$id.includes("/primitives/")) continue;
    // Equity-comp transactions use an enum (current name + deprecated TX_PLAN_SECURITY_* alias) instead of a const.
    const ot = s.properties?.object_type;
    const keys = ot?.const ? [ot.const] : (ot?.enum ?? []);
    const ft = s.properties?.file_type?.const;
    for (const key of ft ? [ft] : keys) map.set(key, ajv.getSchema(s.$id)!);
  }
  return map;
}

/** [] when valid, else readable errors. Dispatches on object_type (objects) or file_type (OCF files). */
export function validateOcf(obj: unknown): string[] {
  validators ??= init();
  const o = obj as { object_type?: unknown; file_type?: unknown };
  const key = o?.object_type ?? o?.file_type;
  const v = typeof key === "string" ? validators.get(key) : undefined;
  if (!v) return [`Unknown OCF object_type or file_type: ${String(key)}`];
  if (v(obj)) return [];
  return (v.errors ?? []).map((e) => `${e.instancePath || "(root)"} ${e.message}`);
}
