import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { App } from "../App";
import { acmePlatform } from "../test/acme";
import { fakePlatform } from "../test/fakePlatform";

const last = (log: string) => JSON.parse(log.trim().split("\n").at(-1)!);

async function settings() {
  const fp = acmePlatform();
  render(<App platform={fp.platform} />);
  await screen.findByText("Fully diluted");
  fireEvent.change(screen.getByLabelText("As of"), { target: { value: "2026-10-07" } });
  await userEvent.click(screen.getByRole("button", { name: "Settings" }));
  return fp;
}

test("your country sets the number format everywhere", async () => {
  const fp = await settings();
  await userEvent.selectOptions(screen.getByLabelText("Your country"), "DE");
  expect(JSON.parse(fp.fs.readSync("/appdata/settings.json")).region).toBe("DE");
  expect(screen.getByText(/1\.234\.567,89/)).toBeInTheDocument(); // the preview
  await userEvent.click(screen.getByRole("button", { name: "Cap table" }));
  expect(await screen.findByText("8.000.000")).toBeInTheDocument();
});

test("company currency: new records use it and money shows it; typed numbers follow your country", async () => {
  const fp = await settings();
  await userEvent.selectOptions(screen.getByLabelText("Your country"), "PT");
  await userEvent.selectOptions(screen.getByLabelText("Currency"), "EUR");
  expect(JSON.parse(fp.fs.readSync(`${fp.root}/capfolder.json`)).currency).toBe("EUR");
  await userEvent.click(screen.getByRole("button", { name: "Cap table" }));
  await userEvent.click(await screen.findByRole("button", { name: "+ New" }));
  await userEvent.click(screen.getByRole("menuitem", { name: "SAFE" }));
  await userEvent.type(screen.getByLabelText("Name"), "Fundo Y");
  await userEvent.type(screen.getByLabelText(/^Amount/), "250.000");
  await userEvent.type(screen.getByLabelText(/^Valuation cap/), "10.000.000");
  await userEvent.click(screen.getByRole("button", { name: "Record as signed" }));
  await screen.findByRole("dialog");
  const tx = last(fp.fs.readSync(`${fp.root}/events.jsonl`));
  expect(tx.data.investment_amount).toEqual({ amount: "250000", currency: "EUR" });
  expect(
    tx.data.conversion_triggers[0].conversion_right.conversion_mechanism.conversion_valuation_cap,
  ).toEqual({ amount: "10000000", currency: "EUR" });
});

test("the company's country and state of incorporation are editable", async () => {
  const fp = await settings();
  const company = screen.getByRole("region", { name: "Company" });
  await userEvent.selectOptions(within(company).getByLabelText("Country of incorporation"), "PT");
  await userEvent.click(within(company).getByRole("button", { name: "Save company details" }));
  expect(await within(company).findByText("Saved.")).toBeInTheDocument();
  const e = last(fp.fs.readSync(`${fp.root}/events.jsonl`));
  expect([e.type, e.data.id, e.data.country_of_formation, e.data.country_subdivision_of_formation]).toEqual([
    "ISSUER",
    "iss_acme",
    "PT",
    undefined,
  ]);
});

test("first run: country on Welcome, then the company's country sets its currency", async () => {
  const { platform, fs } = fakePlatform();
  render(<App platform={platform} />);
  expect(await screen.findByLabelText("Your country")).toHaveValue("US");
  await userEvent.selectOptions(screen.getByLabelText("Your country"), "PT");
  await userEvent.click(screen.getByLabelText("No lock"));
  await userEvent.click(screen.getByLabelText(/I accept the/));
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));
  await userEvent.click(await screen.findByRole("button", { name: "Skip for now" }));
  await userEvent.type(await screen.findByLabelText("Legal name"), "Exemplo Lda");
  expect(screen.getByLabelText("Country of incorporation")).toHaveValue("PT");
  expect(screen.getByLabelText("Currency")).toHaveValue("EUR");
  await userEvent.type(screen.getByLabelText("Incorporated"), "2026-01-02");
  await userEvent.click(screen.getByRole("button", { name: "Create folder" }));
  await screen.findByText("How do you want to start?");
  const root = "/home/me/Documents/capfolder/Exemplo Lda";
  expect(JSON.parse(fs.readSync(`${root}/capfolder.json`)).currency).toBe("EUR");
  const issuer = fs
    .readSync(`${root}/events.jsonl`)
    .split("\n")
    .map((l) => l && JSON.parse(l))
    .find((x) => x?.type === "ISSUER");
  expect([issuer.data.country_of_formation, issuer.data.country_subdivision_of_formation]).toEqual([
    "PT",
    undefined,
  ]);
});

test("a bad currency in capfolder.json falls back to USD instead of crashing the app", async () => {
  const fp = acmePlatform();
  const meta = JSON.parse(fp.fs.readSync(`${fp.root}/capfolder.json`));
  fp.fs.writeSync(`${fp.root}/capfolder.json`, JSON.stringify({ ...meta, currency: "not a currency" }));
  render(<App platform={fp.platform} />);
  expect(await screen.findByText("Fully diluted")).toBeInTheDocument();
  expect(screen.getByText("$900,000")).toBeInTheDocument();
});

test("Portugal end to end: the wizard's defaults parse with comma decimals, labels say EUR, the save works", async () => {
  const { platform, fs } = fakePlatform();
  render(<App platform={platform} />);
  await userEvent.selectOptions(await screen.findByLabelText("Your country"), "PT");
  await userEvent.click(screen.getByLabelText("No lock"));
  await userEvent.click(screen.getByLabelText(/I accept the/));
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));
  await userEvent.click(await screen.findByRole("button", { name: "Skip for now" }));
  await userEvent.type(await screen.findByLabelText("Legal name"), "Exemplo Lda");
  await userEvent.type(screen.getByLabelText("Incorporated"), "2026-01-02");
  await userEvent.click(screen.getByRole("button", { name: "Create folder" }));
  await userEvent.click(await screen.findByRole("button", { name: /Start from zero/ }));
  expect(await screen.findByLabelText(/^Authorized/)).toHaveValue("10.000.000");
  expect(screen.getByLabelText("Par value (EUR)")).toBeInTheDocument();
  const par = screen.getByLabelText("Par value (EUR)");
  await userEvent.clear(par);
  await userEvent.type(par, "0,0001");
  await userEvent.click(screen.getByRole("button", { name: "Next" }));
  await userEvent.type(screen.getByLabelText("Name"), "Ana");
  await userEvent.type(screen.getByLabelText(/^Shares/), "4.000.000");
  await userEvent.click(screen.getByRole("button", { name: "No vesting" }));
  await userEvent.click(screen.getByRole("button", { name: "Next" }));
  await userEvent.click(screen.getByRole("button", { name: "Next" }));
  await userEvent.click(screen.getByRole("button", { name: "Add a SAFE" }));
  await userEvent.type(screen.getByLabelText("Investor"), "Fundo");
  await userEvent.type(screen.getByLabelText("Amount (EUR)"), "100.000");
  await userEvent.type(screen.getByLabelText("Valuation cap (EUR)"), "5.000.000");
  await userEvent.type(screen.getByLabelText(/Discount/), "33,3");
  await userEvent.click(screen.getByRole("button", { name: /Save/ }));
  await screen.findByText("Fully diluted");
  const log = fs.readSync("/home/me/Documents/capfolder/Exemplo Lda/events.jsonl");
  expect(log).toContain('"share_price":{"amount":"0.0001","currency":"EUR"}');
  expect(log).toContain('"conversion_discount":"0.333"');
});
