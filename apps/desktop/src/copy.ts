/** Exact disclaimer text (docs/00-overview.md). Shown on first run, in every export and in the website footer. */
export const DISCLAIMER =
  "Capfolder is software, not a law firm. It does not give legal, tax or financial advice. Templates come from public sources such as Y Combinator and are provided as is. Have a lawyer review your documents.";

/** Bump when TERMS changes; Settings stores the version the founder accepted. */
export const TERMS_VERSION = "2026-10-10";

// Draft: to be reviewed by a lawyer before launch (docs/15).
export const TERMS = [
  ["What Capfolder is", DISCLAIMER],
  [
    "Open source, as is",
    "Capfolder is free, open-source software under the GNU AGPL-3.0 license. It is provided as is, without warranty of any kind. You are responsible for checking your cap table and documents.",
  ],
  [
    "Your data stays with you",
    "Your cap table lives in a folder on your computer that you choose. Capfolder has no account and no server copy of it. Back the folder up (iCloud, Dropbox or similar); if it is lost, Capfolder can't recover it.",
  ],
  [
    "Anonymous usage counts",
    "Capfolder sends anonymous usage counts so we know the app is used: an install id, the app version, your operating system and three yes/no flags (whether you imported a cap table, attached documents, and sent a document for signing). Never company data, names, numbers or files. Turn it off any time in Settings.",
  ],
  [
    "Email (optional)",
    "If you give your email, it's used only for product updates and security notices. You can skip it.",
  ],
] as const;
