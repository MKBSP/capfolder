// The few Documenso v2 calls the relay makes (checked against v2.18.0, docs/superpowers/specs/2026-10-10-m5-signing-design.md).

export interface DocRecipient {
  id: number;
  name: string;
  email: string;
  role: string;
  signingOrder: number | null;
  readStatus: "NOT_OPENED" | "OPENED";
  signingStatus: "NOT_SIGNED" | "SIGNED" | "REJECTED";
  signedAt: string | null;
  expiresAt?: string | null;
  token?: string;
}
export interface DocEnvelope {
  id: string;
  externalId: string | null;
  status: "DRAFT" | "PENDING" | "COMPLETED" | "REJECTED" | "CANCELLED";
  createdAt: string;
  completedAt: string | null;
  deletedAt?: string | null; // Documenso soft-deletes
  recipients: DocRecipient[];
  envelopeItems: { id: string; order: number }[];
}
export interface CreatePayload {
  title: string;
  externalId: string;
  recipients: {
    name: string;
    email: string;
    signingOrder: number;
    fields: { page: number; positionX: number; positionY: number; width: number; height: number }[];
  }[];
}

export interface Documenso {
  create(p: CreatePayload, pdf: Uint8Array): Promise<string>;
  distribute(id: string): Promise<{ email: string; signingUrl: string }[]>;
  get(id: string): Promise<DocEnvelope | null>;
  redistribute(id: string, recipientIds: number[]): Promise<void>;
  cancel(id: string): Promise<void>;
  remove(id: string): Promise<void>;
  download(itemId: string): Promise<Uint8Array>;
  find(page: number): Promise<{ data: DocEnvelope[]; totalPages: number }>;
  /** Documenso's signing page for one recipient (its public web address + /sign/<token>). */
  signingUrl(recipientToken: string): string;
}

/** Reminders on day 3 then every 4 days (≈ day 3 and 7), links expire after 30 days (F-16). */
const META = {
  signingOrder: "SEQUENTIAL",
  distributionMethod: "EMAIL",
  reminderSettings: { sendAfter: { unit: "day", amount: 3 }, repeatEvery: { unit: "day", amount: 4 } },
  envelopeExpirationPeriod: { unit: "day", amount: 30 },
  // Signers get the request and the signed copy. Nothing goes to the relay's own account (it would collect every
  // founder's documents), and no "deleted" mail when the purge removes a finished envelope. Fewer emails, too.
  emailSettings: {
    recipientSigningRequest: true,
    recipientRemoved: true,
    recipientSigned: false,
    documentPending: false,
    documentCompleted: true,
    documentDeleted: false,
    ownerDocumentCompleted: false,
    ownerRecipientExpired: false,
    ownerDocumentCreated: false,
  },
};

export function httpDocumenso(baseUrl: string, token: string, publicUrl = baseUrl): Documenso {
  const api = `${baseUrl.replace(/\/$/, "")}/api/v2`;
  async function call(path: string, init: RequestInit = {}) {
    const r = await fetch(`${api}${path}`, { ...init, headers: { Authorization: token, ...init.headers } });
    if (r.status === 404) return null;
    if (!r.ok)
      throw new Error(
        `Documenso ${init.method ?? "GET"} ${path}: ${r.status} ${(await r.text()).slice(0, 300)}`,
      );
    return r;
  }
  const post = (path: string, body: unknown) =>
    call(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  return {
    async create(p, pdf) {
      const form = new FormData();
      const payload = {
        title: p.title,
        type: "DOCUMENT",
        externalId: p.externalId,
        recipients: p.recipients.map((r) => ({
          ...r,
          role: "SIGNER",
          fields: r.fields.map((f) => ({ type: "SIGNATURE", identifier: 0, ...f })),
        })),
        meta: {
          ...META,
          subject: `Please sign: ${p.title}`,
          message: `You've been asked to sign "${p.title}".`,
        },
      };
      form.append("payload", JSON.stringify(payload));
      form.append(
        "files",
        new Blob([pdf as Uint8Array<ArrayBuffer>], { type: "application/pdf" }),
        "document.pdf",
      );
      const r = await call("/envelope/create", { method: "POST", body: form });
      return ((await r!.json()) as { id: string }).id;
    },
    async distribute(id) {
      const r = await post("/envelope/distribute", { envelopeId: id });
      return ((await r!.json()) as { recipients: { email: string; signingUrl: string }[] }).recipients;
    },
    async get(id) {
      const r = await call(`/envelope/${encodeURIComponent(id)}`);
      return r ? ((await r.json()) as DocEnvelope) : null;
    },
    async redistribute(id, recipientIds) {
      await post("/envelope/redistribute", { envelopeId: id, recipients: recipientIds });
    },
    async cancel(id) {
      await post("/envelope/cancel", { envelopeId: id, reason: "Cancelled by the sender" });
    },
    async remove(id) {
      await post("/envelope/delete", { envelopeId: id });
    },
    async download(itemId) {
      const r = await call(`/envelope/item/${encodeURIComponent(itemId)}/download?version=signed`);
      return new Uint8Array(await r!.arrayBuffer());
    },
    signingUrl: (t) => `${publicUrl.replace(/\/$/, "")}/sign/${encodeURIComponent(t)}`,
    async find(page) {
      const r = await call(`/envelope?page=${page}&perPage=100&type=DOCUMENT`);
      return (await r!.json()) as { data: DocEnvelope[]; totalPages: number };
    },
  };
}
