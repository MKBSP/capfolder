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

/** "2026-11-07" → "Nov 7, 2026" */
export const day = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return `${MONTHS[m - 1]} ${d}, ${y}`;
};
/** "2027-03-02" → "Mar 2027" */
export const month = (iso: string) => {
  const [y, m] = iso.split("-").map(Number) as [number, number];
  return `${MONTHS[m - 1]} ${y}`;
};

/** "0.20" → "20%" */
export const percent = (fraction: string | undefined) =>
  fraction ? `${Number((Number(fraction) * 100).toFixed(4))}%` : "";

export const todayIso = () => new Date().toISOString().slice(0, 10);
