---
target: website variant E
total_score: 20
max_score: 32
na_heuristics: 7,10
p0_count: 0
p1_count: 3
target_identity: "file:/Users/MadsTrundte/Desktop/claude_code_projects/capfolder/apps/website/testing-landing-page/e/index.html"
target_fingerprint: "sha256:f16217ca618a2636267efa645faaca9a70ae886090f7b5894c954df2362ef36d"
target_path: /Users/MadsTrundte/Desktop/claude_code_projects/capfolder/apps/website/testing-landing-page/e/index.html
timestamp: 2026-10-27T18-48-34Z
slug: apps-website-testing-landing-page-e-index-html
---
Method: dual-agent. Score 20/32 (62.5%, Acceptable); n/a: 7, 10.
H1 2, H2 2, H3 2, H4 2, H5 3, H6 3, H8 3, H9 3.

Priority issues:
- P1: The hero rotates AIs (ChatGPT, Gemini, Grok, DeepSeek, Mistral) that the install tabs don't offer.
- P1: The demo hides its payoff. It opens on an empty chat, the wire peak comes at about 33s, there are blank frames between stories, and there's no chapter indicator.
- P1: Pro sells "MCP for any agent", while Free sells MCP as the core.
- P2: Jargon: "agentic", OCF JSON, events.jsonl, and "Open Cap Format" (should be Open Cap Table Format).
- P2: The hero rotation never stops (WCAG 2.2.2), the line re-centres each word, and 9 items is too many.

Detector: 18 CLI warnings. True: low contrast on inactive feature tabs (#9A9EA6, 2.6:1), a skipped heading (h2 to h4), Inter overused, and stragglers. False positives: cramped padding (8) and nested cards (mock chrome).
