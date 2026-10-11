// docs/11: the anonymous install ping. Off in Settings → nothing is sent. Never names, numbers, files or emails.
import { TERMS_VERSION } from "./copy";
import type { Platform } from "./platform";
import type { Settings } from "./settings";
import type { Vault } from "./vault";

const WEEK = 7 * 864e5;

export const osName = (ua = navigator.userAgent): "macos" | "windows" | "linux" =>
  /Mac/i.test(ua) ? "macos" : /Win/i.test(ua) ? "windows" : "linux";

/** Sends first_run once, then weekly. Returns the settings to save after a successful send, else null. */
export async function maybePing(
  platform: Platform,
  s: Settings,
  vault: Vault | null,
  appVersion: string,
  now = Date.now(),
): Promise<Settings | null> {
  // only after the founder accepted the terms that disclose it (it's on by default, so consent comes from there)
  if (!s.telemetry || s.termsAccepted !== TERMS_VERSION || !s.relayUrl) return null;
  const p = s.ping;
  const age = now - Date.parse(p.last); // NaN (garbled) or negative (clock moved) counts as due
  const event = !p.firstRunSent ? "first_run" : !(age >= 0 && age < WEEK) ? "weekly" : null;
  if (!event) return null;
  const installId = p.installId || crypto.randomUUID();
  const events = vault?.events ?? [];
  const body = {
    install_id: installId,
    event,
    app_version: appVersion,
    os: osName(),
    imported: events.some((e) => String(e.meta?.source ?? "").startsWith("import:")),
    has_documents: events.some((e) => e.type === "doc_added"),
    sent_envelope: events.some((e) => e.type === "envelope_sent"),
  };
  try {
    const r = await platform.fetch(`${s.relayUrl}/ping`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) return null;
  } catch {
    return null; // offline: try again next time
  }
  return { ...s, ping: { installId, firstRunSent: true, last: new Date(now).toISOString() } };
}
