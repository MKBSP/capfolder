// The desktop side of signing (docs/05): a small relay client and the envelopes as the record tells them.
import type { EventDraft, VaultEvent } from "@capfolder/core";
import type { Platform } from "./platform";

export const OFFLINE = "Can't reach the signing relay. Everything else works; try again when you're online.";

export class RelayError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.status = status;
  }
}

export interface SignerStatus {
  name: string;
  email: string;
  status: "sent" | "opened" | "signed" | "rejected";
  signedAt: string | null;
}
export interface EnvelopeStatus {
  id: string;
  status: "pending" | "completed" | "cancelled" | "rejected" | "expired";
  signers: SignerStatus[];
}

export function relayClient(platform: Platform, s: { relayUrl: string; relayToken: string }) {
  const base = s.relayUrl.replace(/\/+$/, "");
  async function call(path: string, init: RequestInit = {}, auth = true): Promise<Response> {
    let r: Response;
    try {
      r = await platform.fetch(`${base}${path}`, {
        ...init,
        headers: {
          ...(auth && s.relayToken ? { Authorization: `Bearer ${s.relayToken}` } : {}),
          ...init.headers,
        },
      });
    } catch {
      throw new RelayError(OFFLINE);
    }
    if (!r.ok) {
      const msg = await r
        .json()
        .then((j: { error?: string }) => j.error)
        .catch(() => undefined);
      throw new RelayError(msg ?? `The signing relay answered ${r.status}.`, r.status);
    }
    return r;
  }
  const post = (path: string, body: unknown, auth = true) =>
    call(
      path,
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
      auth,
    );
  return {
    health: async () =>
      (await (await call("/health", {}, false)).json()) as { ok: boolean; service?: string },
    start: (email: string) => post("/auth/start", { email }, false),
    verify: async (email: string, code: string) =>
      (await (await post("/auth/verify", { email, code }, false)).json()) as { token: string; email: string },
    send: async (
      pdf: Uint8Array,
      meta: { title: string; signers: { name: string; email: string }[]; fields: unknown[] },
    ) => {
      const form = new FormData();
      form.append(
        "pdf",
        new Blob([pdf as Uint8Array<ArrayBuffer>], { type: "application/pdf" }),
        "document.pdf",
      );
      form.append("meta", JSON.stringify(meta));
      return (await (await call("/envelopes", { method: "POST", body: form })).json()) as { id: string };
    },
    status: async (id: string) =>
      (await (await call(`/envelopes/${encodeURIComponent(id)}`)).json()) as EnvelopeStatus,
    signingUrl: async (id: string) =>
      ((await (await call(`/envelopes/${encodeURIComponent(id)}/signing-url`)).json()) as { url: string })
        .url,
    signedPdf: async (id: string) =>
      new Uint8Array(await (await call(`/envelopes/${encodeURIComponent(id)}/signed.pdf`)).arrayBuffer()),
    remind: (id: string) => call(`/envelopes/${encodeURIComponent(id)}/remind`, { method: "POST" }),
    remove: (id: string) => call(`/envelopes/${encodeURIComponent(id)}`, { method: "DELETE" }),
  };
}
export type RelayClient = ReturnType<typeof relayClient>;

/** One envelope, from its envelope_sent event and whatever closed it. */
export interface Envelope {
  id: string;
  relay: string;
  title: string;
  docType: string;
  target?: string;
  person: string;
  signers: { name: string; email: string }[];
  sentAt: string;
  outbox: string;
  originalPages: number;
  onSigned: EventDraft[];
  state: "open" | "signed" | "voided";
  closedAt?: string;
  docId?: string;
}

export function envelopes(events: VaultEvent[]): Envelope[] {
  const out = new Map<string, Envelope>();
  for (const e of events) {
    const d = e.data;
    if (e.type === "envelope_sent")
      out.set(d.envelope_id, {
        id: d.envelope_id,
        relay: d.relay,
        title: d.title,
        docType: d.doc_type,
        target: d.target,
        person: d.person,
        signers: d.signers,
        sentAt: e.ts,
        outbox: d.outbox,
        originalPages: d.original_pages,
        onSigned: d.on_signed ?? [],
        state: "open",
      });
    const env = out.get(d.envelope_id);
    if (!env) continue;
    if (e.type === "envelope_signed")
      Object.assign(env, { state: "signed", closedAt: e.ts, docId: d.doc_id });
    if (e.type === "envelope_voided") Object.assign(env, { state: "voided", closedAt: e.ts });
  }
  return [...out.values()];
}
