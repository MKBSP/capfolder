import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { App } from "../App";
import { acmePlatform } from "../test/acme";

const settingsOf = (fp: ReturnType<typeof acmePlatform>) =>
  JSON.parse(fp.fs.readSync("/appdata/settings.json"));

test("✦ Ask AI opens and closes the side panel (button, ⌘K, Esc, ×) and remembers it", async () => {
  const fp = acmePlatform();
  render(<App platform={fp.platform} />);
  const ask = await screen.findByRole("button", { name: /Ask AI/ });
  await userEvent.click(ask);
  const panel = await screen.findByRole("complementary", { name: "Ask AI" });
  expect(within(panel).getByText(/Looking at: Cap table/)).toBeInTheDocument();
  expect(settingsOf(fp).chat.open).toBe(true);
  await userEvent.keyboard("{Escape}");
  expect(screen.queryByRole("complementary", { name: "Ask AI" })).toBeNull();
  await userEvent.keyboard("{Meta>}k{/Meta}");
  expect(await screen.findByRole("complementary", { name: "Ask AI" })).toBeInTheDocument();
  // it stays open across screens
  await userEvent.click(screen.getByRole("button", { name: "People" }));
  expect(
    within(screen.getByRole("complementary", { name: "Ask AI" })).getByText(/Looking at: People/),
  ).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Close Ask AI" }));
  expect(screen.queryByRole("complementary", { name: "Ask AI" })).toBeNull();
  expect(settingsOf(fp).chat.open).toBe(false);
});

test("no AI connected: the panel says where to connect one", async () => {
  render(<App platform={acmePlatform().platform} />);
  await userEvent.click(await screen.findByRole("button", { name: /Ask AI/ }));
  await userEvent.click(await screen.findByRole("button", { name: "Connect an AI" }));
  expect(await screen.findByLabelText("AI in use")).toBeInTheDocument();
});

test("Settings → AI keeps the Claude key in the keychain, not in settings.json", async () => {
  const fp = acmePlatform();
  render(<App platform={fp.platform} />);
  await userEvent.click(await screen.findByRole("button", { name: "Settings" }));
  await userEvent.selectOptions(await screen.findByLabelText("AI in use"), "anthropic|");
  await userEvent.type(screen.getByLabelText("Claude API key"), "sk-ant-123");
  await userEvent.click(screen.getByRole("button", { name: "Save key" }));
  expect(await screen.findByText("Key saved in your keychain.")).toBeInTheDocument();
  expect(fp.keys.anthropic).toBe("sk-ant-123");
  expect(fp.fs.readSync("/appdata/settings.json")).not.toContain("sk-ant-123");
  expect(settingsOf(fp).ai).toMatchObject({ provider: "anthropic", model: "claude-sonnet-5-5" });
  expect(settingsOf(fp).chat).toEqual({ cloudDocs: false, open: false });
});

test("ask, get an answer and a draft; the draft opens the grant form filled in", async () => {
  let n = 0;
  const fp = acmePlatform({
    relay: {
      fetch: async (url: string) =>
        url !== "https://api.anthropic.com/v1/messages"
          ? Promise.reject(new TypeError("Failed to fetch"))
          : new Response(
              JSON.stringify(
                n++ === 0
                  ? {
                      stop_reason: "tool_use",
                      content: [
                        {
                          type: "tool_use",
                          id: "t1",
                          name: "propose_grant",
                          input: { person: "Steve Jobs", options: 40000 },
                        },
                      ],
                    }
                  : {
                      stop_reason: "end_turn",
                      content: [{ type: "text", text: "Here is a draft grant for Steve Jobs." }],
                    },
              ),
            ),
    },
  });
  await fp.platform.aiKey.set("anthropic", "sk-test");
  const s = settingsOf(fp);
  fp.fs.writeSync(
    "/appdata/settings.json",
    JSON.stringify({ ...s, chat: { provider: "anthropic", model: "", cloudDocs: false, open: true } }), // old settings: migrated
  );
  render(<App platform={fp.platform} />);
  const panel = await screen.findByRole("complementary", { name: "Ask AI" });
  await userEvent.type(
    within(panel).getByLabelText("Ask a question"),
    "Add a grant for Steve: 40,000 options{Enter}",
  );
  expect(await within(panel).findByText("Here is a draft grant for Steve Jobs.")).toBeInTheDocument();
  expect(within(panel).getByText("Draft · New option grant")).toBeInTheDocument();
  await userEvent.click(within(panel).getByRole("button", { name: "Open in the grant form" }));
  expect(await screen.findByDisplayValue("40000")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Record grant" })).toBeInTheDocument();
});

test("an AI connected for sorting is the one Ask AI uses: the panel names it, no 'Connect an AI'", async () => {
  const fp = acmePlatform();
  const s = settingsOf(fp);
  fp.fs.writeSync(
    "/appdata/settings.json",
    JSON.stringify({
      ...s,
      ai: { provider: "lmstudio", model: "google/gemma-4-e4b", sortWithAi: true },
      chat: { provider: "", model: "", cloudDocs: false, open: true },
    }),
  );
  render(<App platform={fp.platform} />);
  const panel = await screen.findByRole("complementary", { name: "Ask AI" });
  expect(within(panel).getByText(/LM Studio · google\/gemma-4-e4b/)).toBeInTheDocument();
  expect(within(panel).queryByText(/not connected/)).toBeNull();
  expect(within(panel).queryByRole("button", { name: "Connect an AI" })).toBeNull();
});

test("a SAFE draft's email lands in the form", async () => {
  let n = 0;
  const fp = acmePlatform({
    relay: {
      fetch: async (url: string) =>
        url !== "https://api.anthropic.com/v1/messages"
          ? Promise.reject(new TypeError("Failed to fetch"))
          : new Response(
              JSON.stringify(
                n++ === 0
                  ? {
                      stop_reason: "tool_use",
                      content: [
                        {
                          type: "tool_use",
                          id: "t1",
                          name: "propose_safe",
                          input: { investor: "Jeff Bezos", amount: 20000, email: "jeff@amazon.com" },
                        },
                      ],
                    }
                  : { stop_reason: "end_turn", content: [{ type: "text", text: "Draft ready." }] },
              ),
            ),
    },
  });
  await fp.platform.aiKey.set("anthropic", "sk-test");
  const s = settingsOf(fp);
  fp.fs.writeSync(
    "/appdata/settings.json",
    JSON.stringify({
      ...s,
      ai: { provider: "anthropic", model: "", sortWithAi: false },
      chat: { cloudDocs: false, open: true },
    }),
  );
  render(<App platform={fp.platform} />);
  const panel = await screen.findByRole("complementary", { name: "Ask AI" });
  await userEvent.type(within(panel).getByLabelText("Ask a question"), "SAFE for Jeff{Enter}");
  await userEvent.click(await within(panel).findByRole("button", { name: "Open in the SAFE form" }));
  expect(await screen.findByDisplayValue("jeff@amazon.com")).toBeInTheDocument();
});
