// F-39: Try a scenario. Steps on the left, the engine's table on the right; nothing is written.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { App } from "../App";
import { acmePlatform } from "../test/acme";
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

test("save hands founders, pool and SAFEs to the wizard, not the round", async () => {
  await openEmpty();
  await founders(["Steve Jobs", "Steve Wozniak"], "5000000");
  await add("Option pool");
  await userEvent.type(screen.getByLabelText("Pool, % of fully diluted"), "10");
  await add("SAFE");
  await userEvent.type(screen.getByLabelText("Investor"), "Bill Gates");
  await userEvent.type(screen.getByLabelText("Amount (USD)"), "500000");
  await userEvent.type(screen.getByLabelText("Valuation cap (USD)"), "2000000");
  await add("Priced round");
  await screen.findByRole("heading", { name: "Seed" });
  await userEvent.click(screen.getByRole("button", { name: "Save as my cap table" }));
  // first run: terms and lock, then the email step, then Create company carries the scenario along
  await userEvent.click(await screen.findByLabelText("No lock"));
  await userEvent.click(screen.getByLabelText(/I accept the/));
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));
  await userEvent.click(await screen.findByRole("button", { name: "Skip for now" }));
  expect(await screen.findByText(/Rounds that haven't happened/)).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText("Legal name"), "Acme Inc.");
  await userEvent.type(screen.getByLabelText("Incorporated"), "2026-01-02");
  await userEvent.click(screen.getByRole("button", { name: "Create folder" }));
  await screen.findByRole("heading", { name: "How many shares can the company issue?" });
  await userEvent.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByRole("heading", { name: "Who are the founders?" });
  const digits = (el: HTMLElement) => (el as HTMLInputElement).value.replace(/[,\s]/g, "");
  expect(screen.getAllByLabelText("Name").map((i) => (i as HTMLInputElement).value)).toEqual([
    "Steve Jobs",
    "Steve Wozniak",
  ]);
  expect(screen.getAllByLabelText(/^Shares/).map(digits)).toEqual(["5000000", "5000000"]);
  await userEvent.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByRole("heading", { name: "Is there an option pool?" });
  expect(digits(screen.getByLabelText(/^Pool size/))).toBe("1111111"); // 10% after: floor(10M × 0.1 ÷ 0.9)
  await userEvent.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByRole("heading", { name: "Any SAFEs already signed?" });
  expect((screen.getByLabelText("Investor") as HTMLInputElement).value).toBe("Bill Gates");
  expect(digits(screen.getByLabelText("Amount (USD)"))).toBe("500000");
  expect(digits(screen.getByLabelText("Valuation cap (USD)"))).toBe("2000000");
});

