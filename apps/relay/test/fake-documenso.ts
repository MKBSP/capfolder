import type { CreatePayload, DocEnvelope, Documenso } from "../src/documenso.ts";

/** In-memory Documenso: enough behaviour to test the relay (and the desktop app) without Docker. */
export function fakeDocumenso(now = () => new Date("2026-10-10T12:00:00Z")) {
  const envelopes = new Map<string, DocEnvelope & { pdf: Uint8Array; signed?: Uint8Array }>();
  const calls: string[] = [];
  let n = 0;
  const api: Documenso = {
    async create(p: CreatePayload, pdf) {
      const id = `envelope_${++n}`;
      calls.push(`create ${id}`);
      envelopes.set(id, {
        id,
        externalId: p.externalId,
        status: "DRAFT",
        createdAt: now().toISOString(),
        completedAt: null,
        recipients: p.recipients.map((r, i) => ({
          id: i + 1,
          name: r.name,
          email: r.email,
          role: "SIGNER",
          signingOrder: r.signingOrder,
          readStatus: "NOT_OPENED",
          signingStatus: "NOT_SIGNED",
          signedAt: null,
          token: `tok${n}_${i + 1}`,
        })),
        envelopeItems: [{ id: `item_${n}`, order: 1 }],
        pdf,
      });
      return id;
    },
    async distribute(id) {
      calls.push(`distribute ${id}`);
      const e = envelopes.get(id)!;
      e.status = "PENDING";
      return e.recipients.map((r) => ({
        email: r.email,
        signingUrl: `http://documenso.test/sign/${r.token}`,
      }));
    },
    async get(id) {
      return envelopes.get(id) ?? null;
    },
    async redistribute(id, ids) {
      calls.push(`redistribute ${id} ${ids.join(",")}`);
    },
    async cancel(id) {
      calls.push(`cancel ${id}`);
      envelopes.get(id)!.status = "CANCELLED";
    },
    async remove(id) {
      calls.push(`remove ${id}`);
      envelopes.get(id)!.deletedAt = now().toISOString(); // like Documenso: soft delete
    },
    async download(itemId) {
      const e = [...envelopes.values()].find((x) => x.envelopeItems[0]!.id === itemId)!;
      return e.signed ?? e.pdf;
    },
    signingUrl: (t) => `http://documenso.test/sign/${t}`,
    async find(page) {
      const all = [...envelopes.values()];
      return {
        data: all.slice((page - 1) * 100, page * 100),
        totalPages: Math.max(1, Math.ceil(all.length / 100)),
      };
    },
  };
  /** Test helpers: what a signer does in the browser. */
  const sign = (id: string, email: string, signed?: Uint8Array) => {
    const e = envelopes.get(id)!;
    const r = e.recipients.find((x) => x.email === email)!;
    r.readStatus = "OPENED";
    r.signingStatus = "SIGNED";
    r.signedAt = now().toISOString();
    if (e.recipients.every((x) => x.signingStatus === "SIGNED")) {
      e.status = "COMPLETED";
      e.completedAt = now().toISOString();
      e.signed = signed ?? e.pdf;
    }
  };
  return { api, envelopes, calls, sign };
}
