import { expect, test } from "vitest";
import {
  decFraction,
  fmtInt,
  largestRemainder,
  parseDec,
  parseLocalNumber,
  ratioFixed,
  subDec,
  toInt,
} from "../src/num";

test("parseDec / toInt", () => {
  expect(parseDec("0.20")).toEqual({ v: 20n, scale: 2 });
  expect(toInt("4000000")).toBe(4000000n);
  expect(toInt("40000.00")).toBe(40000n);
  expect(() => toInt("1.5")).toThrow('Expected a whole number, got "1.5"');
  expect(() => parseDec("abc")).toThrow('Not a number: "abc"');
});
test("decFraction aligns scales", () => {
  expect(decFraction("150000", "8000000")).toEqual([150000n, 8000000n]);
  expect(decFraction("0.5", "2")).toEqual([5n, 20n]);
});
test("subDec", () => {
  expect(subDec("250000", "100000")).toBe("150000");
  expect(subDec("250000.50", "0.5")).toBe("250000.00");
});
test("fmtInt", () => {
  expect(fmtInt(4000000n)).toBe("4,000,000");
  expect(fmtInt(-30000n)).toBe("-30,000");
});
test("ratioFixed rounds half up", () => {
  expect(ratioFixed(150000n * 100n, 8000000n, 2)).toBe("1.88"); // 1.875
  expect(ratioFixed(500000n * 100n, 10000000n, 2)).toBe("5.00");
  expect(ratioFixed(1n, 3n, 2)).toBe("0.33");
});
test("largestRemainder sums to 100.00", () => {
  expect(largestRemainder([4000000n, 3000000n, 40000n, 40000n, 920000n], 2)).toEqual([
    "50.00",
    "37.50",
    "0.50",
    "0.50",
    "11.50",
  ]);
  expect(largestRemainder([1n, 1n, 1n], 2)).toEqual(["33.34", "33.33", "33.33"]);
  expect(largestRemainder([0n, 0n], 2)).toEqual(["0.00", "0.00"]);
});

test("parseLocalNumber reads the founder's decimal mark", () => {
  expect(parseLocalNumber("1,000,000.50", ".")).toBe("1000000.50");
  expect(parseLocalNumber("$200,000", ".")).toBe("200000");
  expect(parseLocalNumber("1.000.000,50", ",")).toBe("1000000.50");
  expect(parseLocalNumber("0,50 €", ",")).toBe("0.50");
  expect(parseLocalNumber("1 000 000", ",")).toBe("1000000");
  expect(parseLocalNumber("1'000'000.5", ".")).toBe("1000000.5");
  expect(parseLocalNumber("1.5M", ".")).toBeNull();
  expect(parseLocalNumber("-5", ".")).toBeNull();
});
