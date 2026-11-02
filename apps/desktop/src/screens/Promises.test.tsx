import { builders } from "@capfolder/core";
import { createVault } from "@capfolder/vault";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { App } from "../App";
import { askChat } from "../chat";
import { todayIso } from "../fmt";
import { acmePlatform } from "../test/acme";
import { fakePlatform } from "../test/fakePlatform";

const LABEL = "Promised — not legal until the company exists.";

/** Opens a company created without an incorporation date. */
async function planned(opts: Parameters<typeof fakePlatform>[0] = {}) {
  const fp = fakePlatform(opts);
  const ctx = { now: () => new Date(), newId: () => builders.newId("evt"), deviceId: "dev_t" };
  const v = await createVault(fp.fs, ctx, {
    parent: "/home/me/Documents/capfolder",
    company: { name: "Acme Inc.", country: "US", subdivision: "DE" },
  });
  fp.fs.writeSync(
    "/appdata/settings.json",
    JSON.stringify({ deviceId: "dev_t", lock: "none", recentVaults: [{ name: "Acme Inc.", root: v.root }] }),
  );
  render(<App platform={fp.platform} />);
  await screen.findByRole("heading", { name: "Not incorporated yet" });
  return { ...fp, root: v.root, vault: v, ctx };
}

async function promise(name: string, qty: string, vests = false) {
  await userEvent.click(screen.getByRole("button", { name: "Promise shares" }));
  await screen.findByLabelText("Shares");
  expect(screen.queryByLabelText("Class")).toBeNull();
  expect(screen.queryByLabelText("Issued on")).toBeNull();
  expect(screen.getByText(LABEL)).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText("Name"), name);
  await userEvent.type(screen.getByLabelText("Shares"), qty);
  if (vests) await userEvent.click(screen.getByRole("button", { name: "4 years · 1-year cliff · monthly" }));
  await userEvent.click(screen.getByRole("button", { name: "Promise shares" }));
  await screen.findByRole("heading", { name: "Not incorporated yet" });
}

test("create a company that isn't incorporated yet", async () => {
  const { platform, fs } = fakePlatform();
  render(<App platform={platform} />);
  await userEvent.click(await screen.findByLabelText("No lock"));
  await userEvent.click(screen.getByLabelText(/I accept the/));
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));
  await userEvent.click(await screen.findByRole("button", { name: "Skip for now" }));
  await userEvent.type(await screen.findByLabelText("Legal name"), "Acme Inc.");
  await userEvent.click(screen.getByLabelText("Not incorporated yet"));
  expect(screen.queryByLabelText("Incorporated")).toBeNull();
  expect(screen.getByText("Where you plan to incorporate")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Create folder" }));
  expect(await screen.findByRole("heading", { name: "Not incorporated yet" })).toBeInTheDocument();
  const log = fs.readSync("/home/me/Documents/capfolder/Acme Inc./events.jsonl");
  expect(log).not.toContain("TX_STOCK");
  expect(log).not.toMatch(/"(object_)?type":"ISSUER"/);
  const card = screen.getByRole("group", { name: /Get started/ });
  expect(within(card).getByText("0 of 2 done")).toBeInTheDocument();
  expect(within(card).getByText("Promise shares to founders")).toBeInTheDocument();
  expect(within(card).getByText("Record the incorporation")).toBeInTheDocument();
});

test("promise shares from New shares", async () => {
  await planned();
  await userEvent.click(screen.getByRole("button", { name: "+ New" }));
  expect(screen.queryByRole("menuitem", { name: "SAFE" })).toBeNull(); // core refuses these before incorporation
  expect(screen.queryByRole("menuitem", { name: "Option pool" })).toBeNull();
  await userEvent.keyboard("{Escape}");
  await promise("Tim Apple", "6000000");
  expect(screen.getByText(LABEL)).toBeInTheDocument();
  const row = within(screen.getByRole("table")).getByText("Tim Apple").closest("tr")!;
  expect(row.textContent).toContain("6,000,000");
  expect(row.textContent).toContain("100.00%");
  expect(row.textContent).toContain("No vesting");
  const card = screen.getByRole("group", { name: /Get started/ });
  expect(within(card).getByText("1 of 2 done")).toBeInTheDocument();
});

test("remove a promise", async () => {
  await planned();
  await promise("Tim Apple", "6000000");
  await promise("Steve Jobs", "4000000");
  expect(within(screen.getByRole("table")).getByText("Tim Apple").closest("tr")!.textContent).toContain(
    "60.00%",
  );
  const row = within(screen.getByRole("table")).getByText("Steve Jobs").closest("tr")!;
  await userEvent.click(within(row).getByRole("button", { name: "Remove" }));
  const dialog = screen.getByRole("dialog"); // asks first, as removing a document does
  await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(screen.getByText("Steve Jobs")).toBeInTheDocument();
  await userEvent.click(within(row).getByRole("button", { name: "Remove" }));
  await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Remove" }));
  expect(await screen.findByText("100.00%")).toBeInTheDocument();
  expect(screen.queryByText("Steve Jobs")).toBeNull();
});