test("from the cap table: Today, then an exit at $100M; nothing is written", async () => {
  const fp = acmePlatform();
  render(<App platform={fp.platform} />);
  await screen.findByText("Fully diluted");
  const before = fp.fs.readSync(`${fp.root}/events.jsonl`);
  await userEvent.click(screen.getByRole("button", { name: "Try a scenario" }));
  await screen.findByRole("heading", { name: "Try a scenario" });
  expect(await screen.findByRole("button", { name: "Today" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Save as my cap table" })).toBeNull();
  expect(rows().some((r) => r.startsWith("Tim Apple"))).toBe(true);
  await add("Exit");
  await userEvent.type(screen.getByLabelText("Company sells for (USD)"), "100000000");
  await screen.findByRole("heading", { name: "Exit at $100M" });
  expect(screen.getByText(/Convert the SAFEs with a round first/)).toBeInTheDocument(); // acme has SAFEs outstanding
  expect(fp.fs.readSync(`${fp.root}/events.jsonl`)).toBe(before);
});

test("sample company: scenarios run, no save button", async () => {
  const fp = fakePlatform();
  render(<App platform={fp.platform} />);
  await screen.findByRole("heading", { name: "Welcome to Capfolder" });
  await userEvent.click(screen.getByRole("button", { name: "Try the sample company" }));
  await screen.findByText("Fully diluted");
  await userEvent.click(screen.getByRole("button", { name: "Try a scenario" }));
  await screen.findByRole("heading", { name: "Try a scenario" });
  expect(await screen.findByRole("button", { name: "Today" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Save as my cap table" })).toBeNull();
  await add("Priced round");
  await screen.findByRole("heading", { name: "Seed" });
  expect(rows().some((r) => r.startsWith("Seed investors"))).toBe(true);
});

// ---- from the final review (2026-11-06): each of these failed first ----

async function toCreateWithScenario() {
  await openEmpty();
  await founders(["Steve Jobs", "Steve Wozniak"], "5000000");
  await screen.findByRole("heading", { name: "Founders" });
  await userEvent.click(screen.getByRole("button", { name: "Save as my cap table" }));
  await userEvent.click(await screen.findByLabelText("No lock"));
  await userEvent.click(screen.getByLabelText(/I accept the/));
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));
  await userEvent.click(await screen.findByRole("button", { name: "Skip for now" }));
  await screen.findByText(/Rounds that haven't happened/);
}

test("not incorporated yet: the banner says the scenario can't be filled in as promises, no false promise", async () => {
  await toCreateWithScenario();
  await userEvent.click(screen.getByLabelText("Not incorporated yet"));
  expect(screen.getByText(/Promise shares/)).toBeInTheDocument();
  expect(screen.queryByText(/will be filled into the setup/)).toBeNull();
});

test("the discount field keeps what is typed, decimals included", async () => {
  await openEmpty();
  await founders(["Steve Jobs", "Steve Wozniak"], "5000000");
  await add("SAFE");
  const d = screen.getByLabelText(/^Discount/);
  await userEvent.type(d, "12.5");
  expect((d as HTMLInputElement).value).toBe("12.5");
});

test("a card heading reads the amount the way the founder typed it", async () => {
  await openEmpty();
  await founders(["Steve Jobs", "Steve Wozniak"], "5000000");
  await add("Exit");
  await userEvent.type(screen.getByLabelText("Company sells for (USD)"), "200,000,000");
  expect(screen.getAllByText("Exit at $200M").length).toBeGreaterThan(0);
  expect(screen.queryByText(/NaN/)).toBeNull();
});

test("a SAFE added after the typical rounds goes before the first round", async () => {
  await openEmpty();
  await founders(["Steve Jobs", "Steve Wozniak"], "5000000");
  await userEvent.click(screen.getByRole("button", { name: "Use the typical rounds" }));
  await add("SAFE");
  await userEvent.type(screen.getByLabelText("Investor"), "Bill Gates");
  await userEvent.type(screen.getByLabelText("Amount (USD)"), "500000");
  await userEvent.type(screen.getByLabelText("Valuation cap (USD)"), "2000000");
  await screen.findByRole("button", { name: "Series B" });
  const chips = screen.getAllByRole("button", {
    name: /^(Founders|SAFE: Bill Gates|Seed|Series A|Series B)$/,
  });
  expect(chips.map((c) => c.textContent)).toEqual([
    "Founders",
    "SAFE: Bill Gates",
    "Seed",
    "Series A",
    "Series B",
  ]);
});

test("Save is disabled while a real step is refused", async () => {
  await openEmpty();
  await founders(["Steve Jobs", "Steve Wozniak"], "5000000");
  await screen.findByRole("heading", { name: "Founders" });
  expect(screen.getByRole("button", { name: "Save as my cap table" })).toBeEnabled();
  await add("SAFE");
  await userEvent.type(screen.getByLabelText("Investor"), "Bill Gates");
  await userEvent.type(screen.getByLabelText("Amount (USD)"), "50,");
  await screen.findByText(/whole/);
  expect(screen.getByRole("button", { name: "Save as my cap table" })).toBeDisabled();
});
