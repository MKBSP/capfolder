// The relay API (docs/05-signing.md). Thin on purpose: Documenso does the signing; this checks who's asking.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { Codes, emailKey, Limit, makeToken, readToken } from "./auth.ts";
import type { DocEnvelope, Documenso } from "./documenso.ts";

export interface RelayDeps {
  documenso: Documenso;
  secret: string;
  now(): number;
  sendMail(to: string, subject: string, text: string, extra?: MailExtra): Promise<void>;
  /** Who's calling, for rate limits. Default: the last X-Forwarded-For hop (the one our proxy added). */
  clientIp?(c: Context): string;
  /** docs/11: where anonymous install pings go (one row each). Without it pings are accepted and dropped. */
  recordPing?(row: PingRow): Promise<void>;
  /** Fair use on a hosted relay: signing requests per free account per calendar month (10, UTC) and across
   * everyone per day (unlimited). */
  limits?: { perEmailPerMonth?: number; totalPerDay?: number };
  /** The sender's plan, by lowercased email. Pro has no per-account limit. Default: everyone is free. */
  plan?(email: string): "free" | "pro";
  /** Kill switch: true stops new envelopes; status, downloads and reminders keep working. */
  paused?(): boolean;
}

export interface MailExtra {
  replyTo?: string;
  attachments?: { filename: string; content: Uint8Array }[];
}

export interface PingRow {
  day: string; // only the date, not the time
  install_id: string;
  event: "first_run" | "weekly";
  app_version: string;
  os: "macos" | "windows" | "linux";
  imported: boolean;
  has_documents: boolean;
  sent_envelope: boolean;
}

/** The ping, if it's exactly the documented shape; everything else in the body is ignored, never stored. */
function readPing(b: Record<string, unknown> | null, day: string): PingRow | null {
  if (!b || typeof b !== "object" || Array.isArray(b)) return null;
  const bool = (k: string) => typeof b[k] === "boolean";
  if (
    typeof b.install_id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(b.install_id)
  )
    return null;
  if (b.event !== "first_run" && b.event !== "weekly") return null;
  if (typeof b.app_version !== "string" || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.]{1,20})?$/.test(b.app_version))
    return null;
  if (b.os !== "macos" && b.os !== "windows" && b.os !== "linux") return null;
  if (!bool("imported") || !bool("has_documents") || !bool("sent_envelope")) return null;
  return {
    day,
    install_id: b.install_id,
    event: b.event,
    app_version: b.app_version,
    os: b.os,
    imported: b.imported as boolean,
    has_documents: b.has_documents as boolean,
    sent_envelope: b.sent_envelope as boolean,
  };
}

/** Rate-limit key for an address: IPv4 as is, IPv6 by its /64 (one customer network). */
export function clientKey(ip: string): string {
  if (!ip.includes(":") || ip.includes(".")) return ip;
  const [head = "", tail = ""] = ip.split("::");
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const full = ip.includes("::") ? [...h, ...Array(8 - h.length - t.length).fill("0"), ...t] : h;
  return `${full
    .slice(0, 4)
    .map((x) => x.toLowerCase().replace(/^0+(?=.)/, ""))
    .join(":")}::/64`;
}

const MAX_SIGNERS = 10;
const MAX_PDF = 15 * 1024 * 1024;
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

/**
 * Hourly: deletes Capfolder envelopes nobody will fetch any more. Pending, rejected or cancelled ones 30 days after
 * they were sent; completed ones a week after completion (the app normally fetches and deletes them sooner).
 */
export async function purge(doc: Documenso, now: () => number): Promise<number> {
  const old: DocEnvelope[] = [];
  for (let page = 1, total = 1; page <= total; page++) {
    const r = await doc.find(page);
    total = r.totalPages;
    for (const e of r.data) {
      if (!e.externalId?.startsWith("capfolder:") || e.deletedAt) continue;
      const age = e.status === "COMPLETED" && e.completedAt ? now() - Date.parse(e.completedAt) : null;
      if (age !== null ? age > 7 * 864e5 : now() - Date.parse(e.createdAt) > 30 * 864e5) old.push(e);
    }
  }
  for (const e of old) {
    // collected first: deleting while paging would shift later pages and skip some
    if (e.status === "PENDING") await doc.cancel(e.id);
    await doc.remove(e.id);
  }
  return old.length;
}

