import { expect, test } from "vitest";
import { captableCsv } from "../src/index";
import { acmeEvents, readFix } from "./helpers";

test("acme vault reproduces captable.expected.csv byte for byte", () => {
  expect(captableCsv(acmeEvents(), "2026-10-07")).toBe(readFix("captable.expected.csv"));
});
