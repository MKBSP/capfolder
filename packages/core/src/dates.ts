// Calendar dates as "YYYY-MM-DD" strings. ISO strings compare correctly with < and >.
export const MAX_DATE = "9999-12-31";
export const datePart = (ts: string): string => ts.slice(0, 10);

const pad = (n: number) => String(n).padStart(2, "0");
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** start + months, using an OCF VestingDayOfMonth rule, anchored to start (never chained). */
export function addMonths(start: string, months: number, dayRule: string): string {
  const [y, m, d] = start.split("-").map(Number) as [number, number, number];
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const want = dayRule === "VESTING_START_DAY_OR_LAST_DAY_OF_MONTH" ? d : Number.parseInt(dayRule, 10);
  return `${ny}-${pad(nm)}-${pad(Math.min(want, daysIn(ny, nm)))}`;
}
