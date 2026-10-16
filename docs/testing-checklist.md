# Testing checklist (before v0.1.2)

Tick as you go. Anything that breaks: tell Claude, it gets fixed before the release.
Restart `pnpm dev:desktop` after pulling new changes.

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
- [ ] 10. Hit the free limit: the error message is clear.

## AI
- [ ] 11. Connect each local AI (Ollama, LM Studio): detected, model picked.
- [ ] 12. AI with no network.
- [ ] 13. Use AI on a real cap table: what's useful, what's missing (notes for the chat feature).

## Import and data
- [ ] 14. Messy folder (mixed PDFs, scans, duplicates, odd names): progress is clear, can leave the page, review shows a preview + summary.
- [ ] 15. Import from Pulley (needs the pilot's exports).
- [ ] 16. Import from Carta.
- [ ] 17. Employee stock options: grant, vesting, exercise; cap table and dilution update.
- [ ] 18. Delete a whole company folder: no crash, no ghost company in the switcher.
- [ ] 19. Two companies: switch between them, data stays separate.

## Website
- [ ] 20. capfolder.com → Get the download → Tally form → download links work.
- [ ] 21. Umami shows the visit and the button clicks.

## Release
- [ ] 22. Release v0.1.2: the installed app updates itself.
