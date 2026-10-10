import canonicalize from "canonicalize";
import type { VaultEvent } from "./types";

export const GENESIS = "0".repeat(64);

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function canonicalLine(e: VaultEvent): string {
  return canonicalize(e)!;
}

export async function hashEvent(e: VaultEvent | Omit<VaultEvent, "hash">): Promise<string> {
  const { hash: _ignored, ...rest } = e as VaultEvent;
  return sha256Hex(canonicalize(rest)!);
}

export type ChainResult = { ok: true; events: VaultEvent[] } | { ok: false; line: number; reason: string };

export async function verifyChain(text: string): Promise<ChainResult> {
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  const events: VaultEvent[] = [];
  let prev = GENESIS;
  for (let i = 0; i < lines.length; i++) {
    let e: VaultEvent;
    try {
      e = JSON.parse(lines[i]!);
    } catch {
      return { ok: false, line: i + 1, reason: "not valid JSON" };
    }
    if (e === null || typeof e !== "object" || Array.isArray(e))
      return { ok: false, line: i + 1, reason: "not an event object" };
    // ponytail: an array prev (merge event, docs/12) is accepted if it contains the previous hash; real fork merge is F-35.
    const prevs = Array.isArray(e.prev) ? e.prev : [e.prev];
    if (!prevs.includes(prev))
      return { ok: false, line: i + 1, reason: "prev does not match the previous line's hash" };
    if ((await hashEvent(e)) !== e.hash)
      return { ok: false, line: i + 1, reason: "hash does not match the line's content" };
    prev = e.hash;
    events.push(e);
  }
  return { ok: true, events };
}
