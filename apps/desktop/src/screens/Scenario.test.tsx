// F-39: Try a scenario. Steps on the left, the engine's table on the right; nothing is written.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { App } from "../App";
import { fakePlatform } from "../test/fakePlatform";

async function openEmpty() {
  const fp = fakePlatform();
  render(<App platform={fp.platform} />);
  await screen.findByRole("heading", { name: "Welcome to Capfolder" });
  await userEvent.click(screen.getByRole("button", { name: "Try a scenario" }));
  await screen.findByRole("heading", { name: "Try a scenario" });
  return fp;
}

test("Welcome offers Try a scenario; the screen opens with two empty founders and no table yet", async () => {
  await openEmpty();
  expect(screen.getAllByLabelText("Founder name")).toHaveLength(2);
  expect(screen.getByText("Name the founders and their shares to see the first table.")).toBeInTheDocument();
});

async function founders(names: [string, string], count: string) {
  const name = screen.getAllByLabelText("Founder name");
  const sh = screen.getAllByLabelText("Shares");
  await userEvent.type(name[0]!, names[0]);
  await userEvent.type(sh[0]!, count);
  await userEvent.type(name[1]!, names[1]);
  await userEvent.type(sh[1]!, count);
}
async function add(kind: string) {
  await userEvent.click(screen.getByRole("button", { name: "+ Add step" }));
  await userEvent.click(screen.getByRole("menuitem", { name: kind }));
}
const rows = () =>
  within(screen.getByRole("table"))
    .getAllByRole("row")
    .slice(1)
    .map((r) => r.textContent ?? "");

test("the first question: founders, 10% pool, $500k at $2M, typical rounds, exit at $200M", async () => {
  await openEmpty();
  await founders(["Steve Jobs", "Steve Wozniak"], "5000000");
  await add("Option pool");
  await userEvent.type(screen.getByLabelText("Pool, % of fully diluted"), "10");
  await add("SAFE");
  await userEvent.type(screen.getByLabelText("Investor"), "Bill Gates");
  await userEvent.type(screen.getByLabelText("Amount (USD)"), "500000");
  await userEvent.type(screen.getByLabelText("Valuation cap (USD)"), "2000000");
  await userEvent.click(screen.getByRole("button", { name: "Use the typical rounds" }));
  await add("Exit");
  await userEvent.type(screen.getByLabelText("Company sells for (USD)"), "200000000");
  await screen.findByRole("heading", { name: "Exit at $200M" });
  const chips = screen.getAllByRole("button", {
    name: /^(Founders|Option pool|SAFE: Bill Gates|Seed|Series A|Series B|Exit at \$200M)$/,
  });
  expect(chips.map((c) => c.textContent)).toEqual([
    "Founders",
    "Option pool",
    "SAFE: Bill Gates",
    "Seed",
    "Series A",
    "Series B",
    "Exit at $200M",
  ]);
  expect(rows().find((r) => r.startsWith("Option pool"))).toContain("$0");
  expect(screen.getByText(/Unissued options are cancelled/)).toBeInTheDocument();
  expect(screen.getByText("Projections, not advice. Nothing is saved.")).toBeInTheDocument();
  expect(screen.getByText(/Carta, 2025/)).toBeInTheDocument();
  // the founders' share never goes up: Founders table vs Series B table
  await userEvent.click(screen.getByRole("button", { name: "Series B" }));
  const jobsB = rows().find((r) => r.startsWith("Steve Jobs"))!;
  expect(jobsB).toMatch(/\d+\.\d\d%/);
  expect(Number(/(\d+\.\d\d)%/.exec(jobsB)![1])).toBeLessThan(50);
});

test("a bad amount shows the engine's words, nothing crashes", async () => {
  await openEmpty();
  await founders(["Steve Jobs", "Steve Wozniak"], "5000000");
  await add("SAFE");
  await userEvent.type(screen.getByLabelText("Investor"), "Bill Gates");
  await userEvent.type(screen.getByLabelText("Amount (USD)"), "50,");
  expect(await screen.findByText(/whole/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Founders" }));
  expect(screen.getByRole("table")).toBeInTheDocument();
});

test("removing a step recomputes the ones after it", async () => {
  await openEmpty();
  await founders(["Steve Jobs", "Steve Wozniak"], "5000000");
  await add("SAFE");
  await userEvent.type(screen.getByLabelText("Investor"), "Bill Gates");
  await userEvent.type(screen.getByLabelText("Amount (USD)"), "500000");
  await userEvent.type(screen.getByLabelText("Valuation cap (USD)"), "2000000");
  await add("Priced round");
  await screen.findByRole("heading", { name: "Seed" });
  expect(rows().some((r) => r.startsWith("Bill Gates"))).toBe(true);
  await userEvent.click(screen.getAllByRole("button", { name: "Remove" })[0]!); // the SAFE card
  await waitFor(() => expect(screen.queryByRole("button", { name: "SAFE: Bill Gates" })).toBeNull());
  await screen.findByRole("heading", { name: "Seed" });
  expect(rows().some((r) => r.startsWith("Bill Gates"))).toBe(false);
});
