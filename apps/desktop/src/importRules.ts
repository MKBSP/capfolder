// Where each tool hides its export (docs/04, "Export instructions shown to the user").
// The steps here are the fallback; the signed rules pack (rules/rules.json, export_guides) can replace them live.

export type SourceId = "pulley" | "carta" | "cake" | "ocf" | "sheet";

export const SOURCES: { id: SourceId; label: string; steps: string[]; extensions: string[] }[] = [
  {
    id: "pulley",
    label: "Pulley",
    steps: [
      "Dashboard → Download Cap Table (uncheck “All Time” for an as-of date), or Company → Reports → Detailed Cap Table → Generate.",
      "Also download every signed document before Pulley closes on Dec 8, 2026.",
      "Choose the .xlsx (or .csv) here. You'll check the columns next.",
    ],
    extensions: ["xlsx", "csv"],
  },
  {
    id: "carta",
    label: "Carta",
    steps: [
      "Cap Table → Run reports → “Open Cap Table report” if it's listed, otherwise the Cap table report (Detailed).",
      "Also the Securities ledger and Stakeholder details reports, and download your signed documents from the Documents library.",
      "Choose the .xlsx (or .csv) here. You'll check the columns next.",
    ],
    extensions: ["xlsx", "csv"],
  },
  {
    id: "cake",
    label: "Cake Equity",
    steps: [
      "Compliance → Reporting → Exports: Cap table (XLSX). SAFEs are in Noteholders (CSV).",
      "Choose one file here. You'll check the columns next; import the SAFEs into the same sheet or add them after.",
    ],
    extensions: ["xlsx", "csv"],
  },
  {
    id: "ocf",
    label: "An OCF export (.zip)",
    steps: [
      "Any tool that exports Open Cap Table Format gives a .zip with a manifest. It imports with its full history.",
    ],
    extensions: ["zip"],
  },
  {
    id: "sheet",
    label: "Any spreadsheet",
    steps: [
      "One row per holding: name, type, shares, dates, and SAFE amounts. You'll match the columns next.",
    ],
    extensions: ["xlsx", "csv"],
  },
];

/** Moving off a tool: its name in the "Compare with …" step and the "Before you cancel …" card on Home. */
export const MOVES: Partial<
  Record<SourceId, { tool: string; where: string; docs: string; closes?: string }>
> = {
  pulley: {
    tool: "Pulley",
    where: "Copy them from Pulley's Dashboard (the cap table summary).",
    docs: "Company → Data Room → Download All",
    closes: "2026-12-08",
  },
  carta: {
    tool: "Carta",
    where: "Copy them from Carta's cap table summary.",
    docs: "Documents library → download as zip",
  },
  cake: {
    tool: "Cake Equity",
    where: "Copy them from Cake Equity's cap table summary.",
    docs: "Documents → download each folder",
  },
};
