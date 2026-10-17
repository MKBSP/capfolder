import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test } from "vitest";
import { App } from "../App";
import { acmePlatform } from "../test/acme";

const reduceMotion = (on: boolean) => {
  window.matchMedia = ((q: string) => ({ matches: on && q.includes("reduce") })) as typeof window.matchMedia;
};
afterEach(() => {
  document.querySelector(".driver-popover")?.remove();
  delete (window as any).matchMedia;
});
const title = () => document.querySelector(".driver-popover-title")?.textContent;
const settingsOf = (fp: ReturnType<typeof acmePlatform>) =>
  JSON.parse(fp.fs.readSync("/appdata/settings.json"));

test("offered once on Home: six stops, no motion when reduced, focus comes back", async () => {
  reduceMotion(true);
  const fp = acmePlatform();
  render(<App platform={fp.platform} />);
  await userEvent.click(await screen.findByRole("button", { name: "Take the tour" }));
  await waitFor(() => expect(title()).toBe("Your company folder"));
  expect(document.body).toHaveClass("driver-simple");
  expect(settingsOf(fp).tourSeen).toBe(true);
  expect(screen.queryByRole("button", { name: "Take the tour" })).toBeNull();
  const seen = [title()];
  for (let i = 0; i < 5; i++) {
    await userEvent.click(document.querySelector<HTMLElement>(".driver-popover-next-btn")!);
    seen.push(title());
  }
  expect(seen).toEqual([
    "Your company folder",
    "Your cap table",
    "A holding",
    "Documents",
    "Signatures",
    "✦ Ask AI",
  ]);
  await userEvent.click(document.querySelector<HTMLElement>(".driver-popover-next-btn")!); // Done
  expect(document.querySelector(".driver-popover")).toBeNull();
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /^Acme Inc\./ })),
  );
});

test("No thanks is remembered; Settings → Take the tour still runs it, Esc closes", async () => {
  reduceMotion(false);
  const fp = acmePlatform();
  render(<App platform={fp.platform} />);
  await userEvent.click(await screen.findByRole("button", { name: "No thanks" }));
  expect(screen.queryByRole("button", { name: "Take the tour" })).toBeNull();
  expect(settingsOf(fp).tourSeen).toBe(true);
  await userEvent.click(screen.getByRole("button", { name: "Settings" }));
  await userEvent.click(await screen.findByRole("button", { name: "Take the tour" }));
  expect(await screen.findByText("Fully diluted")).toBeInTheDocument();
  expect(document.body).toHaveClass("driver-fade");
  await userEvent.keyboard("{Escape}");
  await waitFor(() => expect(document.querySelector(".driver-popover")).toBeNull());
});
