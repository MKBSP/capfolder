# 08 · Design system

Source of truth: the screens in `design/` (open `design/index.html`). These are the tokens they use.

## Logo
Use `brand/mark.svg` (filled folder + 3 ascending bars, #1F6F4A) in the app header, Welcome screen, website nav, favicon and app icon. Never recolor it outside green #1F6F4A, white, or ink #111311. Minimum 16px.

## Type
- **UI:** IBM Plex Sans 400/500/600 (website display: 600–700, tight letter-spacing −0.03 to −0.04em)
- **Numbers, paths, code:** IBM Plex Mono, `font-variant-numeric: tabular-nums`. Always use mono for amounts and share counts.
- **Sizes:** 12 (meta), 13 (secondary), 14 (body UI), 15–16 (forms), 18 (card titles), 24–30 (page titles), 46 (site h2), 80 (site hero)

## Color
| Token | Hex | Use |
|---|---|---|
| ink | #16181D | text |
| ink-2 | #3A3E46 | secondary text |
| muted | #5B606B | meta, labels |
| bg | #FBFBFA (app) / #FAFAF8 (site) | page |
| surface | #FFFFFF | cards |
| border | #E6E6E3 | card borders |
| border-strong | #D9DAD6 | inputs, secondary buttons |
| row-divider | #EFEFEC | table rows |
| green-600 | #1F6F4A | primary buttons, links, vesting bars |
| green-700 | #16543A | text on green tint, hover |
| green-tint | #E8F3EC | success chips, "local" |
| amber-text / amber-bg | #8A3E05 / #FDF1E3 | warnings, gaps, "needs you" |
| red-text / red-bg | #A1261A / #FDE8E6 | missing signed doc, destructive |
| purple-text / purple-bg | #4E3F86 / #F4F1FA | cloud / relay / signing |
| bar-track | #E9ECE8 | vesting bar background |

**Meaning is consistent everywhere:** green = local / done, purple = cloud (temporary), amber = needs attention, red = missing proof.

## Shape
- **Radius:** 6 (inputs, small buttons), 8 (cards in app), 10–16 (site cards), 999 (chips)
- **Touch targets:** ≥ 40px in the app, ≥ 44px on the site
- **Spacing:** multiples of 4. Card padding is 18–28.

## Components (see screens)
- **Cap table row:** name, type, shares (mono, right), % (mono, right), vesting bar (140px, 8px tall) + %, document chip
- **Chips:** Signed (green), Missing (amber), No signed doc (red)
- **"What's missing" list:** a dot colour by severity, a sentence, and an inline action link
- **Stepper (first run):** pill row: done = green tint ✓, current = ink, upcoming = grey
- **Toasts** (Sonner-style): "Filed to docs/safes/"

## Motion (from Emil Kowalski's design-engineering skill)
- **Easing:** `--ease-out: cubic-bezier(0.23,1,0.32,1)`, `--ease-in-out: cubic-bezier(0.77,0,0.175,1)`. Never `ease-in` for UI.
- **Press:** buttons `transform: scale(0.97)` on `:active`, 160ms ease-out.
- **Durations:** dropdowns and popovers 150–200ms from `scale(0.95)` + opacity, `transform-origin` at the trigger.
- **Cap table home:** no entrance animation (opened many times a day). Row expand uses height + opacity at 200ms.
- **Hover effects:** only inside `@media (hover:hover) and (pointer:fine)`.
- **Reduced motion:** honour `prefers-reduced-motion`. Keep fades, drop movement.
- **Website** (marketing; longer motion allowed): hero word rise, sorting demo loop, signing round-trip loop, scroll reveals via `animation-timeline: view()`.

## Copy rules
- Plain language: "Woz has 10,000 of 40,000 vested, next 833 on Nov 7". No legalese in the UI.
- Always say where a file lives: `docs/safes/2023-03-14_fund-x.pdf`.
- Never say "encrypted" without saying what it means (docs/05).
