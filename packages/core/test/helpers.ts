import { readFileSync } from "node:fs";
import type { Data, VaultEvent } from "../src/types";

const FIX = new URL("../../../fixtures/acme-vault/", import.meta.url);
export const readFix = (name: string) => readFileSync(new URL(name, FIX), "utf8");
export const acmeEvents = (): VaultEvent[] =>
  readFix("events.jsonl")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));

let n = 1000;
/** Unhashed test event. Upper-case types are OCF objects/transactions. */
export function ev(type: string, data: Data, opts: { ts?: string; id?: string } = {}): VaultEvent {
  n++;
  const ocf = type === type.toUpperCase();
  return {
    seq: n,
    id: opts.id ?? `evt_t${String(n).padStart(9, "0")}`, // padded so ids sort as strings (property test makes 100k+)
    ts: opts.ts ?? "2026-10-07T10:00:00Z",
    kind: ocf ? "ocf" : "app",
    type,
    data: ocf ? { object_type: type, ...data } : data,
    meta: { source: "test" },
    prev: "",
    hash: "",
  };
}
