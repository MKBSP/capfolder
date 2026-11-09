// The site's own forms (download gate, Pro waitlist, Book a call) in a <dialog>. Loaded with import() the first
// time a visitor opens one, posts to /api/submit (functions/api/submit.js). Setup: integrations/forms.md.
// FORMS mirrors the function's field table (forms-ui.test.ts checks ids, field order, options and required).

// Turnstile site key (public). Test key until Mads creates the widget (integrations/forms.md, step 3).
const SITE_KEY = "0x4AAAAAAF6DYQTOAAyQXwAM";
const TURNSTILE_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

const STAGES = [
  "Idea stage, company not founded yet",
  "Founded, no funding yet",
  "Pre-seed or seed (SAFEs, notes)",
  "Priced round, Series A",
  "Series B or later",
];
const stage = (required) => ({
  type: "radio",
  label: "What stage is your company at?",
  options: STAGES,
  ...(required ? { required: true } : {}),
});
const email = { type: "email", label: "Email", placeholder: "you@company.com", required: true };
const hidden = { utm_source: { type: "text", label: "utm_source" }, ref: { type: "text", label: "ref" } };

export const FORMS = {
  download: {
    title: "Download Capfolder",
    intro: "Free and open source. Tick the box below if you'd like an email when there's a new version.",
    button: "Download",
    thanks: ["Your download is ready", "The links are on the page behind this window."],
    fields: {
      email,
      stage: stage(false),
      os: { type: "radio", label: "Which computer?", required: true, options: ["macOS", "Windows", "Linux"] },
      updates: { type: "checkbox", label: "Email me when there's a new version" },
      ...hidden,
    },
  },
  "pro-waitlist": {
    title: "Capfolder Pro: tell me when it's ready",
    intro:
      "Pro adds sync across computers, encrypted online backup, no signing limit and AI included. Leave your email and we'll tell you when it's ready. Everyone on this list gets <b>25% off the first year</b>.",
    button: "Tell me when it's ready",
    thanks: [
      "You're on the list",
      "We'll email you when Pro is ready, with your 25% off the first year. Until then, Capfolder stays free.",
    ],
    fields: {
      email,
      company: { type: "text", label: "Company (optional)", placeholder: "Acme Inc." },
      stage: stage(false),
      want_pro: { type: "radio", label: "Yes, I want the Pro Paid version", options: ["Yes", "No"] },
      before: {
        type: "checkboxes",
        label: "What software, if any, were you using before?",
        options: ["Pulley", "Carta", "Cake Equity", "Ledgy", "Eqvista", "Excel"],
      },
      notes: {
        type: "textarea",
        label: "What would make Pro worth it for you? (optional)",
        placeholder: "Sync with my co-founder, backups, AI that drafts grants…",
      },
      ...hidden,
    },
  },
  "book-a-call": {
    title: "Book a call",
    intro:
      "I just want to help. I've been through Y Combinator and worked with other accelerator programs, and I'm happy to share what I learned.<br><br>Want to learn about Capfolder, fundraising or something else? Tell me a bit about where you are, and I'll email you a time for a short call.",
    button: "Book a call",
    thanks: [
      "Thanks, we'll be in touch.",
      "We'll email you a time for the call, usually within a day. Capfolder isn't legal advice, so for anything binding, check with a lawyer.",
    ],
    fields: {
      name: { type: "text", label: "Your name", required: true },
      email,
      company: { type: "text", label: "Company (if it has a name yet)" },
      stage: stage(true),
      help: {
        type: "checkboxes",
        label: "What do you want help with?",
        options: [
          "Demo Capfolder",
          "My first SAFE or valuation cap",
          "Incorporating",
          "Moving from a spreadsheet, Pulley or Carta",
          "Setting up Capfolder",
          "Something else",
        ],
      },
      notes: {
        type: "textarea",
        label: "What should we cover on the call?",
        placeholder: "e.g. two cofounders, not incorporated, an angel wants to invest $50k",
      },
      ...hidden,
    },
  },
};

export const ERROR_HTML =
  'Something went wrong. Email <a href="mailto:privacy@capfolder.com">privacy@capfolder.com</a> and we\'ll sort it.';

