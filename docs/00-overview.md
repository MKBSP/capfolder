# 00 · Overview

## One line
Your cap table, in a folder you own. Issue SAFEs and options, track vesting, collect signatures. Open source, local-first.

## Why now
Pulley announced its shutdown on Sep 15, 2026.
- **Nov 30:** last day to opt into the Carta migration.
- **Dec 8:** Pulley stops operating.
- **Jan 31, 2027:** limited data access expected to end.

Founders must move their cap table now, and many have documents scattered across Pulley, email and investors' own paper.

## Founder story (website copy)
We raised our seed on SAFEs from 28 investors. Some signed in Pulley, some on their own paper, some by email. When we needed the documents, the data was gone. We built a cap table that lives in a folder you own, and open-sourced it so it can't disappear.

## v1 scope
- **One user:** the founder, the only admin.
- **Home screen:** the cap table, with vesting for everyone.
- **"What's missing":** gaps in documents, such as an unsigned SAFE, a missing 83(b) or a missing IP assignment.
- **Import:** from Pulley, Carta, Cake, OCF or any spreadsheet (F-07).
- **Documents:** drop a messy folder, it gets sorted and matched (F-09).
- **Issue:** SAFEs (YC post-money), option pool and grants, shares.
- **Async signing** through a relay (Documenso). Signers need no account.
- **Changes:** corrections, renames, SAFE transfers, terminations, exercises, repurchases.
- **Export:** Excel/CSV as of any date, a lawyer zip, and OCF.
- **Optional AI:** local (Ollama / LM Studio), the user's subscription CLI (Claude Code / Codex / Gemini), or an API key.
- **MCP server** (read-only) so Claude Desktop or ChatGPT can query the vault.
- **App lock** (Touch ID / Windows Hello / app password). This is not encryption.
- **Updates:** signed app updates plus a signed rules pack.

## Not in v1
- Vault encryption (later, opt-in)
- Multi-admin
- Investor/employee logins
- Round modeling, waterfalls, 409A
- Non-US templates (tracking only)
- SAFE conversion math at a priced round (the founder records the result)

## Decisions already made
| Topic | Decision |
|---|---|
| License | AGPL-3.0 |
| Data model | OCF transactions inside our hash-chained event log |
| Desktop | Tauri 2 (Rust + TypeScript/React) |
| Signing | Documenso (self-hosted by us; users can self-host), behind our thin relay API |
| Password | App lock only; files stay plain |
| Email | Optional in the app (needed only to send for signature). Required on the website download (Tally form) |
| Templates | YC SAFEs unmodified + credited. Everything else: attach your own |
| Monetization (v1) | Free. Pay-what-you-want link (Revolut) after download. A paid hosted relay may come later |
| Launch | Show HN + Bookface, before Nov 30, 2026 |
| Pilots | Founder's former company (an ex-Pulley customer) + one friend's company |

## Disclaimer (exact text; show on first run, in every export, and in the website footer)
> Capfolder is software, not a law firm. It does not give legal, tax or financial advice. Templates come from public sources such as Y Combinator and are provided as is. Have a lawyer review your documents.

## Links
- **Domain:** capfolder.com (to register)
- **Design canvas (private, owner only):** https://claude.ai/artifact/1T1fb2bpZET1HPGmjrwQuT
- **Revolut pay-what-you-want:** https://checkout.revolut.com/pay/5f256b0e-5234-478c-b512-e92228c101df
- **Tally download form:** id `rjxQjR` (see `integrations/tally.md`)
