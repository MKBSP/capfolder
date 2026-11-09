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

const cell = (v) => (Array.isArray(v) ? v.join(", ") : v === true ? "yes" : v === false ? "" : String(v ?? ""));

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
  const schema = FORMS[formId];
  if (!schema || !input || typeof input !== "object") return json({ error: "form" }, 400);
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

  await env.DB.prepare("INSERT INTO submissions (form_id, data, email, ip_hash, user_agent) VALUES (?, ?, ?, ?, ?)")
    .bind(formId, JSON.stringify(fields), fields.email || null, await sha256(ip + env.IP_SALT), request.headers.get("User-Agent"))
    .run();

  if (env.SHEETS_WEBHOOK_URL) {
    const columns = Object.keys(schema);
    waitUntil(
      fetch(env.SHEETS_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret: env.SHEETS_SECRET,
          form: formId,
          created_at: new Date().toISOString(),
          columns,
          values: columns.map((c) => cell(fields[c])),
        }),
      }).catch(() => {}), // the row is already in D1; the Sheet is a copy
    );
  }
  return json({ ok: true });
}

async function sha256(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
