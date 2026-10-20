import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { captableCsv, toOcfExport, zip } from "@capfolder/core";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { App } from "../App";
import { acmePlatform } from "../test/acme";
import { fakePlatform } from "../test/fakePlatform";
import { appendToVault, createVault, importIntoVault, openVault } from "../vault";

const FIX = resolve(process.cwd(), "../../fixtures");
const acmeEvents = () =>
  readFileSync(resolve(FIX, "acme-vault/events.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
let i = 0;
const ctx = {
  now: () => new Date("2026-10-10T12:00:00Z"),
  newId: () => `evt_T${String(i++).padStart(6, "0")}`,
  deviceId: "d",
};
const strip = (s: string) =>
  s
    .split("\n")
    .map((l) => l.replace(/,[^,]*$/, ""))
    .join("\n");

/** A brand-new company folder (only the issuer), open in the app. */
async function freshVault(file: { name: string; bytes: Uint8Array | string }) {
  const fp = fakePlatform({ pickFile: { path: `/home/me/Downloads/${file.name}`, name: file.name } });
  fp.fs.writeSync(`/home/me/Downloads/${file.name}`, file.bytes);
  const v = await createVault(fp.fs, ctx, {
    parent: "/home/me/Documents",
    company: { name: "Acme Inc.", formationDate: "2021-09-14", type: "DE_CCORP" },
  });
  fp.fs.writeSync(
    "/appdata/settings.json",
    JSON.stringify({
      deviceId: "d",
      lock: "none",
      idleMinutes: 15,
      telemetry: true,
      recentVaults: [{ name: "Acme Inc.", root: v.root }],
      termsAccepted: "x",
    }),
  );
  render(<App platform={fp.platform} />);
  await userEvent.click(await screen.findByRole("button", { name: "Import a cap table" }));
  return { ...fp, root: v.root };
}

test("import an OCF export into a new company folder", async () => {
  const ocf = zip(toOcfExport(acmeEvents(), { asOf: "2026-10-07", generatedAt: "2026-10-10T00:00:00Z" }));
  const fp = await freshVault({ name: "acme-ocf.zip", bytes: ocf });
  await userEvent.click(screen.getByLabelText(/An OCF export/));
  await userEvent.click(screen.getByRole("button", { name: "Choose file…" }));
  expect(await screen.findByText("8,000,000")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Save to the cap table" }));
  expect(await screen.findByText(/Reports don't include signed documents/)).toBeInTheDocument();
  const today = new Date().toISOString().slice(0, 10); // captable.csv is written as of today
  expect(strip(fp.fs.readSync(`${fp.root}/captable.csv`))).toBe(strip(captableCsv(acmeEvents(), today)));
  expect(await fp.fs.list(`${fp.root}/docs/_imports`)).toEqual([`${today}_acme-ocf.zip`]);
});

test("import a spreadsheet: map columns, totals must match or be accepted with a note", async () => {
  const fp = await freshVault({
    name: "pulley.csv",
    bytes: readFileSync(resolve(FIX, "import/acme-generic.csv"), "utf8"),
  });
  await userEvent.click(screen.getByLabelText(/Any spreadsheet/));
  await userEvent.click(screen.getByRole("button", { name: "Choose file…" }));
  expect(await screen.findByLabelText("Column: Stakeholder")).toHaveValue("name");
  expect(screen.getByLabelText("Column: Vesting period (months)")).toHaveValue("vestingMonths");
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));
  const save = await screen.findByRole("button", { name: "Save to the cap table" });
  expect(save).toBeDisabled();
  await userEvent.type(screen.getByLabelText(/^Fully diluted in your old tool/), "8,000,001");
  expect(
    screen.getByText("Fully diluted is 8,000,000 here but 8,000,001 in your old tool (1 short)"),
  ).toBeInTheDocument();
  expect(save).toBeDisabled();
  await userEvent.click(screen.getByLabelText(/Accept with a note/));
  await userEvent.type(screen.getByLabelText("Note"), "Old tool counted a cancelled grant");
  expect(save).toBeEnabled();
  await userEvent.click(save);
  expect(await screen.findByText(/Reports don't include signed documents/)).toBeInTheDocument();
  const log = fp.fs.readSync(`${fp.root}/events.jsonl`);
  expect(log).toContain('"source":"import:pulley.csv"');
  expect(log).toContain("Old tool counted a cancelled grant");
  expect(fp.fs.readSync(`${fp.root}/captable.csv`)).toContain("Tim Apple,common,Common,4000000,50.00");
});

test("a spreadsheet with problems lists them per row and can't be saved", async () => {
  await freshVault({ name: "bad.csv", bytes: "Name,Type,Shares,Strike\nWoz,Option,100,\n" });
  await userEvent.click(screen.getByLabelText(/Any spreadsheet/));
  await userEvent.click(screen.getByRole("button", { name: "Choose file…" }));
  await userEvent.click(await screen.findByRole("button", { name: "Continue" }));
  expect(await screen.findByText("Row 2 (Woz): strike price missing")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Save to the cap table" })).toBeDisabled();
});

test("a company folder that already has a cap table is refused", async () => {
  const fp = acmePlatform();
  const v = await openVault(fp.fs, fp.root, ctx);
  const r = await importIntoVault(fp.fs, v, { drafts: [], fileName: "x.csv", bytes: new Uint8Array() }, ctx);
  expect(r).toEqual({
    ok: false,
    errors: [
      "Import works on a new company folder, and this one already has a cap table. Create a new company first.",
    ],
  });
  render(<App platform={fp.platform} />);
  await screen.findByText("Fully diluted");
  expect(screen.queryByRole("button", { name: "Import a cap table" })).toBeNull();
});

test("M2 review: a folder with only a share class or pool is not 'new'; odd file names are kept safely", async () => {
  const { MemoryFs } = await import("../fs/memory");
  const { builders: bl } = await import("@capfolder/core");
  const fs = new MemoryFs();
  const v = await createVault(fs, ctx, {
    parent: "/d",
    company: { name: "Co", formationDate: "2026-01-02", type: "DE_CCORP" },
  });
  const withClass = await appendToVault(
    fs,
    v,
    [bl.stockClass({ name: "Common", authorized: "100", parValue: "0.0001" })],
    ctx,
  );
  if (!withClass.ok) throw new Error("setup");
  const refused = await importIntoVault(
    fs,
    withClass.vault,
    { drafts: [], fileName: "x.csv", bytes: new Uint8Array() },
    ctx,
  );
  expect(refused.ok).toBe(false);

  const fresh = await createVault(fs, ctx, {
    parent: "/e",
    company: { name: "Co", formationDate: "2026-01-02", type: "DE_CCORP" },
  });
  const ok = await importIntoVault(
    fs,
    fresh,
    { drafts: [], fileName: 'cap*table?"<v2>.csv', bytes: new Uint8Array([1]) },
    ctx,
  );
  expect(ok.ok).toBe(true);
  expect(await fs.list("/e/Co/docs/_imports")).toEqual([
    `${new Date("2026-10-10T12:00:00Z").toISOString().slice(0, 10)}_cap_table___v2_.csv`,
  ]);
});

test("M2 review: clearing the old tool's total after accepting re-blocks the save", async () => {
  await freshVault({ name: "p.csv", bytes: readFileSync(resolve(FIX, "import/acme-generic.csv"), "utf8") });
  await userEvent.click(screen.getByLabelText(/Any spreadsheet/));
  await userEvent.click(screen.getByRole("button", { name: "Choose file…" }));
  await userEvent.click(await screen.findByRole("button", { name: "Continue" }));
  const total = screen.getByLabelText(/^Fully diluted in your old tool/);
  await userEvent.type(total, "1");
  await userEvent.click(screen.getByLabelText(/Accept with a note/));
  await userEvent.type(screen.getByLabelText("Note"), "x");
  expect(screen.getByRole("button", { name: "Save to the cap table" })).toBeEnabled();
  await userEvent.clear(total);
  expect(screen.getByRole("button", { name: "Save to the cap table" })).toBeDisabled();
});

test("from Pulley: compare every total with Pulley, then Home shows Before you cancel Pulley", async () => {
  const fp = await freshVault({
    name: "p.csv",
    bytes: readFileSync(resolve(FIX, "import/acme-generic.csv"), "utf8"),
  });
  await userEvent.click(screen.getByRole("button", { name: "Choose file…" })); // Pulley is the default source
  await userEvent.click(await screen.findByRole("button", { name: "Continue" }));
  expect(screen.getByRole("heading", { name: "Compare with Pulley" })).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText("Fully diluted in Pulley"), "8,000,000");
  await userEvent.type(screen.getByLabelText("Pool available in Pulley"), "900,000");
  expect(
    screen.getByText(/Pool available is 920,000 here but 900,000 in Pulley \(20,000 over\)/),
  ).toBeInTheDocument();
  await userEvent.click(screen.getByLabelText(/Accept with a note/));
  await userEvent.type(screen.getByLabelText("Note"), "Pulley counts a returned grant");
  await userEvent.click(screen.getByRole("button", { name: "Save to the cap table" }));
  await screen.findByText(/Reports don't include signed documents/);
  await userEvent.click(screen.getByRole("button", { name: "Cap table" }));
  const card = await screen.findByRole("region", { name: "Before you cancel Pulley" });
  expect(card).toHaveTextContent("Totals checked (saved with a note)");
  expect(card).toHaveTextContent(/Data Room → Download All/);
  expect(card).toHaveTextContent(/days left/);
  await userEvent.click(screen.getByLabelText("Last 409A report saved"));
  expect(JSON.parse(fp.fs.readSync("/appdata/settings.json")).onboarding[fp.root]).toMatchObject({
    movedFrom: "pulley",
    tie: "note",
    moveTicks: { "409a": true },
  });
});

test("from Carta: the wording says Carta, with no Pulley deadline", async () => {
  await freshVault({ name: "c.csv", bytes: readFileSync(resolve(FIX, "import/acme-generic.csv"), "utf8") });
  await userEvent.click(screen.getByLabelText("Carta"));
  await userEvent.click(screen.getByRole("button", { name: "Choose file…" }));
  await userEvent.click(await screen.findByRole("button", { name: "Continue" }));
  expect(screen.getByRole("heading", { name: "Compare with Carta" })).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText("Fully diluted in Carta"), "8,000,000");
  await userEvent.click(screen.getByRole("button", { name: "Save to the cap table" }));
  await screen.findByText(/Reports don't include signed documents/);
  await userEvent.click(screen.getByRole("button", { name: "Cap table" }));
  const card = await screen.findByRole("region", { name: "Before you cancel Carta" });
  expect(card).toHaveTextContent("Totals checked against Carta");
  expect(card).not.toHaveTextContent(/Pulley|days left/);
});
