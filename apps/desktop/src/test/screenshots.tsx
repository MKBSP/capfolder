import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "../styles/tokens.css";
import "../styles/app.css";
import { createRoot } from "react-dom/client";
import { App } from "../App";
import { fakePlatform } from "./fakePlatform";

// The real app on memory files and fake dialogs: help-page screenshots without Tauri.
createRoot(document.getElementById("root")!).render(<App platform={fakePlatform().platform} />);
