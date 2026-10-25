import { describe, expect, test } from "vitest";
import { createApp, filePlans, type MailExtra } from "../src/app.ts";
import { makeToken } from "../src/auth.ts";
import { fakeDocumenso } from "../src/fake-documenso.ts";

const SECRET = "test-secret";
let clock = Date.parse("2026-10-10T12:00:00Z");
function setup(extra: Partial<Parameters<typeof createApp>[0]> = {}) {
  const doc = fakeDocumenso();
  const mail: { to: string; subject: string; text: string; extra?: MailExtra }[] = [];
  const app = createApp({
    ...extra,
    documenso: doc.api,
    secret: SECRET,
    now: () => clock,
    sendMail: async (to, subject, text, extra) => {
      mail.push({ to, subject, text, extra });
    },
  });
  return { app, doc, mail };
}
const auth = (email: string) => ({ Authorization: `Bearer ${makeToken(SECRET, email, clock)}` });
const json = (body: unknown, headers: Record<string, string> = {}) => ({
  method: "POST",
  headers: { "content-type": "application/json", ...headers },
  body: JSON.stringify(body),
});

async function send(app: ReturnType<typeof setup>["app"], email = "tim@apple.com") {
  const form = new FormData();
  form.append("pdf", new Blob([new Uint8Array([37, 80, 68, 70])], { type: "application/pdf" }), "safe.pdf");
  form.append(
    "meta",
    JSON.stringify({
      title: "SAFE · Fund Y",
      signers: [
        { name: "Fund Y", email: "fund@y.example" },
        { name: "Tim", email },
      ],
      fields: [
        { signer: 0, page: 2, x: 10, y: 30, w: 35, h: 8 },
        { signer: 1, page: 2, x: 10, y: 55, w: 35, h: 8 },
      ],
    }),
  );
  return app.request("/envelopes", { method: "POST", body: form, headers: auth(email) });
}

test("health", async () => {
  expect(await (await setup().app.request("/health")).json()).toEqual({
    ok: true,
    service: "capfolder-relay",
  });
});

describe("auth (F-04)", () => {
  test("code by email, then a device token", async () => {
    const { app, mail } = setup();
    expect((await app.request("/auth/start", json({ email: "Tim@Apple.com" }))).status).toBe(200);
    const code = /\b(\d{6})\b/.exec(mail[0]!.text)![1]!;
    expect(mail[0]!.to).toBe("tim@apple.com");
    expect((await app.request("/auth/verify", json({ email: "tim@apple.com", code: "000000" }))).status).toBe(
      400,
    );
    const r = await app.request("/auth/verify", json({ email: "tim@apple.com", code }));
    const { token } = (await r.json()) as { token: string };
    expect((await app.request("/me", { headers: { Authorization: `Bearer ${token}` } })).status).toBe(200);
  });
  test("codes expire, lock after 5 tries, and are rate-limited", async () => {
    const { app, mail } = setup();
    await app.request("/auth/start", json({ email: "a@b.co" }));
    for (let i = 0; i < 5; i++) await app.request("/auth/verify", json({ email: "a@b.co", code: "999999" }));
    const code = /\b(\d{6})\b/.exec(mail[0]!.text)![1]!;
    expect(await (await app.request("/auth/verify", json({ email: "a@b.co", code }))).json()).toEqual({
      error: "Too many tries. Ask for a new code.",
    });
    await app.request("/auth/start", json({ email: "a@b.co" }));
    clock += 11 * 60e3;
    const late = /\b(\d{6})\b/.exec(mail[1]!.text)![1]!;
    expect(await (await app.request("/auth/verify", json({ email: "a@b.co", code: late }))).json()).toEqual({
      error: "That code has expired. Ask for a new one.",
    });
    for (let i = 0; i < 3; i++) await app.request("/auth/start", json({ email: "a@b.co" }));
    expect((await app.request("/auth/start", json({ email: "a@b.co" }))).status).toBe(429);
  });
  test("forged or missing tokens are refused", async () => {
    const { app } = setup();
    expect((await app.request("/envelopes/x")).status).toBe(401);
    expect(
      (await app.request("/envelopes/x", { headers: { Authorization: "Bearer abc.def.ghi" } })).status,
    ).toBe(401);
    const forged = makeToken("other-secret", "tim@apple.com", clock);
    expect(
      (await app.request("/envelopes/x", { headers: { Authorization: `Bearer ${forged}` } })).status,
    ).toBe(401);
  });
  test("a bad email is refused", async () => {
    expect((await setup().app.request("/auth/start", json({ email: "nope" }))).status).toBe(400);
  });
});

