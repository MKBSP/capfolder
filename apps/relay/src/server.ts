// Runs the relay on Node. Config is env only (docs/05): DOCUMENSO_URL, DOCUMENSO_API_TOKEN, RELAY_SECRET, SMTP_*.
import { serve } from "@hono/node-server";
import { createTransport } from "nodemailer";
import { createApp, purge } from "./app.ts";
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
  secret,
  now: () => Date.now(),
  sendMail: async (to, subject, text) => {
    await mail.sendMail({ from, to, subject, text });
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
