// The rules pack (docs/07 §2): export guides and document-sorting phrases that can change without a release.
// A copy ships in the app; newer packs are fetched daily, used only if signed with our key, and swapped in live.
import type { DocRule } from "@capfolder/core";
import * as ed from "@noble/ed25519";
import bundled from "../../../rules/rules.json";
import { join } from "./fs/types";
import type { Platform } from "./platform";

export interface RulesPack {
  format: "capfolder-rules/1";
  version: string; // YYYY.MM.DD-n
  min_app_version: string;
  export_guides: Record<string, { title: string; steps: string[] }>;
  doc_types: DocRule[];
}

export const BUNDLED_RULES = bundled as RulesPack;
/** ed25519 public key for rules/rules.json.sig (private key: ~/.capfolder/rules-signing.key, never in the repo). */
export const RULES_PUBLIC_KEY = "865790ada203062d02d45a56e5b4b1734782532160b5b666dd6e526caa361e9c";
export const RULES_URL = "https://raw.githubusercontent.com/MKBSP/capfolder/main/rules/rules.json";

const nums = (v: string) => v.split(/[.-]/).map((x) => Number.parseInt(x, 10) || 0);
/** Negative when a < b, for "2026.10.11-2" pack versions and "0.1.0" app versions alike. */
export function compareVersions(a: string, b: string): number {
  const x = nums(a);
  const y = nums(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++)
    if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
}

const fromHex = (h: string) => Uint8Array.from(h.match(/../g)!.map((b) => Number.parseInt(b, 16)));
const fromB64 = (s: string) => Uint8Array.from(atob(s.trim()), (c) => c.charCodeAt(0));

/** The pack in these bytes, if it's signed with our key, well-formed, newer than `current` and fits this app. */
export async function acceptPack(
  bytes: Uint8Array,
  sigB64: string,
  current: RulesPack,
  appVersion: string,
  publicKey = RULES_PUBLIC_KEY,
): Promise<RulesPack | null> {
  try {
    if (!(await ed.verifyAsync(fromB64(sigB64), bytes, fromHex(publicKey)))) return null;
    const p = JSON.parse(new TextDecoder().decode(bytes)) as RulesPack;
    if (p.format !== "capfolder-rules/1" || !/^\d{4}\.\d\d\.\d\d-\d+$/.test(p.version)) return null;
    if (compareVersions(p.version, current.version) <= 0) return null;
    if (compareVersions(p.min_app_version, appVersion) > 0) return null;
    if (typeof p.export_guides !== "object" || !Array.isArray(p.doc_types)) return null;
    for (const r of p.doc_types) for (const ph of r.phrases) new RegExp(ph, "m"); // throws on a bad phrase
    return p;
  } catch {
    return null; // tampered, truncated or garbled: keep what we have
  }
}

const CACHE = "rules.json";

/** At start: a cached pack from an earlier download, if it still verifies and beats the bundled one. */
export async function cachedRules(
  platform: Platform,
  appVersion: string,
  publicKey = RULES_PUBLIC_KEY,
): Promise<RulesPack> {
  try {
    const dir = await platform.appDataDir();
    const bytes = await platform.fs.readBytes(join(dir, CACHE));
    const sig = await platform.fs.readText(join(dir, `${CACHE}.sig`));
    return (await acceptPack(bytes, sig, BUNDLED_RULES, appVersion, publicKey)) ?? BUNDLED_RULES;
  } catch {
    return BUNDLED_RULES;
  }
}

/** Daily: a newer signed pack, saved for next start, or null (offline, not newer, or not ours). */
export async function fetchRules(
  platform: Platform,
  current: RulesPack,
  appVersion: string,
  publicKey = RULES_PUBLIC_KEY,
): Promise<RulesPack | null> {
  try {
    const [b, s] = await Promise.all([
      platform.fetch(RULES_URL, { cache: "no-store" }),
      platform.fetch(`${RULES_URL}.sig`, { cache: "no-store" }),
    ]);
    if (!b.ok || !s.ok) return null;
    const bytes = new Uint8Array(await b.arrayBuffer());
    const sig = await s.text();
    const pack = await acceptPack(bytes, sig, current, appVersion, publicKey);
    if (!pack) return null;
    const dir = await platform.appDataDir();
    await platform.fs.writeBytes(join(dir, CACHE), bytes);
    await platform.fs.writeText(join(dir, `${CACHE}.sig`), sig);
    return pack;
  } catch {
    return null;
  }
}
