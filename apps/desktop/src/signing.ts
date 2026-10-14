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
  receipt?: string; // when completed: lets /wire email these signers later
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
    /** The signed copy and the wire instructions to everyone else who signed. */
    wire: (
      meta: {
        envelope_id: string;
        receipt: string;
        title: string;
        company: string;
        signers: { name: string; email: string }[];
      },
      signed: Uint8Array,
      wire: Uint8Array,
    ) => {
      const form = new FormData();
      const blob = (b: Uint8Array) => new Blob([b as Uint8Array<ArrayBuffer>], { type: "application/pdf" });
      form.append("signed", blob(signed), "signed.pdf");
      form.append("wire", blob(wire), "wire.pdf");
      form.append("meta", JSON.stringify(meta));
      return call("/wire", { method: "POST", body: form });
    },
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
  receipt?: string;
  wireSentAt?: string;
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
      Object.assign(env, { state: "signed", closedAt: e.ts, docId: d.doc_id, receipt: d.receipt });
    if (e.type === "wire_sent") env.wireSentAt = e.ts;
    if (e.type === "envelope_voided") Object.assign(env, { state: "voided", closedAt: e.ts });
  }
  return [...out.values()];
}

/**
 * Which relay to ask about an envelope. envelope_sent.relay comes from events.jsonl, a file anyone with access to
 * the folder can edit, so only relays this computer was set up with are contacted (never an address from the file).
 */
export function relayFor(
  s: { relayUrl: string; relayToken: string; relayTokens?: Record<string, string> },
  env: Pick<Envelope, "relay">,
): { relayUrl: string; relayToken: string } | null {
  if (env.relay === s.relayUrl) return { relayUrl: s.relayUrl, relayToken: s.relayToken };
  const t = s.relayTokens?.[env.relay];
  return t ? { relayUrl: env.relay, relayToken: t } : null;
}
