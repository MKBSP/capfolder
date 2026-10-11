# Show HN draft (Mads posts; check every claim the week of launch)

**Title:** Show HN: Capfolder – an open-source cap table that lives in a folder you own

**URL:** https://capfolder.com/?ref=hn

**Text:**

Pulley shuts down on December 8. We raised our seed on SAFEs, some signed in Pulley, some on investors' own paper, some by email, and when we needed the documents they were scattered or gone.

Capfolder is a desktop app (Tauri, AGPL-3.0) that keeps the cap table as plain files in a folder on your computer:

- `events.jsonl`: an append-only, hash-chained log of Open Cap Format (OCF) records. Mistakes are fixed by new entries, never edits.
- `captable.csv`: regenerated on every change, opens in Excel without the app.
- `docs/`: your signed documents, sorted by type and linked to the holdings they prove.

What it does today:
- Import from Pulley/Carta/Cake spreadsheets or any OCF export. It refuses to save until totals match the old tool to the share.
- Point it at a messy folder of PDFs and scans. It reads them locally (PDF.js, tesseract.js), files the ones it's sure of, and asks about the rest. When it isn't sure, it asks.
- Vesting, the option pool, SAFEs, a "what's missing" checklist (83(b)s, IP assignments, board consents), exports for any date, and a zip for your lawyer.
- Signatures go through a small relay in front of self-hosted Documenso. It's the only server involved, and it deletes the document once it's signed and back in your folder. You can self-host it.
- Optional local AI (Ollama/LM Studio) for documents the rules can't sort. It only proposes; you click.

It's free. Code, tests and the golden cap-table fixtures are on GitHub: https://github.com/MKBSP/capfolder

Not legal advice, and not affiliated with Pulley or Carta. I'd love feedback from anyone migrating off Pulley this month, especially exports that don't import cleanly.
