import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { App } from "../App";
import { acmePlatform } from "../test/acme";

async function person(name: string, asOf = "2026-10-07") {
  const fp = acmePlatform();
  render(<App platform={fp.platform} />);
  await screen.findByText("Fully diluted");
  fireEvent.change(screen.getByLabelText("As of"), { target: { value: asOf } });
  await userEvent.click(screen.getByRole("button", { name }));
  await screen.findByRole("heading", { name, level: 1 });
  return fp;
}
const backHome = async () => {
  await userEvent.click(screen.getByRole("button", { name: "← People" }));
  await userEvent.click(screen.getByRole("button", { name: "Cap table" }));
};

test("Woz: summary, chart and history", async () => {
  await person("Steve Wozniak");
  expect(screen.getByText("10,000")).toBeInTheDocument();
  expect(screen.getByText("833 7 Nov")).toBeInTheDocument();
  expect(screen.getAllByText("Oct 2029").length).toBeGreaterThan(0);
  expect(screen.getByRole("img", { name: "Vesting schedule" }).children).toHaveLength(48);
  expect(screen.getByText("Granted 40,000 options at $0.12 (OPT-1)")).toBeInTheDocument();
});

test("terminate Woz after the cliff: unvested returns to the pool", async () => {
  await person("Steve Wozniak");
  await userEvent.click(screen.getByRole("button", { name: "Terminate…" }));
  fireEvent.change(screen.getByLabelText("Last day"), { target: { value: "2026-11-07" } });
  expect(within(screen.getByRole("dialog")).getByText(/^Vested/).textContent).toBe(
    "Vested 10,833 · returns 29,167 to the pool · exercise by 5 Feb 2027",
  );
  await userEvent.click(screen.getByRole("button", { name: "Record termination" }));
  expect(await screen.findByText("Cancelled 29,167 unvested on OPT-1 · Voluntary")).toBeInTheDocument();
  await backHome();
  fireEvent.change(screen.getByLabelText("As of"), { target: { value: "2027-10-07" } });
  const t = screen.getByRole("table").textContent!;
  expect(t).toContain("Steve WozniakEmployee · Option10,833");
  expect(t).toContain("Option pool (available)Pool949,167");
});

test("correct Angel's cap: as-converted updates, history shows both", async () => {
  await person("Angel A");
  await userEvent.click(screen.getByRole("button", { name: "Correct…" }));
  await userEvent.selectOptions(screen.getByLabelText("What's wrong"), "Valuation cap");
  expect(screen.getByLabelText("Recorded as")).toHaveValue("8000000");
  await userEvent.type(screen.getByLabelText("Should be"), "9000000");
  await userEvent.type(screen.getByLabelText("Why"), "Typo");
  await userEvent.click(screen.getByRole("button", { name: "Record correction" }));
  expect(
    await screen.findByText(/Corrected conversion_triggers.*8000000 → 9000000 · Typo/),
  ).toBeInTheDocument();
  await backHome();
  expect(within(screen.getByRole("table")).getByText("≈1.67%")).toBeInTheDocument();
});

test("edit a name as the same person", async () => {
  await person("Steve Jobs");
  await userEvent.click(screen.getByRole("button", { name: "Edit" }));
  await userEvent.click(screen.getByRole("button", { name: "Same, just a new name or email" }));
  const name = screen.getByLabelText("Name");
  await userEvent.clear(name);
  await userEvent.type(name, "Steve R. Jobs");
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByRole("heading", { name: "Steve R. Jobs", level: 1 })).toBeInTheDocument();
});

test("transfer part of Steve's shares to a new holding company: both rows on the cap table", async () => {
  await person("Steve Jobs");
  await userEvent.click(screen.getByRole("button", { name: "Transfer…" }));
  const dialog = within(screen.getByRole("dialog"));
  await userEvent.type(dialog.getByLabelText("Name"), "Jobs Holdings");
  await userEvent.type(dialog.getByLabelText(/^Shares/), "1000000");
  fireEvent.change(dialog.getByLabelText("Date"), { target: { value: "2026-01-01" } });
  await userEvent.click(dialog.getByRole("button", { name: "Record transfer" }));
  expect(await screen.findByText(/Transferred 1,000,000 shares of CS-2/)).toBeInTheDocument();
  await backHome();
  const t = screen.getByRole("table").textContent!;
  expect(t).toContain("Jobs Holdings");
  expect(t).toMatch(/Steve Jobs.*2,000,000/);
});

test("transfer refuses more than the holder has, and says why", async () => {
  await person("Steve Jobs");
  await userEvent.click(screen.getByRole("button", { name: "Transfer…" }));
  const dialog = within(screen.getByRole("dialog"));
  await userEvent.selectOptions(dialog.getByLabelText("To"), "Tim Apple");
  await userEvent.type(dialog.getByLabelText(/^Shares/), "9000000");
  await userEvent.click(dialog.getByRole("button", { name: "Record transfer" }));
  expect(await dialog.findByText("Only 3,000,000 shares are outstanding on CS-2.")).toBeInTheDocument();
});

test("merge a duplicate: holdings move, the duplicate is gone, its page goes to the kept person", async () => {
  const fp = await person("Fund X");
  await userEvent.click(screen.getByRole("button", { name: "Edit" }));
  await userEvent.click(screen.getByRole("button", { name: "A duplicate of someone else here" }));
  await userEvent.selectOptions(screen.getByLabelText("Keep"), "Y Combinator");
  await userEvent.click(screen.getByRole("button", { name: "Merge into Y Combinator" }));
  expect(await screen.findByRole("heading", { name: "Y Combinator", level: 1 })).toBeInTheDocument();
  expect(screen.getAllByText(/SAFE-3/).length).toBeGreaterThan(0);
  expect(fp.fs.readSync(`${fp.root}/events.jsonl`)).toContain('"type":"stakeholder_alias"');
  await userEvent.click(screen.getByRole("button", { name: "← People" }));
  expect(screen.queryByRole("button", { name: "Fund X" })).not.toBeInTheDocument();
});
