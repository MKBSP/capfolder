// docs/18: the Ask AI loop. Provider HTTP is mocked; tools run over the acme fixture.
import { builders } from "@capfolder/core";
import { describe, expect, test } from "vitest";
import { askChat, type ChatDeps } from "./chat";
import { acmePlatform } from "./test/acme";
import { openVault } from "./vault";

const ctx = {
  now: () => new Date("2026-10-16T10:00:00Z"),
  newId: () => builders.newId("evt"),
  deviceId: "dev_t",
};

type Call = { url: string; init?: RequestInit };
/** A fake provider: answers each request with the next scripted JSON body, and records the calls. */
async function deps(
  answers: unknown[],
  chat: Partial<ChatDeps["chat"]> = {},
  status: number[] = [],
): Promise<{ d: ChatDeps; calls: Call[] }> {
  const calls: Call[] = [];
  const fp = acmePlatform({
    relay: {
      fetch: async (url: string, init?: RequestInit) => {
        calls.push({ url, init });
        const i = calls.length - 1;
        return new Response(JSON.stringify(answers[i] ?? {}), { status: status[i] ?? 200 });
      },
    },
  });
  await fp.platform.aiKey.set("anthropic", "sk-test");
  await fp.platform.aiKey.set("openai", "sk-oa");
  const vault = await openVault(fp.platform.fs, fp.root, ctx);
  return {
    calls,
    d: {
      platform: fp.platform,
      vault,
      asOf: "2026-10-16",
      ctx,
      currency: "USD",
      looking: "Cap table",
      chat: { provider: "anthropic", model: "claude-sonnet-5-5", cloudDocs: false, ...chat },
    },
  };
}
const body = (c: Call) => JSON.parse(String(c.init?.body));

describe("Claude", () => {
  test("looks things up with a tool, then answers with the sources it used", async () => {
    const { d, calls } = await deps([
      { stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "cap_table", input: {} }] },
      { stop_reason: "end_turn", content: [{ type: "text", text: "Lisa Moreau has 30,000 unvested." }] },
    ]);
    const m = await askChat(d, [], "Who has unvested options?");
    expect(m.text).toBe("Lisa Moreau has 30,000 unvested.");
    expect(calls[0]!.url).toBe("https://api.anthropic.com/v1/messages");
    const h = new Headers(calls[0]!.init?.headers);
    expect(h.get("x-api-key")).toBe("sk-test");
    expect(h.get("anthropic-dangerous-direct-browser-access")).toBe("true");
    expect(body(calls[0]!).model).toBe("claude-sonnet-5-5");
    // the tool result went back as data, and named Lisa's holding
    const result = body(calls[1]!).messages.at(-1).content[0];
    expect(result.type).toBe("tool_result");
    expect(result.content).toContain("Lisa Moreau");
    expect(m.sources?.some((s) => s.label.includes("Lisa Moreau"))).toBe(true);
  });

  test("no key: says where to add one, no request", async () => {
    const { d, calls } = await deps([]);
    await d.platform.aiKey.set("anthropic", "");
    const m = await askChat(d, [], "hi");
    expect(m.error).toBe(true);
    expect(m.text).toMatch(/Settings → AI/);
    expect(calls).toHaveLength(0);
  });

  test("a document's text stays on this computer unless cloud AI may read documents", async () => {
    const ask = (cloudDocs: boolean) =>
      deps(
        [
          {
            stop_reason: "tool_use",
            content: [
              {
                type: "tool_use",
                id: "t1",
                name: "document_text",
                input: { path: "docs/grants/2025-10-07_lisa-moreau.pdf" },
              },
            ],
          },
          { stop_reason: "end_turn", content: [{ type: "text", text: "ok" }] },
        ],
        { cloudDocs },
      );
    const off = await ask(false);
    await askChat(off.d, [], "read Lisa's grant");
    expect(body(off.calls[0]!).tools.map((t: { name: string }) => t.name)).not.toContain("document_text");
    expect(body(off.calls[1]!).messages.at(-1).content[0].content).toMatch(/not allowed/i);
    const on = await ask(true);
    await askChat(on.d, [], "read Lisa's grant");
    expect(body(on.calls[0]!).tools.map((t: { name: string }) => t.name)).toContain("document_text");
  });
});

