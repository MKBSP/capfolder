import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { App } from "./App";
import { acmePlatform } from "./test/acme";

test("Connect your AI shows each command, a Copy button, and ChatGPT as Coming", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  const fp = acmePlatform();
  render(<App platform={fp.platform} />);
  await userEvent.click(await screen.findByRole("button", { name: "Settings" }));
  expect(screen.getByRole("heading", { name: "Connect your AI" })).toBeInTheDocument();
  expect(screen.getByText("Your AI opens this same folder.")).toBeInTheDocument();
  expect(screen.getByText(/What's on my cap table\?/)).toBeInTheDocument();
  expect(screen.getByText("Coming")).toBeInTheDocument();
  const cmds: Record<string, string[]> = {
    "Claude Code": ["/plugin marketplace add MKBSP/capfolder", "/plugin install capfolder@capfolder"],
    Codex: ["codex mcp add capfolder -- npx -y capfolder mcp"],
    "Gemini CLI": ["gemini extensions install https://github.com/MKBSP/capfolder"],
    Other: ["npx capfolder install"],
  };
  for (const [tab, lines] of Object.entries(cmds)) {
    await userEvent.click(screen.getByRole("tab", { name: tab }));
    expect(screen.getByRole("tab", { name: tab })).toHaveAttribute("aria-selected", "true");
    for (const l of lines) expect(screen.getByText(l)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Copy" }));
    expect(await screen.findByText("Copied.")).toBeInTheDocument();
    expect(writeText).toHaveBeenLastCalledWith(lines.join("\n"));
  }
  await userEvent.click(screen.getByRole("tab", { name: "Claude Desktop" }));
  expect(screen.getByRole("tabpanel")).toHaveTextContent(
    "Download capfolder.mcpb from GitHub Releases and double-click it.",
  );
  await userEvent.click(screen.getByRole("link", { name: "GitHub Releases" }));
  expect(fp.opened).toEqual(["https://github.com/MKBSP/capfolder/releases"]);
  expect(screen.getByRole("region", { name: "Connect your AI" })).not.toHaveTextContent(/MCP server/i);
});

test("Copy says so when the clipboard is unavailable", async () => {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: vi.fn().mockRejectedValue(new Error("no")) },
    configurable: true,
  });
  render(<App platform={acmePlatform().platform} />);
  await userEvent.click(await screen.findByRole("button", { name: "Settings" }));
  await userEvent.click(screen.getByRole("button", { name: "Copy" }));
  expect(await screen.findByText("Copy failed — select the text above")).toBeInTheDocument();
  expect(screen.queryByText("Copied.")).toBeNull();
});

test("arrow keys move focus with the selected tab", async () => {
  render(<App platform={acmePlatform().platform} />);
  await userEvent.click(await screen.findByRole("button", { name: "Settings" }));
  screen.getByRole("tab", { name: "Claude Code" }).focus();
  await userEvent.keyboard("{ArrowRight}");
  const next = screen.getByRole("tab", { name: "Claude Desktop" });
  expect(next).toHaveAttribute("aria-selected", "true");
  expect(next).toHaveFocus();
});

test("a failed link open is handled, not left as an unhandled rejection", async () => {
  const fp = acmePlatform();
  const openUrl = vi.fn(() => Promise.reject(new Error("no opener")));
  fp.platform.openUrl = openUrl;
  render(<App platform={fp.platform} />);
  await userEvent.click(await screen.findByRole("button", { name: "Settings" }));
  await userEvent.click(screen.getByRole("tab", { name: "Claude Desktop" }));
  await userEvent.click(screen.getByRole("link", { name: "GitHub Releases" }));
  await new Promise((r) => setTimeout(r, 50)); // an unhandled rejection would be reported by vitest as an error
  expect(openUrl).toHaveBeenCalledWith("https://github.com/MKBSP/capfolder/releases");
});
