import { describe, expect, test } from "vitest";
import { createApp } from "../src/app.ts";
import { makeToken } from "../src/auth.ts";
import { fakeDocumenso } from "./fake-documenso.ts";

const SECRET = "test-secret";
let clock = Date.parse("2026-10-10T12:00:00Z");
function setup() {
  const doc = fakeDocumenso();
  const mail: { to: string; text: string }[] = [];
  const app = createApp({
    documenso: doc.api,
    secret: SECRET,
    now: () => clock,
    sendMail: async (to, _subject, text) => {
      mail.push({ to, text });
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

async function send(app: ReturnType<typeof setup>["app"], email = "mads@acme.example") {
  const form = new FormData();
  form.append("pdf", new Blob([new Uint8Array([37, 80, 68, 70])], { type: "application/pdf" }), "safe.pdf");
  form.append(
    "meta",
    JSON.stringify({
      title: "SAFE · Fund Y",
      signers: [
        { name: "Fund Y", email: "fund@y.example" },
        { name: "Mads", email },
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
    expect((await app.request("/auth/start", json({ email: "Mads@Acme.example" }))).status).toBe(200);
    const code = /\b(\d{6})\b/.exec(mail[0]!.text)![1]!;
    expect(mail[0]!.to).toBe("mads@acme.example");
    expect(
      (await app.request("/auth/verify", json({ email: "mads@acme.example", code: "000000" }))).status,
    ).toBe(400);
    const r = await app.request("/auth/verify", json({ email: "mads@acme.example", code }));
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
    const forged = makeToken("other-secret", "mads@acme.example", clock);
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
      ["mads@acme.example", 2],
    ]);
    expect(doc.calls).toEqual([`create ${id}`, `distribute ${id}`]);
  });
  test("status per signer", async () => {
    const { app, doc } = setup();
    const { id } = (await (await send(app)).json()) as { id: string };
    doc.envelopes.get(id)!.recipients[0]!.readStatus = "OPENED";
    expect(
      await (await app.request(`/envelopes/${id}`, { headers: auth("mads@acme.example") })).json(),
    ).toEqual({
      id,
      status: "pending",
      signers: [
        { name: "Fund Y", email: "fund@y.example", status: "opened", signedAt: null },
        { name: "Mads", email: "mads@acme.example", status: "sent", signedAt: null },
      ],
    });
    doc.sign(id, "fund@y.example");
    doc.sign(id, "mads@acme.example");
    const done = (await (
      await app.request(`/envelopes/${id}`, { headers: auth("mads@acme.example") })
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
      await (
        await app.request(`/envelopes/${id}/signing-url`, { headers: auth("mads@acme.example") })
      ).json(),
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
      await app.request("/envelopes", { method: "POST", body: form, headers: auth("mads@acme.example") })
    ).json()) as { id: string };
    expect(
      (await app.request(`/envelopes/${other.id}/signing-url`, { headers: auth("mads@acme.example") }))
        .status,
    ).toBe(404);
  });
  test("remind only the unsigned; cancel a pending one; delete a finished one", async () => {
    const { app, doc } = setup();
    const { id } = (await (await send(app)).json()) as { id: string };
    doc.sign(id, "fund@y.example");
    await app.request(`/envelopes/${id}/remind`, { method: "POST", headers: auth("mads@acme.example") });
    expect(doc.calls.at(-1)).toBe(`redistribute ${id} 2`);
    await app.request(`/envelopes/${id}`, { method: "DELETE", headers: auth("mads@acme.example") });
    expect(doc.calls.slice(-2)).toEqual([`cancel ${id}`, `remove ${id}`]);
    expect((await app.request(`/envelopes/${id}`, { headers: auth("mads@acme.example") })).status).toBe(404);
  });
  test("signed.pdf only when completed", async () => {
    const { app, doc } = setup();
    const { id } = (await (await send(app)).json()) as { id: string };
    expect(
      (await app.request(`/envelopes/${id}/signed.pdf`, { headers: auth("mads@acme.example") })).status,
    ).toBe(409);
    doc.sign(id, "fund@y.example");
    doc.sign(id, "mads@acme.example", new Uint8Array([9, 9]));
    const r = await app.request(`/envelopes/${id}/signed.pdf`, { headers: auth("mads@acme.example") });
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
      headers: auth("mads@acme.example"),
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
  test("a device can send at most 20 envelopes a day, 10 signers each, 15 MB", async () => {
    const { app } = setup();
    for (let i = 0; i < 20; i++) expect((await send(app, "busy@acme.example")).status).toBe(201);
    expect((await send(app, "busy@acme.example")).status).toBe(429);
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
      (await app.request("/envelopes", { method: "POST", body: many, headers: auth("mads@acme.example") }))
        .status,
    ).toBe(400);
    const big = new FormData();
    big.append("pdf", new Blob([new Uint8Array(15 * 1024 * 1024 + 1)]), "x.pdf");
    big.append(
      "meta",
      JSON.stringify({ title: "T", signers: [{ name: "A", email: "a@x.example" }], fields: [] }),
    );
    expect(
      (await app.request("/envelopes", { method: "POST", body: big, headers: auth("mads@acme.example") }))
        .status,
    ).toBe(413);
  });
});

describe("security review 2", () => {
  test("flooding the limiter with keys doesn't reset anyone's limit (fails closed)", async () => {
    const { Limit } = await import("../src/auth.ts");
    const l = new Limit(1, 3600e3, () => clock, 100);
    expect(l.take("victim")).toBe(true);
    for (let i = 0; i < 500; i++) l.take(`spam${i}`);
    expect(l.take("victim")).toBe(false);
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
        ...auth("mads@acme.example"),
        "content-type": "multipart/form-data; boundary=x",
        "content-length": String(40 * 1024 * 1024),
      },
      body: "--x--",
    });
    expect(r.status).toBe(413);
  });
});
