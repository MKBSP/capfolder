import { builders } from "@capfolder/core";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { App } from "../App";
import { acmePlatform } from "../test/acme";
import { fakePlatform } from "../test/fakePlatform";
import { createVault } from "../vault";

async function home() {
  const fp = acmePlatform();
  render(<App platform={fp.platform} />);
  await screen.findByText("Fully diluted");
  return fp;
}

test("acme cap table as of 2026-10-07", async () => {
  await home();
  fireEvent.change(screen.getByLabelText("As of"), { target: { value: "2026-10-07" } });
  const table = screen.getByRole("table");
  const rows = within(table)
    .getAllByRole("row")
    .slice(1)
    .map((r) => r.textContent);
  expect(rows[0]).toContain("Tim Apple");
  expect(rows[0]).toContain("Founder · Common4,000,00050.00%75%");
  expect(rows[2]).toContain("Employee · Option40,0000.50%25%");
  expect(rows[3]).toContain("Cliff Mar 2027");
  expect(rows[4]).toContain("Option pool (available)Pool920,00011.50%");
  expect(table.textContent).toContain("Fund XPost-money SAFE$250,000≈2.50%Cap $10MNo signed doc");
  expect(table.textContent).toContain("Angel APost-money SAFE$150,000≈1.88%Cap $8M · 20%");
  expect(screen.getByText("8,000,000")).toBeInTheDocument();
  expect(screen.getByText("87.50%")).toBeInTheDocument();
  expect(screen.getByText("$900,000")).toBeInTheDocument();
  expect(screen.getByText(/Vault verified · 30 events · totals add to 100.00%/)).toBeInTheDocument();
});

test("row expands with next vest and the math", async () => {
  await home();
  fireEvent.change(screen.getByLabelText("As of"), { target: { value: "2026-10-07" } });
  await userEvent.click(screen.getAllByText("Employee · Option", { selector: "td" })[0]!);
  expect(screen.getByText("10,000 of 40,000 vested")).toBeInTheDocument();
  expect(screen.getByText("Next: 833 on 7 Nov 2026")).toBeInTheDocument();
  expect(screen.getByText("4 years · 1-year cliff (passed 7 Oct 2026) · monthly")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "How is this calculated?" }));
  expect(screen.getByText("10,000 = floor(40,000 × 12/48), as of 2026-10-07")).toBeInTheDocument();
});

test("changing the as-of date recomputes everything", async () => {
  await home();
  fireEvent.change(screen.getByLabelText("As of"), { target: { value: "2023-01-01" } });
  const rows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
  expect(rows.map((r) => r.textContent?.split(/Founder|Post-money/)[0])).toEqual([
    "Tim Apple",
    "Steve Jobs",
    "SAFEs · as-converted, not in fully diluted",
    "Y Combinator",
  ]);
  expect(screen.getByText("7,000,000")).toBeInTheDocument();
});

test("export csv as of the chosen date", async () => {
  const { saved } = await home();
  fireEvent.change(screen.getByLabelText("As of"), { target: { value: "2026-10-07" } });
  await userEvent.click(screen.getByRole("button", { name: "Export" }));
  await userEvent.click(screen.getByLabelText(/CSV/));
  await userEvent.click(screen.getByRole("button", { name: "Save…" }));
  expect(saved["acme-inc-cap-table-2026-10-07.csv"]).toContain(
    "CS-1,Tim Apple,Individual,Stock,Common,2021-09-14,4000000,4000000,3000000,1000000,",
  );
});

test("Get started card: ticks from the cap table, Hide is remembered in app settings", async () => {
  const fp = await home();
  const card = screen.getByRole("group", { name: /Get started/ });
  expect(within(card).getByText("6 of 8 done")).toBeInTheDocument();
  expect(within(card).getByText(/Preferred shares sold at a set price/)).toBeInTheDocument();
  await userEvent.click(within(card).getByRole("button", { name: "Set up AI" }));
  expect(await screen.findByText("App lock")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Cap table" }));
  await userEvent.click(await screen.findByRole("button", { name: "Hide this list" }));
  expect(screen.queryByRole("group", { name: /Get started/ })).toBeNull();
  expect(JSON.parse(fp.fs.readSync("/appdata/settings.json")).onboarding[fp.root]).toEqual({
    dismissed: true,
  });
});

test("Get started: Import is the main button while the company is empty", async () => {
  const fp = fakePlatform();
  const ctx = { now: () => new Date(), newId: () => builders.newId("evt"), deviceId: "dev_t" };
  const v = await createVault(fp.fs, ctx, {
    parent: "/home/me/Documents/capfolder",
    company: { name: "New Co", formationDate: "2026-01-02" },
  });
  fp.fs.writeSync(
    "/appdata/settings.json",
    JSON.stringify({ deviceId: "dev_t", lock: "none", recentVaults: [{ name: "New Co", root: v.root }] }),
  );
  render(<App platform={fp.platform} />);
  const card = await screen.findByRole("group", { name: /Get started/ });
  expect(within(card).getByText("1 of 8 done")).toBeInTheDocument();
  const imports = within(card).getAllByRole("button", { name: "Import" });
  expect(imports).toHaveLength(5); // share classes, founders, pool, SAFEs, priced round
  for (const b of imports) expect(b).toHaveClass("primary");
  await userEvent.click(within(card).getByRole("button", { name: "How do I add founders?" }));
  expect(fp.opened).toEqual(["https://capfolder.com/help/founders/"]);
  await userEvent.click(within(card).getByRole("button", { name: "Add a SAFE" }));
  expect(await screen.findByText(/New SAFE/)).toBeInTheDocument();
});
