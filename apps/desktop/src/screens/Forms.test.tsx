import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { App } from "../App";
import { configureFormat, day, parseDay } from "../fmt";
import { acmePlatform } from "../test/acme";

async function openNew(item: string) {
  const fp = acmePlatform();
  render(<App platform={fp.platform} />);
  await screen.findByText("Fully diluted");
  fireEvent.change(screen.getByLabelText("As of"), { target: { value: "2026-10-07" } });
  await userEvent.click(screen.getByRole("button", { name: "+ New" }));
  await userEvent.click(screen.getByRole("menuitem", { name: item }));
  return fp;
}

test("New SAFE: live impact, record, then it's on the cap table", async () => {
  const { fs, root } = await openNew("SAFE");
  await userEvent.type(screen.getByLabelText("Name"), "Fund Y");
  await userEvent.type(screen.getByLabelText("Amount (USD)"), "200000");
  await userEvent.type(screen.getByLabelText("Valuation cap (USD)"), "10000000");
  fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-10-07" } });
  expect(await screen.findByText("Fund Y ≈ 2.00% as-converted ($200k ÷ $10M)")).toBeInTheDocument();
  expect(screen.getByText("SAFEs outstanding: $900k → $1.1M")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Record as signed" }));
  await userEvent.click(await screen.findByRole("button", { name: "Cancel" })); // skip attaching the PDF
  const table = await screen.findByRole("table");
  expect(table.textContent).toContain("Fund YPost-money SAFE$200,000≈2.00%Cap $10MNo signed doc");
  expect(fs.readSync(`${root}/captable.csv`)).toContain("Fund Y,safe,,,,,,200000,10000000,,2.00,missing");
});

test("New grant: pool line, record, pool shrinks", async () => {
  await openNew("Grant");
  await userEvent.type(screen.getByLabelText("Name"), "Rui");
  await userEvent.type(screen.getByLabelText("Options"), "40000");
  await userEvent.type(screen.getByLabelText(/^Strike price/), "0.12");
  fireEvent.change(screen.getByLabelText("Grant date"), { target: { value: "2026-10-07" } });
  const line = await screen.findByText(/after this grant/);
  expect(line.textContent).toBe("Pool: 920,000 available → 880,000 after this grant");
  await userEvent.click(screen.getByRole("button", { name: "Record grant" }));
  await screen.findByText("Fully diluted");
  expect(within(screen.getByRole("table")).getByText("880,000")).toBeInTheDocument();
});

test("New grant bigger than the pool is blocked with core's reason", async () => {
  await openNew("Grant");
  await userEvent.type(screen.getByLabelText("Name"), "Rui");
  await userEvent.type(screen.getByLabelText("Options"), "2000000");
  expect(await screen.findByText(/would go negative/)).toBeInTheDocument();
});

test("Increase the pool to a new total", async () => {
  await openNew("Option pool");
  await userEvent.type(screen.getByLabelText(/^New total reserved/), "1500000");
  fireEvent.change(screen.getByLabelText("Board approved on"), { target: { value: "2026-10-07" } });
  expect(await screen.findByText(/Pool available after this/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Increase pool" }));
  await screen.findByText("Fully diluted");
  expect(within(screen.getByRole("table")).getByText("1,420,000")).toBeInTheDocument();
});

test("dates read day month year and accept day-first typing", () => {
  expect(parseDay("6 Oct 2026")).toBe("2026-10-06");
  expect(parseDay("06/10/2026")).toBe("2026-06-10"); // US: month first
  configureFormat({ locale: "pt-PT", currency: "EUR", monthFirst: false });
  expect(parseDay("06/10/2026")).toBe("2026-10-06"); // elsewhere: day first
  configureFormat({ locale: "en-US", currency: "USD", monthFirst: true });
  expect(parseDay("6 october 2026")).toBe("2026-10-06");
  expect(parseDay("2026-10-06")).toBe("2026-10-06");
  expect(parseDay("31/02/2026")).toBeNull();
  expect(parseDay("6 Foo 2026")).toBeNull();
  expect(day("2026-10-06")).toBe("6 Oct 2026");
});

test("an impossible date is kept on screen and blocks the save (no silent fallback to today)", async () => {
  const { fs, root } = await openNew("SAFE");
  const before = fs.readSync(`${root}/events.jsonl`);
  await userEvent.type(screen.getByLabelText("Name"), "Fund Y");
  await userEvent.type(screen.getByLabelText("Amount (USD)"), "200000");
  const date = screen.getByLabelText("Date");
  await userEvent.clear(date);
  await userEvent.type(date, "31/09/2026");
  await userEvent.click(screen.getByRole("button", { name: "Record as signed" }));
  expect(await screen.findByText("Enter a valid date (for example 6 Oct 2026).")).toBeInTheDocument();
  expect(date).toHaveValue("31/09/2026");
  expect(fs.readSync(`${root}/events.jsonl`)).toBe(before);
});

test("? tips explain the jargon in one sentence, without changing the field's label", async () => {
  await openNew("SAFE");
  expect(screen.getByLabelText("Valuation cap (USD)")).toBeInTheDocument(); // label unchanged
  const cap = screen.getByRole("button", { name: "What is a valuation cap?" });
  expect(cap).toHaveAccessibleDescription(/highest company value/);
  expect(cap).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByText(/highest company value/)).not.toBeVisible();
  await userEvent.click(cap);
  expect(cap).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByText(/highest company value/)).toBeVisible();
  expect(screen.getByRole("button", { name: "What is a discount?" })).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: /Cap table/ }));
  await userEvent.click(screen.getByRole("button", { name: "+ New" }));
  await userEvent.click(screen.getByRole("menuitem", { name: "Grant" }));
  for (const name of ["What is a cliff?", "What is the vesting start?"])
    expect(await screen.findByRole("button", { name })).toHaveAccessibleDescription(/\.$/);
});
