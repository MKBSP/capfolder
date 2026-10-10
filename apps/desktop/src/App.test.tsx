import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { App } from "./App";
import { fakePlatform } from "./test/fakePlatform";

test("first run with no vault starts at Welcome", async () => {
  render(<App platform={fakePlatform().platform} />);
  expect(await screen.findByText("Welcome to Capfolder")).toBeInTheDocument();
});

test("password lock: wrong then right", async () => {
  const { platform, fs } = fakePlatform({ password: "hunter2" });
  fs.writeSync(
    "/appdata/settings.json",
    JSON.stringify({
      deviceId: "dev_x",
      lock: "password",
      idleMinutes: 15,
      telemetry: true,
      recentVaults: [],
    }),
  );
  render(<App platform={platform} />);
  const input = await screen.findByLabelText("App password");
  await userEvent.type(input, "nope{Enter}");
  expect(await screen.findByText("That's not it. Try again.")).toBeInTheDocument();
  await userEvent.clear(input);
  await userEvent.type(input, "hunter2{Enter}");
  expect(await screen.findByText("Welcome to Capfolder")).toBeInTheDocument();
});

test("first run: no lock → skip email → create company → start choice → wizard", async () => {
  const { platform, fs } = fakePlatform();
  render(<App platform={platform} />);
  await userEvent.click(await screen.findByLabelText("No lock"));
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));
  await userEvent.click(await screen.findByRole("button", { name: "Skip for now" }));
  await userEvent.type(await screen.findByLabelText("Legal name"), "Test Co");
  await userEvent.type(screen.getByLabelText("Incorporated"), "2026-01-02");
  await userEvent.click(screen.getByRole("button", { name: "Create folder" }));
  expect(await screen.findByText("How do you want to start?")).toBeInTheDocument();
  expect(fs.existsSync("/home/me/Documents/Test Co/events.jsonl")).toBe(true);
  expect(JSON.parse(fs.readSync("/appdata/settings.json")).recentVaults[0].name).toBe("Test Co");
  await userEvent.click(screen.getByRole("button", { name: /Start from zero/ }));
  expect(await screen.findByText(/wizard|Authorized shares/)).toBeInTheDocument();
});
test("passwords must match", async () => {
  render(<App platform={fakePlatform().platform} />);
  await userEvent.type(await screen.findByLabelText("App password"), "abcd");
  await userEvent.type(screen.getByLabelText("Again"), "abce");
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(await screen.findByText("The passwords don't match.")).toBeInTheDocument();
});

test("a password set during first run is enforced by the idle lock in the same session", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    const { platform } = fakePlatform();
    render(<App platform={platform} />);
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.type(await screen.findByLabelText("App password"), "abcd");
    await user.type(screen.getByLabelText("Again"), "abcd");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText(/Your email/)).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(16 * 60_000));
    expect(await screen.findByText("Capfolder is locked")).toBeInTheDocument();
  } finally {
    vi.useRealTimers();
  }
});
