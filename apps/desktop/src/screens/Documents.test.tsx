import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { App } from "../App";
import { acmePlatform } from "../test/acme";

test("attach the missing Fund X SAFE, then remove it again", async () => {
  const fp = acmePlatform({ pickFile: { path: "/home/me/Downloads/scan_0042.pdf", name: "scan_0042.pdf" } });
  fp.fs.writeSync("/home/me/Downloads/scan_0042.pdf", "%PDF-1.4 fund x safe");
  render(<App platform={fp.platform} />);
  await userEvent.click(await screen.findByRole("button", { name: "Documents" }));
  expect(await screen.findByText("3 / 16")).toBeInTheDocument();
  const row = screen.getByText("Fund X · $250k").closest(".row") as HTMLElement;
  await userEvent.click(within(row).getByRole("button", { name: "Attach" }));
  const dialog = screen.getByRole("dialog");
  await userEvent.click(within(dialog).getByRole("button", { name: "Choose file…" }));
  expect(within(dialog).getByText("scan_0042.pdf")).toBeInTheDocument();
  expect(within(dialog).getByLabelText("What is it?")).toHaveValue("safe");
  await userEvent.click(within(dialog).getByRole("button", { name: "Attach" }));
  expect(await screen.findByText("4 / 16")).toBeInTheDocument();
  expect(fp.fs.existsSync(`${fp.root}/docs/safes/2023-03-14_fund-x_safe.pdf`)).toBe(true);

  const filed = screen.getByText("docs/safes/2023-03-14_fund-x_safe.pdf").closest(".row") as HTMLElement;
  await userEvent.click(within(filed).getByRole("button", { name: "Remove" }));
  expect(
    screen.getByText("This is the only signed document for Fund X · $250k. Removing it will show a gap."),
  ).toBeInTheDocument();
  await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Remove" }));
  expect(await screen.findByText("3 / 16")).toBeInTheDocument();
  expect(fp.fs.existsSync(`${fp.root}/docs/_removed/2023-03-14_fund-x_safe.pdf`)).toBe(true);
});
