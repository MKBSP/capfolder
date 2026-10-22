# 15 · Status, to do, missing things, future ideas

Updated 2026-10-11 (after M4). Milestones and acceptance tests: `docs/09-build-plan.md`. History: `CHANGELOG.md`.

## Where the docs are
| Topic | File |
|---|---|
| Requirements (product, decisions, scope) | `docs/00-overview.md`, `docs/02-user-stories.md` (F-01…F-38, the spec) |
| Architecture | `docs/01-architecture.md`, data model `docs/03-data-model.md` |
| Plans | `docs/09-build-plan.md` (milestones), `docs/superpowers/specs/` (design specs), `docs/superpowers/plans/` (implementation plans) |
| Topic specs | import `04`, signing `05`, AI `06`, updates `07`, design system `08` |
| Research, metrics, licensing, brand | `10`, `11`, `13`, `14`; competitor gap analysis `20` (SumoShares) |
| Future (do not build yet) | `docs/12-cloud-later.md`, plus "Future ideas" below |

## Status
| Milestone | State |
|---|---|
| M0 Repo + CI | Done 2026-10-10 |
| M1 Core engine | Done 2026-10-10 |
| M3 Desktop shell (Tauri) | Done 2026-10-10 (built before M2, see below) |
| M6 Export (xlsx, lawyer zip) | Done 2026-10-10; richer xlsx 2026-10-21: Overview tab first (4 key numbers, ownership doughnut, vested-over-time line as real chart parts, checked in Numbers), Vesting by month and Missing documents before All holdings. Skipped: "if the SAFEs converted" estimate (reads as advice). |
| M2 Import | Done 2026-10-10 (OCF + generic spreadsheet). Still to come: OCF + generic spreadsheet first; Pulley/Carta/Cake when real files arrive (Mads is collecting testers' exports and template docs) |
| M5 Signing | Done 2026-10-10, runs locally; hosting relay.capfolder.com is Mads' decision |
| M4 Document sorting | Done 2026-10-11 (rules + kNN + local AI, OCR; tested on a synthetic folder, run the pilot's folder when it arrives) |
| M7 Updates + release | Built 2026-10-11 (updater, release workflow, signed rules pack). The v0.1.0 → v0.1.1 check runs once the certificates and secrets exist |
| M8 Website + launch | Built 2026-10-11 (`apps/website`, install ping, metrics workflow, dashboard, launch drafts in `docs/launch/`); going live is Mads' list below |

Order changed 2026-10-10 so the full product can be tested sooner: M3 → M6 → M2 → M5 → M4 → M7 → M8.

Target: launch before **Nov 30, 2026**. Pulley shuts down Dec 8.

## To do (outside the code, owner: Mads)
- [ ] Get the pilot company's Pulley exports + every signed PDF **before Dec 8, 2026** (M2 test data).
- [x] Install CLA Assistant on `MKBSP/capfolder`, pointing at `CLA.md` (done 2026-10-21).
- [ ] Lawyer review of `CLA.md` / `CCLA.md` (incl. explicit "relicense" wording, docs/13).
- [ ] Trademark search (USPTO, EUIPO). (capfolder.com is registered and live.)
- [ ] Apple Developer ID + Windows code-signing certificate (M7).
- [ ] **Back up offline** `~/.tauri/capfolder-updater.key` (lose it and installed apps can never update) and `~/.capfolder/rules-signing.key`.
- **Decision 2026-10-18:** stay unsigned ("allow unsigned" builds) until there's real interest; then pay Apple ($99/yr) first, Microsoft later. How-to: `docs/07` → Getting the certificates.
- [ ] GitHub secrets for `release.yml`: `TAURI_SIGNING_PRIVATE_KEY` (the updater key file's contents; it has no password, so set `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` empty or regenerate it with one), `APPLE_CERTIFICATE` (.p12, base64), `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD` (app-specific), `APPLE_TEAM_ID`, `WINDOWS_CERTIFICATE` (.pfx, base64), `WINDOWS_CERTIFICATE_PASSWORD`.
- [ ] First release: tag v0.1.0, publish the draft; then v0.1.1 to see the update arrive on each OS (M7 acceptance).
- [ ] Send real Pulley / Carta / Cake export files (anonymize names/emails, keep numbers): each gets a detector + golden test.
- [ ] Decide where the relay + Documenso run (relay.capfolder.com), and which email service sends codes and signing emails (SMTP). Then a production signing certificate (self-signed works; an AATL certificate shows a green check in Acrobat).
- [ ] Source the YC post-money SAFE template so New SAFE can fill it (today the founder attaches the filled PDF).
- [ ] Lawyer review of the in-app terms and conditions (`apps/desktop/src/copy.ts`, TERMS).
- [x] Tally form `rjxQjR` published 2026-10-15 (thank-you page → releases/latest, optional "Email me when there's a new version" consent box).
- [x] Website hosting: Cloudflare Pages (project `capfolder`, functions at the repo root).
- [ ] Google Search Console + Bing Webmaster: verify capfolder.com, submit `https://capfolder.com/sitemap.xml` (Bing file is live).
- [x] Umami Cloud site `capfolder.com` (id in `apps/website/index.html`).
- [x] Cloudflare Email Routing: `privacy@capfolder.com` → your inbox (done 2026-10-21).
- [ ] Check the site's personal story is right ("28 investors", "YC W22", the name "Tim Apple") and re-check the comparison table against vendors' pages in launch week.
- [ ] Relay hosting: set `PING_FILE` to a persistent path; turn off reverse-proxy access logs for `/ping` (IP + time would undo "no IP"). The site says "with our hosted signing relay": host it (Documenso storage encrypted at rest) before launch, or drop that line.
- [ ] Privacy contact: the site's privacy section points to GitHub issues; add a contact email (and your legal name/address if the lawyer says so, GDPR Art. 13). Lawyer: is the random install id OK without a deletion route?
- [ ] Post `docs/launch/show-hn.md` and `docs/launch/bookface.md` (edit first).

## Missing in the desktop app (M3)
- Not built yet (shown as Coming soon): AI through CLIs (Claude Code, Codex, Gemini) or API keys, chat and the MCP server; updates (M7), Touch ID / Windows Hello (M7).
- Built 2026-10-11: SAFE/share transfer (F-20), merge duplicate people (F-21), replace/rename a document (F-28), unsigned-draft detection, drag and drop.
- Not built, no placeholder: two-laptop forks (F-35), rebaseline after an outside edit (F-31), document generation from templates.
- Founder detection is a heuristic (common stock issued on the formation date or with vesting) until stakeholder roles exist.
- Options recorded without a strike are stored at $0 (with a 409A warning).
- Reset of a forgotten app password is manual (remove the "Capfolder" keychain item).
- File scope covers ~/Documents and dialog-picked folders; a vault elsewhere must be opened through the dialog once.

## Missing / known limits (engine)
- Hash chain catches accidental edits only; a rewrite with recomputed hashes is undetected. Needs signing/anchoring.
- `appendEvent` allows making an already-reported problem worse (e.g. a negative pool more negative); only new kinds of problems block.
- Chain doesn't check `seq` continuity or duplicate event ids (duplicates collapse when replayed).
- Exercising options whose vesting is "unknown" skips the exercise ≤ vested check.
- Vesting: only start + month-based relative chains or explicit `vestings[]`. No event triggers, absolute dates, acceleration math, front/back-loaded allocations.
- No SAFE conversion math at a priced round (by design for v1; founder records the result).
- OCF export leaves out `DOCUMENT` objects until documents carry an md5 (M3/M4).
- Fork merge (two devices, F-35) only accepts `prev` arrays structurally.
- Fresh install on an arm64 Mac with an x64 Node needs `pnpm i --force` (rolldown native binding).

## Open `[verify]` items in the docs
- Biometric unlock crate/plugin for Tauri desktop (`01`).
- Documenso enterprise-license features: API, embedded signing (`01`, `02`, `05`, `10`); how it exposes the signature certificate (`05`).
- Captable, Inc. maintenance status for vesting logic reference (`01`). M1 implemented vesting from OCF directly, so this is now low priority.
- Real export headers for Pulley, Carta, Cake (`04`).
- AI CLI flags and vendor terms (`02`, `06`).
- Tauri icon command (`14`).

## Next developments (agreed 2026-10-15, after the v0.1.2 test round)
Not yet: billing, pricing and referrals wait; for now users can only donate (Revolut).

1. **Billing** through a merchant of record (Paddle / Lemon Squeezy) so EU VAT is handled; Revolut doesn't. Pricing and referrals depend on it.
2. **Pricing:** Pro at 50/month or 500/year (currency open: € or $). Website still says "Pro $50/month, Coming".
3. **Referrals:** 50 off the next payment, only for confirmed referrals who actually paid a subscription.
4. **Define Pro** (sync, online backup, more signing requests?) and how the app knows a user is paying. The relay's email/signing limits must be **per account**: free accounts keep the daily limit, paying accounts don't. **Done 2026-10-16:** keyed by the sender's verified email (not per company: companies can be cloned), free = 10 a month (UTC calendar month), Pro listed by hand in the relay's plans file (`apps/relay/HOSTING.md`); billing will write the same list.
5. **Product tour + getting-started checklist,** after competitor onboarding research.
6. ~~Public roadmap~~ on the website: done 2026-10-15 (`#roadmap`, Now/Next/Later; no infrastructure items).
7. **Templates:** insert parts (clauses/blocks) into templated docs; more items from Mads to come.
8. ~~**Website analytics**~~ done 2026-10-15; 2026-10-21: served through our own `/stats` proxy (`functions/stats/` at the repo root, where the Pages project looks) because Umami moved sending to `gateway.umami.is`, which the CSP blocked (no data was ever collected), and blockers drop `cloud.umami.is`. Was waiting on the Umami id (Umami Cloud: free, cookieless, click events, referrers; `?ref=` on shared links) and a privacy contact email (Cloudflare Email Routing → `privacy@capfolder.com`).
9. **Update emails** to the download-form list: only people who ticked the consent box. Resend Broadcasts (already our sender for the relay); import Tally submissions into a Resend audience.
10. **Move the relay** off the laptop to a real server. Stays on the laptop for now; internal roadmap only, not on the website.
11. **AI ↔ structured equity terms.** Vesting, cliffs, ESOP/plan terms and other OCF settings are standardised and easy to edit, so both directions work:
    - **Doc → settings:** a founder adds a vesting plan, ESOP or grant letter; the AI reads it and creates the matching OCF settings (vesting schedule, cliff, acceleration, plan pool, …) for the founder to confirm.
    - **Request → settings + doc:** "add a grant for my employee with these conditions" → the AI creates the settings *and* finds the matching document in the template marketplace. If no template fits, it says so plainly and tells the founder to get a lawyer to draft it. It never invents legal text.

12. **AI chat** ("✦ Ask AI" side panel, local + cloud keys, answer + propose): first version built 2026-10-16; "What needs my attention?" with Take me there built 2026-10-21 (works without an AI). See `docs/18-ai-chat.md`.

13. **Deeper security work** (before paid users and before the relay leaves the laptop):
    - Full threat model: what a malicious shared company folder, imported file, PDF or AI answer can do (path/symlink tricks, prompt injection, formula injection, oversized files).
    - Review the relay end to end: auth codes, rate limits that survive restarts, Documenso exposure through the tunnel, secrets on the host.
    - Desktop: Tauri capabilities and fs scope down to the minimum, CSP, API keys only in the keychain, signed updates.
    - Dependency audit in CI, and an outside penetration test before launch of Pro.

14. **Startup-finance knowledge base for Ask AI** (a small "RAG" the AI looks things up in only when needed):
    - Our own plain-language explainers, written for Capfolder and kept in the repo (e.g. `knowledge/`): SAFEs (post-money, cap, discount, MFN, pro rata), "outstanding", fully diluted vs issued, option pools and vesting, cliffs, acceleration, 83(b), liquidation preferences, pre/post-money, dilution, conversion at a priced round.
    - Books and guides are **reading sources only**, never copied in (copyright): Feld & Mendelson *Venture Deals*, Kupor *Secrets of Sand Hill Road*, YC's SAFE user guide and Startup School notes, Cooley GO and Series Seed (CC0) docs, the OCF glossary.
    - Ask AI gets one `explain_term` tool: keyword lookup over those files, no vector database (ponytail: upgrade to embeddings only if lookups miss). The answer combines the explainer with the company's own numbers ("$150k outstanding means…, for you that's these 3 SAFEs").
    - Ships with the app and the rules pack, so it can be updated without a release; every explainer says "not legal advice".
    - **Website articles from the same explainers (2026-10-19, Mads):** one page per topic on capfolder.com (learn + help), so the knowledge base also brings search traffic.
      - Start from Carta's learn library as the topic map: https://carta.com/learn/startups/equity-management/cap-table/ (and its sibling sections). Read it and the sources it cites, then write our own text. Never copy or lightly reword theirs.
      - Every page cites its sources, and **always Investopedia** for the term, plus the primary source (YC SAFE guide, SEC/IRS pages, OCF docs) where there is one.
      - Each article links to the matching help page and app screen, and the help pages link back.
15. **Onboarding:** sample company, 3 yes/no questions, a Get started checklist on Home, a Driver.js spotlight tour, "?" help tips. Built 2026-10-17 (`docs/19-onboarding.md`); 2026-10-21: "How?" links to the learn guides, sample company as a real button on Welcome. No invite step until sync / web app.

16. **Vesting screen** built 2026-10-20 (Mads' Claude Design "Vesting Overview"): a Vesting tab with the pool cards (total, allocated, vested, available incl. returned), one pool bar, a row per grant (vested %, strike, next vest, documents) that opens to the graph (flat to the cliff, the jump, monthly steps or a straight line, Today marker, stops at a leaving date, hover/arrow-key card), key dates, price (strike, FMV, exercise cost, vested value, exercise by) and that person's signed documents; "Show former employees". The Person page uses the same graph. Not yet: role/title under the name (no stakeholder roles yet), a help page for it (`apps/website/help/pages.json`).

17. **Signing blocks in the right place (requested 2026-10-22).** The SAFE and other key documents sent for signature must put each signature block where the document's signature page has it, in the right format. Today it looks wrong: see the SAFE signed by Mads and Camilo in the pilot company's Documents. Check every built-in template (YC SAFE, pro rata side letter) against a signed copy.

18. **Field editor for your own templates (requested 2026-10-22).** When a founder uploads a new template, they mark where things go: fields like `<name>`, amount and date, and the signature block for each signer, placed on the right area of the page. Needed before "attach your own" documents can be sent for signature properly.

## Future ideas (not in v1)
- **Stakeholders see their own holdings from their own AI (Mads, 2026-10-21; research first).**
  - **Pitch to founders:** "Give your stakeholders access to their own documents, without them leaving your laptop." Never "create an MCP server for your stakeholders": the MCP is how it works, not what we sell.
  - **Flow:**
    1. The founder clicks a few buttons ("Share with Steve").
    2. Capfolder starts a local MCP server that only exposes that person's own documents, vesting, shares and SAFEs.
    3. The founder sends the stakeholder a link or invite.
    4. The stakeholder adds it in ChatGPT, Claude or whatever AI they use.
    5. Their AI authenticates, and **the founder approves each one in Capfolder** before anything is readable.
  - **Scope:** read-only, per-person, can be revoked any time, and every access is logged.
  - **Later:** a web app does the same in a browser.
  - **To research:**
    - how a remote AI reaches a server on a laptop (tunnel through our relay? the laptop must be on);
    - MCP auth (OAuth 2.1 / the MCP authorization spec), and which clients support remote MCP with auth;
    - per-person data scoping, rate limits and audit;
    - what happens when the laptop sleeps;
    - prompt injection through documents.
- **From the SumoShares gap analysis** (`docs/20-sumoshares.md`, with code links and what to copy or not):
  1. ~~409A record~~ and the below-FMV grant warning built 2026-10-20 (OCF `VALUATION`, "Add 409A" on the Vesting screen, FMV = latest 409A on or before the as-of date; the sample company has one at $0.42). Not yet: the 12-month expiry banner, and attaching the report in the same form (attach it in Documents).
  2. Option deadlines: countdown on Person, "Expire them" on open (the founder confirms).
  3. ~~Import tie-out~~ built 2026-10-20: "Compare with Pulley/Carta" table (fully diluted required; each class, options outstanding, pool available, SAFE total, stakeholders optional), vested-so-far checked against the schedule (1 share of rounding allowed; more than granted blocks), "Before you cancel {tool}" card on Home and on the Pulley/Carta compare pages. Not yet: the full per-grant balance (needs exercised/cancelled columns from a real Pulley export). `[verify]` the "where to copy it from" hints against real Pulley and Carta screens.
  4. Exercises (Form 3921 inputs) and events CSV exports.
  5. With the web app / Pro: holder portal, online exercise through the signing relay, reminder emails.
- Cloud tier ($50/mo): sync, roles, four-eyes approval (`docs/12`).
- Vault encryption (opt-in).
- Investor/employee logins to see their own holdings.
- Round modeling, waterfalls, 409A; SAFE conversion at a priced round.
- Non-US entity templates (PT Lda, DK ApS, UK Ltd).
- Signed/anchored event log (e.g. signed checkpoints) for real tamper evidence.
- Paid hosted relay; AI credits for people without their own AI.

## M3 decisions (rulings made during the build)

- work on main — Mads asked for linear history on main — cost: none
- State gains allSecurityIds (all security_ids regardless of asOf) and Security.price — nextSecurityId must not reuse a future-dated id; exercise/repurchase need the original price — cost: none
- TX_STOCK_PLAN_RETURN_TO_POOL carries security_id — OCF requires it (schema test caught it) — cost: none
- tauri companion crates pinned via Cargo.lock (tauri-runtime 2.11.3, tauri-runtime-wry 2.11.4, tauri-macros/codegen 2.6.3) — cargo resolved 2.12 runtime crates that don't compile with tauri 2.11.6 — cost: none (lockfile committed)
- jsdom pinned to 26.1.0 via pnpm override — jsdom 30 needs Node ≥22.12 (local Node is 22.9) — cost: none
- fs scope $HOME/** for now (ponytail; narrow to chosen vault in M7) — cost if wrong: broader file access than needed
- argon2 0.6 API (hash_password generates salt; phc::PasswordHash), keyring 4 default v1 API — crate versions newer than plan assumed — cost: none
- captable.csv "edited" check compares against the CSV regenerated at capfolder.json.captable_as_of — otherwise vesting changing day to day would flag every reopen as an outside edit; test "regenerated on another day is not reported as edited" — cost: none
- appendToVault re-reads events.jsonl and refuses if it changed outside the app — cheap guard until F-35 forks — cost: none
- security-review finding (fs scope $HOME/**) fixed now — scope = $APPDATA, $DOCUMENT + dialog-picked folders persisted via tauri-plugin-persisted-scope — cost if wrong: a vault outside ~/Documents opened without a dialog (recent list) relies on the persisted scope
- core exports builders as a namespace (builders.safe…) to avoid top-level name clashes — cost: none
- vitest 5 + jsdom: rejects.toThrow loses the message; tests use rejects.toMatchObject({message}) — cost: none
- security-review path traversal fixed — isSafeDocPath (docs/ prefix, no ..) guards remove + missing-doc checks; company names with / \ or leading dot rejected — tests 'untrusted paths' RED→GREEN — cost: none
- Platform interface (fs, paths, dialogs, reveal, lock) instead of mockIPC — one seam makes every screen testable with fakePlatform; nav/crumb use <button> not <a> (a11y lint) — cost: none
- Logo uses the real brand/mark.svg paths (Mads: follow the original layout) — cost: none
- Welcome defaults to app password (Touch ID shown disabled, Coming soon M7); telemetry toggle + exact disclaimer on Welcome; "Other" entity asks for a 2-letter country — cost: none
- security-review fail-open fixed — settings owned by App, idle lock reads current settings; test 'password set during first run is enforced…' RED→GREEN — cost: none
- builders accept explicit securityId and core exports nextSecurityIdNumber — one batch must issue CS-1, CS-2… without reusing an id — cost: none
- live preview ignores stale async results (found by the over-issue UI test: an earlier keystroke's preview cleared the latest error) — cost: none
- AttachModal built in Task 10 (Home's What's-missing 'Attach' needs it) instead of Task 13; Export .csv uses the captable.csv format (disclaimer lives in README.txt) — cost: none
- form previews show the cap table as of the later of the as-of date and the change's own date (a change dated today was invisible at an earlier as-of) — caught by form tests — cost: none
- new persons carry their id from creation (PersonChoice.newId) so drafts are stable between renders; options with no strike are recorded at $0 with the 409A warning (schema requires exercise_price) — cost: a $0 strike is visible data, fixable with a correction
- corrections limited to a per-type field list (quantity, price/strike, amount, cap, date); transfer for 'different entity' shown as Coming soon; SAFE names on Home link to Person — cost: rarer fields need a reversal + re-entry
- checklist items = certificate, bylaws, plan; per founder SPA + CIIAA + 83(b) when vesting; per grant + CIIAA; per SAFE — derived from state (acme 3/16) — cost: a company needing other docs adds them as 'Other'
- re-graded Minor "lock set/clear failures unhandled" to Important — on Linux without a secret service, Continue silently does nothing (first run stuck)
- Home verify footer kept ("totals add to 100.00%" shown only when checkInvariants, which includes the FD-sum invariant, is empty) — reviewer called it hard-coded; it is gated — cost: none

## M3 deferred minors (from the final review)

- Person discount display uses float (7% → 7.000000000000001%)
- NewSafe preview discount and usdShort use float for display
- todayIso/as-of use UTC date and don't roll over at midnight
- Pool BigInt on decimals (now guarded by a whole-number check) / useDryRun has no .catch
- writeDerived throwing after a successful append shows an error and the retry says "changed outside the app"
- Modal renders <dialog open> (no backdrop/focus trap/Escape)
- .git under $DOCUMENT never detected (leading-dot scope); suggestedFolders outside scope never offered
- reveal scope doesn't cover vaults outside the four roots
- persisted-scope remembers every attached-file and save-dialog path
- createVault doesn't reject Windows-reserved characters or a trailing dot
- openVault overwrites an existing captable.edited.csv
- Documents uses label as React key (two founders with the same name collide)
- NewSafe shows a 'stakeholder already exists' error behind the Attach modal after recording

## M6 decisions (rulings made during the build)

- No exceljs: its reader pulls `buffers` (no license at all), plus jszip/unzipper. A ~100-line xlsx writer on fflate instead — cost if wrong: reading Pulley/Cake xlsx in M2 needs its own choice of reader.
- `(MIT AND Zlib)` added to the license allow-list (pako, via pdf-lib) — both permissive — cost: none.
- xlsx cells: shares as integers, money/percents written from their exact decimal strings (no float conversion) — cost: none.
- PDF uses the standard Helvetica font; characters outside WinAnsi print as "?" — cost: a non-Latin name looks wrong in the PDF (the xlsx is exact). Embed IBM Plex later.
- Lawyer scope "one round" skipped (rounds aren't modeled); "One person" excludes events.jsonl, OCF and the full cap table because they show everyone — cost: a lawyer who wants the record asks for "Everything".
- OCF import doesn't check manifest md5s; every object is schema-validated instead — cost: a corrupted-but-valid file isn't caught by md5.
- OCF round-trip compares the cap table without `doc_status` (documents aren't in the OCF export yet) — cost: none until DOCUMENT objects are exported.
- Telemetry disclosure moved into the terms (Mads) — docs/11 updated.
- Date fields are text fields formatted "6 Oct 2026" with a calendar button (when the webview supports `showPicker`), because WebKit's native date field follows the OS locale.
- Testing Library wait raised to 3 s: the full suite runs core and desktop in parallel and a save can exceed 1 s — cost: none.

## M6 final review: fixed (each with a test that failed first)
- Critical: a date the founder typed that isn't a real date (31/09) was silently replaced by the old date on save. Now the text stays, the field turns amber and the save is blocked ("Enter a valid date").
- Important: event ids weren't monotonic within a millisecond, so two same-date transactions saved together (e.g. an OCF import) could replay in the wrong order. Ids are now monotonic ULIDs.
- Important: odd OCF files (missing filepath, null entries, items not a list) threw instead of returning errors.
- Important: one-person lawyer zips could include a document shared with someone else; now left out and counted in the README.
- Important: one-person sheets showed company totals that could reveal other holders' numbers; removed.
- Security: the lawyer zip no longer follows a symlink inside docs/ to a file outside the vault.

## M6 deferred minors
- xlsx: strip U+FFFE/U+FFFF; give percent cells a `0.00` format; check the file opens in Numbers.
- Numeric dates are read day-first (10/1/2026 = 10 Jan), as Mads asked; US founders may expect month-first. Consider showing the parsed date while typing.
- Lawyer zip: no "before incorporation" check on the as-of date; zipping runs on the UI thread (large vaults freeze briefly; use async zip / level 0 for PDFs).
- Terms acceptance is only asked on first run; installs from before 2026-10-10 never see it. Usage counts default on with consent bundled in the terms: check with the lawyer (GDPR).
- The calendar button relies on `showPicker` in the webview; hidden if unsupported. Check by hand in the Tauri window.

## M2 decisions (rulings made during the build)

- Import only into a company folder with no people or holdings yet — merging into an existing cap table needs conflict rules — cost: a founder who started from zero must create a new folder to import.
- Numeric dates in a column are month-first (US tools) unless a value in that column can only be day-first — cost: an all-ambiguous day-first sheet (e.g. 01/02/2021 only) imports with month and day swapped; the preview shows the dates before saving.
- Pulley, Carta and Cake use the generic column matcher until real files arrive — cost: the founder checks the column mapping by hand.
- Reconcile compares fully diluted only (typed by the founder); per-class and SAFE totals are shown, not enforced — cost: an offsetting error across classes could pass.
- Missing price per share on common/preferred imports as $0 — cost: price-based reports would be wrong until corrected.
- Institution vs individual is a name heuristic (Inc, LLC, Fund, Ventures, …) — cost: wrong type label until edited; numbers unaffected.
- Security ids are assigned in row order (CS-1, PS-1, OPT-1, SAFE-1); the option plan's board date is the earliest grant date — cost: the pool appears from the first grant rather than the real approval date.
- No xlsx library (same reason as M6); a small reader on fflate — cost: unusual Excel files may need a fix once we see them.

## M2 final review: fixed (each with a test that failed first)
- Critical: European number formats (1.000.000 / 0,50 / 250.000,00) were read 100–1000× wrong; the decimal mark is now detected per file and anything unclear is a row issue.
- Critical: an option row next to a preferred class crashed the Import screen; options and the pool always sit on a common class.
- Important:
  - same email with different names is flagged instead of merged
  - Series/Seed classes count as preferred, and each class has a "preferred" checkbox
  - a class is preferred if any of its rows says so
  - a pool with no grants yet counts
  - option rows without a class don't create a phantom class
  - Total/Subtotal rows are skipped
  - the SAFE total can be reconciled
  - a vesting length without a start uses the issue date, and a start without a length is an issue
  - discount "1" means 1% (same as New SAFE)
  - the person-or-entity column is used
  - Excel float noise (1.0000000000000001E-5) is cleaned up
  - namespaced xlsx tags, self-closing rows and 1904 dates are read
  - a folder with only a class or pool isn't "new"
  - the original file is kept (with a safe name) before anything is recorded
  - the reconcile check can't be bypassed by clearing the total
  - "Advisor common" isn't an option

## M2 deferred minors
- The parsed dates aren't shown before saving; an all-ambiguous day-first file reads month-first (spec ruling).
- CSV is read as UTF-8 only (Windows-1252 exports show "Jos�").
- No size limit when unzipping (a zip bomb picked by the founder would hang the app; local file only).
- The preview rebuilds with fresh ids on every render (wasteful, not wrong).
- The OCF preview runs without the vault's own events (fine while import requires an empty folder).
- Pulley's matrix layout (a column per class) needs one row per holding; the screen says so, a detector comes with real files.

## Country and currency decisions (2026-10-10)
- Your country lives in app settings (per computer); the company currency lives in `capfolder.json` (per company) — Mads: "editable in the settings tab on the company and user profiles".
- Display formatting is set once per render from those two (module state in fmt.ts) instead of threading a formatter through every component — cost: none for the UI; a future multi-company window would need it per window.
- Dates still read "6 Oct 2026" everywhere (Mads' earlier ask); the country only changes how typed numeric dates are read.
- Not yet localized: export sheet headings say "(USD)", percentages in tables keep a "." decimal point, and money in the PDF uses plain numbers.

## M4 decisions (rulings made during the build)
- AI never files a document, even on an exact match: CLAUDE.md says no AI output reaches the log without a click, so AI-sorted documents always land in Needs you.
- kNN is word counts (cosine), not embeddings: works with no model installed. Switch to `embed()` when a local model is connected.
- Learned examples (`sorting.json`) live in app data, per computer. Aliases are vault events (`stakeholder_alias`), because they're facts about the company.
- An unreadable field, a second document for a holding that already has one, or a name that only matches through the number all go to Needs you (the "0 filed wrong" rule wins over the 80%).
- Only local AI (Ollama, LM Studio over localhost). The CLIs need the Tauri shell plugin and the cloud privacy toggle: later.
- PDF pages with almost no text are OCR'd at scale 2 (~150 dpi), rendered with `intent: "print"` so a hidden window doesn't stall.

## M4 final review: fixed (each with a test that failed first)
- Wrong-row filing (Critical): consents linked any grant whose holder and count appeared anywhere; plan-headed grant notices, exercise notices, award agreements and plan amendments were filed as the plan; side letters, SAFE amendments, exercise notices, offer letters and stock certificates were filed as what they mention; a merged-text SPA became an 83(b). Now a document files itself only when its kind is in the title, with no caution word there; consents are read per resolution (`review-m4.test.ts` C1–C4).
- AI or kNN "not equity" skipped files unseen (`I5`); a 83(b)/consent linked to a holding ticked its agreement (`I6`, core gaps + `checklist.test.ts`); no date with two holdings of that kind (`I7`); consent review lost its links (`I15`).
- Local AI unreachable from the packaged app (CORS): a Rust localhost bridge, ports 11434/1234 only (`localai.rs` tests). Not RED-tested in the webview: jsdom has no CORS.
- Minors fixed too: folder walk, 500-file notice, Remember default, provenance flags, learn failure, add-SAFE duplicate person, leaving Sort mid-run, OCR worker rebuild.

## M7 final review: fixed (each with a test that failed first)
- Real PDFs wrap lines: titles now skip capital legend paragraphs and stop at body text; consents are read per paragraph. The whole acme-docs folder is also tested wrapped at 90 columns (`review-m4.test.ts`).
- Papers about an agreement filed as the agreement: joinder, spousal consent, repurchase, transfer, MFN or pro rata letters, addenda and similar now go to Needs you. A resolution that cancels or reprices a grant no longer links it, and names match whole words only.
- Settings → Check now did nothing until the next 6-hour check, and nothing in Off mode: the found update now shows straight away (`updates.test.tsx`). Update state lives above the lock, so a downloaded update isn't fetched again.
- Rules packs are shape-checked (guides, steps, types, phrases), so one bad signed pack can't break the Import screen.
- Minors: the local AI bridge has a total deadline and an 8 MB cap; release.yml checks every Apple secret, accepts a passwordless .pfx, and sends unsigned test builds to their own prerelease; the publish checklist checks latest.json has all four platforms.
- Declined: whether webkitgtk exposes `crypto.subtle` on `tauri://` (if not, Linux stays on the bundled rules pack), and LM Studio listening only on `::1`.

## M8 final review: fixed (each with a test that failed first)
- Downloads metric counted updater fetches (latest.json, .tar.gz): now installers only, one row per day.
- `/ping` could be filled by anyone: JSON only (a text/plain post from another website is refused, 415), 3 install ids per network per day, 50,000 rows per day; null body → 400; prerelease versions accepted.
- A fresh install wasn't counted until its second launch: the ping now goes as soon as the terms are accepted; a garbled or future last-ping date no longer stops weekly pings.
- Site: no Google Fonts (self-hosted IBM Plex, OFL), Tally loads only on click, a Privacy section naming every third party and the install ping, honest "who can see my data", no "encrypted" claim before the relay is hosted; launch drafts no longer overstate import.
- Minors: dashboard survives a truncated line and paths with spaces; Tally popup closes itself; aria-live on the download links; ✦ hidden from screen readers; manifest icons relative; site tests run before deploy; metrics runs one at a time.
- Minors fixed 2026-10-11: a Pause animations button, row headers on the comparison table, settings saves serialized (a ping save can't undo a Privacy toggle).

## M7 decisions (rulings)
- Rules pack served from `raw.githubusercontent.com` (CORS), not a release tag.
- ed25519 via `@noble/ed25519` (pure JS) rather than WebCrypto Ed25519, which not every webview has.
- Automatic updates download only; installing waits for Restart (Windows installers close the app).
- Plugins pinned to versions at least two weeks old that work with tauri 2.11: updater 2.12.0, process 2.3.1.
- The updater key was generated without a password (in `~/.tauri/`, mode 600). Regenerate with a password before the first release if you prefer; the public key in `tauri.conf.json` changes with it.
- Touch ID / Windows Hello: not in M7 (needs a native plugin); Welcome says "Coming later".

## M4 not built (known limits)
- Signature detection (2026-10-11): only explicit markers count as a draft (DRAFT, "Form of", template blanks, "for discussion"); e-signature stamps, /s/ and PDF signature fields count as signed. A draft without markers still looks signed.
- Terms diff against the YC template (needs the template).
- A page that mixes a text header with a scanned body isn't OCR'd. Only English OCR data is bundled.
- Board consents link to the plan and grants they name (name + share count); other resolutions aren't read.

## M5 rulings (so far)
- Relay rate limits are in memory and bounded; when full the oldest key is evicted (availability over strictness). Two automated security reviews flagged each direction (fail-closed = global lockout; eviction = reset with ~200k fresh IPs/64s); a bounded in-memory limiter can't avoid both. A public relay must also rate-limit at its proxy (apps/relay/README.md) — Mads to confirm at deploy time.
- Signing emails come from the relay's own address; the subject/message name the document. Sender-domain email later.
- Reminders (day 3, then every 4 days) and 30-day expiry use Documenso's built-in settings, so the relay needs no reminder cron; it only purges old envelopes hourly.

## M5 final review: fixed (each with a test that failed first)
- Critical: two SAFEs sent for signature at the same time got the same id and the second could never be filed. Ids are fitted when filing (the next free one if taken since sending).
- Critical: filing was three writes; a failure halfway left it stuck. It's one write now, and a retry skips anything already recorded. If the SAFE no longer fits the cap table, the signed PDF is still filed and the founder is told to record it.
- Important:
  - the minute-by-minute check used a stale copy of the folder and stopped at the first "not found"
  - envelopes are checked on the relay they were sent through (tokens kept per relay)
  - the relay purges completed envelopes a week after completion, not 30 days after sending
  - the signed-copy check also refuses added annotations on original pages and missing pages
  - "0,12" is refused instead of read as 12 when your decimal mark is "."
  - amounts show in their own currency (a company currency change doesn't relabel old ones); mixed SAFE totals say so
  - your name is kept when you verify inside the send dialog
  - a send this computer can't record is withdrawn from the relay
- Minor fixed with the above: reminders go only to whoever is next to sign; malformed sign-in input is a 400; purge no longer skips envelopes while paging; outbox paths must be under docs/_outbox/; a Refresh during a running check runs once more after it.

## M5 deferred minors
- The signed-copy check compares text and annotations, not pixels: content drawn as shapes or images over an original page would pass. Next step: render each original page with pdf.js and compare.
- Device tokens last a year and are only revoked by rotating RELAY_SECRET; changing email doesn't revoke the old token.
- CSP allows connections to any https host (any self-hosted relay); production builds still allow localhost:8787; the opener may open any https URL the relay returns (could check it's the Documenso host).
- Changing the company currency writes capfolder.json outside the save queue (a save at the same moment shows a "folder changed" error).
- money() uses Number() for display: amounts above 2^53 or with more than 20 decimals lose precision in the display only.
- New SAFE → Send: the recorded SAFE terms come from the form, not from the PDF the founder attaches; they could disagree (until the YC template is filled by the app).
- Import: a lone "250.000" in a file with no other clue uses the founder's decimal mark (a US founder importing a European file would read 250).
