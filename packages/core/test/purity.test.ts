import { readdirSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";

const SRC = new URL("../src/", import.meta.url);

test("core src has no Node or I/O imports", () => {
  const files = readdirSync(SRC, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".ts"));
  const offenders = files.filter((f) => /from "node:|require\(/.test(readFileSync(new URL(f, SRC), "utf8")));
  expect(offenders).toEqual([]);
});
