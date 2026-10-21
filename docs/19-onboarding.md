# 19 · Onboarding (plan 2026-10-16, approved; built 2026-10-17)

## What others do (research 2026-10-16)
- **Carta:** setup guide plus uploads, a human kickoff call and a review before you can use it. Takes days.
- **Pulley:** a short questionnaire (SAFEs? pool? priced round?) decides which documents to ask for. Their team imports. Takes 5–12 business days.
- **Cake Equity:** self-serve "Get started" checklist (company → cap table → plans). An empty company in about 5 minutes.
- **Ledgy:** 5-step guide with a video per step.
- **Gaps:** reviews everywhere say "not enough instructions", and none of them offers a sample company.

## Decisions
- **No sales call, no review gate.** You should see your ownership chart within minutes.
- **Tour library: Driver.js** (MIT, ~8 kB, offline, no tracking). We add focus handling and respect reduced motion.
  - Not Shepherd.js or Intro.js, because of their AGPL + commercial licences.
  - Not SaaS tools (Appcues, Pendo), because they need online tracking.
- **Checklist: our own code.** Progress is computed from the cap table (like `checklist.ts`), so it never drifts. Only "dismissed" and "tour seen" are stored, in app settings, not the vault.
- **No "invite people" step** until local-to-local sync or the web app exists.

## The flow
The flow builds on what exists today: Welcome → CreateCompany → StartChoice (Import / Start from zero / Only documents).

1. **Try the sample company** (new):
   - It's a fourth card on StartChoice and a link on Welcome.
   - It opens a read-only demo vault "Acme Robotics": founders, a pool with grants, 3 SAFEs, documents filed.
   - A banner says "Sample company · nothing here is real · Start my own".
   - Generated from `fixtures/` at first open, so no extra files ship.
2. **Three yes/no questions** (new, one screen after StartChoice; can be skipped):
   - "Do you have SAFEs or convertible notes?"
   - "Do you have an option pool?"
   - "Have you done a priced round?"
   - The answers hide checklist steps that don't apply and can be changed later.
3. **Get started checklist:**
   - Collapsible card at the top of Home, ticks computed from data. Hidden when everything is done or dismissed.
   - Steps:
     1. Company details
     2. Share classes
     3. Founders and their shares
     4. Option pool and grants *(if pool)*
     5. SAFEs *(if SAFEs)*
     6. Priced round *(if priced)*
     7. File your signed documents (opens Sort)
     8. Set up Ask AI (optional)
   - Each step: one sentence of help, a "How?" link to the docs, and a button that opens the right form.
   - Import is the hero path: the import button is the main button on steps 2–6 until something is entered.
4. **Spotlight tour** (Driver.js, ~6 stops):
   - It's offered once after the first save, or when the sample company opens. "Take the tour" also stays in Settings.
   - Stops:
     1. Company switcher + vault path ("your data is this folder")
     2. Cap table / ownership
     3. A holding ("click to see how it was computed")
     4. Documents + Sort
     5. Signatures
     6. ✦ Ask AI
5. **Short in-context help:**
   - A "?" next to jargon fields (cap, discount, cliff, par) with one plain sentence.
   - Later it pulls from the knowledge base (dev plan item 14).

## Build order (each with a failing test first)
1. Checklist logic (pure, with tests) and the Home card.
2. The three questions plus their settings.
3. Sample company vault (read-only flag) plus the StartChoice card.
4. Driver.js tour.
5. "?" help tips.

## Later
- Short videos per step (if people get stuck).
- The invite step (after sync / web app).
- Track funnel drop-off only through the opt-in analytics (`docs/11`).

## Status (2026-10-17)
All five build steps are done, one commit each, tests first. Hand tests: `docs/testing-checklist.md` 31–36.
- **Checklist:** `onboarding.ts` (pure) + `components/GetStarted.tsx`. Settings key `onboarding[<folder>]` holds the answers and `dismissed`. Answer "no" hides a step; unanswered shows it.
- **Questions:** `screens/Questions.tsx`, route `questions` after any StartChoice card. "Change my answers" on the list.
- **Sample company:** `sample.ts`. It's the golden fixture "Acme Inc." (not "Acme Robotics"), bundled as text and copied to `<app data>/sample` on first open, with placeholder PDFs for its 3 documents. `capfolder.json` has `"sample": true`, and `vault.ts` refuses every save (and the currency change). It isn't added to the recent companies list.
- **Tour:** `components/Tour.tsx`, Driver.js 1.8.0 (MIT; 1.9.0 was exactly two weeks old, so we used the version before it). The Settings key is `tourSeen`. The offer shows once when the company has a holding, or in the sample. Settings → Tour runs it again.
- **Tips:** `copy.ts` `TIPS` + `Tip` in `components/ui.tsx`.
- **2026-10-21:** "How?" links on the Share classes, Option pool, SAFEs and Priced round steps go to the capfolder.com/learn guides (Founders already linked to help/founders). Welcome shows "Try the sample company" as a real button instead of a text link (a tester missed the link).
- **Not done:** the items under Later.
