import { expect, it, vi } from "vitest";

// The desktop CSP has no 'unsafe-eval' (tester hit "Refused to evaluate a string as JavaScript" on Create folder).
it("validates OCF without eval / new Function", async () => {
  const Real = globalThis.Function;
  vi.resetModules();
  globalThis.Function = (() => {
    throw new EvalError("unsafe-eval blocked");
  }) as unknown as FunctionConstructor;
  try {
    const { validateOcf } = await import("./validate");
    expect(validateOcf({ object_type: "NOPE" })[0]).toMatch(/Unknown/);
    expect(validateOcf({ object_type: "STAKEHOLDER" }).length).toBeGreaterThan(0);
  } finally {
    globalThis.Function = Real;
  }
});
