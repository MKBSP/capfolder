// Display formatting only. Every number comes from @capfolder/core; this just prints it.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const shares = (n: bigint | null | undefined) =>
  n === null || n === undefined ? "—" : n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** "500000" → "$500,000" (keeps cents if present). */
export const usd = (amount: string | undefined) => {
  if (!amount) return "—";
  const [whole, cents] = amount.split(".");
  return `$${whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${cents && Number(cents) ? `.${cents}` : ""}`;
};

/** "10000000" → "$10M", "150000" → "$150k", "1100000" → "$1.1M". */
export const usdShort = (amount: string | undefined) => {
  if (!amount) return "—";
  const n = Number(amount);
  const trim = (x: number) => x.toFixed(2).replace(/\.?0+$/, "");
  if (n >= 1_000_000) return `$${trim(n / 1_000_000)}M`;
  if (n >= 1_000) return `$${trim(n / 1_000)}k`;
  return `$${trim(n)}`;
};

/** "2026-11-07" → "7 Nov 2026" (day month year, everywhere in the app). */
export const day = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return `${d} ${MONTHS[m - 1]} ${y}`;
};

/** What the founder types → ISO date, or null. Accepts "7 Nov 2026", "7 November 2026", "07/11/2026" (day first) and "2026-11-07". */
export function parseDay(text: string): string | null {
  const t = text.trim().toLowerCase().replace(/,/g, " ").replace(/\s+/g, " ");
  let y: number;
  let m: number;
  let d: number;
  let r = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  if (r) [y, m, d] = [Number(r[1]), Number(r[2]), Number(r[3])];
  else if ((r = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t)))
    [d, m, y] = [Number(r[1]), Number(r[2]), Number(r[3])];
  else if ((r = /^(\d{1,2}) ([a-z]{3,9})\.? (\d{4})$/.exec(t))) {
    const i = MONTHS.findIndex((mm) => r![2]!.startsWith(mm.toLowerCase()));
    if (i < 0) return null;
    [d, m, y] = [Number(r[1]), i + 1, Number(r[3])];
  } else return null;
  if (m < 1 || m > 12 || d < 1 || d > new Date(Date.UTC(y, m, 0)).getUTCDate()) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
/** "2027-03-02" → "Mar 2027" */
export const month = (iso: string) => {
  const [y, m] = iso.split("-").map(Number) as [number, number];
  return `${MONTHS[m - 1]} ${y}`;
};

/** "0.20" → "20%" */
export const percent = (fraction: string | undefined) =>
  fraction ? `${Number((Number(fraction) * 100).toFixed(4))}%` : "";

export const todayIso = () => new Date().toISOString().slice(0, 10);
