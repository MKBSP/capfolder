import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { App } from "./App";
import { fakePlatform } from "./test/fakePlatform";

const mocks = vi.hoisted(() => ({ fail: false }));
vi.mock("@capfolder/vault", async (orig) => {
  const m = await orig<typeof import("@capfolder/vault")>();
  return {
    ...m,
    registerCompany: (...a: Parameters<typeof m.registerCompany>) =>
      mocks.fail ? Promise.reject(new Error("disk full")) : m.registerCompany(...a),
  };
});

async function createTestCo(fp: ReturnType<typeof fakePlatform>) {
  render(<App platform={fp.platform} />);
  await userEvent.click(await screen.findByLabelText("No lock"));
  await userEvent.click(screen.getByLabelText(/I accept the/));
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));
  await userEvent.click(await screen.findByRole("button", { name: "Skip for now" }));
  await userEvent.type(await screen.findByLabelText("Legal name"), "Test Co");
  await userEvent.type(screen.getByLabelText("Incorporated"), "2026-01-02");
  await userEvent.click(screen.getByRole("button", { name: "Create folder" }));
}

test("creating a company lists it in ~/.capfolder/companies.json", async () => {
  mocks.fail = false;
  const fp = fakePlatform();
  await createTestCo(fp);
  await screen.findByRole("button", { name: /Try the sample company/ });
  await vi.waitFor(() => {
    const r = JSON.parse(fp.fs.readSync("/home/me/.capfolder/companies.json"));
    expect(r.companies.map((c: { name: string }) => c.name)).toEqual(["Test Co"]);
  });
});

test("creating still succeeds when registerCompany rejects", async () => {
  mocks.fail = true;
  const fp = fakePlatform();
  await createTestCo(fp);
  expect(await screen.findByRole("button", { name: /Try the sample company/ })).toBeInTheDocument();
  expect(fp.fs.existsSync("/home/me/.capfolder/companies.json")).toBe(false);
});

test("the sample company is never registered", async () => {
  mocks.fail = false;
  const fp = fakePlatform();
  render(<App platform={fp.platform} />);
  await userEvent.click(await screen.findByRole("button", { name: "Try the sample company" }));
  await screen.findByText("Fully diluted");
  expect(fp.fs.existsSync("/home/me/.capfolder/companies.json")).toBe(false);
});

test("openCompany lists a normal vault, and still opens when registerCompany rejects", async () => {
  const { createVault } = await import("@capfolder/vault");
  const { builders } = await import("@capfolder/core");
  const { openCompany } = await import("./state");
  const ctx = { now: () => new Date(), newId: () => builders.newId("evt"), deviceId: "dev_t" };
  for (const fail of [false, true]) {
    mocks.fail = fail;
    const fp = fakePlatform();
    const v = await createVault(fp.fs, ctx, {
      parent: "/home/me/Documents",
      company: { name: "Open Co", formationDate: "2026-01-02", country: "US", subdivision: "DE" },
    } as never);
    const opened: unknown[] = [];
    const app = {
      platform: fp.platform,
      ctx,
      setSettings: async () => {},
      setVault: (x: unknown) => opened.push(x),
      go: () => {},
    };
    await openCompany(app as never, v.root);
    expect(opened).toHaveLength(1);
    if (!fail)
      await vi.waitFor(() => {
        const r = JSON.parse(fp.fs.readSync("/home/me/.capfolder/companies.json"));
        expect(r.companies).toEqual([{ name: expect.any(String), root: v.root }]);
      });
  }
});
