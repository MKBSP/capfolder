// jest-dom's own types extend whichever "vitest" copy it resolves; with several installed (peer variants) that can be
// a different copy than ours, and the matchers vanish from expect(). This extends the vitest this app imports.
import type { TestingLibraryMatchers } from "@testing-library/jest-dom/matchers";

declare module "vitest" {
  interface Assertion<T = any> extends TestingLibraryMatchers<any, T> {}
  interface AsymmetricMatchersContaining extends TestingLibraryMatchers<any, any> {}
}
