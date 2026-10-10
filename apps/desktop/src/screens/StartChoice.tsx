import { Stepper } from "../components/ui";
import { type Route, useApp } from "../state";

const CARDS: { title: string; sub: string; steps: string[]; to: Route }[] = [
  {
    title: "Import from Pulley or Carta",
    sub: "You have a cap table somewhere. About 2 minutes.",
    steps: [
      "Export a CSV there",
      "Drop it here, check the columns",
      "Totals must match before saving",
      "Then drop your signed documents",
    ],
    to: {
      name: "comingSoon",
      title: "Import",
      milestone: "M2",
      text: "Import from Pulley, Carta, Cake, OCF or any spreadsheet.",
    },
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
    to: {
      name: "comingSoon",
      title: "Documents",
      milestone: "M4",
      text: "Drop a messy folder; it gets sorted and matched.",
    },
  },
];

/** StartChoice.html (F-06). */
export function StartChoice() {
  const { go } = useApp();
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
            style={{ display: "block", textAlign: "left" }}
            onClick={() => go(c.to)}
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
            {c.to.name === "comingSoon" ? (
              <span className="chip" style={{ marginTop: 10 }}>
                Coming soon ({c.to.milestone})
              </span>
            ) : null}
          </button>
        ))}
      </div>
      <p className="muted" style={{ marginTop: 20 }}>
        You can always import more later. Nothing is final until you confirm.
      </p>
    </main>
  );
}
