import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { App } from "../App";
import { fakePlatform } from "../test/fakePlatform";

/** Walks first run with no lock up to the wizard. */
export async function toWizard() {
  const fp = fakePlatform();
  render(<App platform={fp.platform} />);
  await userEvent.click(await screen.findByLabelText("No lock"));
  await userEvent.click(screen.getByLabelText(/I accept the/));
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));
  await userEvent.click(await screen.findByRole("button", { name: "Skip for now" }));
  await userEvent.type(await screen.findByLabelText("Legal name"), "Test Co");
  await userEvent.type(screen.getByLabelText("Incorporated"), "2026-01-02");
  await userEvent.click(screen.getByRole("button", { name: "Create folder" }));
  await userEvent.click(await screen.findByRole("button", { name: /Start from zero/ }));
  return fp;
}

test("wizard: two founders, a pool and a SAFE → saved cap table", async () => {
  const { fs } = await toWizard();
  await userEvent.click(await screen.findByRole("button", { name: "Next" }));
  await userEvent.type(screen.getByLabelText("Name"), "Ana");
  await userEvent.type(screen.getByLabelText(/^Shares/), "4000000");
  await userEvent.click(screen.getByRole("button", { name: "Add another founder" }));
  await userEvent.type(screen.getAllByLabelText("Name")[1]!, "Bo");
  await userEvent.type(screen.getAllByLabelText(/^Shares/)[1]!, "3000000");
  await userEvent.click(screen.getAllByRole("button", { name: "No vesting" })[1]!);
  await userEvent.click(screen.getByRole("button", { name: "Next" }));
  await userEvent.click(screen.getByRole("button", { name: "Add an option pool" }));
  await userEvent.click(screen.getByRole("button", { name: "Next" }));
  await userEvent.click(screen.getByRole("button", { name: "Add a SAFE" }));
  await userEvent.type(screen.getByLabelText("Investor"), "Y Combinator");
  await userEvent.type(screen.getByLabelText("Amount (USD)"), "500000");
  await userEvent.type(screen.getByLabelText("Valuation cap (USD)"), "10000000");
  const live = screen.getByLabelText("Live cap table");
  expect(await within(live).findByText("≈5.00%")).toBeInTheDocument();
  expect(within(live).getByText("50.00%")).toBeInTheDocument();
  expect(within(live).getByText("12.50%")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Save cap table" }));
  await waitFor(() => expect(fs.readSync("/home/me/Documents/Test Co/captable.csv")).toContain("Ana"));
  const csv = fs.readSync("/home/me/Documents/Test Co/captable.csv");
  expect(csv).toContain("Ana,common,Common,4000000,50.00");
  expect(csv).toContain("Bo,common,Common,3000000,37.50,3000000,0");
  expect(csv).toContain("Y Combinator,safe,,,,,,500000,10000000,,5.00,missing");
});

test("wizard: over-issuing shows the core's error and can't be saved", async () => {
  await toWizard();
  await userEvent.click(await screen.findByRole("button", { name: "Next" }));
  await userEvent.type(screen.getByLabelText("Name"), "Ana");
  await userEvent.type(screen.getByLabelText(/^Shares/), "12000000");
  expect(
    await screen.findByText("Issued would exceed authorized for Common (12,000,000 > 10,000,000)"),
  ).toBeInTheDocument();
});
