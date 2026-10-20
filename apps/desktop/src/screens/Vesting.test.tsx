import { appendEvents, builders, reduce } from "@capfolder/core";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { App } from "../App";
import { acmePlatform } from "../test/acme";

async function vesting(fp = acmePlatform()) {
  render(<App platform={fp.platform} />);
  await screen.findByText("Fully diluted");
  fireEvent.change(screen.getByLabelText("As of"), { target: { value: "2026-10-07" } });
  fireEvent.click(screen.getByRole("button", { name: "Vesting" }));
  await screen.findByRole("heading", { name: "Equity incentive pool" });
  return fp;
}

test("pool cards and one row per person on the sample company", async () => {
  await vesting();
  const card = (label: string) =>
    screen.getByText(label, { selector: ".meta" }).closest(".card")!.textContent;
  expect(card("Total pool")).toContain("1,000,000");
  expect(card("Total pool")).toContain("12.50% of company · 8,000,000 fully diluted");
  expect(card("Allocated")).toContain("80,000");
  expect(card("Allocated")).toContain("8.00% of pool · 2 people");
  expect(card("Vested")).toContain("10,000");
  expect(card("Vested")).toContain("12.50% of allocated");
  expect(card("Available to grant")).toContain("920,000");
  const rows = within(screen.getByRole("table"))
    .getAllByRole("row")
    .slice(1)
    .map((r) => r.textContent);
  expect(rows[0]).toContain("Steve Wozniak");
  expect(rows[0]).toContain("ISO40,00025%$0.127 Nov 2026+833 monthlySigned");
  expect(rows[1]).toContain("Bill Gates");
  expect(rows[1]).toContain("2 Mar 2027");
});

test("a row opens to the graph, key dates, prices and the person's documents", async () => {
  await vesting();
  fireEvent.click(screen.getByRole("button", { name: "Steve Wozniak details" }));
  expect(screen.getByRole("img", { name: /Vesting schedule for Steve Wozniak/ })).toBeInTheDocument();
  const details = screen.getByRole("region", { name: "Steve Wozniak" }).textContent;
  expect(details).toContain("Cliff7 Oct 2026");
  expect(details).toContain("Fully vested7 Oct 2029");
  expect(details).toContain("Option expiry7 Oct 2035");
  expect(details).toContain("FMV$0.42");
  expect(details).toContain("Exercise cost$1,200");
  expect(details).toContain("Vested value$4,200");
  expect(details).toContain("2025-10-07_steve-wozniak.pdf");
});

test("former employees are hidden until the switch is on", async () => {
  const fp = acmePlatform();
  const path = `${fp.root}/events.jsonl`;
  const log = await fp.platform.fs.readText(path);
  const s = reduce(
    log
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l)),
    "2026-11-07",
  );
  const drafts = builders.termination({ state: s, securityId: "OPT-1", date: "2026-11-07", reason: "Left" });
  const ctx = {
    now: () => new Date("2026-11-07T12:00:00Z"),
    newId: () => `evt_${Math.random()}`,
    deviceId: "d",
  };
  const r = await appendEvents(log, drafts, ctx);
  if (!r.ok) throw new Error(r.errors.join("; "));
  fp.fs.writeSync(path, log + r.text);
  await vesting(fp);
  fireEvent.change(screen.getByLabelText("As of"), { target: { value: "2026-12-01" } });
  expect(screen.queryByText("Steve Wozniak")).toBeNull();
  fireEvent.click(screen.getByLabelText("Show former employees"));
  fireEvent.click(screen.getByRole("button", { name: "Steve Wozniak details" }));
  const details = screen.getByRole("region", { name: "Steve Wozniak" }).textContent;
  expect(details).toContain("Vesting stopped7 Nov 2026");
  expect(details).toContain("Exercise by5 Feb 2027");
});

test("a new grant with a strike under the 409A price is flagged", async () => {
  await vesting();
  fireEvent.click(screen.getByRole("button", { name: "+ New grant" }));
  fireEvent.change(await screen.findByLabelText(/Strike price/), { target: { value: "0.10" } });
  expect(screen.getByText(/below the 409A price of \$0\.42/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/Strike price/), { target: { value: "0.42" } });
  expect(screen.queryByText(/below the 409A price/)).toBeNull();
});
