# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Pre-funding and bootstrapped founders, and no one else. The typical user has 2–3 cofounders and no lawyer on retainer. They are about to take, or have just taken, a first friends-and-family or angel cheque on a SAFE. Today their cap table is a spreadsheet plus PDFs scattered across email. Many are technical founders who are smart about product and new to equity.

Their pains, in their own words (from founder feedback, 2026-10-23):
- What valuation cap to put on a first SAFE
- What's standard in a cofounder agreement, and how vesting works
- Getting a lawyer to check "a couple of things" in the setup
- How a big, messy cap table hurts later (SPVs, etc.)
- Sweat-equity deals with collaborators that become a mess
- Carta and similar tools are too expensive and too much for where they are

## Product Purpose

Capfolder is a free, open-source desktop app (macOS, Windows, Linux). A founder sets up the cap table and the papers behind it: cofounder shares with vesting, option grants, SAFEs filled from the YC templates, and e-signatures. Everything lives as plain files in a folder on their own computer. Success means the founder's cap table and signed documents are complete and correct before their first priced round or due diligence.

## Positioning

Your company's records live in a folder you own. There's no account, no subscription to stay alive, and no server holding your cap table. Only the unsigned document passes through the signing relay. You always have access to your data, including when a vendor's servers are down. The code and the math are public (AGPL-3.0).

Never frame this as "what happens if we shut down". Frame it as "your data, always".

The homepage leads with these selling points (Mads, 2026-10-26):
1. Like Carta, but free.
2. Open source, so you can host it yourself.
3. Bring your own AI. True today: Ask AI in the app with a local model or the founder's own Claude, ChatGPT or Gemini key, and every folder has an `AGENTS.md` so Claude Code or any agent can work in it. Sending and chasing signatures by AI is the agentic version: label it "Coming" until it ships.
4. You own your files. They're on your computer 24/7 and nobody can take them down.
5. Signing is included: investors sign from a link, with no account.

## Operating Context

- Founders evaluate it on the website, then download the desktop app.
- In the app: a sample company to try, three setup questions, and a Get started list.
- Investors and employees sign from a link in any browser.
- Optional AI (Ask AI): local (Ollama, LM Studio) or the founder's own Claude, ChatGPT or Gemini key.
- Education is how founders find us: guides about the first raise, SAFEs, cofounder equity and the YC application (at /learn and /blog).
- Moving from Pulley or Carta is supported (import plus help pages), but it is not the homepage pitch.

## Capabilities and Constraints

- **Free:** unlimited cap table, people and documents; e-signatures through the hosted relay, 5 signature requests per month; bring your own AI.
- **Ask AI (in the app today):** questions about the cap table, what's missing and the documents; drafts (a SAFE, a grant, a person, a pool) that open prefilled for the founder to check and save. Providers: Ollama, LM Studio, or the founder's own Anthropic, OpenAI or Gemini key. Document text goes to a cloud model only if the founder turns that on.
- **Pro ($50/month):** sync across computers and an encrypted online backup. Not released yet; always label it "coming".
- **Self-host:** anyone can run the relay themselves.
- **Not built yet; never show as available:** the agentic or MCP version, the knowledge base inside the app, and connecting founders to lawyers.
- Builds are not code-signed yet, so users confirm once on first open.
- The website is plain static HTML on Cloudflare Pages, with tests in `site.test.ts`.

## Brand Commitments

- The name Capfolder and the folder logo (`favicon.svg`) stay.
- Colours, type and layout are open: the current look is evidence only.
- Voice: plain, short, direct, founder to founder. Fewer words. Storytelling over technical jargon.
- Sample names only: Tim Apple, Steve Jobs, Steve Wozniak, Bill Gates, Acme.
- No time-sensitive text ("N days left").

## Evidence on Hand

- Real app screenshots: `apps/website/blog/img/v013-*.jpg`.
- The real app UI can be rebuilt as HTML fragments.
- Illustrations: `img/ill/*.svg`.
- No customers, testimonials, logos, press or usage numbers exist. Never invent them.
- GitHub stars are very low, so don't show the count.

## Product Principles

- Only for the earliest founders: if a section talks to a Series A company, cut it.
- Say less. Every section makes one claim and shows its proof.
- Ownership as a calm benefit, never as a fear.
- Teach before you sell: the guides earn the download.
- Keep the founder's own story ("We lost our cap table paperwork": a seed raised on SAFEs from 28 investors). It earns trust: early founders relate to it and look up to it (Mads, 2026-10-25).
- Show the real app, not a mock of a dashboard.
