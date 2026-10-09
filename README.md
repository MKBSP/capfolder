# Capfolder — handoff package

Everything needed to start building Capfolder with Claude Code.

## How to use
```bash
unzip capfolder-handoff.zip && cd capfolder-handoff
git init && git add . && git commit -m "Capfolder: specs, designs, fixtures"
claude          # Claude Code reads CLAUDE.md automatically
```

First prompt to give Claude Code:
> Read CLAUDE.md and every file in docs/. Then do milestone M0 from docs/09-build-plan.md and make the Acme golden test in fixtures/ run (failing is fine). Stop and show me the repo layout before M1.

## What's inside
```
CLAUDE.md                       instructions Claude Code follows
docs/
  00-overview.md                product, decisions, disclaimer, links
  01-architecture.md            monorepo, stack, components, relay, security
  02-user-stories.md            38 founder stories with Mermaid flows (the spec)
  03-data-model.md              vault folder, event log, OCF mapping, math, invariants
  04-import.md                  F-07 import: detect → map → OCF → validate → reconcile
  05-signing.md                 relay API + Documenso flow + verification
  06-ai.md                      providers, sorting pipeline, terms diff, MCP
  07-updates-and-rules-pack.md  app updates + hot-swappable rules pack
  08-design-system.md           tokens, components, motion, copy rules
  09-build-plan.md              milestones M0–M8 with acceptance tests
  10-research.md                Pulley shutdown, export paths, OCF, sources
  11-metrics.md                 downloads, installs, stars, donations; pass/fail
  12-cloud-later.md             $50/mo cloud sync tier (later); MVP rules for it
  13-licensing-and-cla.md       AGPL + CLA (CLA Assistant), to set up in M0
  14-brand-and-logo.md          brand colors/type + logo prompts for image generators
design/
  index.html                    open this: every screen, clickable
  app/*.html                    15 app screens + system design + 2 flowcharts
  website/index.html            landing page (works standalone)
  source/                       original Design-canvas files (.dc.html + canvas.json)
brand/                          logo: mark.svg, logo.svg, app-icon.svg, preview.png
fixtures/acme-vault/            golden test vault + expected cap table
integrations/tally.md           website download form (Tally id rjxQjR)
```

## Urgent, outside the code
- Get the former company's **Pulley exports + all signed PDFs before Dec 8, 2026**. They're the F-07 test data.
- Apple Developer ID + Windows code-signing certificate (needed for M7).
- Domain + GitHub org name (the "Capfolder" name is a working title).
