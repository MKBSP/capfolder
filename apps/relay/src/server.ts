// Runs the relay on Node. Config is env only (docs/05): DOCUMENSO_URL, DOCUMENSO_API_TOKEN, RELAY_SECRET, SMTP_*.

import { existsSync } from "node:fs";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { serve } from "@hono/node-server";
import { getConnInfo } from "@hono/node-server/conninfo";
import { createTransport } from "nodemailer";
import { createApp, filePlans, purge } from "./app.ts";
import { httpDocumenso } from "./documenso.ts";

const env = (k: string, fallback?: string) => {
  const v = process.env[k] ?? fallback;
  if (v === undefined) throw new Error(`Set ${k} (see apps/relay/README.md)`);
  return v;
};
const dev = process.env.NODE_ENV !== "production";
const documenso = httpDocumenso(
  env("DOCUMENSO_URL"),
  env("DOCUMENSO_API_TOKEN"),
  process.env.DOCUMENSO_PUBLIC_URL,
);
const mail = createTransport({
  host: env("SMTP_HOST", dev ? "localhost" : undefined),
  port: Number(env("SMTP_PORT", dev ? "1025" : undefined)),
  secure: process.env.SMTP_SECURE === "true",
  ...(process.env.SMTP_USER ? { auth: { user: env("SMTP_USER"), pass: env("SMTP_PASS") } } : {}),
});
const from = env("SMTP_FROM", dev ? "Capfolder <signing@capfolder.local>" : undefined);
const secret = env("RELAY_SECRET", dev ? "dev-only-secret-change-me" : undefined);
if (!dev && secret.length < 32) throw new Error("RELAY_SECRET must be at least 32 characters");

const app = createApp({
  documenso,
  // Behind a proxy (TRUST_PROXY=true) the client is the first X-Forwarded-For hop; otherwise the socket address,
  // so a client can't pick its own rate-limit bucket by sending the header.
  clientIp:
    process.env.TRUST_PROXY === "true" ? undefined : (c) => getConnInfo(c).remote.address ?? "unknown",
  secret,
  now: () => Date.now(),
  limits: {
    perEmailPerMonth: Number(process.env.RELAY_PER_EMAIL_MONTH ?? 5),
    totalPerDay: process.env.RELAY_TOTAL_DAY ? Number(process.env.RELAY_TOTAL_DAY) : undefined,
  },
  // who's Pro, edited by hand without a restart: {"pro": ["founder@example.com"]}
  plan: filePlans(process.env.RELAY_PLANS_FILE ?? "data/plans.json"),
  // kill switch without a restart: create this file to stop new envelopes, delete it to resume
  paused: () => existsSync(process.env.PAUSE_FILE ?? "data/PAUSED"),
  // ponytail: one JSON line per ping in a file (PING_FILE); move to Postgres if the counts ever need queries
  recordPing: async (row) => {
    const file = process.env.PING_FILE ?? "data/pings.jsonl";
    await mkdir(dirname(file), { recursive: true });
    await appendFile(file, `${JSON.stringify(row)}\n`);
  },
  sendMail: async (to, subject, text, extra) => {
    await mail.sendMail({
      from,
      to,
      subject,
      text,
      replyTo: extra?.replyTo,
      attachments: extra?.attachments?.map((a) => ({
        filename: a.filename,
        content: Buffer.from(a.content),
      })),
    });
  },
});
const port = Number(process.env.PORT ?? 8787);
serve({ fetch: app.fetch, port, hostname: process.env.HOST ?? (dev ? "127.0.0.1" : "0.0.0.0") });
console.log(`capfolder relay on :${port} → ${env("DOCUMENSO_URL")}`);

const hourly = () =>
  purge(documenso, () => Date.now())
    .then((n) => n && console.log(`purged ${n} old envelopes`))
    .catch((e) => console.error("purge failed:", e));
setInterval(hourly, 3600e3);
hourly();
