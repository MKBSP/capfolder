import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Tauri expects a fixed dev port and leaves the terminal to cargo's output.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true, watch: { ignored: ["**/src-tauri/**"] } },
  // whole-app UI tests take a few seconds on CI runners; 5 s (the default) timed out there
  test: { environment: "jsdom", setupFiles: ["./src/test/setup.ts"], testTimeout: 20_000 },
});