// FormData → the `fields` object /api/submit expects. Hidden utm_source/ref come from the page URL.
export function toFields(fd, schema, search) {
  const params = new URLSearchParams(search);
  const out = {};
  for (const [name, f] of Object.entries(schema)) {
    if (name === "utm_source" || name === "ref") out[name] = params.get(name) || "";
    else if (f.type === "checkboxes") out[name] = fd.getAll(name).map(String);
    else if (f.type === "checkbox") out[name] = fd.has(name);
    else out[name] = String(fd.get(name) ?? "");
  }
  if (fd.has("website")) out.website = String(fd.get("website"));
  return out;
}

// The bot check starts when the form opens and can take a few seconds; a fast (autofilled) submit waits for it.
export async function waitForToken(read, timeoutMs = 15000, stepMs = 100) {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const token = read();
    if (token || Date.now() >= end) return token || "";
    await new Promise((r) => setTimeout(r, stepMs));
  }
}

const CSS = `
.cfdlg{font-family:'IBM Plex Sans',system-ui,sans-serif;color:#111311;background:#fff;border:1px solid #E4E4E0;border-radius:16px;padding:0;width:min(520px,calc(100vw - 32px));max-height:calc(100vh - 32px);box-shadow:0 30px 60px -30px rgba(14,18,15,.35)}
.cfdlg::backdrop{background:rgba(14,18,15,.45)}
.cfdlg form,.cfdlg .cf-done{padding:28px 28px 24px;box-sizing:border-box}
.cfdlg h2{font-size:24px;font-weight:600;letter-spacing:-.02em;line-height:1.15;margin:0 36px 10px 0}
.cfdlg .cf-intro,.cfdlg .cf-done p{font-size:15px;line-height:1.6;color:#3A3E46;margin:0 0 18px}
.cfdlg .cf-x{position:absolute;top:14px;right:14px;width:36px;height:36px;border:0;border-radius:10px;background:transparent;color:#5B606B;font:inherit;font-size:22px;line-height:1;cursor:pointer}
.cfdlg .cf-x:hover{background:#F2F3EF;color:#111311}
.cfdlg label,.cfdlg legend{display:block;font-size:14px;font-weight:600;margin:0 0 6px}
.cfdlg .cf-f{margin:0 0 16px}
.cfdlg input[type=text],.cfdlg input[type=email],.cfdlg textarea{width:100%;box-sizing:border-box;font:inherit;font-size:15px;padding:12px 14px;border:1px solid #D9DAD6;border-radius:10px;background:#FAFAF8;color:#111311}
.cfdlg textarea{min-height:88px;resize:vertical}
.cfdlg input:focus-visible,.cfdlg textarea:focus-visible,.cfdlg button:focus-visible{outline:2px solid #1F6F4A;outline-offset:2px}
.cfdlg fieldset{border:0;padding:0;margin:0 0 16px;min-width:0}
.cfdlg .cf-opt{display:flex;align-items:center;gap:10px;font-weight:400;font-size:15px;padding:6px 0;margin:0;cursor:pointer}
.cfdlg .cf-opt input{width:18px;height:18px;margin:0;accent-color:#1F6F4A}
.cfdlg .cf-ts{min-height:0;margin:0 0 12px}
.cfdlg .cf-err{font-size:14px;color:#9B2C2C;margin:0 0 12px}
.cfdlg .cf-err a{color:inherit}
.cfdlg .btn{display:inline-flex;align-items:center;gap:8px;font:inherit;font-size:16px;font-weight:600;padding:14px 22px;border-radius:10px;border:1px solid transparent;cursor:pointer;background:#1F6F4A;color:#fff}
.cfdlg .btn:hover{background:#16543A}
.cfdlg .btn:disabled{opacity:.6;cursor:default}
.cfdlg .cf-fine{font-size:12.5px;color:#5B606B;margin:12px 0 0;line-height:1.5}
@media (max-width:560px){.cfdlg{width:100vw;max-width:100vw;max-height:100vh;margin:auto 0 0;border-radius:16px 16px 0 0}}
`;

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function fieldHtml(name, f) {
  if (name === "utm_source" || name === "ref") return "";
  const req = f.required ? " required" : "";
  if (f.type === "radio" || f.type === "checkboxes") {
    const type = f.type === "radio" ? "radio" : "checkbox";
    return `<fieldset><legend>${esc(f.label)}</legend>${f.options
      .map(
        (o) =>
          `<label class="cf-opt"><input type="${type}" name="${name}" value="${esc(o)}"${type === "radio" ? req : ""}>${esc(o)}</label>`,
      )
      .join("")}</fieldset>`;
  }
  if (f.type === "checkbox")
    return `<div class="cf-f"><label class="cf-opt"><input type="checkbox" name="${name}">${esc(f.label)}</label></div>`;
  const ph = f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : "";
  const id = `cf-${name}`;
  const control =
    f.type === "textarea"
      ? `<textarea id="${id}" name="${name}"${ph}${req}></textarea>`
      : `<input id="${id}" type="${f.type === "email" ? "email" : "text"}" name="${name}"${ph}${req}${f.type === "email" ? ' autocomplete="email"' : ""}>`;
  return `<div class="cf-f"><label for="${id}">${esc(f.label)}</label>${control}</div>`;
}

