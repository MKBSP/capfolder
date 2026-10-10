import { expect, test } from "vitest";
import { addMonths, datePart } from "../src/dates";

const START_DAY = "VESTING_START_DAY_OR_LAST_DAY_OF_MONTH";
test("same day of month", () => expect(addMonths("2025-10-07", 12, START_DAY)).toBe("2026-10-07"));
test("31st falls back to last day", () => {
  expect(addMonths("2024-01-31", 1, START_DAY)).toBe("2024-02-29");
  expect(addMonths("2023-01-31", 1, START_DAY)).toBe("2023-02-28");
  expect(addMonths("2024-01-31", 2, START_DAY)).toBe("2024-03-31"); // anchored to start, no drift
});
test("fixed day rules", () => {
  expect(addMonths("2024-01-31", 1, "15")).toBe("2024-02-15");
  expect(addMonths("2024-01-10", 1, "30_OR_LAST_DAY_OF_MONTH")).toBe("2024-02-29");
});
test("year rollover", () => expect(addMonths("2025-11-30", 3, START_DAY)).toBe("2026-02-28"));
test("negative months", () => expect(addMonths("2026-03-31", -1, START_DAY)).toBe("2026-02-28"));
test("datePart", () => expect(datePart("2026-10-07T09:00:00Z")).toBe("2026-10-07"));
