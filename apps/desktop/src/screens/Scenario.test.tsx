// F-39: Try a scenario. Steps on the left, the engine's table on the right; nothing is written.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { App } from "../App";
import { fakePlatform } from "../test/fakePlatform";

async function openEmpty() {
  const fp = fakePlatform();
  render(<App platform={fp.platform} />);
  await screen.findByRole("heading", { name: "Welcome to Capfolder" });
  await userEvent.click(screen.getByRole("button", { name: "Try a scenario" }));
  await screen.findByRole("heading", { name: "Try a scenario" });
  return fp;
}

test("Welcome offers Try a scenario; the screen opens with two empty founders and no table yet", async () => {
  await openEmpty();
  expect(screen.getAllByLabelText("Founder name")).toHaveLength(2);
  expect(screen.getByText("Name the founders and their shares to see the first table.")).toBeInTheDocument();
});
