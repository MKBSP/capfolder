// Cloudflare Pages Function: POST /api/submit receives the site's forms (download gate, Pro waitlist, Book a
// call; apps/website/forms.js). Turnstile check, validation against FORMS, insert into D1 `forms`, then a copy
// of the row to the Google Sheet (one tab per form) in waitUntil. Setup and secrets: integrations/forms.md.

const STAGES = [
  "Idea stage, company not founded yet",
  "Founded, no funding yet",
  "Pre-seed or seed (SAFEs, notes)",
  "Priced round, Series A",
  "Series B or later",
];
const hidden = { utm_source: { type: "text" }, ref: { type: "text" } };

// Field order is the Sheet column order. forms.js mirrors this table (forms-ui.test.ts checks they match).
export const FORMS = {
  download: {
    email: { type: "email", required: true },
    stage: { type: "radio", options: STAGES },
    os: { type: "radio", required: true, options: ["macOS", "Windows", "Linux"] },
    updates: { type: "checkbox" },
    ...hidden,
  },
  "pro-waitlist": {
    email: { type: "email", required: true },
    company: { type: "text" },
    stage: { type: "radio", options: STAGES },
    want_pro: { type: "radio", options: ["Yes", "No"] },
    before: { type: "checkboxes", options: ["Pulley", "Carta", "Cake Equity", "Ledgy", "Eqvista", "Excel"] },
    notes: { type: "textarea" },
    ...hidden,
  },
  "book-a-call": {
    name: { type: "text", required: true },
    email: { type: "email", required: true },
    company: { type: "text" },
    stage: { type: "radio", required: true, options: STAGES },
    help: {
      type: "checkboxes",
      options: [
        "Demo Capfolder",
        "My first SAFE or valuation cap",
        "Incorporating",
        "Moving from a spreadsheet, Pulley or Carta",
        "Setting up Capfolder",
        "Something else",
      ],
    },
    notes: { type: "textarea" },
    ...hidden,
  },
};

const MAX_BODY = 16_000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const json = (data, status = 200) => Response.json(data, { status });

// Returns { fields } (clean, only known fields) or { error: fieldName }.
export function validate(schema, input) {
  const fields = {};
  for (const [name, f] of Object.entries(schema)) {
    let v = input[name];
    if (f.type === "checkbox") {
      fields[name] = v === true || v === "true" || v === "on";
      continue;
    }
    if (f.type === "checkboxes") {
      if (v == null || v === "") v = [];
      if (!Array.isArray(v) || !v.every((x) => f.options.includes(x))) return { error: name };
      fields[name] = v;
      continue;
    }
    if (v == null) v = "";
    if (typeof v !== "string") return { error: name };
    v = v.trim();
    if (f.type === "email") v = v.toLowerCase();
    if (!v && f.required) return { error: name };
    if (v.length > (f.max ?? (f.type === "textarea" ? 2000 : 200))) return { error: name };
    if (v && f.type === "email" && !EMAIL.test(v)) return { error: name };
    if (v && f.options && !f.options.includes(v)) return { error: name };
    fields[name] = v;
  }
  return { fields };
}

// Sheet cell text. A leading = + - @ or tab/CR would make Sheets treat the text as a formula: prefix an apostrophe.
const cell = (v) => {
  const s = Array.isArray(v) ? v.join(", ") : v === true ? "yes" : v === false ? "" : String(v ?? "");
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
};

export async function onRequestPost({ request, env, waitUntil }) {
  const raw = await request.text();
  if (raw.length > MAX_BODY) return json({ error: "size" }, 413);
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "json" }, 400);
  }
  const { formId, fields: input, token } = body ?? {};
  if (typeof formId !== "string" || !Object.hasOwn(FORMS, formId) || !input || typeof input !== "object")
    return json({ error: "form" }, 400);
  const schema = FORMS[formId];
  if (input.website) return json({ ok: true }); // honeypot: pretend success

  const ip = request.headers.get("CF-Connecting-IP") ?? "";
  const verify = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token ?? "", remoteip: ip }),
  }).then((r) => r.json());
  if (!verify.success) return json({ error: "turnstile" }, 403);

  const v = validate(schema, input);
  if (v.error) return json({ error: v.error }, 422);
  const { fields } = v;

  await env.DB.prepare(
    "INSERT INTO submissions (form_id, data, email, ip_hash, user_agent) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(
      formId,
      JSON.stringify(fields),
      fields.email || null,
      await sha256(ip + env.IP_SALT),
      request.headers.get("User-Agent"),
    )
    .run();

  if (env.SHEETS_WEBHOOK_URL) waitUntil(copyToSheet(env, formId, schema, fields));
  if (formId === "download" && env.RESEND_API_KEY) waitUntil(sendDownloadEmail(env, fields.email, fields.os));
  return json({ ok: true });
}

