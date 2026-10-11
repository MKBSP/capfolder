import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { App } from "../App";
import { acmePlatform } from "../test/acme";

test("turn the password lock on from Settings", async () => {
  const fp = acmePlatform();
  render(<App platform={fp.platform} />);
  await userEvent.click(await screen.findByRole("button", { name: "Settings" }));
  await userEvent.type(screen.getByLabelText("New app password"), "abcd");
  await userEvent.type(screen.getByLabelText("Again"), "abcd");
  await userEvent.click(screen.getByRole("button", { name: "Turn on password lock" }));
  expect(await screen.findByText("Password saved.")).toBeInTheDocument();
  expect(await fp.platform.lock.verify("abcd")).toBe(true);
  expect(JSON.parse(fp.fs.readSync("/appdata/settings.json")).lock).toBe("password");
});

test("every screen in the nav renders", async () => {
  render(<App platform={acmePlatform().platform} />);
  for (const [nav, text] of [
    ["People", "Lisa Moreau"],
    ["Documents", "Due-diligence ready"],
    ["Signatures", /documents waiting for signatures/],
    ["Settings", "App lock"],
    ["Cap table", "Fully diluted"],
  ] as const) {
    await userEvent.click(await screen.findByRole("button", { name: nav }));
    expect((await screen.findAllByText(text)).length).toBeGreaterThan(0);
  }
});

test("Settings → AI finds a local Ollama and uses the chosen model for sorting (F-10)", async () => {
  const fp = acmePlatform({
    relay: {
      fetch: async (url: string) =>
        url === "http://localhost:11434/api/tags"
          ? new Response(JSON.stringify({ models: [{ name: "llama3.1:8b" }] }))
          : Promise.reject(new TypeError("Failed to fetch")),
    },
  });
  render(<App platform={fp.platform} />);
  await userEvent.click(await screen.findByRole("button", { name: "Settings" }));
  expect(await screen.findByText(/LM Studio/)).toBeInTheDocument();
  expect(await screen.findByText(/Not running\. Install it from https:\/\/lmstudio\.ai/)).toBeInTheDocument();
  await userEvent.selectOptions(await screen.findByLabelText("Ollama model"), "llama3.1:8b");
  expect(JSON.parse(fp.fs.readSync("/appdata/settings.json")).ai).toEqual({
    provider: "ollama",
    model: "llama3.1:8b",
    sortWithAi: true,
  });
  expect(screen.getByRole("checkbox", { name: "Use AI when sorting documents" })).toBeChecked();
});
