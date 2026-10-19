import { builders } from "@capfolder/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { App } from "../App";
import { fakePlatform } from "../test/fakePlatform";
import { appendToVault, openVault } from "../vault";

const ctx = { now: () => new Date(), newId: () => builders.newId("evt"), deviceId: "dev_t" };

test("Welcome → Try the sample company: a read-only Acme in app data, with a banner", async () => {
  const fp = fakePlatform();
  render(<App platform={fp.platform} />);
  await userEvent.click(await screen.findByRole("button", { name: "Try the sample company" }));
  expect(await screen.findByText("Fully diluted")).toBeInTheDocument();
  expect(screen.getByText(/Sample company · nothing here is real/)).toBeInTheDocument();
  expect(screen.getAllByText("Tim Apple").length).toBeGreaterThan(0);
  expect(screen.queryByText(/missing from the folder/)).toBeNull(); // its documents are filed too
  expect(screen.queryByRole("group", { name: /Get started/ })).toBeNull();
  expect(fp.fs.existsSync("/appdata/sample/docs/safes/2022-01-10_y-combinator.pdf")).toBe(true);
  expect(JSON.parse(fp.fs.readSync("/appdata/settings.json")).recentVaults).toEqual([]);

  // saving is blocked with a plain message, and nothing is written
  const v = await openVault(fp.fs, "/appdata/sample", ctx);
  const r = await appendToVault(
    fp.fs,
    v,
    [builders.stakeholder({ name: "Someone", type: "INDIVIDUAL" })],
    ctx,
  );
  expect(r.ok).toBe(false);
  expect(!r.ok && r.errors[0]).toMatch(/sample company/);
  expect(fp.fs.readSync("/appdata/sample/events.jsonl")).toBe(v.log);

  await userEvent.click(screen.getByRole("button", { name: "Start my own" }));
  expect(await screen.findByText("Welcome to Capfolder")).toBeInTheDocument();
});

test("StartChoice has the sample as a fourth card; Start my own goes back to your company", async () => {
  const fp = fakePlatform();
  render(<App platform={fp.platform} />);
  await userEvent.click(await screen.findByLabelText("No lock"));
  await userEvent.click(screen.getByLabelText(/I accept the/));
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));
  await userEvent.click(await screen.findByRole("button", { name: "Skip for now" }));
  await userEvent.type(await screen.findByLabelText("Legal name"), "Test Co");
  await userEvent.type(screen.getByLabelText("Incorporated"), "2026-01-02");
  await userEvent.click(screen.getByRole("button", { name: "Create folder" }));
  await userEvent.click(await screen.findByRole("button", { name: /Try the sample company/ }));
  expect(await screen.findByText(/Sample company · nothing here is real/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Start my own" }));
  expect(await screen.findByRole("button", { name: /^Test Co/ })).toBeInTheDocument();
  expect(screen.queryByText(/Sample company · nothing here is real/)).toBeNull();
});

test("the sample banner stays on every screen, not only the cap table", async () => {
  const fp = fakePlatform();
  render(<App platform={fp.platform} />);
  await userEvent.click(await screen.findByRole("button", { name: "Try the sample company" }));
  await screen.findByText("Fully diluted");
  for (const tab of ["People", "Documents", "Settings"]) {
    await userEvent.click(screen.getByRole("button", { name: tab }));
    expect(screen.getAllByText(/Sample company · nothing here is real/)).toHaveLength(1);
  }
});