describe("envelopes", () => {
  test("send: in order, fields on the right signer, reminders and expiry set by the client", async () => {
    const { app, doc } = setup();
    const r = await send(app);
    expect(r.status).toBe(201);
    const { id } = (await r.json()) as { id: string };
    const e = doc.envelopes.get(id)!;
    expect(e.externalId).toMatch(/^capfolder:[0-9a-f]{32}:/);
    expect(e.recipients.map((x) => [x.email, x.signingOrder])).toEqual([
      ["fund@y.example", 1],
      ["tim@apple.com", 2],
    ]);
    expect(doc.calls).toEqual([`create ${id}`, `distribute ${id}`]);
  });
  test("status per signer", async () => {
    const { app, doc } = setup();
    const { id } = (await (await send(app)).json()) as { id: string };
    doc.envelopes.get(id)!.recipients[0]!.readStatus = "OPENED";
    expect(await (await app.request(`/envelopes/${id}`, { headers: auth("tim@apple.com") })).json()).toEqual({
      id,
      status: "pending",
      signers: [
        { name: "Fund Y", email: "fund@y.example", status: "opened", signedAt: null },
        { name: "Tim", email: "tim@apple.com", status: "sent", signedAt: null },
      ],
    });
    doc.sign(id, "fund@y.example");
    doc.sign(id, "tim@apple.com");
    const done = (await (
      await app.request(`/envelopes/${id}`, { headers: auth("tim@apple.com") })
    ).json()) as {
      status: string;
    };
    expect(done.status).toBe("completed");
  });
  test("another device's envelope doesn't exist for you", async () => {
    const { app } = setup();
    const { id } = (await (await send(app)).json()) as { id: string };
    for (const [path, init] of [
      [`/envelopes/${id}`, {}],
      [`/envelopes/${id}/signing-url`, {}],
      [`/envelopes/${id}/signed.pdf`, {}],
      [`/envelopes/${id}/remind`, { method: "POST" }],
      [`/envelopes/${id}`, { method: "DELETE" }],
    ] as const)
      expect((await app.request(path, { ...init, headers: auth("eve@evil.example") })).status).toBe(404);
  });
  test("the signing URL is only ever your own", async () => {
    const { app } = setup();
    const { id } = (await (await send(app)).json()) as { id: string };
    expect(
      await (await app.request(`/envelopes/${id}/signing-url`, { headers: auth("tim@apple.com") })).json(),
    ).toEqual({
      url: "http://documenso.test/sign/tok1_2",
    });
    // the founder isn't a signer on this one: no URL, never the investor's
    const form = new FormData();
    form.append("pdf", new Blob([new Uint8Array([1])]), "x.pdf");
    form.append(
      "meta",
      JSON.stringify({ title: "T", signers: [{ name: "Fund Y", email: "fund@y.example" }], fields: [] }),
    );
    const other = (await (
      await app.request("/envelopes", { method: "POST", body: form, headers: auth("tim@apple.com") })
    ).json()) as { id: string };
    expect(
      (await app.request(`/envelopes/${other.id}/signing-url`, { headers: auth("tim@apple.com") })).status,
    ).toBe(404);
  });
  test("remind only the unsigned; cancel a pending one; delete a finished one", async () => {
    const { app, doc } = setup();
    const { id } = (await (await send(app)).json()) as { id: string };
    doc.sign(id, "fund@y.example");
    await app.request(`/envelopes/${id}/remind`, { method: "POST", headers: auth("tim@apple.com") });
    expect(doc.calls.at(-1)).toBe(`redistribute ${id} 2`);
    await app.request(`/envelopes/${id}`, { method: "DELETE", headers: auth("tim@apple.com") });
    expect(doc.calls.slice(-2)).toEqual([`cancel ${id}`, `remove ${id}`]);
    expect((await app.request(`/envelopes/${id}`, { headers: auth("tim@apple.com") })).status).toBe(404);
  });
  test("signed.pdf only when completed", async () => {
    const { app, doc } = setup();
    const { id } = (await (await send(app)).json()) as { id: string };
    expect(
      (await app.request(`/envelopes/${id}/signed.pdf`, { headers: auth("tim@apple.com") })).status,
    ).toBe(409);
    doc.sign(id, "fund@y.example");
    doc.sign(id, "tim@apple.com", new Uint8Array([9, 9]));
    const r = await app.request(`/envelopes/${id}/signed.pdf`, { headers: auth("tim@apple.com") });
    expect([r.status, r.headers.get("content-type"), [...new Uint8Array(await r.arrayBuffer())]]).toEqual([
      200,
      "application/pdf",
      [9, 9],
    ]);
  });
  test("bad requests get plain errors", async () => {
    const { app } = setup();
    const form = new FormData();
    form.append("meta", JSON.stringify({ title: "", signers: [] }));
    const r = await app.request("/envelopes", {
      method: "POST",
      body: form,
      headers: auth("tim@apple.com"),
    });
    expect([r.status, await r.json()]).toEqual([
      400,
      { error: "Send a PDF, a title and at least one signer with an email." },
    ]);
  });
  test("purge: capfolder envelopes older than 30 days go", async () => {
    const { app, doc } = setup();
    const { id } = (await (await send(app)).json()) as { id: string };
    doc.envelopes.get(id)!.createdAt = new Date(clock - 31 * 864e5).toISOString();
    const { purge } = await import("../src/app.ts");
    expect(await purge(doc.api, () => clock)).toBe(1);
    expect(doc.calls.at(-1)).toBe(`remove ${id}`);
  });
});

