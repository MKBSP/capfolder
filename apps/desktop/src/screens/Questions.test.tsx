import { builders } from "@capfolder/core";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { App } from "../App";
import { fakePlatform } from "../test/fakePlatform";
import { createVault } from "../vault";

/** A new, empty company that has just been created: boots into Home. */
async function newCo() {
  const fp = fakePlatform();
  const ctx = { now: () => new Date(), newId: () => builders.newId("evt"), deviceId: "dev_t" };
  const v = await createVault(fp.fs, ctx, {
    parent: "/home/me/Documents/capfolder",
    company: { name: "New Co", formationDate: "2026-01-02" },
  });
  fp.fs.writeSync(
    "/appdata/settings.json",
    JSON.stringify({ deviceId: "dev_t", lock: "none", recentVaults: [{ name: "New Co", root: v.root }] }),
  );
  render(<App platform={fp.platform} />);
  await screen.findByText("Fully diluted");
  const settings = () => JSON.parse(fp.fs.readSync("/appdata/settings.json"));
  return { ...fp, root: v.root, settings };
}

test("after StartChoice: three yes/no questions, saved per company, then the chosen path", async () => {
  const fp = await newCo();
  await userEvent.click(screen.getByRole("button", { name: /^New Co/ }));
  await userEvent.click(screen.getByRole("menuitem", { name: "Add a company…" }));
  await userEvent.type(await screen.findByLabelText("Legal name"), "Two Co");
  await userEvent.type(screen.getByLabelText("Incorporated"), "2026-01-02");
  await userEvent.click(screen.getByRole("button", { name: "Create folder" }));
  await userEvent.click(await screen.findByRole("button", { name: /Start from zero/ }));
  expect(await screen.findByText("Three quick questions")).toBeInTheDocument();
  await userEvent.click(
    within(screen.getByRole("group", { name: "Do you have SAFEs or convertible notes?" })).getByLabelText(
      "No",
    ),
  );
  await userEvent.click(
    within(screen.getByRole("group", { name: "Do you have an option pool?" })).getByLabelText("Yes"),
  );
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(await screen.findByText(/Authorized shares/)).toBeInTheDocument();
  const s = fp.settings();
  expect(s.onboarding[s.recentVaults[0].root]).toEqual({ safes: false, pool: true });
});

test("the questions can be skipped, and changed later from Get started", async () => {
  const fp = await newCo();
  const card = screen.getByRole("group", { name: /Get started/ });
  expect(within(card).getByText("SAFEs")).toBeInTheDocument();
  await userEvent.click(within(card).getByRole("button", { name: "Change my answers" }));
  await userEvent.click(
    within(screen.getByRole("group", { name: "Do you have SAFEs or convertible notes?" })).getByLabelText(
      "No",
    ),
  );
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));
  const again = await screen.findByRole("group", { name: /Get started/ });
  expect(within(again).queryByText("SAFEs")).toBeNull();
  expect(fp.settings().onboarding[fp.root]).toEqual({ safes: false });

  await userEvent.click(within(again).getByRole("button", { name: "Change my answers" }));
  expect(
    within(screen.getByRole("group", { name: "Do you have SAFEs or convertible notes?" })).getByLabelText(
      "No",
    ),
  ).toBeChecked();
  await userEvent.click(screen.getByRole("button", { name: "Skip" }));
  expect(await screen.findByText("Fully diluted")).toBeInTheDocument();
  expect(fp.settings().onboarding[fp.root]).toEqual({ safes: false });
});
