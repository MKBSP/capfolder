import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "../styles/tokens.css";
import "../styles/app.css";
import { createVault } from "@capfolder/vault";
import { createRoot } from "react-dom/client";
import importCsv from "../../../../fixtures/import/acme-generic.csv?raw";
import { App } from "../App";
import { fakePlatform } from "./fakePlatform";

// The real app on memory files and fake dialogs: help-page screenshots without Tauri (scripts/shots.mjs).
// ?flow=import starts in an empty Acme Inc. folder, with the fixture export ready behind "Choose file…".
// ?flow=ai: the same empty folder, with a fake Ollama/LM Studio whose state the script sets in window.__ai
// ("off" refuses, "empty" answers with no models, "models" lists two Ollama models).
const localAi = {
  fetch: async (url: string) => {
    const state = (window as unknown as { __ai?: string }).__ai ?? "off";
    const port = new URL(url).port;
    if (state === "off" || (port !== "11434" && port !== "1234")) throw new TypeError("connection refused");
    if (port === "1234") throw new TypeError("connection refused"); // LM Studio stays off in the shots
    const models = state === "models" ? [{ name: "gemma4:e2b" }, { name: "llama3.1" }] : [];
    return new Response(JSON.stringify({ models }), { status: 200 });
  },
};

async function platform() {
  const flow = new URLSearchParams(location.search).get("flow");
  if (flow !== "import" && flow !== "ai") return fakePlatform().platform;
  const file = "/home/me/Downloads/acme-cap-table.csv";
  const fp = fakePlatform(flow === "ai" ? { relay: localAi } : { pickFile: { path: file, name: "acme-cap-table.csv" } });
  fp.fs.writeSync(file, importCsv);
  const v = await createVault(
    fp.fs,
    { now: () => new Date(), newId: () => `evt_${Math.random()}`, deviceId: "shots" },
    {
      parent: "/home/me/Documents",
      company: { name: "Acme Inc.", formationDate: "2021-09-14", type: "DE_CCORP" },
    },
  );
  const settings = { deviceId: "shots", lock: "none", idleMinutes: 15, telemetry: false, termsAccepted: "x" };
  fp.fs.writeSync(
    "/appdata/settings.json",
    JSON.stringify({ ...settings, recentVaults: [{ name: "Acme Inc.", root: v.root }], tourSeen: true }),
  );
  return fp.platform;
}

platform().then((p) => createRoot(document.getElementById("root")!).render(<App platform={p} />));
