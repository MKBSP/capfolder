// F-04: a 6-digit code by email, then a long-lived device token (HMAC; rotating RELAY_SECRET revokes all).
import { createHash, createHmac, randomInt, timingSafeEqual } from "node:crypto";

export const emailKey = (email: string) =>
  createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 32);

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const unb64 = (s: string) => Buffer.from(s, "base64url").toString();

export function makeToken(secret: string, email: string, now: number): string {
  const body = `${b64(email.trim().toLowerCase())}.${now}`;
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}

/** The email a token was issued for, or null when it's forged or older than a year. */
export function readToken(secret: string, token: string, now: number): string | null {
  const [e, t, sig] = token.split(".");
  if (!e || !t || !sig) return null;
  const want = createHmac("sha256", secret).update(`${e}.${t}`).digest();
  const got = Buffer.from(sig, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  if (now - Number(t) > 365 * 864e5) return null;
  return unb64(e);
}

/** Fixed-window counter: at most `max` hits per key per `windowMs`. */
export class Limit {
  private hits = new Map<string, number[]>();
  private max: number;
  private windowMs: number;
  private now: () => number;
  private cap: number;
  constructor(max: number, windowMs: number, now: () => number, cap = 200_000) {
    this.max = max;
    this.windowMs = windowMs;
    this.now = now;
    this.cap = cap;
  }
  /** Counts a hit; false when the key is over its limit. */
  take(key: string): boolean {
    const t = this.now();
    if (!this.hits.has(key) && this.hits.size >= this.cap) {
      // Full: forget what has expired, then the oldest key. Never refuse newcomers (that would lock everyone
      // out); resetting one old key takes `cap` fresh IPs (IPv6 is counted per /64), which is the real cost.
      for (const [k, v] of this.hits) if (v.every((x) => t - x >= this.windowMs)) this.hits.delete(k);
      if (this.hits.size >= this.cap) this.hits.delete(this.hits.keys().next().value!);
    }
    const recent = (this.hits.get(key) ?? []).filter((x) => t - x < this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return false;
    }
    this.hits.set(key, [...recent, t]);
    return true;
  }
}

/** One pending code per email: 10 minutes, 5 tries; at most 5 codes per email per hour. */
export class Codes {
  private pending = new Map<string, { code: string; until: number; tries: number }>();
  private sent = new Map<string, number[]>();
  private now: () => number;
  constructor(now: () => number) {
    this.now = now; // no parameter properties: the relay runs with Node's type stripping
  }

  issue(email: string): { code: string } | { error: string } {
    const k = email.trim().toLowerCase();
    const t = this.now();
    if (this.pending.size > 50_000 || this.sent.size > 50_000) {
      for (const [x, p] of this.pending) if (t > p.until) this.pending.delete(x);
      for (const [x, v] of this.sent) if (v.every((y) => t - y >= 3600e3)) this.sent.delete(x);
      while (this.pending.size > 50_000) this.pending.delete(this.pending.keys().next().value!); // oldest code goes
    }
    const recent = (this.sent.get(k) ?? []).filter((x) => t - x < 3600e3);
    if (recent.length >= 5) return { error: "Too many codes for this email. Try again in an hour." };
    this.sent.set(k, [...recent, t]);
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    this.pending.set(k, { code, until: t + 600e3, tries: 0 });
    return { code };
  }

  check(email: string, code: string): boolean | "expired" | "locked" {
    const k = email.trim().toLowerCase();
    const p = this.pending.get(k);
    if (!p || this.now() > p.until) return "expired";
    if (p.tries >= 5) return "locked";
    p.tries++;
    if (p.code !== code.trim()) return false;
    this.pending.delete(k);
    return true;
  }
}
