import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(cleanup);

// jsdom has no layout: scrolling is a no-op in tests.
if (typeof window !== "undefined") window.scrollTo = () => {};

// The full suite runs core and desktop in parallel; under that load a save can take over the default 1s.
configure({ asyncUtilTimeout: 3000 });
