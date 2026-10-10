// Against the real local Documenso (docker/compose.dev.yml + dev-account.sh). Opt in: RELAY_CONTRACT=1 pnpm test
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { createApp } from "../src/app.ts";
import { makeToken } from "../src/auth.ts";
import { httpDocumenso } from "../src/documenso.ts";

const env = Object.fromEntries(
  (() => {
    try {
      return readFileSync(new URL("../docker/.local/relay.env", import.meta.url), "utf8")
        .trim()
        .split("\n")
        .map((l) => l.split("=", 2) as [string, string]);
    } catch {
      return [];
    }
  })(),
);

describe.skipIf(!process.env.RELAY_CONTRACT)("contract: real Documenso", () => {
  const doc = httpDocumenso(env.DOCUMENSO_URL!, env.DOCUMENSO_API_TOKEN!);
  const app = createApp({ documenso: doc, secret: "s", now: () => Date.now(), sendMail: async () => {} });
  const me = "founder@capfolder.local";
  const auth = { Authorization: `Bearer ${makeToken("s", me, Date.now())}` };
  // smallest valid one-page PDF
  const pdf = new TextEncoder().encode(
    "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF",
  );

  test("send, status, my signing link, remind, cancel and delete", async () => {
    const form = new FormData();
    form.append("pdf", new Blob([pdf], { type: "application/pdf" }), "x.pdf");
    form.append(
      "meta",
      JSON.stringify({
        title: "Contract test",
        signers: [
          { name: "Investor", email: "investor@capfolder.local" },
          { name: "Founder", email: me },
        ],
        fields: [
          { signer: 0, page: 1, x: 10, y: 70, w: 30, h: 6 },
          { signer: 1, page: 1, x: 55, y: 70, w: 30, h: 6 },
        ],
      }),
    );
    const created = await app.request("/envelopes", { method: "POST", body: form, headers: auth });
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };
    const s = (await (await app.request(`/envelopes/${id}`, { headers: auth })).json()) as {
      status: string;
      signers: { status: string }[];
    };
    expect([s.status, s.signers.map((x) => x.status)]).toEqual(["pending", ["sent", "sent"]]);
    const url = (await (await app.request(`/envelopes/${id}/signing-url`, { headers: auth })).json()) as {
      url: string;
    };
    expect(url.url).toMatch(/^http:\/\/localhost:3100\/sign\//);
    expect((await app.request(`/envelopes/${id}/remind`, { method: "POST", headers: auth })).status).toBe(
      200,
    );
    expect((await app.request(`/envelopes/${id}`, { method: "DELETE", headers: auth })).status).toBe(200);
    expect((await app.request(`/envelopes/${id}`, { headers: auth })).status).toBe(404);
  }, 30_000);
});
