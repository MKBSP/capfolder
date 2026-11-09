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
const halfEmail = { ...email, half: true };
const hidden = { utm_source: { type: "text", label: "utm_source" }, ref: { type: "text", label: "ref" } };

export const FORMS = {
  download: {
    title: "Download Capfolder",
    script: "free and open source",
    intro:
      "We'll email you the download links and install steps. Tick the box below if you'd also like an email when there's a new version.",
    button: "Download",
    thanks: [
      "Thanks, check your inbox",
      "We've emailed you the links and install steps. You can also download now.",
    ],
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
    script: "25% off the first year",
    intro:
      "Pro adds sync across computers, encrypted online backup, no signing limit and AI included. Leave your email and we'll tell you when it's ready. Everyone on this list gets <b>25% off the first year</b>.",
    button: "Tell me when it's ready",
    thanks: [
      "You're on the list",
      "We'll email you when Pro is ready, with your 25% off the first year. Until then, Capfolder stays free.",
    ],
    fields: {
      email: halfEmail,
      company: { type: "text", label: "Company (optional)", placeholder: "Acme Inc.", half: true },
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
    script: "tell me where you are",
    intro:
      "I just want to help. I've been through Y Combinator and worked with other accelerator programs, and I'm happy to share what I learned.<br><br>Want to learn about Capfolder, fundraising or something else? Tell me a bit about where you are, and I'll email you a time for a short call.",
    button: "Book a call",
    thanks: [
      "Thanks, we'll be in touch.",
      "We'll email you a time for the call, usually within a day. Capfolder isn't legal advice, so for anything binding, check with a lawyer.",
    ],
    fields: {
      name: { type: "text", label: "Your name", required: true, half: true },
      email: halfEmail,
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
@font-face{font-family:'Instrument Serif';font-style:italic;font-weight:400;font-display:swap;src:url(/fonts/instrument-serif-latin-400-italic.woff2) format('woff2')}
.cfdlg{font-family:'IBM Plex Sans',system-ui,sans-serif;color:#0E120F;background:#FAFAF8;border:1px solid #E6E7E3;border-radius:24px;padding:0;width:min(720px,calc(100vw - 32px));max-width:none;max-height:calc(100dvh - 32px);overflow:hidden;box-shadow:0 30px 60px -30px rgba(14,18,15,.35)}
.cfdlg[open]{animation:cf-in 180ms cubic-bezier(.23,1,.32,1)}
@keyframes cf-in{from{opacity:0;transform:translateY(10px)}}
@media (prefers-reduced-motion:reduce){.cfdlg[open]{animation:none}}
.cfdlg::backdrop{background:rgba(14,18,15,.32);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px)}
.cf-body{max-height:calc(100dvh - 32px);overflow-y:auto;overscroll-behavior:contain}
.cf-x{position:absolute;z-index:1;top:14px;right:14px;width:40px;height:40px;border:1px solid #E6E7E3;border-radius:999px;background:rgba(255,255,255,.8);color:#5B606B;font:inherit;font-size:22px;line-height:1;cursor:pointer}
.cf-x:hover{background:#fff;color:#0E120F}
.cf-head{padding:34px 64px 26px 36px;background:radial-gradient(120% 140% at 50% 0%,#D7E9DD 0%,#EAF2EC 55%,#F4F5F1 100%);border-bottom:1px solid #E6E7E3}
.cfdlg h2{font-size:clamp(28px,4.4vw,36px);font-weight:600;letter-spacing:-.03em;line-height:1.08;margin:0;text-wrap:balance}
.cf-script{font-family:'Instrument Serif',Georgia,serif;font-style:italic;font-size:clamp(23px,3.4vw,27px);line-height:1.2;color:#1F6F4A;margin:4px 0 0}
.cf-intro{font-size:16px;line-height:1.6;color:#3A3E46;margin:14px 0 0}
.cf-form{padding:26px 36px 28px}
.cf-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px 18px}
.cf-wide{grid-column:1/-1}
.cfdlg label.cf-l,.cfdlg legend{display:block;font-size:15px;font-weight:600;margin:0 0 8px;padding:0}
.cfdlg input[type=text],.cfdlg input[type=email],.cfdlg textarea{display:block;width:100%;box-sizing:border-box;font:inherit;font-size:15px;padding:13px 14px;border:1px solid #D9DAD6;border-radius:10px;background:#fff;color:#0E120F}
.cfdlg ::placeholder{color:#8A8F98}
.cfdlg textarea{min-height:92px;resize:vertical}
.cfdlg input[type=text]:focus-visible,.cfdlg input[type=email]:focus-visible,.cfdlg textarea:focus-visible,.cfdlg button:focus-visible,.cfdlg a:focus-visible{outline:2px solid #1F6F4A;outline-offset:2px}
.cfdlg fieldset{border:0;padding:0;margin:0;min-width:0}
.cf-pills{display:flex;flex-wrap:wrap;gap:8px}
.cf-pill{position:relative;cursor:pointer}
.cf-pill input{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer}
.cf-pill span{display:block;padding:9px 15px;border:1px solid #D9DAD6;border-radius:18px;background:#fff;font-size:15px;line-height:1.35;color:#2B2E33;transition:background-color 120ms ease,border-color 120ms ease}
.cf-pill:hover span{border-color:#A9C9B5}
.cf-pill input:checked+span{background:#EEF5F0;border-color:#1F6F4A;color:#16543A;font-weight:500}
.cf-pill input:focus-visible+span{outline:2px solid #1F6F4A;outline-offset:2px}
.cf-check{display:flex;align-items:center;gap:10px;font-size:15px;cursor:pointer}
.cf-check input{width:18px;height:18px;margin:0;accent-color:#1F6F4A}
.cf-err{font-size:15px;line-height:1.5;color:#9B2C2C;margin:18px 0 0}
.cf-err a{color:inherit}
.cf-ts:not(:empty){margin-top:18px}
.cf-foot{display:flex;flex-wrap:wrap;align-items:center;gap:12px 18px;margin-top:24px}
.cfdlg .cf-go{display:inline-flex;justify-content:center;font:inherit;font-size:16px;font-weight:600;padding:15px 24px;border-radius:10px;border:1px solid transparent;cursor:pointer;background:#1F6F4A;color:#fff;transition:transform 160ms cubic-bezier(.23,1,.32,1),background-color 200ms ease}
.cfdlg .cf-go:hover{background:#16543A}
.cfdlg .cf-go:active{transform:scale(.97)}
.cfdlg .cf-go:disabled{opacity:.6;cursor:default}
.cf-skip{font:inherit;font-size:15px;padding:6px 0;border:0;background:none;color:#5B606B;text-decoration:underline;text-underline-offset:3px;cursor:pointer}
.cf-skip:hover{color:#0E120F}
.cf-fine{font-size:13px;color:#5B606B;margin:16px 0 0;line-height:1.5}
.cf-fine a{color:inherit}
.cf-done-head{display:flex;align-items:flex-start;gap:16px}
.cf-tick{flex:none;width:46px;height:46px;border-radius:999px;background:#1F6F4A;display:grid;place-items:center}
.cf-tick svg{width:24px;height:24px;fill:none;stroke:#fff;stroke-width:2.5;stroke-linecap:round;stroke-linejoin:round}
.cf-panel{padding:24px 36px 30px}
@media (max-width:640px){
.cfdlg{width:100%;max-height:92dvh;margin:auto 0 0;border-width:1px 0 0;border-radius:24px 24px 0 0}
.cf-body{max-height:92dvh;padding-bottom:env(safe-area-inset-bottom)}
.cf-head{padding:28px 60px 22px 20px}
.cf-form,.cf-panel{padding-left:20px;padding-right:20px}
.cf-grid{grid-template-columns:1fr}
.cfdlg input[type=text],.cfdlg input[type=email],.cfdlg textarea{font-size:16px}
.cf-foot{flex-direction:column;align-items:stretch}
.cf-skip{text-align:center}
}
`;

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const maxLen = (f) => (f.type === "textarea" ? 2000 : 200); // same caps as /api/submit
const TICK =
  '<div class="cf-tick"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg></div>';

function fieldHtml(name, f, focus) {
  if (name === "utm_source" || name === "ref") return "";
  const req = f.required ? " required" : "";
  if (f.type === "radio" || f.type === "checkboxes") {
    const type = f.type === "radio" ? "radio" : "checkbox";
    return `<fieldset class="cf-wide"><legend>${esc(f.label)}</legend><div class="cf-pills">${f.options
      .map(
        (o) =>
          `<label class="cf-pill"><input type="${type}" name="${name}" value="${esc(o)}"${type === "radio" ? req : ""}><span>${esc(o)}</span></label>`,
      )
      .join("")}</div></fieldset>`;
  }
  if (f.type === "checkbox")
    return `<label class="cf-check cf-wide"><input type="checkbox" name="${name}">${esc(f.label)}</label>`;
  const ph = f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : "";
  const id = `cf-${name}`;
  const attrs = `id="${id}" name="${name}" maxlength="${maxLen(f)}"${ph}${req}${focus ? " autofocus" : ""}`;
  const control =
    f.type === "textarea"
      ? `<textarea ${attrs}></textarea>`
      : `<input type="${f.type === "email" ? "email" : "text"}" ${attrs}${f.type === "email" ? ' autocomplete="email"' : ""}>`;
  return `<div class="${f.half ? "" : "cf-wide"}"><label class="cf-l" for="${id}">${esc(f.label)}</label>${control}</div>`;
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
  // Only with a mouse: on a phone, focusing the first field would throw the keyboard over the form.
  const focusFirst = globalThis.matchMedia?.("(pointer:fine)").matches;
  const dlg = document.createElement("dialog");
  dlg.className = "cfdlg";
  dlg.setAttribute("aria-labelledby", "cf-title");
  dlg.innerHTML = `<button type="button" class="cf-x" aria-label="Close">×</button>
  <div class="cf-body">
    <div class="cf-head">
      <h2 id="cf-title">${esc(def.title)}</h2>
      <p class="cf-script">${esc(def.script)}</p>
      <p class="cf-intro">${def.intro}</p>
    </div>
    <form class="cf-form">
      <div class="cf-grid">${Object.entries(def.fields)
        .map(([n, f], i) => fieldHtml(n, f, focusFirst && i === 0))
        .join("")}</div>
      <input name="website" tabindex="-1" autocomplete="off" hidden aria-hidden="true">
      <div class="cf-ts"></div>
      <p class="cf-err" role="alert" hidden></p>
      <div class="cf-foot">
        <button type="submit" class="cf-go">${esc(def.button)}</button>
        ${opts.skip ? `<button type="button" class="cf-skip" data-umami-event="skip-download">${esc(opts.skip)}</button>` : ""}
      </div>
      <p class="cf-fine">Stored on Cloudflare and in a Google Sheet we read; your IP is hashed, not stored. Email <a href="mailto:privacy@capfolder.com">privacy@capfolder.com</a> to be removed.</p>
    </form>
  </div>`;
  document.body.appendChild(dlg);
  const body = dlg.querySelector(".cf-body");
  const form = dlg.querySelector("form");
  const err = dlg.querySelector(".cf-err");
  const btn = dlg.querySelector('button[type="submit"]');
  const showError = () => {
    err.innerHTML = ERROR_HTML;
    err.hidden = false;
    btn.disabled = false;
    btn.textContent = def.button;
  };
  // The closing state: the thank-you (none when the form was skipped), then the page's own panel if there is one.
  const showDone = (thanks) => {
    body.innerHTML = thanks
      ? `<div class="cf-head"><div class="cf-done-head">${TICK}<div><h2 id="cf-title">${esc(thanks[0])}</h2><p class="cf-intro" style="margin-top:8px">${esc(thanks[1])}</p></div></div></div>`
      : "";
    const panel = opts.panel?.();
    if (panel) {
      const wrap = document.createElement("div");
      wrap.className = "cf-panel";
      wrap.append(panel);
      body.append(wrap);
    }
    body.scrollTop = 0;
    dlg.querySelector(".cf-x").focus();
  };
  dlg.querySelector(".cf-x").addEventListener("click", () => dlg.close());
  dlg.querySelector(".cf-skip")?.addEventListener("click", () => {
    opts.onSkip?.();
    showDone(null);
  });
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
      opts.onSubmit?.();
      showDone(def.thanks);
    } catch {
      showError();
    }
  });
}
