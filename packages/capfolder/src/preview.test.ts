import { expect, test } from "vitest";
import { PreviewStore } from "./preview";

const clock = (t: number) => {
  const c = { t, now: () => new Date(c.t) };
  return c;
};

test("put then take gives the value back once", () => {
  const c = clock(0);
  const s = new PreviewStore<string[]>(c.now);
  const id = s.put("/v", "h1", ["a"], "Adds a.");
  expect(id).toMatch(/^pvw_/);
  expect(s.take(id, "/v", "h1")).toEqual({ value: ["a"], summary: "Adds a." });
  expect(s.take(id, "/v", "h1")).toBeInstanceOf(Error); // single-use
});

test("a changed folder, another company, or an old preview is refused", () => {
  const c = clock(0);
  const s = new PreviewStore<string[]>(c.now);
  const a = s.put("/v", "h1", [], "");
  expect((s.take(a, "/v", "h2") as Error).message).toBe(
    "The folder changed since the preview. Ask again to see the new preview.",
  );
  const b = s.put("/v", "h1", [], "");
  expect(s.take(b, "/other", "h1")).toBeInstanceOf(Error);
  const d = s.put("/v", "h1", [], "");
  c.t += 10 * 60_000 + 1;
  expect((s.take(d, "/v", "h1") as Error).message).toMatch(/10 minutes/);
  expect(s.take("pvw_nope", "/v", "h1")).toBeInstanceOf(Error);
});

test("exactly 10 minutes is still fine", () => {
  const c = clock(0);
  const s = new PreviewStore<number>(c.now);
  const id = s.put("/v", "h", 1, "");
  c.t += 10 * 60_000;
  expect(s.take(id, "/v", "h")).toEqual({ value: 1, summary: "" });
});
