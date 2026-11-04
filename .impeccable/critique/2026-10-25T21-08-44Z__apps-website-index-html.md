---
target: homepage
total_score: 19
max_score: 32
na_heuristics: 7,10
p0_count: 2
p1_count: 2
target_identity: "file:/Users/MadsTrundte/Desktop/claude_code_projects/capfolder/apps/website/index.html"
target_fingerprint: "sha256:09a18055e36baf2492a2bdab2d2ba6b3d6ecbcb449b983fbf6531439b20bf629"
target_path: /Users/MadsTrundte/Desktop/claude_code_projects/capfolder/apps/website/index.html
timestamp: 2026-10-25T21-08-44Z
slug: apps-website-index-html
---
Method: dual-agent (A: design review · B: detector), browser overlay skipped (no interactive browser tool).

Score 19/32 (59%, Acceptable). 7 and 10 n/a (landing page).
H1 3 · H2 1 (jargon: AGPL, relay, hash, OCF, 409A, MCP, git clone; post-seed story) · H3 3 · H4 2 (mixed CTA labels, anchor vs page links) · H5 3 · H6 3 · H8 1 (13 sections, ~2,100 words) · H9 3.
Cognitive load: 6/8 failed (nav 13 items, 9 equal H2s, hero asks 3 decisions, privacy/license/roadmap up front).
Detector: 21 findings, ~6 real (marquee .track, aphoristic cadence, typing dot); cramped-padding x13, dark-glow, stripes, repeated text are false positives. Hero hidden until ~3.1s (CSS opacity:0 word reveal).

P0 Talks to the wrong founder (Pulley/Carta spine, 28-investor seed story). P0 Too much on one page.
P1 Template rhythm (eyebrow + 46px H2 + card grid x9, blur reveal, highlighter, dot grid, marquee, fake window chrome). P1 Technical, not storytelling.
P2 Hero asks for an email decision before earning it; 3-row nav on phones.

Step 0 done after this run (commit 4363d28): removed compare/open/roadmap/competitor/marquee sections, nav anchors, star, eyebrows, Pulley above footer, hero motion; one-line phone nav. ~1,500 words left.
Still open: story recast to first cheque, real app screenshots instead of mock chrome, email gate, privacy + acknowledgements to own pages.
