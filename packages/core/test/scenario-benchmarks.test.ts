import { expect, test } from "vitest";
import { BENCHMARKS, defaultPath, preseedCapFor } from "../src/scenario/benchmarks";

test("every benchmark names its source and year", () => {
  for (const b of BENCHMARKS)
    expect([b.key, b.source.length > 0, b.year >= 2024]).toEqual([b.key, true, true]);
});

test("default path from pre-seed through series B", () => {
  expect(
    defaultPath({ from: "preseed", through: "series-b" }).map((r) => [r.name, r.sells, r.poolTarget]),
  ).toEqual([
    ["Seed", "20", "12"],
    ["Series A", "18", undefined],
    ["Series B", "14", undefined],
  ]);
});

test("pre-seed cap band by amount raised", () => {
  expect([preseedCapFor("200000"), preseedCapFor("500000"), preseedCapFor("2000000")]).toEqual([
    "7500000",
    "10000000",
    "12000000",
  ]);
});
