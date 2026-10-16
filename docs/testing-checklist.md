# Testing checklist (before v0.1.2)

Tick as you go. Anything that breaks: tell Claude, it gets fixed before the release.
Before you start: `git pull` if needed, restart `pnpm dev:desktop` (the native side changed), and `./host.sh up` in `apps/relay/docker` for the relay.

## Signing
- [ ] 1. New SAFE: both signatures land on YC's own signature page (company "By:" and investor "By:"), no extra page added.
- [ ] 2. Old stuck "SAFE · Mads test": Refresh → it files.
- [ ] 3. Side letter: sign it, it files.
- [ ] 4. Send wire instructions: the email arrives with the signed SAFE + wire PDF.
- [ ] 5. Discount-only SAFE.
- [ ] 6. MFN SAFE.
- [ ] 7. SAFE with your own PDF.
- [ ] 8. Documents → Send for signature (any PDF).
- [ ] 9. Send reminder, then Cancel.
- [ ] 10. Free limit (10 a month): send from an email that is NOT in `apps/relay/docker/.host/plans/plans.json`. The 11th send shows "That's 10 signing requests this month…". Your two emails are Pro, so they never hit it. Note: restarting the relay resets the count.

## Ask AI (new)
- [ ] 11. Settings → AI → Ask AI: pick Claude, paste your API key, Save key. Also try a local model (Ollama / LM Studio).
- [ ] 12. ✦ Ask AI button and ⌘K open the panel; Esc and × close it; it stays open when you switch screens.
- [ ] 13. Questions: "who has unvested options?", "what's missing?", "ownership as of last year". Source chips under answers open the right holding or document.
- [ ] 14. Drafts: "add a grant for Ana: 40,000 options, 4 years, 1-year cliff" → card → "Open in the grant form" is prefilled. Nothing is saved until you save the form.
- [ ] 15. "Add double-trigger acceleration" → amber "No template… ask a lawyer" card.
- [ ] 16. Documents: with "Let cloud AI read documents" OFF, Claude must say it can't read the document; ON, it reads it.

## Sorting documents
- [ ] 17. Choose a folder with your SAFEs (`~/Downloads/AI Library/Financial Reports`): "Looking through… N found", then a progress bar with time left. **If it still does nothing or shows "couldn't open", send Claude the exact message.**
- [ ] 18. Leave the page mid-sort: the "Sorting 3/9" chip in the top bar brings you back, results are kept.
- [ ] 19. Review: document preview with page buttons, a 1–2 sentence summary, fields filled in, clear buttons ("File as proof for…" / "Add this SAFE to the cap table"). Hippo documents in "Test 2" warn "this document is for Hippobuild, but the open company is Test 2".

## Export (new)
- [ ] 20. Export → Excel: compare with the Pulley file (Summary, Ownership, ledgers, Convertibles, Voting). Numbers match the cap table screen.
- [ ] 21. Export → CSV: one row per holding with all columns.
- [ ] 22. Share with lawyer (.zip): the full Excel file is inside.

## Import and data
- [ ] 23. Import from Pulley (your Hippobanco xlsx is a good test) and Carta.
- [ ] 24. Employee stock options: grant, vesting, exercise; cap table and dilution update.
- [ ] 25. Delete a whole company folder: no crash, no ghost company in the switcher.
- [ ] 26. Two companies: switch between them, data stays separate.

## Look and feel
- [ ] 27. Header on every screen (especially Documents): no wrapped "Cap table", path on one line, buttons on their own row when narrow.

## Website
- [ ] 28. capfolder.com → Get the download → Tally form → download links work.
- [ ] 29. Umami shows the visit and the button clicks; the Roadmap section and privacy@capfolder.com are on the site.

## Release
- [ ] 30. Release v0.1.2: the installed app updates itself.