test("a document path from the event log that leaves docs/ is never read or sent", async () => {
  const evil = "../../../.ssh/id_rsa";
  const { d, calls } = await deps(
    [
      {
        stop_reason: "tool_use",
        content: [{ type: "tool_use", id: "t1", name: "document_text", input: { path: evil } }],
      },
      { stop_reason: "end_turn", content: [{ type: "text", text: "ok" }] },
    ],
    { cloudDocs: true },
  );
  // a tampered or imported events.jsonl: the doc points outside the company folder
  const events = d.vault.events.map((e) =>
    (e.data as { doc_id?: string }).doc_id === "doc_lisa_grant"
      ? { ...e, data: { ...e.data, path: evil } }
      : e,
  );
  let read = false;
  const fs = Object.assign(Object.create(d.platform.fs), {
    readBytes: async () => {
      read = true;
      return new Uint8Array();
    },
  });
  await askChat({ ...d, vault: { ...d.vault, events }, platform: { ...d.platform, fs } }, [], "read it");
  expect(read).toBe(false);
  expect(JSON.stringify(body(calls[1]!).messages.at(-1))).toMatch(/No filed document/);
});

test("a filed document that is a symlink (it could point anywhere) is never read or sent", async () => {
  const path = "docs/grants/2025-10-07_lisa-moreau.pdf";
  const { d, calls } = await deps(
    [
      {
        stop_reason: "tool_use",
        content: [{ type: "tool_use", id: "t1", name: "document_text", input: { path } }],
      },
      { stop_reason: "end_turn", content: [{ type: "text", text: "ok" }] },
    ],
    { cloudDocs: true },
  );
  let read = false;
  const fs = Object.assign(Object.create(d.platform.fs), {
    isSymlink: async (p: string) => p.endsWith(path),
    readBytes: async () => {
      read = true;
      return new Uint8Array();
    },
  });
  await askChat({ ...d, platform: { ...d.platform, fs } }, [], "read it");
  expect(read).toBe(false);
  expect(JSON.stringify(body(calls[1]!).messages.at(-1))).toMatch(/No filed document/);
});

