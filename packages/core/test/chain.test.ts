import { describe, expect, test } from "vitest";
import { canonicalLine, verifyChain } from "../src/chain";
import { readFix } from "./helpers";

const text = readFix("events.jsonl");
const lines = text.trim().split("\n");

describe("verifyChain", () => {
  test("acme chain verifies", async () => {
    const r = await verifyChain(text);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.events).toHaveLength(lines.length);
  });

  test("lines are canonical JSON", async () => {
    const r = await verifyChain(text);
    if (!r.ok) throw new Error("chain broken");
    expect(r.events.map(canonicalLine)).toEqual(lines);
  });

  test.each(lines.map((_, i) => i))("tampering with line %i fails at that line", async (i) => {
    const e = JSON.parse(lines[i]!);
    e.ts = e.ts.replace("2026", "2025");
    const tampered = lines.map((l, j) => (j === i ? JSON.stringify(e) : l)).join("\n");
    const r = await verifyChain(`${tampered}\n`);
    expect(r).toEqual({ ok: false, line: i + 1, reason: "hash does not match the line's content" });
  });

  test("a removed line breaks the chain at the next line", async () => {
    const r = await verifyChain(`${lines.filter((_, j) => j !== 4).join("\n")}\n`);
    expect(r).toMatchObject({ ok: false, line: 5, reason: "prev does not match the previous line's hash" });
  });

  test("garbage line is reported", async () => {
    const r = await verifyChain(`${lines[0]}\n{not json\n`);
    expect(r).toEqual({ ok: false, line: 2, reason: "not valid JSON" });
  });

  test("empty log is valid", async () => {
    expect(await verifyChain("")).toEqual({ ok: true, events: [] });
  });
});
