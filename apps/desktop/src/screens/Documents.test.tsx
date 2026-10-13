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

  const filed = screen
    .getAllByText("docs/safes/2023-03-14_fund-x_safe.pdf")[0]!
    .closest(".row") as HTMLElement;
  await userEvent.click(within(filed).getByRole("button", { name: "Remove" }));
  expect(
    screen.getByText("This is the only signed document for Fund X · $250k. Removing it will show a gap."),
  ).toBeInTheDocument();
  await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Remove" }));
  expect(await screen.findByText("3 / 16")).toBeInTheDocument();
  expect(fp.fs.existsSync(`${fp.root}/docs/_removed/2023-03-14_fund-x_safe.pdf`)).toBe(true);
});

test("every filed document is listed; rename it, then replace it with the signed copy", async () => {
  const fp = acmePlatform({ pickFile: { path: "/home/me/Downloads/yc-signed.pdf", name: "yc-signed.pdf" } });
  fp.fs.writeSync(`${fp.root}/docs/safes/2022-01-10_y-combinator.pdf`, "%PDF-1.4 yc draft");
  fp.fs.writeSync("/home/me/Downloads/yc-signed.pdf", "%PDF-1.4 yc signed");
  render(<App platform={fp.platform} />);
  await userEvent.click(await screen.findByRole("button", { name: "Documents" }));
  const list = within(await screen.findByRole("region", { name: "All documents" }));
  const row = list.getByText("docs/safes/2022-01-10_y-combinator.pdf").closest(".row") as HTMLElement;
  await userEvent.click(within(row).getByRole("button", { name: "Rename…" }));
  const name = within(screen.getByRole("dialog")).getByLabelText(/^File name/);
  await userEvent.clear(name);
  await userEvent.type(name, "YC SAFE");
  await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Rename" }));
  expect(await list.findByText("docs/safes/YC SAFE.pdf")).toBeInTheDocument();
  expect(fp.fs.existsSync(`${fp.root}/docs/safes/YC SAFE.pdf`)).toBe(true);

  const renamed = list.getByText("docs/safes/YC SAFE.pdf").closest(".row") as HTMLElement;
  await userEvent.click(within(renamed).getByRole("button", { name: "Replace…" }));
  await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Choose file…" }));
  await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Replace" }));
  expect(await list.findByText("docs/safes/YC SAFE.pdf")).toBeInTheDocument();
  expect(fp.fs.readSync(`${fp.root}/docs/safes/YC SAFE.pdf`)).toBe("%PDF-1.4 yc signed");
  expect(fp.fs.existsSync(`${fp.root}/docs/_removed/YC SAFE.pdf`)).toBe(true);
});

test("a missing document links to a free template; Series Seed copies into drafts/", async () => {
  const fp = acmePlatform();
  render(<App platform={fp.platform} />);
  await userEvent.click(await screen.findByRole("button", { name: "Documents" }));
  const bylaws = (await screen.findByText("Bylaws")).closest(".row") as HTMLElement;
  await userEvent.click(within(bylaws).getByRole("button", { name: "Get a template" }));
  expect(fp.opened).toEqual(["https://www.cooleygo.com/documents/"]);
  const fundX = screen.getByText("Fund X · $250k").closest(".row") as HTMLElement;
  await userEvent.click(within(fundX).getByRole("button", { name: "Get a template" }));
  expect(fp.opened.at(-1)).toBe("https://www.ycombinator.com/documents");

  const card = screen.getByRole("region", { name: "Templates" });
  await userEvent.click(within(card).getByRole("button", { name: "Copy Series Seed to drafts/" }));
  const ts = fp.fs.readSync(`${fp.root}/drafts/series-seed/Series Seed - Term Sheet.md`);
  expect(ts).toContain("SERIES SEED PREFERRED STOCK");
  expect(fp.fs.existsSync(`${fp.root}/drafts/series-seed/SOURCE.md`)).toBe(true);
  expect(await within(card).findByText(/Copied 4 files to drafts\/series-seed/)).toBeInTheDocument();
});