// The row is already in D1, so a failure here must not reach the visitor. Apps Script answers 200 even for a wrong
// secret or a login page, so only the body "ok" counts. Failures show in the Pages real-time logs.
async function copyToSheet(env, formId, schema, fields) {
  try {
    const columns = Object.keys(schema);
    const res = await fetch(env.SHEETS_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: env.SHEETS_SECRET,
        form: formId,
        created_at: new Date().toISOString(),
        columns,
        values: columns.map((c) => cell(fields[c])),
      }),
    });
    const text = await res.text();
    if (text !== "ok") console.error("sheet copy failed:", res.status, text.slice(0, 200));
  } catch (err) {
    console.error("sheet copy failed:", err);
  }
}

const RELEASES = "https://github.com/MKBSP/capfolder/releases/latest";
const HELP = "https://capfolder.com/help/install-beta/";
const INSTALL_STEPS = {
  macOS: [
    "Open the downloaded file and drag Capfolder into Applications.",
    "Open Capfolder. macOS warns you and doesn't open it yet.",
    "Go to System Settings, then Privacy & Security, scroll down and click Open Anyway.",
  ],
  Windows: [
    "Open the downloaded setup file.",
    "If Windows says it protected your PC, click More info, then Run anyway.",
    "Click through the installer.",
  ],
  Linux: [
    "Download the AppImage.",
    "Right-click it, open Properties and allow it to run as a program.",
    "Open it.",
  ],
};

// Everything here is fixed text: the only visitor input used is `os`, already checked against the form's options,
// so nobody can make this email carry their own words to someone else's address.
export function downloadEmail(os) {
  const steps = INSTALL_STEPS[os];
  const beta =
    "Capfolder is in beta. We don't have Apple or Microsoft certificates yet, so your computer warns you the first time you open it. That warning is expected.";
  const text = [
    "Thanks for trying Capfolder.",
    `Download it here: ${RELEASES}`,
    beta,
    `To install on ${os}:`,
    ...steps.map((step, i) => `${i + 1}. ${step}`),
    `Step-by-step help: ${HELP}`,
    "Stuck, or found a bug? Reply to this email. Please don't attach a real cap table.",
  ].join("\n\n");
  const p = (html) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#3A3E46">${html}</p>`;
  const html = `<div style="max-width:560px;margin:0 auto;padding:24px;font-family:'IBM Plex Sans',Helvetica,Arial,sans-serif;color:#111311">
<h1 style="margin:0 0 16px;font-size:26px;line-height:1.2;letter-spacing:-.02em">Thanks for trying Capfolder.</h1>
<p style="margin:0 0 24px"><a href="${RELEASES}" style="display:inline-block;background:#1F6F4A;color:#fff;font-weight:600;padding:13px 20px;border-radius:10px;text-decoration:none">Download Capfolder</a></p>
<div style="background:#FFF8EC;border:1px solid #F0DDB8;border-radius:12px;padding:16px 18px;margin:0 0 24px;font-size:15px;line-height:1.55;color:#3A3E46">${beta}</div>
${p(`<b style="color:#111311">To install on ${os}:</b>`)}
<ol style="margin:0 0 20px;padding-left:22px;font-size:16px;line-height:1.6;color:#3A3E46">${steps.map((step) => `<li style="margin:0 0 6px">${step.replace("&", "&amp;")}</li>`).join("")}</ol>
${p(`<a href="${HELP}" style="color:#1F6F4A">Step-by-step install help</a>`)}
${p("Stuck, or found a bug? Reply to this email. Please don't attach a real cap table.")}
</div>`;
  return { subject: "Your Capfolder download and install steps", text, html };
}

async function sendDownloadEmail(env, to, os) {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "User-Agent": "capfolder-website",
      },
      body: JSON.stringify({ from: "Capfolder <hello@capfolder.com>", to: [to], ...downloadEmail(os) }),
    });
    if (!res.ok) console.error("download email failed:", res.status, (await res.text()).slice(0, 200));
  } catch (err) {
    console.error("download email failed:", err);
  }
}

async function sha256(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
