// Display formatting only. Every number comes from @capfolder/core; this just prints it.
import { parseLocalNumber } from "@capfolder/core";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Set by <App> from the founder's country and the company currency, before anything renders.
// ponytail: module state instead of threading a formatter through every component (display only).
let cfg = { locale: "en-US", currency: "USD", decimalMark: "." as "." | ",", monthFirst: true };
export function configureFormat(p: { locale: string; currency: string; monthFirst: boolean }) {
  // capfolder.json is a plain file anyone can edit: a value Intl rejects must not take the whole UI down.
  const ok = (f: () => unknown) => {
    try {
      f();
      return true;
    } catch {
      return false;
    }
  };
  if (!ok(() => new Intl.NumberFormat(p.locale))) p = { ...p, locale: "en-US" };
  if (!ok(() => new Intl.NumberFormat(p.locale, { style: "currency", currency: p.currency })))
    p = { ...p, currency: "USD" };
  const decimal = new Intl.NumberFormat(p.locale).formatToParts(1.5).find((x) => x.type === "decimal")?.value;
  cfg = { ...p, decimalMark: decimal === "," ? "," : "." };
}
export const formatConfig = () => cfg;
/** "10000000" → "10,000,000" (US) or "10.000.000" (PT, DE…): a default the founder's own number parser accepts. */
export const wholeInput = (digits: string) =>
  digits.replace(/\B(?=(\d{3})+(?!\d))/g, cfg.decimalMark === "," ? "." : ",");
/** "0.00001" → "0,00001" where the decimal mark is a comma. */
export const decimalInput = (dec: string) => (cfg.decimalMark === "," ? dec.replace(".", ",") : dec);
/** Field labels: "Amount (EUR)". */
export const withCurrency = (label: string) => `${label} (${cfg.currency})`;
/** A record's own currency, if Intl knows it (a hand-edited file could say anything). */
const knownCurrency = (c: string) => {
  try {
    new Intl.NumberFormat("en", { style: "currency", currency: c });
    return c;
  } catch {
    return cfg.currency;
  }
};

export const shares = (n: bigint | null | undefined) =>
  n === null || n === undefined ? "—" : new Intl.NumberFormat(cfg.locale).format(n);

/** Chart axes: "4000000" → "4M", "12500" → "12.5K" (short, so a label never runs off the edge). */
export const sharesShort = (n: bigint) =>
  new Intl.NumberFormat(cfg.locale, { notation: "compact", maximumFractionDigits: 1 }).format(n);

/** "500000" → "$500,000" / "500.000 €" (keeps cents if present). Display only. */
export const money = (amount: string | undefined, currency = cfg.currency) => {
  if (!amount) return "—";
  const cents = amount.split(".")[1]?.replace(/0+$/, "") ?? "";
  return new Intl.NumberFormat(cfg.locale, {
    style: "currency",
    currency: knownCurrency(currency),
    minimumFractionDigits: cents ? Math.max(2, cents.length) : 0,
    maximumFractionDigits: cents ? Math.max(2, cents.length) : 0,
  }).format(Number(amount));
};

/** "10000000" → "$10M", "150000" → "$150k", "1100000" → "$1.1M" (symbol and decimal mark follow the settings). */
export const moneyShort = (amount: string | undefined, currency = cfg.currency) => {
  if (!amount) return "—";
  const n = Number(amount);
  const [v, suffix] = n >= 1_000_000 ? [n / 1_000_000, "M"] : n >= 1_000 ? [n / 1_000, "k"] : [n, ""];
  const parts = new Intl.NumberFormat(cfg.locale, {
    style: "currency",
    currency: knownCurrency(currency),
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).formatToParts(v);
  let at = -1; // the suffix goes right after the last digit: "$1.1M", "1,1M €"
  parts.forEach((x, i) => {
    if (x.type === "integer" || x.type === "fraction") at = i;
  });
  return parts.map((x, i) => (i === at ? `${x.value}${suffix}` : x.value)).join("");
};

/** What the founder typed in a number field, read with their decimal mark; the raw text when it isn't a number. */
export const num = (text: string) => parseLocalNumber(text, cfg.decimalMark) ?? text.trim();

/** "2026-11-07" → "7 Nov 2026" (day month year, everywhere in the app). */
export const day = (iso: string) => {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return `${d} ${MONTHS[m - 1]} ${y}`;
};

/** What the founder types → ISO date, or null. Accepts "7 Nov 2026", "7 November 2026", "07/11/2026" (day first) and "2026-11-07". */
export function parseDay(text: string): string | null {
  const t = text.trim().toLowerCase().replace(/,/g, " ").replace(/\s+/g, " ");
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  const named = /^(\d{1,2}) ([a-z]{3,9})\.? (\d{4})$/.exec(t);
  const mi = named ? MONTHS.findIndex((mm) => named[2]!.startsWith(mm.toLowerCase())) + 1 : 0;
  const [y, m, d] = iso
    ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    : dmy
      ? cfg.monthFirst
        ? [Number(dmy[3]), Number(dmy[1]), Number(dmy[2])]
        : [Number(dmy[3]), Number(dmy[2]), Number(dmy[1])]
      : named && mi
        ? [Number(named[3]), mi, Number(named[1])]
        : [0, 0, 0];
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

export const plusDays = (d: string, n: number) => {
  const [y, m, dd] = d.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10);
};

// The founder's own calendar day, not UTC (8 pm in California is already tomorrow in UTC).
export const todayIso = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};
