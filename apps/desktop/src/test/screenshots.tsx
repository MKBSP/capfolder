import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "../styles/tokens.css";
import "../styles/app.css";
import { createRoot } from "react-dom/client";
import importCsv from "../../../../fixtures/import/acme-generic.csv?raw";
import { App } from "../App";
import { createVault } from "../vault";
import { fakePlatform } from "./fakePlatform";

// The real app on memory files and fake dialogs: help-page screenshots without Tauri (scripts/shots.mjs).
// ?flow=import starts in an empty Acme Inc. folder, with the fixture export ready behind "Choose file…".
async function platform() {
  if (new URLSearchParams(location.search).get("flow") !== "import") return fakePlatform().platform;
  const file = "/home/me/Downloads/acme-cap-table.csv";
  const fp = fakePlatform({ pickFile: { path: file, name: "acme-cap-table.csv" } });
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
