// Regression tests for the M3 final-review findings.
import { builders as b, verifyChain } from "@capfolder/core";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Profiler } from "react";
import { describe, expect, test, vi } from "vitest";
import { App } from "./App";
import { backupStatus } from "./backup";
import { MemoryFs } from "./fs/memory";
import { baseName, parentOf } from "./fs/types";
import { acmePlatform } from "./test/acme";
import { fakePlatform } from "./test/fakePlatform";
import { appendToVault, attachDocument, createVault, openVault, removeDocument } from "./vault";

let i = 0;
const ctx = {
  now: () => new Date("2026-10-09T12:00:00Z"),
  newId: () => `evt_R${String(i++).padStart(6, "0")}`,
  deviceId: "d",
};
const company = { name: "Co", formationDate: "2026-01-02", type: "DE_CCORP" as const };

describe("critical: concurrent saves", () => {
  test("two appends at once never break the chain", async () => {
    const fs = new MemoryFs();
    const v = await createVault(fs, ctx, { parent: "/d", company });
    const [r1, r2] = await Promise.all([
      appendToVault(fs, v, [b.stakeholder({ name: "A", type: "INDIVIDUAL" })], ctx),
      appendToVault(fs, v, [b.stakeholder({ name: "B", type: "INDIVIDUAL" })], ctx),
    ]);
    expect([r1.ok, r2.ok].filter(Boolean)).toHaveLength(1);
    expect((await verifyChain(fs.readSync("/d/Co/events.jsonl"))).ok).toBe(true);
  });
  test("a double-click on Record as signed records one SAFE", async () => {
    const fp = acmePlatform();
    render(<App platform={fp.platform} />);
    await screen.findByText("Fully diluted");
    await userEvent.click(screen.getByRole("button", { name: "+ New" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "SAFE" }));
    await userEvent.type(screen.getByLabelText("Name"), "Fund Y");
    await userEvent.type(screen.getByLabelText("Amount (USD)"), "200000");
    await screen.findByText(/Fund Y ≈/);
    const btn = screen.getByRole("button", { name: "Record as signed" });
    fireEvent.click(btn);
    fireEvent.click(btn);
    await screen.findByRole("dialog");
    const log = fp.fs.readSync(`${fp.root}/events.jsonl`);
    expect((await verifyChain(log)).ok).toBe(true);
    expect(
      log.split("\n").filter((l) => l.includes('"TX_CONVERTIBLE_ISSUANCE"') && l.includes("200000")),
    ).toHaveLength(1);
  });
});

describe("important: read-only means no file changes", () => {
  async function brokenVault() {
    const fs = new MemoryFs();
    const v = await createVault(fs, ctx, { parent: "/d", company });
    const a = await attachDocument(fs, v, ctx, {
      originalName: "x.pdf",
      bytes: new TextEncoder().encode("one"),
      docType: "other",
      date: "2026-01-02",
      person: "co",
    });
    if (a.ok !== true) throw new Error("attach");
    const lines = fs.readSync("/d/Co/events.jsonl").split("\n");
    lines[1] = lines[1]!.replace('"Co"', '"Evil"');
    fs.writeSync("/d/Co/events.jsonl", lines.join("\n"));
    const o = await openVault(fs, "/d/Co", ctx);
    expect(o.broken).toBeDefined();
    return { fs, o, full: a.vault, docId: a.vault.events.at(-1)!.data.doc_id as string };
  }
  test("attach on a broken vault writes no file", async () => {
    const { fs, o } = await brokenVault();
    const before = await fs.list("/d/Co/docs/company");
    const r = await attachDocument(fs, o, ctx, {
      originalName: "y.pdf",
      bytes: new TextEncoder().encode("two"),
      docType: "other",
      date: "2026-01-02",
      person: "co",
    });
    expect(r.ok).toBe(false);
    expect(await fs.list("/d/Co/docs/company")).toEqual(before);
    expect(await fs.list("/d/Co/docs/_removed")).toEqual([]);
  });
  test("remove on a broken vault moves nothing", async () => {
    const { fs, o, full, docId } = await brokenVault();
    const r = await removeDocument(fs, { ...full, broken: o.broken }, ctx, docId);
    expect(r.ok).toBe(false);
    expect(await fs.list("/d/Co/docs/_removed")).toEqual([]);
  });
});

describe("important: app lock", () => {
  test("the idle lock keeps where you were", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { platform } = fakePlatform();
      render(<App platform={platform} />);
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      await user.type(await screen.findByLabelText("App password"), "abcd");
      await user.type(screen.getByLabelText("Again"), "abcd");
      await user.click(screen.getByLabelText(/I accept the/));
      await user.click(screen.getByRole("button", { name: "Continue" }));
      await screen.findByText(/Your email/);
      await act(() => vi.advanceTimersByTimeAsync(16 * 60_000));
      await user.type(await screen.findByLabelText("App password"), "abcd{Enter}");
      expect(await screen.findByText(/Your email/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
  test("a removed keychain item unlocks instead of locking you out", async () => {
    const { platform, fs } = fakePlatform(); // keychain is empty
    fs.writeSync(
      "/appdata/settings.json",
      JSON.stringify({ deviceId: "d", lock: "password", idleMinutes: 15, telemetry: true, recentVaults: [] }),
    );
    render(<App platform={platform} />);
    expect(await screen.findByText("Welcome to Capfolder")).toBeInTheDocument();
    expect(JSON.parse(fs.readSync("/appdata/settings.json")).lock).toBe("none");
  });
  test("a keychain failure is shown, not swallowed", async () => {
    const { platform } = fakePlatform();
    platform.lock.set = async () => {
      throw new Error("No secret service available");
    };
    render(<App platform={platform} />);
    await userEvent.type(await screen.findByLabelText("App password"), "abcd");
    await userEvent.type(screen.getByLabelText("Again"), "abcd");
    await userEvent.click(screen.getByLabelText(/I accept the/));
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(
      await screen.findByText("Couldn't save the password in the keychain: No secret service available"),
    ).toBeInTheDocument();
  });
});

test("important: the option pool form settles after typing (no render loop)", async () => {
  let commits = 0;
  const fp = acmePlatform();
  render(
    <Profiler id="app" onRender={() => commits++}>
      <App platform={fp.platform} />
    </Profiler>,
  );
  await screen.findByText("Fully diluted");
  await userEvent.click(screen.getByRole("button", { name: "+ New" }));
  await userEvent.click(screen.getByRole("menuitem", { name: "Option pool" }));
  await userEvent.type(screen.getByLabelText(/^New total reserved/), "1500000");
  await screen.findByText(/Pool available after this/);
  await new Promise((r) => setTimeout(r, 300));
  const settled = commits;
  await new Promise((r) => setTimeout(r, 300));
  expect(commits - settled).toBe(0);
});

describe("important: Windows paths", () => {
  test("parentOf and baseName understand backslashes and stop at the root", () => {
    expect(parentOf("C:\\Users\\me\\Documents/Acme")).toBe("C:\\Users\\me\\Documents");
    expect(parentOf("C:\\Users")).toBe("C:");
    expect(parentOf("C:")).toBe("C:");
    expect(baseName("C:\\Users\\me\\Documents/Acme")).toBe("Acme");
    expect(baseName("C:\\Users\\me\\Acme Inc")).toBe("Acme Inc");
  });
  test("backup detection terminates on a Windows path", async () => {
    let calls = 0;
    const r = await backupStatus("C:\\Users\\me\\Documents/Acme", async () => {
      calls++;
      return false;
    });
    expect(r).toEqual({ backedUp: false });
    expect(calls).toBeLessThan(10);
  });
});
