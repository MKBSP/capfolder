// docs/19: the spotlight tour (Driver.js, MIT). Offered once on Home; Settings → Take the tour runs it again.
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import { useApp } from "../state";

const STOPS = [
  {
    element: ".switcher",
    title: "Your company folder",
    text: "Switch companies here. The path under the name is the folder on this computer that holds everything: your data is this folder.",
  },
  {
    element: "[data-tour=captable]",
    title: "Your cap table",
    text: "Who owns what, as of the date at the top. The totals always add up to 100%.",
  },
  {
    element: ".tbl tr.click",
    title: "A holding",
    text: "Click a row to see its vesting and how each number was computed.",
  },
  {
    element: "[data-tour=documents]",
    title: "Documents",
    text: "Your signed papers, filed in the folder. Drop a stack of PDFs on Sort and Capfolder files each one.",
  },
  {
    element: "[data-tour=signatures]",
    title: "Signatures",
    text: "Send a document for e-signature and see who still has to sign.",
  },
  {
    element: ".ask-ai",
    title: "✦ Ask AI",
    text: "Ask about your cap table in plain words. The AI only suggests; nothing is saved until you click.",
  },
];

/** Runs on Home. Focus goes back to where it was, or to the company switcher if that button is gone. */
export function startTour() {
  const trigger = document.activeElement as HTMLElement | null;
  driver({
    animate: !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    showProgress: true,
    skipMissingElement: true, // an empty company has no holding row yet
    steps: STOPS.map((s) => ({ element: s.element, popover: { title: s.title, description: s.text } })),
    // after Driver.js's own focus call, which targets whatever was focused when the last stop opened
    onDestroyed: () =>
      setTimeout(() =>
        (trigger?.isConnected && trigger !== document.body
          ? trigger
          : document.querySelector<HTMLElement>(".switcher")
        )?.focus(),
      ),
  }).drive();
}

/** Once, after the first save (or in the sample company): "Take the tour" / "No thanks". */
export function TourOffer() {
  const app = useApp();
  const { vault, latest, settings } = app;
  if (settings.tourSeen || !vault || !(vault.meta.sample || latest?.securities.size)) return null;
  const seen = () => app.setSettings((s) => ({ ...s, tourSeen: true }));
  return (
    <div className="banner row spread" style={{ margin: "12px 24px 0" }}>
      <span>New here? A one-minute tour shows where everything is.</span>
      <span className="row">
        <button type="button" className="btn link small" onClick={seen}>
          No thanks
        </button>
        <button
          type="button"
          className="btn primary small"
          onClick={() => {
            startTour();
            seen();
          }}
        >
          Take the tour
        </button>
      </span>
    </div>
  );
}