let turnstileReady;
function loadTurnstile() {
  if (globalThis.turnstile) return Promise.resolve();
  turnstileReady ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = TURNSTILE_SRC;
    s.async = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error("turnstile"));
    document.head.appendChild(s);
    setTimeout(() => reject(new Error("turnstile timeout")), 8000);
  });
  return turnstileReady;
}

export function open(formId, opts = {}) {
  const def = FORMS[formId];
  if (!def) throw new Error(`unknown form ${formId}`);
  if (!document.getElementById("cfdlg-css")) {
    const st = document.createElement("style");
    st.id = "cfdlg-css";
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  document.querySelector(".cfdlg")?.remove();
  const dlg = document.createElement("dialog");
  dlg.className = "cfdlg";
  dlg.innerHTML = `<form method="dialog">
    <button type="button" class="cf-x" aria-label="Close">×</button>
    <h2>${esc(def.title)}</h2>
    <p class="cf-intro">${def.intro}</p>
    ${Object.entries(def.fields)
      .map(([n, f]) => fieldHtml(n, f))
      .join("")}
    <input name="website" tabindex="-1" autocomplete="off" hidden aria-hidden="true">
    <div class="cf-ts"></div>
    <p class="cf-err" hidden></p>
    <button type="submit" class="btn">${esc(def.button)}</button>
    <p class="cf-fine">Stored on Cloudflare and in a Google Sheet we read; your IP is hashed, not stored. Email <a href="mailto:privacy@capfolder.com">privacy@capfolder.com</a> to be removed.</p>
  </form>`;
  document.body.appendChild(dlg);
  const form = dlg.querySelector("form");
  const err = dlg.querySelector(".cf-err");
  const btn = dlg.querySelector('button[type="submit"]');
  const showError = () => {
    err.innerHTML = ERROR_HTML;
    err.hidden = false;
    btn.disabled = false;
    btn.textContent = def.button;
  };
  dlg.querySelector(".cf-x").addEventListener("click", () => dlg.close());
  dlg.addEventListener("click", (e) => {
    if (e.target === dlg) dlg.close();
  });
  dlg.addEventListener("close", () => {
    if (widget !== undefined) globalThis.turnstile.remove(widget);
    dlg.remove();
  });
  dlg.showModal();

  let widget;
  loadTurnstile()
    .then(() => {
      widget = globalThis.turnstile.render(dlg.querySelector(".cf-ts"), {
        sitekey: SITE_KEY,
        appearance: "interaction-only",
      });
    })
    .catch(showError);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    err.hidden = true;
    btn.disabled = true;
    btn.textContent = "Sending…";
    try {
      const token =
        widget !== undefined ? await waitForToken(() => globalThis.turnstile.getResponse(widget)) : "";
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formId,
          fields: toFields(new FormData(form), def.fields, location.search),
          token,
        }),
      });
      if (!res.ok) {
        if (widget !== undefined) globalThis.turnstile.reset(widget); // a token works once; a retry needs a new one
        return showError();
      }
      form.replaceWith(
        Object.assign(document.createElement("div"), {
          className: "cf-done",
          innerHTML: `<button type="button" class="cf-x" aria-label="Close">×</button><h2>${esc(def.thanks[0])}</h2><p>${esc(def.thanks[1])}</p>`,
        }),
      );
      dlg.querySelector(".cf-x").addEventListener("click", () => dlg.close());
      opts.onSubmit?.();
      if (opts.autoClose) setTimeout(() => dlg.close(), opts.autoClose);
    } catch {
      showError();
    }
  });
}
