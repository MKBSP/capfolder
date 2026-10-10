import { unzip } from "@capfolder/core";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { App } from "../App";

const strFromU8 = (b: Uint8Array) => new TextDecoder().decode(b);

import { acmePlatform } from "../test/acme";

async function openExport() {
  const fp = acmePlatform();
  render(<App platform={fp.platform} />);
  await screen.findByText("Fully diluted");
  fireEvent.change(screen.getByLabelText("As of"), { target: { value: "2026-10-07" } });
  await userEvent.click(screen.getByRole("button", { name: "Export" }));
  return { fp, dialog: screen.getByRole("dialog") };
}

test("export .xlsx as of a date", async () => {
  const { fp, dialog } = await openExport();
  expect(within(dialog).getByLabelText("As of")).toHaveValue("7 Oct 2026");
  await userEvent.click(within(dialog).getByRole("button", { name: "Save…" }));
  const bytes = fp.savedBytes["acme-inc-cap-table-2026-10-07.xlsx"]!;
  expect(strFromU8(unzip(bytes)["xl/workbook.xml"]!)).toContain('name="Vesting"');
  expect(
    await screen.findByText("/home/me/Downloads/acme-inc-cap-table-2026-10-07.xlsx"),
  ).toBeInTheDocument();
});

test("export OCF and CSV", async () => {
  const { fp, dialog } = await openExport();
  await userEvent.click(within(dialog).getByLabelText(/OCF/));
  await userEvent.click(within(dialog).getByRole("button", { name: "Save…" }));
  const ocf = unzip(fp.savedBytes["acme-inc-ocf-2026-10-07.zip"]!);
  expect(Object.keys(ocf)).toContain("Manifest.ocf.json");
  await userEvent.click(screen.getByRole("button", { name: "Export" }));
  await userEvent.click(within(screen.getByRole("dialog")).getByLabelText(/CSV/));
  await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Save…" }));
  expect(fp.saved["acme-inc-cap-table-2026-10-07.csv"]).toMatch(/^stakeholder,type,class/);
});

test("a date before the company existed is blocked", async () => {
  const { fp, dialog } = await openExport();
  fireEvent.change(within(dialog).getByLabelText("As of"), { target: { value: "2020-01-01" } });
  await userEvent.click(within(dialog).getByRole("button", { name: "Save…" }));
  expect(await within(dialog).findByText(/The company didn't exist yet on 1 Jan 2020/)).toBeInTheDocument();
  expect(Object.keys(fp.savedBytes)).toEqual([]);
});

test("share with lawyer: everything, then one person", async () => {
  const fp = acmePlatform();
  fp.fs.writeSync(`${fp.root}/docs/safes/2022-01-10_y-combinator.pdf`, "%PDF yc");
  render(<App platform={fp.platform} />);
  await screen.findByText("Fully diluted");
  fireEvent.change(screen.getByLabelText("As of"), { target: { value: "2026-10-07" } });
  await userEvent.click(screen.getByRole("button", { name: "Documents" }));
  await userEvent.click(await screen.findByRole("button", { name: "Share with lawyer (.zip)" }));
  let dialog = screen.getByRole("dialog");
  await userEvent.click(within(dialog).getByRole("button", { name: "Build zip…" }));
  const all = unzip(fp.savedBytes["acme-inc-for-lawyer-2026-10-07.zip"]!);
  expect(strFromU8(all["documents/docs/safes/2022-01-10_y-combinator.pdf"]!)).toBe("%PDF yc");
  expect(strFromU8(all["README.txt"]!)).toContain("Missing file: docs/safes/2023-02-20_angel-a.pdf");
  expect(Object.keys(all)).toContain("events.jsonl");

  expect(
    await screen.findByText("/home/me/Downloads/acme-inc-for-lawyer-2026-10-07.zip"),
  ).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Share with lawyer (.zip)" }));
  dialog = screen.getByRole("dialog");
  await userEvent.click(within(dialog).getByLabelText(/One person/));
  await userEvent.selectOptions(within(dialog).getByLabelText("Person"), "Lisa Moreau");
  await userEvent.click(within(dialog).getByRole("button", { name: "Build zip…" }));
  const lisa = unzip(fp.savedBytes["acme-inc-lisa-moreau-for-lawyer-2026-10-07.zip"]!);
  expect(Object.keys(lisa)).not.toContain("events.jsonl");
  expect(strFromU8(lisa["whats-missing.txt"]!)).toContain("Lisa Moreau");
});
