// The relay API (docs/05-signing.md). Thin on purpose: Documenso does the signing; this checks who's asking.
import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { Codes, emailKey, makeToken, readToken } from "./auth.ts";
import type { DocEnvelope, Documenso } from "./documenso.ts";

export interface RelayDeps {
  documenso: Documenso;
  secret: string;
  now(): number;
  sendMail(to: string, subject: string, text: string): Promise<void>;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ORIGINS = [
  "tauri://localhost",
  "http://tauri.localhost",
  "https://tauri.localhost",
  "http://localhost:1420",
];
const prefix = (email: string) => `capfolder:${emailKey(email)}:`;

function status(e: DocEnvelope, now: number) {
  const expired =
    e.status === "PENDING" &&
    e.recipients.some((r) => r.expiresAt && Date.parse(r.expiresAt) < now && r.signingStatus !== "SIGNED");
  return {
    id: e.id,
    status: expired
      ? "expired"
      : (
          {
            DRAFT: "pending",
            PENDING: "pending",
            COMPLETED: "completed",
            REJECTED: "rejected",
            CANCELLED: "cancelled",
          } as const
        )[e.status],
    signers: [...e.recipients]
      .sort((a, b) => (a.signingOrder ?? 0) - (b.signingOrder ?? 0))
      .map((r) => ({
        name: r.name,
        email: r.email,
        status:
          r.signingStatus === "SIGNED"
            ? "signed"
            : r.signingStatus === "REJECTED"
              ? "rejected"
              : r.readStatus === "OPENED"
                ? "opened"
                : "sent",
        signedAt: r.signedAt,
      })),
  };
}

/** Deletes every Capfolder envelope older than 30 days (run hourly). Returns how many went. */
export async function purge(doc: Documenso, now: () => number): Promise<number> {
  let gone = 0;
  for (let page = 1, total = 1; page <= total; page++) {
    const r = await doc.find(page);
    total = r.totalPages;
    for (const e of r.data)
      if (e.externalId?.startsWith("capfolder:") && now() - Date.parse(e.createdAt) > 30 * 864e5) {
        if (e.deletedAt) continue;
        if (e.status === "PENDING") await doc.cancel(e.id);
        await doc.remove(e.id);
        gone++;
      }
  }
  return gone;
}

export function createApp(d: RelayDeps) {
  const codes = new Codes(d.now);
  const app = new Hono<{ Variables: { email: string } }>();
  app.use(
    "*",
    cors({
      origin: ORIGINS,
      allowHeaders: ["Authorization", "Content-Type"],
      allowMethods: ["GET", "POST", "DELETE"],
    }),
  );
  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: "The signing service had a problem. Try again in a minute." }, 502);
  });

  app.get("/health", (c) => c.json({ ok: true, service: "capfolder-relay" }));

  app.post("/auth/start", async (c) => {
    const { email } = await c.req.json<{ email?: string }>().catch(() => ({ email: undefined }));
    if (!email || !EMAIL.test(email))
      return c.json({ error: "That doesn't look like an email address." }, 400);
    const r = codes.issue(email);
    if ("error" in r) return c.json({ error: r.error }, 429);
    await d.sendMail(
      email.trim().toLowerCase(),
      `Your Capfolder code: ${r.code}`,
      `Your Capfolder code is ${r.code}. It works for 10 minutes.\n\nIf you didn't ask for it, ignore this email.`,
    );
    return c.json({ ok: true });
  });

  app.post("/auth/verify", async (c) => {
    const { email, code } = await c.req
      .json<{ email?: string; code?: string }>()
      .catch(() => ({}) as Record<string, undefined>);
    if (!email || !code) return c.json({ error: "Send the email and the code." }, 400);
    const ok = codes.check(email, code);
    if (ok === "expired") return c.json({ error: "That code has expired. Ask for a new one." }, 400);
    if (ok === "locked") return c.json({ error: "Too many tries. Ask for a new code." }, 400);
    if (!ok) return c.json({ error: "That's not the code. Check the email and try again." }, 400);
    return c.json({ token: makeToken(d.secret, email, d.now()), email: email.trim().toLowerCase() });
  });

  const authed = new Hono<{ Variables: { email: string } }>();
  authed.use("*", async (c, next) => {
    const token = c.req.header("Authorization")?.replace(/^Bearer /, "") ?? "";
    const email = readToken(d.secret, token, d.now());
    if (!email) return c.json({ error: "Verify your email again (Settings → Signing)." }, 401);
    c.set("email", email);
    await next();
  });
  /** The envelope, if it belongs to the caller (else "not found", never "forbidden"). */
  const mine = async (email: string, id: string) => {
    const e = await d.documenso.get(id);
    return e && !e.deletedAt && e.externalId?.startsWith(prefix(email)) ? e : null;
  };

  authed.get("/me", (c) => c.json({ email: c.get("email") }));

  authed.post("/envelopes", async (c) => {
    const form = await c.req.formData().catch(() => null);
    const pdf = form?.get("pdf");
    let meta: {
      title?: string;
      signers?: { name?: string; email?: string }[];
      fields?: { signer: number; page: number; x: number; y: number; w: number; h: number }[];
    } = {};
    try {
      meta = JSON.parse(String(form?.get("meta") ?? "{}"));
    } catch {}
    const signers = meta.signers ?? [];
    if (
      !(pdf instanceof Blob) ||
      !meta.title?.trim() ||
      !signers.length ||
      signers.some((s) => !s.name?.trim() || !s.email || !EMAIL.test(s.email))
    )
      return c.json({ error: "Send a PDF, a title and at least one signer with an email." }, 400);
    const id = await d.documenso.create(
      {
        title: meta.title.trim().slice(0, 200),
        externalId: `${prefix(c.get("email"))}${randomBytes(8).toString("hex")}`,
        recipients: signers.map((s, i) => ({
          name: s.name!.trim(),
          email: s.email!.trim().toLowerCase(),
          signingOrder: i + 1,
          fields: (meta.fields ?? [])
            .filter((f) => f.signer === i)
            .map((f) => ({ page: f.page, positionX: f.x, positionY: f.y, width: f.w, height: f.h })),
        })),
      },
      new Uint8Array(await pdf.arrayBuffer()),
    );
    await d.documenso.distribute(id);
    return c.json({ id }, 201);
  });

  authed.get("/envelopes/:id", async (c) => {
    const e = await mine(c.get("email"), c.req.param("id"));
    return e ? c.json(status(e, d.now())) : c.json({ error: "Not found" }, 404);
  });

  authed.get("/envelopes/:id/signing-url", async (c) => {
    const email = c.get("email");
    const e = await mine(email, c.req.param("id"));
    const me = e?.recipients.find((r) => r.email.toLowerCase() === email);
    if (!e || !me?.token) return c.json({ error: "Not found" }, 404);
    return c.json({ url: d.documenso.signingUrl(me.token) });
  });

  authed.get("/envelopes/:id/signed.pdf", async (c) => {
    const e = await mine(c.get("email"), c.req.param("id"));
    if (!e) return c.json({ error: "Not found" }, 404);
    if (e.status !== "COMPLETED") return c.json({ error: "Not everyone has signed yet." }, 409);
    const bytes = await d.documenso.download(e.envelopeItems[0]!.id);
    return c.body(bytes as Uint8Array<ArrayBuffer>, 200, { "content-type": "application/pdf" });
  });

  authed.post("/envelopes/:id/remind", async (c) => {
    const e = await mine(c.get("email"), c.req.param("id"));
    if (!e) return c.json({ error: "Not found" }, 404);
    const waiting = e.recipients.filter((r) => r.signingStatus === "NOT_SIGNED").map((r) => r.id);
    if (e.status !== "PENDING" || !waiting.length)
      return c.json({ error: "Nobody is waiting to sign." }, 409);
    await d.documenso.redistribute(e.id, waiting);
    return c.json({ ok: true });
  });

  authed.delete("/envelopes/:id", async (c) => {
    const e = await mine(c.get("email"), c.req.param("id"));
    if (!e) return c.json({ error: "Not found" }, 404);
    if (e.status === "PENDING" || e.status === "DRAFT") await d.documenso.cancel(e.id);
    await d.documenso.remove(e.id);
    return c.json({ ok: true });
  });

  app.route("/", authed);
  return app;
}
