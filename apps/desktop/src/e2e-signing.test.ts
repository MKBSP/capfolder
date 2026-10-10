// @vitest-environment node
// Real stack: relay on :8787, Documenso on :3100, Mailpit on :8025 (apps/relay/README.md). Opt in: SIGNING_E2E=1
// Both parties sign through Documenso's own signing calls; the sealed PDF must pass our "matches what you sent" check.
import { withSignaturePage } from "@capfolder/core";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, test } from "vitest";
import { verifySigned } from "./pdfverify";
import { relayClient } from "./signing";

const RELAY = "http://localhost:8787";
const DOCUMENSO = "http://localhost:3100";
const ME = `founder-${Date.now()}@capfolder.local`;
const INVESTOR = `investor-${Date.now()}@capfolder.local`;
const platform = { fetch: (u: string, i?: RequestInit) => fetch(u, i) } as never;

async function code(to: string) {
  for (let i = 0; i < 20; i++) {
    const r = (await (
      await fetch(`http://localhost:8025/api/v1/search?query=to:${encodeURIComponent(to)}`)
    ).json()) as {
      messages: { Subject: string }[];
    };
    const m = r.messages.find((x) => /code/i.test(x.Subject));
    if (m) return /(\d{6})/.exec(m.Subject)![1]!;
    await new Promise((res) => setTimeout(res, 300));
  }
  throw new Error("no code email");
}

/** What a signer does in the browser: fill their signature field, then finish. */
async function signAs(token: string) {
  const trpc = (path: string, input: unknown) =>
    fetch(`${DOCUMENSO}/api/trpc/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ json: input }),
    }).then(async (r) => ({ status: r.status, body: await r.json() }));
  const page = await fetch(`${DOCUMENSO}/sign/${token}`);
  expect(page.status).toBe(200);
  const fieldsRes = await trpc("envelope.signingStatus", { token });
  return { trpc, fieldsRes };
}

describe.skipIf(!process.env.SIGNING_E2E)("signing end to end (real relay + Documenso)", () => {
  test("send through the relay, both sign, the sealed copy matches what was sent", async () => {
    let client = relayClient(platform, { relayUrl: RELAY, relayToken: "" });
    await client.start(ME);
    const { token } = await client.verify(ME, await code(ME));
    client = relayClient(platform, { relayUrl: RELAY, relayToken: token });

    const d = await PDFDocument.create();
    const f = await d.embedFont(StandardFonts.Helvetica);
    d.addPage([612, 792]).drawText("The Purchase Amount is $200,000.", { x: 72, y: 700, size: 12, font: f });
    const signers = [
      { name: "Investor", email: INVESTOR },
      { name: "Founder", email: ME },
    ];
    const sent = await withSignaturePage(await d.save(), { title: "E2E SAFE", signers });
    const { id } = await client.send(sent.pdf, { title: "E2E SAFE", signers, fields: sent.fields });
    expect((await client.status(id)).signers.map((s) => s.status)).toEqual(["sent", "sent"]);
    const myUrl = await client.signingUrl(id);
    expect(myUrl).toMatch(/^http:\/\/localhost:3100\/sign\//);

    // Sign as both, via Documenso's own API with each recipient's token (the relay never exposes the investor's).
    const api = (p: string) =>
      fetch(`${DOCUMENSO}/api/v2${p}`, { headers: { Authorization: process.env.DOCUMENSO_API_TOKEN ?? "" } });
    const env = (await (await api(`/envelope/${id}`)).json()) as {
      secondaryId: string;
      recipients: { email: string; token: string; id: number }[];
      fields: { id: number; recipientId: number }[];
    };
    for (const email of [INVESTOR, ME]) {
      const r = env.recipients.find((x) => x.email === email)!;
      const { trpc } = await signAs(r.token);
      for (const field of env.fields.filter((x) => x.recipientId === r.id)) {
        const s = await trpc("envelope.field.sign", {
          token: r.token,
          fieldId: field.id,
          fieldValue: { type: "SIGNATURE", value: email.startsWith("investor") ? "Investor" : "Founder" },
        });
        expect([s.status, JSON.stringify(s.body).slice(0, 300)]).toEqual([200, expect.any(String)]);
      }
      const done = await trpc("recipient.completeDocumentWithToken", {
        token: r.token,
        documentId: Number(env.secondaryId.replace(/\D/g, "")),
      });
      expect([done.status, JSON.stringify(done.body).slice(0, 300)]).toEqual([200, expect.any(String)]);
    }

    let status = "pending";
    for (let i = 0; i < 60 && status !== "completed"; i++) {
      status = (await client.status(id)).status;
      if (status !== "completed") await new Promise((res) => setTimeout(res, 1000));
    }
    expect(status).toBe("completed");
    const sealed = await client.signedPdf(id);
    expect(await verifySigned(sent.pdf, sealed, sent.originalPages)).toEqual({ ok: true });
    await client.remove(id);
  }, 120_000);
});
