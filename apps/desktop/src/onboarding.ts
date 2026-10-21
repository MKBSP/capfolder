// docs/19: the "Get started" checklist. Ticks are computed from the cap table, never stored, so they can't drift.
import type { State } from "@capfolder/core";
import type { Route } from "./state";
import { isFounder } from "./views";

/** The three yes/no questions after StartChoice. Unanswered = show the step. */
export type Answers = { safes?: boolean; pool?: boolean; priced?: boolean };

export interface Step {
  label: string;
  help: string;
  done: boolean;
  action: string;
  to: Route;
  capTable?: boolean; // Import is the main button on these while the company is empty
  how?: { label: string; url: string }; // a help page on the website, with screenshots
}

export function getStarted(s: State, a: Answers, aiConnected: boolean): Step[] {
  const sec = [...s.securities.values()];
  const steps: (Step | false)[] = [
    {
      label: "Company details",
      help: "Legal name, country and currency, as on your certificate of incorporation.",
      done: !!s.issuer?.legal_name,
      action: "Edit company",
      to: { name: "settings" },
    },
    {
      label: "Share classes",
      help: "How many shares the company can issue and their par value.",
      done: s.classes.size > 0,
      action: "Set up shares",
      to: { name: "wizard" },
      capTable: true,
      how: { label: "What is a cap table?", url: "https://capfolder.com/learn/cap-table/" },
    },
    {
      label: "Founders and their shares",
      help: "Who owns the company today, and how their shares vest.",
      done: sec.some((x) => isFounder(s, x)),
      action: "Add founder shares",
      to: { name: "newShares" },
      capTable: true,
      how: { label: "How do I add founders?", url: "https://capfolder.com/help/founders/" },
    },
    a.pool !== false && {
      label: "Option pool and grants",
      help: "Shares set aside for employees, and the options granted from them.",
      done: s.plans.size > 0 && sec.some((x) => x.kind === "equity"),
      action: s.plans.size ? "Add a grant" : "Add an option pool",
      to: { name: s.plans.size ? "newGrant" : "pool" },
      capTable: true,
      how: { label: "How do option pools work?", url: "https://capfolder.com/learn/option-pool/" },
    },
    a.safes !== false && {
      label: "SAFEs",
      help: "Money investors gave you that turns into shares at a later round.",
      done: sec.some((x) => x.kind === "convertible"),
      action: "Add a SAFE",
      to: { name: "newSafe" },
      capTable: true,
      how: { label: "What is a SAFE?", url: "https://capfolder.com/learn/safe/" },
    },
    a.priced !== false && {
      label: "Priced round",
      help: "Preferred shares sold at a set price. Import them from your old tool or your lawyer's spreadsheet.",
      done: [...s.classes.values()].some((c) => c.data.class_type === "PREFERRED"),
      action: "Import",
      to: { name: "import" },
      capTable: true,
      how: { label: "Pre-money vs post-money", url: "https://capfolder.com/learn/pre-money-post-money/" },
    },
    {
      label: "File your signed documents",
      help: "Drop your signed PDFs. Capfolder files each one and links it to the cap table.",
      done: [...s.docs.values()].some((d) => !d.removed),
      action: "Sort documents",
      to: { name: "sort" },
    },
    {
      label: "Set up Ask AI (optional)",
      help: "Connect an AI on this computer or in the cloud to ask questions about your cap table.",
      done: aiConnected,
      action: "Set up AI",
      to: { name: "settings" },
    },
  ];
  return steps.filter((x): x is Step => !!x);
}
