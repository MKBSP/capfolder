// /api/submit (functions/api/submit.js): the Pages Function behind the site's forms (integrations/forms.md).
import { readFileSync } from "node:fs";
import { afterEach, expect, test, vi } from "vitest";
import { FORMS, onRequestPost } from "../../functions/api/submit.js";

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const SHEET = "https://script.google.com/macros/s/x/exec";

function harness({
  turnstile = true,
  sheet = async () => new Response("ok"),
  resend = async () => new Response("{}"),
} = {}) {
  const resendCalls: { headers: Record<string, string>; body: Record<string, string | string[]> }[] = [];
  const inserts: { sql: string; args: unknown[] }[] = [];
  const sheetCalls: unknown[] = [];
  const pending: Promise<unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === SITEVERIFY) return Response.json({ success: turnstile });
      if (url === "https://api.resend.com/emails") {
        resendCalls.push({
          headers: init?.headers as Record<string, string>,
          body: JSON.parse(init?.body as string),
        });
        return resend();
      }
      if (url === SHEET) {
        sheetCalls.push(JSON.parse(init?.body as string));
        return sheet();
      }
      throw new Error(`unexpected fetch ${url}`);
    }),
  );
  const env = {
    DB: {
      prepare: (sql: string) => ({
        bind: (...args: unknown[]) => ({ run: async () => void inserts.push({ sql, args }) }),
      }),
    },
    TURNSTILE_SECRET: "ts",
    IP_SALT: "salt",
    SHEETS_WEBHOOK_URL: SHEET,
    SHEETS_SECRET: "sheet-secret",
    RESEND_API_KEY: "re_test",
  };
  const post = async (body: unknown) => {
    const request = new Request("https://capfolder.com/api/submit", {
      method: "POST",
      headers: { "CF-Connecting-IP": "203.0.113.9", "User-Agent": "UA/1" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
    const res = await onRequestPost({
      request,
      env,
      waitUntil: (p: Promise<unknown>) => pending.push(p),
    } as never);
    return { status: res.status, body: await res.json() };
  };
  return { post, inserts, sheetCalls, resendCalls, pending, env };
}

afterEach(() => vi.unstubAllGlobals());

const download = { email: "Founder@Example.com", os: "macOS", updates: true };
const call = {
  name: "Ada",
  email: "ada@example.com",
  stage: "Founded, no funding yet",
  help: ["Demo Capfolder", "Incorporating"],
  notes: "two cofounders",
  utm_source: "hn",
  ref: "",
};

test("unknown form id → 400", async () => {
  const h = harness();
  expect(await h.post({ formId: "nope", fields: download, token: "t" })).toEqual({
    status: 400,
    body: { error: "form" },
  });
});

test("honeypot filled → 200 ok, no insert, no sheet call", async () => {
  const h = harness();
  expect(await h.post({ formId: "download", fields: { ...download, website: "spam" }, token: "t" })).toEqual({
    status: 200,
    body: { ok: true },
  });
  expect(h.inserts).toEqual([]);
  expect(h.sheetCalls).toEqual([]);
});

test("turnstile failure → 403, no insert", async () => {
  const h = harness({ turnstile: false });
  expect((await h.post({ formId: "download", fields: download, token: "bad" })).status).toBe(403);
  expect(h.inserts).toEqual([]);
});

test("download without os → 422 {error:'os'}", async () => {
  const h = harness();
  expect(await h.post({ formId: "download", fields: { email: "a@b.co" }, token: "t" })).toEqual({
    status: 422,
    body: { error: "os" },
  });
});

test("stage outside the fixed options → 422 {error:'stage'}", async () => {
  const h = harness();
  expect(await h.post({ formId: "book-a-call", fields: { ...call, stage: "Series Z" }, token: "t" })).toEqual(
    { status: 422, body: { error: "stage" } },
  );
});

test("book-a-call notes of 2000 chars accepted, 2001 rejected", async () => {
  const h = harness();
  expect(
    (await h.post({ formId: "book-a-call", fields: { ...call, notes: "x".repeat(2000) }, token: "t" }))
      .status,
  ).toBe(200);
  expect(
    await h.post({ formId: "book-a-call", fields: { ...call, notes: "x".repeat(2001) }, token: "t" }),
  ).toEqual({ status: 422, body: { error: "notes" } });
});

test("valid download → one INSERT with normalised email, hashed ip, user agent", async () => {
  const h = harness();
  expect(await h.post({ formId: "download", fields: download, token: "t" })).toEqual({
    status: 200,
    body: { ok: true },
  });
  expect(h.inserts).toHaveLength(1);
  const [formId, data, email, ipHash, ua] = h.inserts[0].args as string[];
  expect(h.inserts[0].sql).toMatch(/INSERT INTO submissions/);
  expect(formId).toBe("download");
  expect(JSON.parse(data)).toMatchObject({ email: "founder@example.com", os: "macOS", updates: true });
  expect(email).toBe("founder@example.com");
  expect(ipHash).toMatch(/^[0-9a-f]{64}$/);
  expect(ipHash).not.toContain("203.0.113.9");
  expect(ua).toBe("UA/1");
});

test("valid book-a-call → sheet POST carries secret, form, columns and joined values", async () => {
  const h = harness();
  await h.post({ formId: "book-a-call", fields: call, token: "t" });
  await Promise.all(h.pending);
  expect(h.sheetCalls).toHaveLength(1);
  const body = h.sheetCalls[0] as Record<string, unknown>;
  expect(body.secret).toBe("sheet-secret");
  expect(body.form).toBe("book-a-call");
  expect(body.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  expect(body.columns).toEqual(Object.keys(FORMS["book-a-call"]));
  expect((body.values as string[]).length).toBe((body.columns as string[]).length);
  const row = Object.fromEntries((body.columns as string[]).map((c, i) => [c, (body.values as string[])[i]]));
  expect(row).toMatchObject({
    name: "Ada",
    help: "Demo Capfolder, Incorporating",
    company: "",
    utm_source: "hn",
  });
});

test("sheet webhook rejecting → still 200 ok", async () => {
  const h = harness({
    sheet: async () => {
      throw new Error("sheet down");
    },
  });
  expect(await h.post({ formId: "book-a-call", fields: call, token: "t" })).toEqual({
    status: 200,
    body: { ok: true },
  });
  expect(h.inserts).toHaveLength(1);
  await expect(Promise.allSettled(h.pending)).resolves.toBeDefined();
});

test("body over 16000 bytes → 413", async () => {
  const h = harness();
  expect((await h.post("x".repeat(16001))).status).toBe(413);
});

test("FORMS lists the three forms with the required fields", () => {
  expect(Object.keys(FORMS)).toEqual(["download", "pro-waitlist", "book-a-call"]);
  expect(FORMS.download.os).toMatchObject({
    type: "radio",
    required: true,
    options: ["macOS", "Windows", "Linux"],
  });
  expect(FORMS["book-a-call"].name.required).toBe(true);
  for (const f of Object.values(FORMS)) expect(Object.keys(f).slice(-2)).toEqual(["utm_source", "ref"]);
});

test("values that would start a spreadsheet formula are neutralised before reaching the Sheet", async () => {
  const h = harness();
  await h.post({
    formId: "book-a-call",
    fields: { ...call, name: '=HYPERLINK("x")', notes: "+1 -2 @x" },
    token: "t",
  });
  await Promise.all(h.pending);
  const body = h.sheetCalls[0] as { columns: string[]; values: string[] };
  const row = Object.fromEntries(body.columns.map((c, i) => [c, body.values[i]]));
  expect(row.name).toBe('\'=HYPERLINK("x")');
  expect(row.notes).toBe("'+1 -2 @x");
  expect(row.company).toBe("");
});

test("prototype keys are not form ids → 400", async () => {
  const h = harness();
  for (const id of ["constructor", "__proto__", "toString"])
    expect((await h.post({ formId: id, fields: download, token: "t" })).status).toBe(400);
  expect((await h.post({ formId: 7, fields: download, token: "t" })).status).toBe(400);
});

// The Apps Script lives in integrations/forms.md (Mads pastes it into the Sheet), so the test runs that exact text.
function appsScript(mail: (to: string, subject: string, body: string) => void = () => {}) {
  const md = readFileSync(new URL("../../integrations/forms.md", import.meta.url), "utf8");
  const code = md.match(/```js\n([\s\S]*?function doPost[\s\S]*?)```/)?.[1] ?? "";
  const rows: unknown[][] = [];
  const sheet = { getLastRow: () => rows.length, appendRow: (r: unknown[]) => void rows.push(r) };
  const SpreadsheetApp = {
    getActiveSpreadsheet: () => ({
      getSheetByName: () => sheet,
      insertSheet: () => sheet,
      getUrl: () => "https://sheet",
    }),
  };
  const ContentService = { createTextOutput: (s: string) => s };
  const MailApp = { sendEmail: mail };
  const doPost = new Function("SpreadsheetApp", "ContentService", "MailApp", `${code}; return doPost;`)(
    SpreadsheetApp,
    ContentService,
    MailApp,
  );
  const send = (b: unknown) => doPost({ postData: { contents: JSON.stringify(b) } });
  return { send, rows };
}
const row = {
  secret: "<paste SHEETS_SECRET>",
  form: "book-a-call",
  created_at: "t",
  columns: ["name", "email"],
  values: ["Ada", "a@b.co"],
};

test("Apps Script: appends the row and emails every field", () => {
  const mails: string[][] = [];
  const s = appsScript((to, subject, body) => void mails.push([to, subject, body]));
  expect(s.send(row)).toBe("ok");
  expect(s.rows).toEqual([
    ["created_at", "name", "email"],
    ["t", "Ada", "a@b.co"],
  ]);
  expect(mails).toHaveLength(1);
  expect(mails[0][1]).toContain("book-a-call");
  expect(mails[0][2]).toContain("name: Ada");
  expect(mails[0][2]).toContain("email: a@b.co");
});

test("Apps Script: a mail failure (quota) still keeps the row", () => {
  const s = appsScript(() => {
    throw new Error("quota");
  });
  expect(s.send(row)).toBe("ok");
  expect(s.rows).toHaveLength(2);
});

test("Apps Script: wrong secret or unknown tab writes and mails nothing", () => {
  const mails: string[] = [];
  const s = appsScript((to) => void mails.push(to));
  expect(s.send({ ...row, secret: "x" })).toBe("no");
  expect(s.send({ ...row, form: "other" })).toBe("no");
  expect(s.rows).toEqual([]);
  expect(mails).toEqual([]);
});

test("sheet answering anything but ok is logged, and the visitor still gets ok", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const h = harness({ sheet: async () => new Response("no") });
  expect((await h.post({ formId: "book-a-call", fields: call, token: "t" })).status).toBe(200);
  await Promise.all(h.pending);
  expect(log.mock.calls[0]?.[0]).toBe("sheet copy failed:");
  log.mockRestore();
});

test("sheet unreachable is logged too", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const h = harness({
    sheet: async () => {
      throw new Error("sheet down");
    },
  });
  await h.post({ formId: "book-a-call", fields: call, token: "t" });
  await Promise.all(h.pending);
  expect(log.mock.calls[0]?.[0]).toBe("sheet copy failed:");
  log.mockRestore();
});

test("download form emails the visitor once, from hello@capfolder.com, with the steps for their computer", async () => {
  const h = harness();
  await h.post({ formId: "download", fields: { email: "Founder@Example.com", os: "Windows" }, token: "t" });
  await Promise.all(h.pending);
  expect(h.resendCalls).toHaveLength(1);
  const { headers, body } = h.resendCalls[0];
  expect(headers.Authorization).toBe("Bearer re_test");
  expect(headers["User-Agent"]).toBeTruthy();
  expect(body.from).toBe("Capfolder <hello@capfolder.com>");
  expect(body.to).toEqual(["founder@example.com"]);
  for (const part of [body.html, body.text]) {
    expect(part).toContain("Run anyway");
    expect(part).not.toContain("Open Anyway");
    expect(part).toContain("https://capfolder.com/help/install-beta/");
    expect(part).toContain("https://github.com/MKBSP/capfolder/releases/latest");
    expect(part).toContain("beta");
  }
});

test("Pro waitlist and Book a call send no email to the visitor", async () => {
  const h = harness();
  await h.post({ formId: "book-a-call", fields: call, token: "t" });
  await h.post({ formId: "pro-waitlist", fields: { email: "a@b.co" }, token: "t" });
  await Promise.all(h.pending);
  expect(h.resendCalls).toEqual([]);
});

test("honeypot and bad submissions send no email", async () => {
  const h = harness();
  await h.post({ formId: "download", fields: { ...download, website: "x" }, token: "t" });
  await h.post({ formId: "download", fields: { email: "a@b.co" }, token: "t" });
  await Promise.all(h.pending);
  expect(h.resendCalls).toEqual([]);
});

test("no Resend key: the download still succeeds and nothing is sent", async () => {
  const h = harness();
  delete (h.env as { RESEND_API_KEY?: string }).RESEND_API_KEY;
  expect((await h.post({ formId: "download", fields: download, token: "t" })).status).toBe(200);
  await Promise.all(h.pending);
  expect(h.resendCalls).toEqual([]);
});

test("a Resend failure is logged and the visitor still gets ok", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  const h = harness({ resend: async () => new Response("quota", { status: 429 }) });
  expect((await h.post({ formId: "download", fields: download, token: "t" })).status).toBe(200);
  await Promise.all(h.pending);
  expect(log.mock.calls[0]?.[0]).toBe("download email failed:");
  log.mockRestore();
});
