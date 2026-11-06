import { expect, test } from "vitest";
import type { Holding } from "../src/scenario";
import { applyExit } from "../src/scenario/exit";

const after: Holding[] = [
  { holder: "Steve Jobs", kind: "shares", shares: 4000000n },
  { holder: "Steve Wozniak", kind: "shares", shares: 4000000n },
  { holder: "Bill Gates", kind: "shares", shares: 1111111n },
  { holder: "Seed investors", kind: "shares", shares: 2777777n },
  { holder: "Option pool", kind: "pool", shares: 2000000n },
];

test("exit at $100M: pool cancelled, proceeds sum to the exit value", () => {
  const r = applyExit([...after], "100000000");
  if ("error" in r) throw new Error(r.error);
  const by = Object.fromEntries(r.lines.map((l) => [l.holder, l.proceeds]));
  expect(by["Option pool"]).toBe("0");
  expect(by["Bill Gates"]).toMatch(/^934579[45]$/);
  expect(by["Seed investors"]).toMatch(/^2336448[12]$/);
  expect(r.lines.reduce((a, l) => a + BigInt(l.proceeds ?? "0"), 0n)).toBe(100000000n);
  expect(r.notes.join(" ")).toContain("liquidation preferences");
});

test("an outstanding SAFE at the exit is an error", () => {
  expect(
    applyExit([{ holder: "Bill Gates", kind: "safe", shares: 0n, amount: "1", cap: "2" }], "1"),
  ).toMatchObject({
    error: expect.stringContaining("round"),
  });
});
