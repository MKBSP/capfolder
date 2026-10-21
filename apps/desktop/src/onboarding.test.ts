import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MAX_DATE, reduce } from "@capfolder/core";
import { expect, test } from "vitest";
import { getStarted } from "./onboarding";

const events = readFileSync(resolve(process.cwd(), "../../fixtures/acme-vault/events.jsonl"), "utf8")
  .trim()
  .split("\n")
  .map((l) => JSON.parse(l));
const ticks = (steps: ReturnType<typeof getStarted>) => steps.map((x) => `${x.done ? "✓" : "·"} ${x.label}`);

test("ticks come from the cap table", () => {
  expect(ticks(getStarted(reduce(events, MAX_DATE), {}, false))).toEqual([
    "✓ Company details",
    "✓ Share classes",
    "✓ Founders and their shares",
    "✓ Option pool and grants",
    "✓ SAFEs",
    "· Priced round",
    "✓ File your signed documents",
    "· Set up Ask AI (optional)",
  ]);
  // a new company: only its details are in
  const fresh = reduce(events.slice(0, 2), MAX_DATE);
  expect(
    getStarted(fresh, {}, true)
      .filter((x) => x.done)
      .map((x) => x.label),
  ).toEqual(["Company details", "Set up Ask AI (optional)"]);
});

test("a 'no' answer hides the step", () => {
  const s = reduce(events, MAX_DATE);
  const labels = getStarted(s, { safes: false, pool: false, priced: false }, false).map((x) => x.label);
  expect(labels).not.toContain("SAFEs");
  expect(labels).not.toContain("Option pool and grants");
  expect(labels).not.toContain("Priced round");
  expect(labels).toHaveLength(5);
});

test("every step says what it is and where to go", () => {
  for (const x of getStarted(reduce([], MAX_DATE), {}, false)) {
    expect(x.help).toMatch(/\.$/);
    expect(x.to.name).toBeTruthy();
  }
});

test("each cap table step has a How? link to its capfolder.com guide", () => {
  const how = Object.fromEntries(
    getStarted(reduce(events, MAX_DATE), {}, false).map((x) => [x.label, x.how?.url]),
  );
  expect(how).toMatchObject({
    "Share classes": "https://capfolder.com/learn/cap-table/",
    "Founders and their shares": "https://capfolder.com/help/founders/",
    "Option pool and grants": "https://capfolder.com/learn/option-pool/",
    SAFEs: "https://capfolder.com/learn/safe/",
    "Priced round": "https://capfolder.com/learn/pre-money-post-money/",
  });
});
