import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { App } from "./App";

test("app renders", () => {
  render(<App />);
  expect(screen.getByText("Capfolder")).toBeInTheDocument();
});
