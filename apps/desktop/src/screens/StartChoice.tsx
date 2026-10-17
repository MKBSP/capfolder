import { Stepper } from "../components/ui";
import { openSample } from "../sample";
import { type Route, useApp } from "../state";

const CARDS: { title: string; sub: string; steps: string[]; to: Route | "sample" }[] = [
  {
    title: "Import from Pulley or Carta",
    sub: "You have a cap table somewhere. About 2 minutes.",
    steps: [
      "Export a CSV there",
      "Drop it here, check the columns",
      "Totals must match before saving",
      "Then drop your signed documents",
    ],
    to: { name: "import" },
  },
  {
    title: "Start from zero",
    sub: "New company, or you only have a spreadsheet.",
    steps: [
      "Authorized shares + par value",
      "Add founders and vesting",
      "Optional: option pool, SAFEs already signed",
    ],
    to: { name: "wizard" },
  },
  {
    title: "I only have documents",
    sub: "Your old tool is gone. Build it from PDFs.",
    steps: ["Drop the folder", "Each document becomes a row", "You confirm each one"],
    to: { name: "sort" },
  },
  {
    title: "Try the sample company",
    sub: "Look around a made-up company first. Nothing is saved.",
    steps: [
      "Founders, an option pool, 3 SAFEs",
      "Click any row to see the math",
      "Start my own when you're ready",
    ],
    to: "sample",
  },
];

/** StartChoice.html (F-06). */
export function StartChoice() {
  const app = useApp();
  return (
    <main className="wide">
      <Stepper current={4} />
      <h1>How do you want to start?</h1>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 16,
          marginTop: 16,
        }}
      >
        {CARDS.map((c) => (
          <button
            type="button"
            key={c.title}
            className="opt"
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "flex-start",
              textAlign: "left",
            }}
            onClick={() => (c.to === "sample" ? openSample(app) : app.go({ name: "questions", next: c.to }))}
          >
            <b style={{ fontSize: 16 }}>{c.title}</b>
            <div className="muted small" style={{ margin: "4px 0 10px" }}>
              {c.sub}
            </div>
            <ol className="small" style={{ margin: 0, paddingLeft: 18 }}>
              {c.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          </button>
        ))}
      </div>
      <p className="muted" style={{ marginTop: 20 }}>
        You can always import more later. Nothing is final until you confirm.
      </p>
    </main>
  );
}
