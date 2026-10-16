# 19 · Onboarding (plan, 2026-10-16, waiting for Mads' OK)

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
