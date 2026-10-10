import { expect, test } from "vitest";
import { toCaptableCsv } from "../src/captable-csv";
import type { Row } from "../src/types";

const row = (over: Partial<Row>): Row => ({
  group: 0,
  date: "2021-01-01",
  securityId: "CS-9",
  stakeholder: "X",
  type: "common",
  class: "Common",
  shares: 1n,
  vested: 1n,
  unvested: 0n,
  fdPercent: "100.00",
  safeAmount: "",
  safeCap: "",
  safeDiscount: "",
  asConverted: "",
  docStatus: "missing",
  math: {},
  ...over,
});

test("quotes commas and quotes (RFC 4180)", () => {
  expect(toCaptableCsv([row({ stakeholder: 'Fund "X", L.P.' })]).split("\n")[1]).toBe(
    '"Fund ""X"", L.P.",common,Common,1,100.00,1,0,,,,,missing',
  );
});
test("neutralises spreadsheet formulas in text cells", () => {
  expect(
    toCaptableCsv([row({ stakeholder: '=HYPERLINK("x")' })])
      .split("\n")[1]!
      .startsWith("\"'=HYPERLINK"),
  ).toBe(true);
  expect(
    toCaptableCsv([row({ stakeholder: "@evil" })])
      .split("\n")[1]!
      .startsWith("'@evil"),
  ).toBe(true);
});
test("LF line endings with trailing newline", () => {
  const out = toCaptableCsv([row({})]);
  expect(out.endsWith("\n")).toBe(true);
  expect(out.includes("\r")).toBe(false);
});
test("neutralises formulas in every column, keeps plain numbers", () => {
  const out = toCaptableCsv([
    row({ type: "=cmd", safeAmount: "+1+1", safeCap: "@x", safeDiscount: "=2", shares: -5n }),
  ]);
  expect(out.split("\n")[1]).toBe("X,'=cmd,Common,-5,100.00,1,0,'+1+1,'@x,'=2,,missing");
});
