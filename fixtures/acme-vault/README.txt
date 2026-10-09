THIS FOLDER IS A CAPFOLDER VAULT
=================================

It holds the cap table records of Acme Inc. You don't need Capfolder to read it.

events.jsonl   The record. One line per change, oldest first. Lines are never
               edited or deleted; mistakes are fixed by later lines. Each line
               contains the hash of the previous line, so edits are detectable.
               Equity data follows the Open Cap Table Format (OCF).
captable.csv   The current cap table, regenerated from events.jsonl. Opens in Excel.
ocf/           The same data as a standard OCF export, readable by other tools.
docs/          Signed documents, sorted by type. docs/_removed/ holds documents
               removed in the app (never deleted automatically).

Capfolder is open source (AGPL-3.0). Capfolder is software, not a law firm,
and does not give legal, tax or financial advice.
