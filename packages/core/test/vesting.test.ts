import { describe, expect, test } from "vitest";
import { vestedAt } from "../src/vesting";
import { acmeEvents } from "./helpers";

const terms = acmeEvents().find((e) => e.type === "VESTING_TERMS")!.data;

describe("4y / 1y cliff / monthly", () => {
  test("Mads: 36 of 48 months", () => {
    expect(vestedAt(4000000n, terms, "2023-10-07", "2026-10-07")).toEqual({
      vested: 3000000n,
      math: "3,000,000 = floor(4,000,000 × 36/48), as of 2026-10-07",
    });
  });
  test("Lisa: cliff day is inclusive", () =>
    expect(vestedAt(40000n, terms, "2025-10-07", "2026-10-07").vested).toBe(10000n));
  test("day before cliff is 0", () =>
    expect(vestedAt(40000n, terms, "2025-10-07", "2026-10-06").vested).toBe(0n));
  test("João before cliff", () =>
    expect(vestedAt(40000n, terms, "2026-03-02", "2026-10-07").vested).toBe(0n));
  test("cumulative floor: month 13 then 14", () => {
    expect(vestedAt(40000n, terms, "2025-10-07", "2026-11-07").vested).toBe(10833n);
    expect(vestedAt(40000n, terms, "2025-10-07", "2026-12-07").vested).toBe(11666n);
  });
  test("fully vested at 48 months, never more", () => {
    expect(vestedAt(40000n, terms, "2025-10-07", "2029-10-07").vested).toBe(40000n);
    expect(vestedAt(40000n, terms, "2025-10-07", "2040-01-01").vested).toBe(40000n);
  });
  test("start on the 31st vests on the last day of short months", () => {
    expect(vestedAt(48n, terms, "2024-01-31", "2025-01-30").vested).toBe(0n);
    expect(vestedAt(48n, terms, "2024-01-31", "2025-01-31").vested).toBe(12n);
    expect(vestedAt(48n, terms, "2024-01-31", "2025-02-28").vested).toBe(13n);
  });
  test("before the start date", () =>
    expect(vestedAt(40000n, terms, "2025-10-07", "2025-01-01").vested).toBe(0n));
});

describe("unsupported shapes are 'unknown', never guessed", () => {
  test("event trigger", () => {
    const t = {
      allocation_type: "CUMULATIVE_ROUND_DOWN",
      vesting_conditions: [
        { id: "s", trigger: { type: "VESTING_START_DATE" }, quantity: "0", next_condition_ids: ["e"] },
        {
          id: "e",
          trigger: { type: "VESTING_EVENT" },
          portion: { numerator: "1", denominator: "1" },
          next_condition_ids: [],
        },
      ],
    };
    const r = vestedAt(100n, t, "2025-01-01", "2026-01-01");
    expect(r.vested).toBeNull();
    expect(r.unknownReason).toMatch(/only month-based relative schedules/);
  });
  test("front-loaded allocation", () => {
    expect(
      vestedAt(100n, { ...terms, allocation_type: "FRONT_LOADED" }, "2025-01-01", "2026-01-01").vested,
    ).toBeNull();
  });
  test("CUMULATIVE_ROUNDING rounds instead of floors", () => {
    const t = { ...terms, allocation_type: "CUMULATIVE_ROUNDING" };
    expect(vestedAt(40000n, t, "2025-10-07", "2026-11-07").vested).toBe(10833n);
    expect(vestedAt(100n, t, "2025-10-07", "2026-11-07").vested).toBe(27n); // 27.08
    expect(vestedAt(100n, t, "2025-10-07", "2027-01-07").vested).toBe(31n); // 31.25
  });
});