/**
 * Plans from a JSON file edited by hand: {"pro": ["founder@example.com"]}. Re-read when it changes; a missing or
 * broken file means everyone is free. Billing will write the same list later.
 */
export function filePlans(path: string): (email: string) => "free" | "pro" {
  let seen = "";
  let pro = new Set<string>();
  let warned = false;
  return (email) => {
    let stamp = "";
    try {
      const st = statSync(path);
      stamp = `${st.mtimeMs}:${st.size}`;
    } catch {}
    if (stamp !== seen) {
      seen = stamp;
      pro = new Set();
      if (stamp)
        try {
          const j = JSON.parse(readFileSync(path, "utf8"));
          pro = new Set(
            (Array.isArray(j?.pro) ? j.pro : []).map((e: unknown) => String(e).trim().toLowerCase()),
          );
          warned = false;
        } catch (e) {
          if (!warned) console.error(`plans file ${path} is unreadable, everyone is free:`, e);
          warned = true;
        }
    }
    return pro.has(email.trim().toLowerCase()) ? "pro" : "free";
  };
}

export function createApp(d: RelayDeps) {
  const codes = new Codes(d.now);
  // Abuse limits: code emails and guesses per IP (across addresses), sends per verified email per month.
  const startPerIp = new Limit(20, 3600e3, d.now);
  const verifyPerIp = new Limit(60, 3600e3, d.now);
  const perEmail = d.limits?.perEmailPerMonth ?? 10;
  // ponytail: counts live in memory, so a relay restart resets them; persist them when billing arrives
  const sent = new Map<string, { month: string; n: number }>();
  let sentMonth = "";
  /** Counts one send for a free account; the refusal message, or null when it may go. */
  const overLimit = (raw: string): string | null => {
    const email = raw.trim().toLowerCase();
    if (d.plan?.(email) === "pro") return null;
    const now = new Date(d.now());
    const month = now.toISOString().slice(0, 7);
    if (month !== sentMonth) {
      sent.clear(); // last month's counts are dead weight: the map only ever holds this month's senders
      sentMonth = month;
    }
    const key = emailKey(email);
    const x = sent.get(key);
    const n = x?.month === month ? x.n : 0;
    if (n >= perEmail) {
      const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
      const on = next.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
      return `That's ${perEmail} signing requests this month, the free limit. It resets on ${on}. Pro has no limit.`;
    }
    sent.set(key, { month, n: n + 1 });
    return null;
  };
  // the total keeps a hosted relay under its email provider's daily quota (~5 emails per envelope)
  const sendsTotal = d.limits?.totalPerDay ? new Limit(d.limits.totalPerDay, 864e5, d.now) : null;
  const pingsPerIp = new Limit(30, 3600e3, d.now);
  // Anyone can post a ping, so fake installs are bounded: 3 install ids per network and 50,000 rows per day.
  // ponytail: in memory, reset daily; a restart resets it too (the proxy's rate limit is the outer fence)
  let pingDay = "";
  let pingRows = 0;
  const idsByNet = new Map<string, Set<string>>();
  const ipOf = (c: Context) => clientKey(rawIp(c));
  const rawIp = (c: Context) =>
    // The last hop is the one our proxy added; anything before it the client could have written itself.
    d.clientIp?.(c) ?? c.req.header("x-forwarded-for")?.split(",").at(-1)?.trim() ?? "unknown";
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

  // Anonymous install counts (docs/11): the IP is used for the rate limit only and never stored.
  app.post(
    "/ping",
    bodyLimit({ maxSize: 2048, onError: (c) => c.json({ error: "Too large." }, 413) }),
    async (c) => {
      // JSON only: a web page can send text/plain without a CORS preflight, but not application/json
      if (!/^application\/json\b/i.test(c.req.header("content-type") ?? ""))
        return c.json({ error: "Send JSON." }, 415);
      const net = ipOf(c);
      if (!pingsPerIp.take(net)) return c.json({ error: "Too many." }, 429);
      const body = await c.req.json<Record<string, unknown> | null>().catch(() => null);
      const day = new Date(d.now()).toISOString().slice(0, 10);
      const row = readPing(body, day);
      if (!row) return c.json({ error: "Not a Capfolder ping." }, 400);
      if (day !== pingDay || idsByNet.size > 200_000) {
        pingDay = day;
        pingRows = 0;
        idsByNet.clear();
      }
      const ids = idsByNet.get(net) ?? new Set<string>();
      if ((!ids.has(row.install_id) && ids.size >= 3) || pingRows >= 50_000)
        return c.json({ error: "Too many." }, 429);
      ids.add(row.install_id);
      idsByNet.set(net, ids);
      pingRows++;
      await d.recordPing?.(row);
      return c.body(null, 204);
    },
  );

  app.post("/auth/start", async (c) => {
    const body = await c.req.json<{ email?: unknown }>().catch(() => ({}) as { email?: unknown });
    const email = typeof body.email === "string" ? body.email : undefined;
    if (!email || !EMAIL.test(email))
      return c.json({ error: "That doesn't look like an email address." }, 400);
    if (!startPerIp.take(ipOf(c)))
      return c.json({ error: "Too many codes from this network. Try again in an hour." }, 429);
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
    const body = await c.req
      .json<{ email?: unknown; code?: unknown }>()
      .catch(() => ({}) as Record<string, unknown>);
    const email = typeof body.email === "string" ? body.email : undefined;
    const code = typeof body.code === "string" ? body.code : undefined;
    if (!email || !code) return c.json({ error: "Send the email and the code." }, 400);
    if (!verifyPerIp.take(ipOf(c)))
      return c.json({ error: "Too many tries from this network. Try again in an hour." }, 429);
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

  authed.post(
    "/envelopes",
    bodyLimit({
      maxSize: MAX_PDF + 1024 * 1024,
      onError: (c) => c.json({ error: "The PDF is over 15 MB." }, 413),
    }),
    async (c) => {
      const form = await c.req.formData().catch(() => null);
      const got = form?.get("pdf");
      // a file part, whichever Blob class the runtime uses (checking instanceof breaks across realms)
      const pdf =
        got && typeof got === "object" && typeof (got as Blob).arrayBuffer === "function"
          ? (got as Blob)
          : null;
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
        !pdf ||
        !meta.title?.trim() ||
        !signers.length ||
        signers.some((s) => !s.name?.trim() || !s.email || !EMAIL.test(s.email))
      )
        return c.json({ error: "Send a PDF, a title and at least one signer with an email." }, 400);
      if (signers.length > MAX_SIGNERS)
        return c.json({ error: `At most ${MAX_SIGNERS} signers per document.` }, 400);
      if (pdf.size > MAX_PDF) return c.json({ error: "The PDF is over 15 MB." }, 413);
      if (d.paused?.())
        return c.json({ error: "Sending is paused on the signing service. Try again later." }, 503);
      const over = overLimit(c.get("email"));
      if (over) return c.json({ error: over }, 429);
      if (sendsTotal && !sendsTotal.take("all"))
        return c.json(
          {
            error:
              "The signing service is at today's limit. Try again tomorrow, or run your own relay (see capfolder.com).",
          },
          429,
        );
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
    },
  );

  // Proof that these people signed this founder's envelope, kept by the app after the relay copy is deleted:
  // it's what lets /wire email them later without the relay storing anything.
  const receipt = (email: string, id: string, signers: string[]) =>
    createHmac("sha256", d.secret)
      .update(
        `wire:${email}:${id}:${signers
          .map((x) => x.trim().toLowerCase())
          .sort()
          .join(",")}`,
      )
      .digest("base64url");

  authed.get("/envelopes/:id", async (c) => {
    const e = await mine(c.get("email"), c.req.param("id"));
    if (!e) return c.json({ error: "Not found" }, 404);
    const s = status(e, d.now());
    return c.json(
      s.status === "completed"
        ? {
            ...s,
            receipt: receipt(
              c.get("email"),
              e.id,
              e.recipients.map((r) => r.email),
            ),
          }
        : s,
    );
  });

  // After everyone signed: the signed copy and the founder's wire instructions to the other signers.
  authed.post(
    "/wire",
    bodyLimit({
      maxSize: 2 * MAX_PDF + 1024 * 1024,
      onError: (c) => c.json({ error: "The PDFs are over 15 MB each." }, 413),
    }),
    async (c) => {
      const form = await c.req.formData().catch(() => null);
      const file = (k: string) => {
        const f = form?.get(k);
        return f && typeof f === "object" && typeof (f as Blob).arrayBuffer === "function"
          ? (f as Blob)
          : null;
      };
      let meta: {
        envelope_id?: string;
        receipt?: string;
        title?: string;
        company?: string;
        signers?: { name?: string; email?: string }[];
      } = {};
      try {
        meta = JSON.parse(String(form?.get("meta") ?? "{}"));
      } catch {}
      const signed = file("signed");
      const wire = file("wire");
      const signers = meta.signers ?? [];
      if (
        !signed ||
        !wire ||
        !meta.envelope_id ||
        !meta.receipt ||
        !signers.length ||
        signers.some((s) => !s.email || !EMAIL.test(s.email))
      )
        return c.json(
          { error: "Send the signed PDF, the wire instructions and the envelope's receipt." },
          400,
        );
      if (signed.size > MAX_PDF || wire.size > MAX_PDF)
        return c.json({ error: "The PDFs are over 15 MB each." }, 413);
      const me = c.get("email");
      const want = Buffer.from(
        receipt(
          me,
          meta.envelope_id,
          signers.map((s) => s.email!),
        ),
      );
      const got = Buffer.from(String(meta.receipt));
      if (got.length !== want.length || !timingSafeEqual(got, want))
        return c.json({ error: "Those people didn't sign that document with you." }, 403);
      // same gates as /envelopes: the kill switch, the account's monthly limit and the relay-wide daily limit
      if (d.paused?.())
        return c.json({ error: "Sending is paused on the signing service. Try again later." }, 503);
      const over = overLimit(me);
      if (over) return c.json({ error: over }, 429);
      if (sendsTotal && !sendsTotal.take("all"))
        return c.json({ error: "The signing service is at today's limit. Try again tomorrow." }, 429);
      const title = (meta.title ?? "document").trim().slice(0, 120);
      const company = (meta.company ?? "The company").trim().slice(0, 120);
      const attachments = [
        { filename: `${title} (signed).pdf`, content: new Uint8Array(await signed.arrayBuffer()) },
        { filename: "Wire instructions.pdf", content: new Uint8Array(await wire.arrayBuffer()) },
      ];
      for (const s of signers.filter((x) => x.email!.trim().toLowerCase() !== me))
        await d.sendMail(
          s.email!.trim().toLowerCase(),
          `${company}: your signed ${title} and wire instructions`,
          `Hi ${(s.name ?? "").trim() || "there"},\n\nEveryone has signed. Attached are your fully signed copy of "${title}" and ${company}'s wire instructions.\n\nBefore you send money, confirm the bank details by phone with someone you know at ${company}. Never trust bank details that arrive or change by email alone.\n\nReply to this email to reach ${me}.\n\nSent with Capfolder.`,
          { replyTo: me, attachments },
        );
      return c.json({ ok: true });
    },
  );

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
    // Sequential signing: only the first signer who hasn't signed is waiting; later ones get their email in turn.
    const next = [...e.recipients]
      .sort((a, b) => (a.signingOrder ?? 0) - (b.signingOrder ?? 0))
      .find((r) => r.signingStatus === "NOT_SIGNED");
    const waiting = next ? [next.id] : [];
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