test("record the incorporation", async () => {
  const { fs, root } = await planned();
  await promise("Tim Apple", "6000000", true);
  await userEvent.click(screen.getByRole("button", { name: "We're incorporated" }));
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).getByLabelText("Legal name")).toHaveValue("Acme Inc.");
  expect(within(dialog).getByLabelText("Authorized shares")).toHaveValue("10000000");
  expect(within(dialog).getByLabelText(/^Par value/)).toHaveValue("0.00001");
  fireEvent.change(within(dialog).getByLabelText("Date of incorporation"), {
    target: { value: "2026-03-03" },
  });
  expect(
    await within(dialog).findByText("Tim Apple: 6,000,000 Common shares (CS-1), vesting from 3 Mar 2026."),
  ).toBeInTheDocument();
  await userEvent.click(within(dialog).getByRole("button", { name: "Record incorporation" }));
  expect(await screen.findByText("Fully diluted")).toBeInTheDocument();
  expect(screen.queryByText("Not incorporated yet")).toBeNull();
  expect(within(screen.getByRole("table")).getByText("Tim Apple")).toBeInTheDocument();
  expect(fs.readSync(`${root}/captable.csv`)).toContain("Tim Apple,common,Common,6000000,100.00,");
  expect(fs.readSync(`${root}/events.jsonl`)).toContain('"security_id":"CS-1"');
});

test("the incorporation dialog shows the 83(b) line when a promise vests", async () => {
  await planned();
  await promise("Tim Apple", "6000000", true);
  await userEvent.click(screen.getByRole("button", { name: "We're incorporated" }));
  const dialog = screen.getByRole("dialog");
  const date = (v: string) =>
    fireEvent.change(within(dialog).getByLabelText("Date of incorporation"), { target: { value: v } });
  date(todayIso());
  expect(await within(dialog).findByText(/^File the 83\(b\) within 30 days of /)).toBeInTheDocument();
  date("2020-01-02"); // deadline passed: no line, as record_incorporation
  expect(within(dialog).queryByText(/83\(b\)/)).toBeNull();
});

test("an incorporation date in the future is refused", async () => {
  await planned();
  await userEvent.click(screen.getByRole("button", { name: "We're incorporated" }));
  const dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Date of incorporation"), {
    target: { value: "2999-01-01" },
  });
  await userEvent.click(within(dialog).getByRole("button", { name: "Record incorporation" }));
  expect(
    await within(dialog).findByText("The incorporation date can't be in the future."),
  ).toBeInTheDocument();
});

test("export before incorporation offers the promised split", async () => {
  const fp = await planned();
  await promise("Tim Apple", "6000000");
  await userEvent.click(screen.getByRole("button", { name: "Export" }));
  const dialog = screen.getByRole("dialog");
  expect(within(dialog).queryByLabelText("As of")).toBeNull();
  expect(within(dialog).getAllByRole("radio")).toHaveLength(1);
  expect(within(dialog).getByText("Promised split (CSV)")).toBeInTheDocument();
  await userEvent.click(within(dialog).getByRole("button", { name: "Save…" }));
  const csv = fp.saved[`acme-inc-promised-split-${todayIso()}.csv`]!;
  expect(csv).toContain("Name,Shares,Percent,Vesting");
  expect(csv).toContain("Tim Apple,6000000,100.00,No vesting");
});

test("an incorporated company shows no promise UI", async () => {
  const fp = acmePlatform();
  render(<App platform={fp.platform} />);
  await screen.findByText("Fully diluted");
  expect(screen.queryByText("Not incorporated yet")).toBeNull();
  expect(screen.queryByText(LABEL)).toBeNull();
  expect(screen.queryByRole("button", { name: "We're incorporated" })).toBeNull();
});

test("the vesting page waits for the incorporation", async () => {
  await planned();
  await userEvent.click(screen.getByRole("button", { name: "Vesting" }));
  expect(
    await screen.findByText("Option pools and grants start once the company is incorporated."),
  ).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "+ New grant" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Create the pool" })).toBeNull();
});

test("Ask AI doesn't open a SAFE form before incorporation", async () => {
  const calls: RequestInit[] = []; // the provider's requests only (the open app pings the relay too)
  const answers = [
    {
      stop_reason: "tool_use",
      content: [
        { type: "tool_use", id: "t1", name: "propose_safe", input: { investor: "Bill Gates", amount: 1 } },
      ],
    },
    { stop_reason: "end_turn", content: [{ type: "text", text: "Not yet." }] },
  ];
  const fp = await planned({
    relay: {
      fetch: async (url: string, init?: RequestInit) => {
        if (!url.startsWith("https://api.anthropic.com/")) return new Response("{}", { status: 404 });
        calls.push(init ?? {});
        return new Response(JSON.stringify(answers[calls.length - 1] ?? {}));
      },
    },
  });
  await fp.platform.aiKey.set("anthropic", "sk-test");
  const m = await askChat(
    {
      platform: fp.platform,
      vault: fp.vault,
      asOf: todayIso(),
      ctx: fp.ctx,
      currency: "USD",
      looking: "Cap table",
      chat: { provider: "anthropic", model: "claude-sonnet-5-5", cloudDocs: false },
    },
    [],
    "Add a SAFE from Bill Gates",
  );
  expect(m.drafts ?? []).toEqual([]);
  expect(String(calls[1]!.body)).toContain(
    "SAFEs, option pools and grants start once the company is incorporated. For now you can promise shares.",
  );
});

test("Get started's Record it opens the incorporation", async () => {
  await planned();
  const card = screen.getByRole("group", { name: /Get started/ });
  await userEvent.click(within(card).getByRole("button", { name: "Record it" }));
  expect(await screen.findByRole("dialog", { name: "Record the incorporation" })).toBeInTheDocument();
});

test("Record incorporation can't be clicked twice while it saves", async () => {
  await planned();
  await userEvent.click(screen.getByRole("button", { name: "We're incorporated" }));
  const dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Date of incorporation"), {
    target: { value: "2026-03-03" },
  });
  const button = within(dialog).getByRole("button", { name: "Record incorporation" });
  fireEvent.click(button);
  expect(button).toBeDisabled();
  expect(await screen.findByText("Fully diluted")).toBeInTheDocument();
});
