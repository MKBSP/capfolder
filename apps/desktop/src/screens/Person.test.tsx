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

test("Lisa: summary, chart and history", async () => {
  await person("Lisa Moreau");
  expect(screen.getByText("10,000")).toBeInTheDocument();
  expect(screen.getByText("833 7 Nov")).toBeInTheDocument();
  expect(screen.getAllByText("Oct 2029").length).toBeGreaterThan(0);
  expect(screen.getByRole("img", { name: "Vesting schedule" }).children).toHaveLength(48);
  expect(screen.getByText("Granted 40,000 options at $0.12 (OPT-1)")).toBeInTheDocument();
});

test("terminate Lisa after the cliff: unvested returns to the pool", async () => {
  await person("Lisa Moreau");
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
  expect(t).toContain("Lisa MoreauEmployee · Option10,833");
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
  await person("Ana Ribeiro");
  await userEvent.click(screen.getByRole("button", { name: "Edit" }));
  await userEvent.click(screen.getByRole("button", { name: "Same, just a new name or email" }));
  const name = screen.getByLabelText("Name");
  await userEvent.clear(name);
  await userEvent.type(name, "Ana R. Ribeiro");
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(await screen.findByRole("heading", { name: "Ana R. Ribeiro", level: 1 })).toBeInTheDocument();
});
