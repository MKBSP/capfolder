// Exact decimal and percentage math on bigint. OCF Numeric strings: ^[+-]?\d+(\.\d{1,10})?$
const DEC = /^([+-]?)(\d+)(?:\.(\d{1,10}))?$/;

export function parseDec(s: string): { v: bigint; scale: number } {
  const m = DEC.exec(String(s));
  if (!m) throw new Error(`Not a number: "${s}"`);
  const frac = m[3] ?? "";
  return { v: BigInt(m[2]! + frac) * (m[1] === "-" ? -1n : 1n), scale: frac.length };
}

export function toInt(s: string): bigint {
  const { v, scale } = parseDec(s);
  const d = 10n ** BigInt(scale);
  if (v % d !== 0n) throw new Error(`Expected a whole number, got "${s}"`);
  return v / d;
}

/** a ÷ b as an integer fraction [num, den]. */
export function decFraction(a: string, b: string): [bigint, bigint] {
  const x = parseDec(a);
  const y = parseDec(b);
  return [x.v * 10n ** BigInt(y.scale), y.v * 10n ** BigInt(x.scale)];
}

function fixed(units: bigint, decimals: number): string {
  const d = 10n ** BigInt(decimals);
  const neg = units < 0n;
  const u = neg ? -units : units;
  const s = `${neg ? "-" : ""}${u / d}`;
  return decimals ? `${s}.${(u % d).toString().padStart(decimals, "0")}` : s;
}

export function subDec(a: string, b: string): string {
  const x = parseDec(a);
  const y = parseDec(b);
  const scale = Math.max(x.scale, y.scale);
  return fixed(x.v * 10n ** BigInt(scale - x.scale) - y.v * 10n ** BigInt(scale - y.scale), scale);
}

export const fmtInt = (n: bigint): string => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** Whole shares × a decimal price, in cents (rounded half up). Non-negative inputs. */
export function mulDec(qty: bigint, price: string): string {
  const { v, scale } = parseDec(price);
  return ratioFixed(qty * v, 10n ** BigInt(scale), 2);
}

/** num ÷ den to `decimals` places, rounded half up. Non-negative inputs. */
export function ratioFixed(num: bigint, den: bigint, decimals: number): string {
  const scale = 10n ** BigInt(decimals);
  return fixed((num * scale * 2n + den) / (2n * den), decimals);
}

/** Each value as a percent of the sum, to `decimals` places, summing to exactly 100. Ties go to earlier rows. */
export function largestRemainder(values: bigint[], decimals: number): string[] {
  const total = values.reduce((a, b) => a + b, 0n);
  if (total === 0n) return values.map(() => fixed(0n, decimals));
  const units = 100n * 10n ** BigInt(decimals);
  const floors = values.map((v) => (v * units) / total);
  let left = units - floors.reduce((a, b) => a + b, 0n);
  const order = values.map((v, i) => ({ i, r: (v * units) % total }));
  order.sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
  for (const { i } of order) {
    if (left <= 0n) break;
    floors[i]! += 1n;
    left -= 1n;
  }
  return floors.map((f) => fixed(f, decimals));
}

/** Exact sum of decimal strings ("0" for none). */
export function sumDec(values: string[]): string {
  return values.reduce((acc, v) => {
    const x = parseDec(acc);
    const y = parseDec(v);
    const scale = Math.max(x.scale, y.scale);
    return fixed(x.v * 10n ** BigInt(scale - x.scale) + y.v * 10n ** BigInt(scale - y.scale), scale);
  }, "0");
}

/**
 * A number the founder typed, read with their decimal mark: "1,000,000.50" (".") or "1.000.000,50" (",").
 * Currency signs and spaces are ignored. Returns a plain decimal string, or null when it isn't a non-negative number.
 */
export function parseLocalNumber(raw: string, decimalMark: "." | ","): string | null {
  const v = raw
    .replace(/[$€£¥\s  '’]/g, "") // spaces and apostrophes are only ever thousands separators
    .replace(/^(usd|eur|gbp|cny|brl|chf)|(usd|eur|gbp|cny|brl|chf)$/gi, "");
  if (!v) return null;
  // Plain digits, or digits grouped in threes, then an optional decimal part. Anything else (like "0,12" when
  // the decimal mark is ".") is refused rather than read as 12.
  const ok =
    decimalMark === ","
      ? /^(\d+|\d{1,3}(\.\d{3})+)(,\d+)?$/.test(v)
      : /^(\d+|\d{1,3}(,\d{3})+)(\.\d+)?$/.test(v);
  if (!ok) return null;
  return decimalMark === "," ? v.replace(/\./g, "").replace(",", ".") : v.replace(/,/g, "");
}
