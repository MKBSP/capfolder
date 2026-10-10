import { expect, test } from "vitest";
import { captableCsv } from "../src/index";
import { acmeEvents, readFix } from "./helpers";

// M0: fails on purpose until the engine exists (flipped to `test` in Task 9).
test.fails("acme vault reproduces captable.expected.csv byte for byte", () => {
  expect(captableCsv(acmeEvents(), "2026-10-07")).toBe(readFix("captable.expected.csv"));
});
