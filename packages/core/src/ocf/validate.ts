import type { ValidateFunction } from "ajv";
// Precompiled by scripts/gen-ocf-validators.mjs (no eval at runtime: the desktop CSP has no 'unsafe-eval').
import * as validators from "./validators.gen.js";

const byKey = validators as unknown as Record<string, ValidateFunction | undefined>;

/** [] when valid, else readable errors. Dispatches on object_type (objects) or file_type (OCF files). */
export function validateOcf(obj: unknown): string[] {
  const o = obj as { object_type?: unknown; file_type?: unknown };
  const key = o?.object_type ?? o?.file_type;
  const v = typeof key === "string" && Object.hasOwn(byKey, key) ? byKey[key] : undefined;
  if (!v) return [`Unknown OCF object_type or file_type: ${String(key)}`];
  if (v(obj)) return [];
  return (v.errors ?? []).map((e) => `${e.instancePath || "(root)"} ${e.message}`);
}
