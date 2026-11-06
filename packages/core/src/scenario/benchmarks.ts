// What "a normal run of rounds" means, each number with its source. Shown next to defaults, never as advice.
import type { RoundStep } from "./types";

export type Benchmark = {
  key: string;
  label: string;
  value: string;
  source: string;
  year: number;
  url?: string;
  /** The figure comes from the research notes and could not be re-checked against the report itself. */
  unverified?: true;
};

const CARTA_PRESEED = "Carta, State of Pre-Seed";
const CARTA_PRIVATE = "Carta, State of Private Markets";
const CARTA_EQUITY = "Carta, startup equity data";

export const BENCHMARKS: readonly Benchmark[] = [
  {
    key: "preseed-cap-under-250k",
    label: "Pre-seed SAFE cap, under $250K raised",
    value: "7500000",
    source: CARTA_PRESEED,
    year: 2025,
    unverified: true,
  },
  {
    key: "preseed-cap-to-1m",
    label: "Pre-seed SAFE cap, $250K to $1M raised",
    value: "10000000",
    source: CARTA_PRESEED,
    year: 2025,
    unverified: true,
  },
  {
    key: "preseed-cap-to-2.5m",
    label: "Pre-seed SAFE cap, $1M to $2.5M raised",
    value: "12000000",
    source: CARTA_PRESEED,
    year: 2025,
    unverified: true,
  },
  {
    key: "preseed-sells",
    label: "Pre-seed SAFEs sell, % of the company",
    value: "10-15",
    source: CARTA_PRESEED,
    year: 2025,
    unverified: true,
  },
  {
    key: "pool-preseed",
    label: "Option pool at pre-seed, %",
    value: "10",
    source: CARTA_EQUITY,
    year: 2025,
    unverified: true,
  },
  {
    key: "pool-seed",
    label: "Option pool after seed, %",
    value: "12",
    source: CARTA_EQUITY,
    year: 2025,
    unverified: true,
  },
  {
    key: "seed-dilution",
    label: "Seed sells, %",
    value: "20",
    source: CARTA_PRIVATE,
    year: 2025,
    unverified: true,
  },
  {
    key: "series-a-dilution",
    label: "Series A sells, %",
    value: "18",
    source: CARTA_PRIVATE,
    year: 2025,
    unverified: true,
  },
  {
    key: "series-b-dilution",
    label: "Series B sells, %",
    value: "14",
    source: CARTA_PRIVATE,
    year: 2025,
    unverified: true,
  },
  {
    key: "series-c-dilution",
    label: "Series C sells, %",
    value: "10",
    source: CARTA_PRIVATE,
    year: 2025,
    unverified: true,
  },
  {
    key: "first-hire",
    label: "First hire, % of the company",
    value: "1.5",
    source: CARTA_EQUITY,
    year: 2025,
    unverified: true,
  },
  {
    key: "advisor-preseed",
    label: "Advisor grant at pre-seed, %",
    value: "0.25",
    source: CARTA_EQUITY,
    year: 2025,
    unverified: true,
  },
  {
    key: "advisor-seed",
    label: "Advisor grant at seed, %",
    value: "0.15",
    source: CARTA_EQUITY,
    year: 2025,
    unverified: true,
  },
  {
    key: "two-founder-split",
    label: "Two-founder split",
    value: "50/50 in 44–46% of teams, median 51/49",
    source: "Carta, founder equity split data",
    year: 2025,
    unverified: true,
  },
];

export const benchmark = (key: string): Benchmark => BENCHMARKS.find((b) => b.key === key)!;

const STAGES = ["preseed", "seed", "series-a", "series-b", "series-c"] as const;
type Stage = (typeof STAGES)[number];
const ROUNDS: { stage: Stage; name: string; dilution: string; poolTarget?: string }[] = [
  { stage: "seed", name: "Seed", dilution: "seed-dilution", poolTarget: "pool-seed" },
  { stage: "series-a", name: "Series A", dilution: "series-a-dilution" },
  { stage: "series-b", name: "Series B", dilution: "series-b-dilution" },
  { stage: "series-c", name: "Series C", dilution: "series-c-dilution" },
];

/** The typical rounds after `from`, through `through`, as "sells X%" steps. Seed tops the pool up to its benchmark. */
export function defaultPath(opts: {
  from: "preseed" | "seed" | "series-a";
  through: "seed" | "series-a" | "series-b" | "series-c";
}): RoundStep[] {
  const [a, z] = [STAGES.indexOf(opts.from), STAGES.indexOf(opts.through)];
  return ROUNDS.filter((r) => STAGES.indexOf(r.stage) > a && STAGES.indexOf(r.stage) <= z).map((r) => ({
    kind: "round",
    name: r.name,
    sells: benchmark(r.dilution).value,
    ...(r.poolTarget ? { poolTarget: benchmark(r.poolTarget).value } : {}),
  }));
}

/** The typical pre-seed post-money cap for the amount raised (Carta bands). */
export function preseedCapFor(amount: string): string {
  const n = Number(amount);
  return benchmark(
    n < 250_000 ? "preseed-cap-under-250k" : n < 1_000_000 ? "preseed-cap-to-1m" : "preseed-cap-to-2.5m",
  ).value;
}
