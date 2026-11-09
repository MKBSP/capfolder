// /api/submit (functions/api/submit.js): the Pages Function behind the site's forms (integrations/forms.md).
import { afterEach, expect, test, vi } from "vitest";
import { FORMS, onRequestPost } from "../../functions/api/submit.js";

const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const SHEET = "https://script.google.com/macros/s/x/exec";

function harness({ turnstile = true, sheet = async () => new Response("ok") } = {}) {
  const inserts: { sql: string; args: unknown[] }[] = [];
  const sheetCalls: unknown[] = [];
  const pending: Promise<unknown>[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === SITEVERIFY) return Response.json({ success: turnstile });
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
  return { post, inserts, sheetCalls, pending };
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
