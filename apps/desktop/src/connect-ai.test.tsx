import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { ConnectAi } from "./screens/ConnectAi";

test("Connect your AI shows each command, a Copy button, and ChatGPT as Coming", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  render(<ConnectAi />);
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
    expect(writeText).toHaveBeenLastCalledWith(lines.join("\n"));
  }
  await userEvent.click(screen.getByRole("tab", { name: "Claude Desktop" }));
  expect(screen.getByRole("tabpanel")).toHaveTextContent(
    "Download capfolder.mcpb from GitHub Releases and double-click it.",
  );
  expect(screen.getByRole("link", { name: "GitHub Releases" })).toHaveAttribute(
    "href",
    "https://github.com/MKBSP/capfolder/releases",
  );
  expect(screen.queryByText(/MCP server/i)).toBeNull();
});