describe("plans: free accounts 5 a month, pro unlimited", () => {
  test("the limit resets on the 1st of the next month (UTC)", async () => {
    const saved = clock;
    try {
      clock = Date.parse("2026-10-31T23:00:00Z");
      const { app } = setup();
      for (let i = 0; i < 5; i++) await send(app, "month@acme.example");
      expect((await send(app, "month@acme.example")).status).toBe(429);
      clock = Date.parse("2026-11-01T00:00:01Z");
      expect((await send(app, "month@acme.example")).status).toBe(201);
    } finally {
      clock = saved;
    }
  });
  test("a pro account has no limit; the plan is keyed by the sender's email, any case", async () => {
    const { app } = setup({ plan: (email) => (email === "pro@acme.example" ? "pro" : "free") });
    for (let i = 0; i < 15; i++) expect((await send(app, "Pro@Acme.example")).status).toBe(201);
    for (let i = 0; i < 5; i++) await send(app, "free@acme.example");
    expect((await send(app, "free@acme.example")).status).toBe(429);
  });
  test("plans file: edits are picked up, a missing or broken file means everyone is free", async () => {
    const { mkdtempSync, writeFileSync, utimesSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const file = join(mkdtempSync(join(tmpdir(), "plans-")), "plans.json");
    const plan = filePlans(file);
    expect(plan("a@x.example")).toBe("free");
    writeFileSync(file, JSON.stringify({ pro: [" A@X.example"] }));
    expect(plan("a@x.example")).toBe("pro");
    writeFileSync(file, "{ not json");
    utimesSync(file, new Date(), new Date(Date.now() + 5000));
    expect(plan("a@x.example")).toBe("free");
  });
});

describe("abuse limits (security review)", () => {
  const ip = (n: number) => ({ "x-forwarded-for": `203.0.113.${n}` });
  test("one IP can't spray code emails at many addresses", async () => {
    const { app } = setup();
    for (let i = 0; i < 20; i++)
      expect((await app.request("/auth/start", json({ email: `p${i}@x.example` }, ip(1)))).status).toBe(200);
    expect((await app.request("/auth/start", json({ email: "p99@x.example" }, ip(1)))).status).toBe(429);
    expect((await app.request("/auth/start", json({ email: "p99@x.example" }, ip(2)))).status).toBe(200);
  });
  test("one IP can't guess codes across many addresses", async () => {
    const { app } = setup();
    for (let i = 0; i < 60; i++)
      await app.request("/auth/verify", json({ email: `v${i}@x.example`, code: "123456" }, ip(3)));
    expect(
      (await app.request("/auth/verify", json({ email: "v1@x.example", code: "123456" }, ip(3)))).status,
    ).toBe(429);
  });
  test("a free account can send at most 5 envelopes a month, 10 signers each, 15 MB", async () => {
    const { app } = setup();
    for (let i = 0; i < 5; i++) expect((await send(app, "busy@acme.example")).status).toBe(201);
    const r = await send(app, "busy@acme.example");
    expect(r.status).toBe(429);
    expect((await r.json()).error).toBe(
      "That's 5 signing requests this month, the free limit. It resets on November 1. Pro has no limit.",
    );
    const many = new FormData();
    many.append("pdf", new Blob([new Uint8Array([1])]), "x.pdf");
    many.append(
      "meta",
      JSON.stringify({
        title: "T",
        signers: Array.from({ length: 11 }, (_, i) => ({ name: `S${i}`, email: `s${i}@x.example` })),
        fields: [],
      }),
    );
    expect(
      (await app.request("/envelopes", { method: "POST", body: many, headers: auth("tim@apple.com") }))
        .status,
    ).toBe(400);
    const big = new FormData();
    big.append("pdf", new Blob([new Uint8Array(15 * 1024 * 1024 + 1)]), "x.pdf");
    big.append(
      "meta",
      JSON.stringify({ title: "T", signers: [{ name: "A", email: "a@x.example" }], fields: [] }),
    );
    expect(
      (await app.request("/envelopes", { method: "POST", body: big, headers: auth("tim@apple.com") })).status,
    ).toBe(413);
  });
});

describe("security review 2", () => {
  test("a full limiter never locks everyone out, and flooding below its size resets nobody", async () => {
    const { Limit } = await import("../src/auth.ts");
    const l = new Limit(1, 3600e3, () => clock, 100);
    expect(l.take("victim")).toBe(true);
    for (let i = 0; i < 98; i++) l.take(`spam${i}`);
    expect(l.take("victim")).toBe(false); // still limited
    for (let i = 98; i < 500; i++) l.take(`spam${i}`);
    expect(l.take("newcomer")).toBe(true); // full: the oldest key goes, newcomers still get in
  });
  test("IPv6 clients are counted per /64", async () => {
    const { app } = setup();
    for (let i = 0; i < 20; i++)
      await app.request(
        "/auth/start",
        json({ email: `six${i}@x.example` }, { "x-forwarded-for": `2001:db8:1:2::${i.toString(16)}` }),
      );
    expect(
      (
        await app.request(
          "/auth/start",
          json({ email: "six@x.example" }, { "x-forwarded-for": "2001:db8:1:2:ffff::1" }),
        )
      ).status,
    ).toBe(429);
  });
  test("behind a proxy the client is the hop the proxy added (the last), not one the client wrote", async () => {
    const { app } = setup();
    for (let i = 0; i < 20; i++)
      await app.request(
        "/auth/start",
        json({ email: `q${i}@x.example` }, { "x-forwarded-for": `198.51.100.${i}, 203.0.113.9` }),
      );
    expect(
      (
        await app.request(
          "/auth/start",
          json({ email: "q@x.example" }, { "x-forwarded-for": "1.2.3.4, 203.0.113.9" }),
        )
      ).status,
    ).toBe(429);
  });
  test("a huge upload is refused before it's read", async () => {
    const { app } = setup();
    const r = await app.request("/envelopes", {
      method: "POST",
      headers: {
        ...auth("tim@apple.com"),
        "content-type": "multipart/form-data; boundary=x",
        "content-length": String(40 * 1024 * 1024),
      },
      body: "--x--",
    });
    expect(r.status).toBe(413);
  });
});

describe("M5 review", () => {
  test("a completed envelope isn't purged just because it was created 30 days ago", async () => {
    const { app, doc } = setup();
    const { id } = (await (await send(app)).json()) as { id: string };
    doc.sign(id, "fund@y.example");
    doc.sign(id, "tim@apple.com");
    const e = doc.envelopes.get(id)!;
    e.createdAt = new Date(clock - 31 * 864e5).toISOString();
    e.completedAt = new Date(clock - 2 * 864e5).toISOString();
    const { purge } = await import("../src/app.ts");
    expect(await purge(doc.api, () => clock)).toBe(0);
    e.completedAt = new Date(clock - 8 * 864e5).toISOString(); // a week after completion it goes
    expect(await purge(doc.api, () => clock)).toBe(1);
  });
  test("remind only the signer whose turn it is", async () => {
    const { app, doc } = setup();
    const { id } = (await (await send(app)).json()) as { id: string };
    await app.request(`/envelopes/${id}/remind`, { method: "POST", headers: auth("tim@apple.com") });
    expect(doc.calls.at(-1)).toBe(`redistribute ${id} 1`);
  });
  test("malformed sign-in input is a 400, not a 502", async () => {
    const { app } = setup();
    expect((await app.request("/auth/start", json({ email: 5 }))).status).toBe(400);
    expect((await app.request("/auth/verify", json({ email: ["a"], code: {} }))).status).toBe(400);
  });
});

describe("install ping (docs/11)", () => {
  const ping = {
    install_id: "3b9f0c2e-6a51-4c3e-9d0a-1f2b3c4d5e6f",
    event: "first_run",
    app_version: "0.1.0",
    os: "macos",
    imported: true,
    has_documents: false,
    sent_envelope: false,
  };
  function withPings() {
    const rows: unknown[] = [];
    const app = createApp({
      documenso: fakeDocumenso().api,
      secret: SECRET,
      now: () => clock,
      sendMail: async () => {},
      recordPing: async (r) => void rows.push(r),
      clientIp: () => "203.0.113.9",
    });
    return { app, rows };
  }
  test("stores exactly the allowed fields and the day, nothing else (no IP)", async () => {
    const { app, rows } = withPings();
    const r = await app.request("/ping", json({ ...ping, company: "Acme Inc.", email: "x@y.z" }));
    expect(r.status).toBe(204);
    expect(rows).toEqual([{ day: "2026-10-10", ...ping }]);
    expect(JSON.stringify(rows)).not.toContain("203.0.113.9");
  });
  test("anything off-format is refused", async () => {
    const { app, rows } = withPings();
    for (const bad of [
      { ...ping, install_id: "Acme Inc." },
      { ...ping, event: "opened_cap_table" },
      { ...ping, os: "amiga" },
      { ...ping, imported: "yes" },
      { ...ping, app_version: "x".repeat(40) },
    ])
      expect((await app.request("/ping", json(bad))).status).toBe(400);
    expect(rows).toEqual([]);
  });
  test("rate limited per network", async () => {
    const { app } = withPings();
    let last = 0;
    for (let i = 0; i < 31; i++) last = (await app.request("/ping", json(ping))).status;
    expect(last).toBe(429);
  });
  test("a relay without a ping store just says no content", async () => {
    expect((await setup().app.request("/ping", json(ping))).status).toBe(204);
  });
});

describe("install ping hardening (M8 review)", () => {
  const ping = (id: string) => ({
    install_id: id,
    event: "first_run",
    app_version: "0.1.0",
    os: "linux",
    imported: false,
    has_documents: false,
    sent_envelope: false,
  });
  const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  function withPings(ip = () => "203.0.113.9") {
    const rows: unknown[] = [];
    const app = createApp({
      documenso: fakeDocumenso().api,
      secret: SECRET,
      now: () => clock,
      sendMail: async () => {},
      recordPing: async (r) => void rows.push(r),
      clientIp: ip,
    });
    return { app, rows };
  }
  test("only JSON is accepted, so other websites can't post pings without a CORS preflight", async () => {
    const { app, rows } = withPings();
    const r = await app.request("/ping", {
      method: "POST",
      headers: { "content-type": "text/plain", origin: "https://evil.example" },
      body: JSON.stringify(ping(uuid(1))),
    });
    expect(r.status).toBe(415);
    expect(rows).toEqual([]);
  });
  test("one network can add at most 3 new installs a day", async () => {
    const { app, rows } = withPings();
    for (let i = 0; i < 6; i++) await app.request("/ping", json(ping(uuid(i))));
    expect(rows).toHaveLength(3);
  });
  test("a null body or a prerelease version", async () => {
    const { app, rows } = withPings();
    expect((await app.request("/ping", json(null))).status).toBe(400);
    expect((await app.request("/ping", json({ ...ping(uuid(9)), app_version: "0.1.1-beta.2" }))).status).toBe(
      204,
    );
    expect(rows).toHaveLength(1);
  });
});

describe("fair use on the hosted relay", () => {
  test("a total daily cap across all founders keeps email under the provider's limit", async () => {
    const { app } = setup({ limits: { totalPerDay: 3 } });
    for (let i = 0; i < 3; i++) expect((await send(app, `f${i}@acme.example`)).status).toBe(201);
    const r = await send(app, "late@acme.example");
    expect(r.status).toBe(429);
    expect((await r.json()).error).toBe(
      "The signing service is at today's limit. Try again tomorrow, or run your own relay (see capfolder.com).",
    );
    clock += 864e5;
    expect((await send(app, "late@acme.example")).status).toBe(201);
  });
  test("paused: nothing new is sent, existing envelopes still work", async () => {
    let paused = false;
    const { app } = setup({ paused: () => paused });
    const id = (await (await send(app)).json()).id;
    paused = true;
    const r = await send(app);
    expect(r.status).toBe(503);
    expect((await r.json()).error).toBe("Sending is paused on the signing service. Try again later.");
    expect((await app.request(`/envelopes/${id}`, { headers: auth("tim@apple.com") })).status).toBe(200);
  });
});

describe("wire instructions after signing", () => {
  const pdf = (b: number[]) => new Blob([new Uint8Array(b)], { type: "application/pdf" });
  async function completed() {
    const t = setup();
    const { id } = (await (await send(t.app)).json()) as { id: string };
    t.doc.sign(id, "fund@y.example");
    t.doc.sign(id, "tim@apple.com");
    const s = (await (
      await t.app.request(`/envelopes/${id}`, { headers: auth("tim@apple.com") })
    ).json()) as {
      receipt?: string;
    };
    return { ...t, id, receipt: s.receipt! };
  }
  const wire = (
    app: ReturnType<typeof setup>["app"],
    meta: Record<string, unknown>,
    who = "tim@apple.com",
  ) => {
    const form = new FormData();
    form.append("signed", pdf([37, 80, 68, 70, 1]), "signed.pdf");
    form.append("wire", pdf([37, 80, 68, 70, 2]), "wire.pdf");
    form.append("meta", JSON.stringify(meta));
    return app.request("/wire", { method: "POST", body: form, headers: auth(who) });
  };
  const signers = [
    { name: "Fund Y", email: "fund@y.example" },
    { name: "Tim", email: "tim@apple.com" },
  ];

  test("a completed envelope's status carries a receipt; a pending one doesn't", async () => {
    const t = setup();
    const { id } = (await (await send(t.app)).json()) as { id: string };
    const s = await (await t.app.request(`/envelopes/${id}`, { headers: auth("tim@apple.com") })).json();
    expect(s).not.toHaveProperty("receipt");
    expect((await completed()).receipt).toMatch(/^[\w-]{20,}$/);
  });

  test("emails every other signer both PDFs, replies go to the founder", async () => {
    const { app, id, receipt, mail } = await completed();
    const r = await wire(app, {
      envelope_id: id,
      receipt,
      signers,
      title: "SAFE · Fund Y",
      company: "Acme Inc.",
    });
    expect(r.status).toBe(200);
    expect(mail.map((m) => m.to)).toEqual(["fund@y.example"]);
    expect(mail[0]!.subject).toBe("Acme Inc.: your signed SAFE · Fund Y and wire instructions");
    expect(mail[0]!.text).toMatch(/confirm the bank details by phone/);
    expect(mail[0]!.extra?.replyTo).toBe("tim@apple.com");
    expect(mail[0]!.extra?.attachments?.map((a) => a.filename)).toEqual([
      "SAFE · Fund Y (signed).pdf",
      "Wire instructions.pdf",
    ]);
  });

  test("the kill switch and the relay-wide daily limit stop wire emails too", async () => {
    const t = await completed();
    const meta = { envelope_id: t.id, receipt: t.receipt, signers, title: "x", company: "Acme" };
    const paused = setup({ paused: () => true });
    paused.doc.envelopes.set(t.id, t.doc.envelopes.get(t.id)!);
    expect((await wire(paused.app, meta)).status).toBe(503);
    const full = setup({ limits: { totalPerDay: 1 } });
    full.doc.envelopes.set(t.id, t.doc.envelopes.get(t.id)!);
    expect((await wire(full.app, meta)).status).toBe(200);
    expect((await wire(full.app, meta)).status).toBe(429);
    expect(paused.mail).toEqual([]);
  });

  test("a forged receipt, an added recipient or another founder sends nothing", async () => {
    const { app, id, receipt, mail } = await completed();
    const base = { envelope_id: id, receipt, signers, title: "x", company: "Acme" };
    expect((await wire(app, { ...base, receipt: "nope" })).status).toBe(403);
    expect(
      (await wire(app, { ...base, signers: [...signers, { name: "Spam", email: "victim@x.example" }] }))
        .status,
    ).toBe(403);
    expect((await wire(app, base, "other@founder.example")).status).toBe(403);
    expect(mail).toEqual([]);
  });
});