describe("drafts", () => {
  const propose = async (
    name: string,
    input: unknown,
    provider: ChatDeps["chat"]["provider"] = "anthropic",
  ) => {
    const { d } = await deps(
      [
        { stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name, input }] },
        { stop_reason: "end_turn", content: [{ type: "text", text: "Here is the draft." }] },
      ],
      { provider },
    );
    return askChat(d, [], "draft it");
  };

  test("a grant becomes a card that opens the grant form filled in, with a template", async () => {
    const m = await propose("propose_grant", {
      person: "Ana Ribeiro",
      options: 40000,
      vesting_months: 48,
      cliff_months: 12,
      vesting_start: "2026-11-01",
    });
    const c = m.drafts![0]!;
    expect(c.kind).toBe("grant");
    expect(c.route).toMatchObject({
      name: "newGrant",
      prefill: { person: "Ana Ribeiro", options: "40000", months: "48", cliff: "12", start: "2026-11-01" },
    });
    expect(c.rows).toContainEqual(["Pool after", "880,000 left"]);
    expect(c.template).toHaveProperty("name");
  });

  test("the email the founder gave goes on the card and into the form (SAFE and grant)", async () => {
    const safe = (
      await propose("propose_safe", {
        investor: "Jorge Sandoval",
        amount: 20000,
        cap: 20000000,
        email: "jorge@sandoval.example",
      })
    ).drafts![0]!;
    expect(safe.rows).toContainEqual(["Email", "jorge@sandoval.example"]);
    expect(safe.route).toMatchObject({ name: "newSafe", prefill: { email: "jorge@sandoval.example" } });
    const grant = (
      await propose("propose_grant", { person: "Ana Ribeiro", options: 40000, email: "ana@x.com" })
    ).drafts![0]!;
    expect(grant.route).toMatchObject({ name: "newGrant", prefill: { email: "ana@x.com" } });
    // not an email: left out, not passed on
    const bad = (await propose("propose_safe", { investor: "X", amount: 1, email: "nope" })).drafts![0]!;
    expect((bad.route as { prefill: Record<string, string> }).prefill.email).toBe("");
  });

  test("acceleration has no template: the card says to get a lawyer", async () => {
    const m = await propose("propose_grant", {
      person: "Ana Ribeiro",
      options: 40000,
      acceleration: "double trigger",
    });
    expect(m.drafts![0]!.template).toEqual({ none: expect.stringMatching(/lawyer/) });
  });

  test("an invalid draft is dropped and the model is told why", async () => {
    const m = await propose("propose_grant", { person: "Ana Ribeiro", options: 99_000_000 });
    expect(m.drafts ?? []).toHaveLength(0);
  });

  test("a SAFE gets the matching YC form, or none for cap + discount", async () => {
    const yc = await propose("propose_safe", { investor: "Fund Y", amount: 100000, cap: 8000000 });
    expect(yc.drafts![0]!.template).toEqual({ name: "YC post-money SAFE (valuation cap)" });
    expect(yc.drafts![0]!.route).toMatchObject({
      name: "newSafe",
      prefill: { investor: "Fund Y", amount: "100000", cap: "8000000" },
    });
    const both = await propose("propose_safe", {
      investor: "Fund Y",
      amount: 100000,
      cap: 8000000,
      discount: 0.2,
    });
    expect(both.drafts![0]!.template).toHaveProperty("none");
  });
});

describe("OpenAI-style providers", () => {
  test("OpenAI: tool calls in, answer out", async () => {
    const { d, calls } = await deps(
      [
        {
          choices: [
            {
              message: {
                content: null,
                tool_calls: [
                  { id: "c1", type: "function", function: { name: "whats_missing", arguments: "{}" } },
                ],
              },
            },
          ],
        },
        { choices: [{ message: { content: "Fund X has no signed SAFE." } }] },
      ],
      { provider: "openai", model: "gpt-5" },
    );
    const m = await askChat(d, [], "What's missing?");
    expect(m.text).toBe("Fund X has no signed SAFE.");
    expect(calls[0]!.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(new Headers(calls[0]!.init?.headers).get("authorization")).toBe("Bearer sk-oa");
    expect(body(calls[1]!).messages.at(-1)).toMatchObject({ role: "tool", tool_call_id: "c1" });
  });

  test("a local model that can't use tools gets a summary instead, and a note", async () => {
    const { d, calls } = await deps(
      [{ error: "does not support tools" }, { choices: [{ message: { content: "You have 8 holders." } }] }],
      { provider: "ollama", model: "gemma" },
      [400, 200],
    );
    const m = await askChat(d, [], "How many holders?");
    expect(calls[0]!.url).toBe("http://localhost:11434/v1/chat/completions");
    expect(body(calls[1]!).tools).toBeUndefined();
    expect(body(calls[1]!).messages[0].content).toContain("Lisa Moreau");
    expect(m.text).toBe("You have 8 holders.");
    expect(m.note).toMatch(/bigger model/);
  });
});

test("answers use the company's currency", async () => {
  const { d, calls } = await deps([{ stop_reason: "end_turn", content: [{ type: "text", text: "ok" }] }]);
  await askChat({ ...d, currency: "EUR" }, [], "how much did we raise?");
  expect(body(calls[0]!).system).toMatch(/EUR/);
});
