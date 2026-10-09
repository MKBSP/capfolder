# 14 · Brand and logo prompts

## Brand basics (match the designs)
- **Name:** Capfolder (written as one word, capital C). Domain: capfolder.com
- **Idea:** your cap table, in a folder you own. Calm, plain, trustworthy, open source.
- **Typeface:** IBM Plex Sans SemiBold (600) for the wordmark; IBM Plex Mono for numbers/code.
- **Colors:**

| Token | Hex | Use |
|---|---|---|
| Green 600 (primary) | #1F6F4A | logo mark, buttons |
| Green 700 | #16543A | dark variant, text on tint |
| Green tint | #E8F3EC | backgrounds, app-icon fill option |
| Accent green | #4FBF85 | sparing highlight only |
| Ink | #111311 | wordmark on light |
| Paper | #FAFAF8 | background |
| Purple (cloud/signing) | #4E3F86 | never in the logo; product UI only |

**Chosen logo (Oct 9, 2026):** a filled rounded folder in #1F6F4A with three ascending bars on the right of the tab (ownership / cap table). Wordmark "Capfolder" in IBM Plex Sans SemiBold, #111311.
Files in `brand/`: `mark.svg` (24px grid), `mark-white.svg` (on dark green #16543A), `logo.svg` (horizontal lockup), `app-icon.svg` (1024, tint #E8F3EC squircle), `preview.png`.
Favicon set: `brand/favicon/` (ico 16/32/48, svg, apple-touch 180, 192/512 + manifest, head snippet in its README). The 16px uses `mark-16.svg`, a pixel-aligned version so the bars stay separate.
To do: convert the wordmark in `logo.svg` to outlines; .icns/.ico for Tauri (`pnpm tauri icon brand/app-icon.svg`) [verify]; social card 1200×630.

## Logo requirements
- Works at 16px (favicon) and as a macOS/Windows app icon (rounded square).
- Flat vector, 1–2 colors, no gradients, no 3D, no glossy effects, no mascots.
- The mark is readable without the wordmark.
- Avoid: generic pie-chart clichés, coins, dollar signs, stock-market arrows, padlocks (we don't encrypt).

## Prompts (used to explore; kept for reference)

### 1 · Midjourney: explore marks
```
minimal flat vector logo mark for "Capfolder", an open-source cap table app, a simple rounded folder shape whose tab is formed by three ascending bars like a share ownership chart, single color deep green #1F6F4A on off-white #FAFAF8 background, geometric, thick even strokes, generous negative space, Swiss modernist, IBM Plex style, no text, no gradient, no 3d, no shadow, centered, logo design sheet --style raw --v 7 --ar 1:1 --no text, gradient, 3d, shadow, coin, dollar sign
```
Variations to swap into the subject:
- "a folder whose front panel is split into 3 vertical segments of different heights, like a cap table"
- "a folder with a small notched corner like a share certificate"
- "a lowercase 'c' that is also an open folder seen from the side"

### 2 · ChatGPT / GPT image: mark + wordmark lockup
```
Design a clean, professional logo for "Capfolder", an open-source desktop app that keeps a startup's cap table (who owns what share of the company) in a folder on your own computer.

Mark: a simple rounded folder icon. Make the folder tab or front panel subtly suggest ownership shares, e.g. 3 bars of increasing height or a folder split into segments. Flat, geometric, even stroke weight, readable at 16px.

Wordmark: "Capfolder" set in IBM Plex Sans SemiBold, sentence case, tight but natural letter spacing, color #111311.

Colors: mark in deep green #1F6F4A, optional light fill #E8F3EC. Background #FAFAF8. No other colors.

Style: calm, trustworthy, Swiss/modernist, like Linear, Obsidian or Cal.com branding. No gradients, no 3D, no shadows, no coins, no dollar signs, no stock arrows, no padlocks.

Output: a horizontal lockup (mark left, wordmark right) and the mark alone, on a plain background, as a clean vector-style image.
```

### 3 · Ideogram: best for exact text in the logo
```
Logo, horizontal lockup: a minimal deep green (#1F6F4A) rounded folder icon with three small ascending bars on its tab, followed by the word "Capfolder" in a clean geometric sans serif like IBM Plex Sans SemiBold, near-black #111311, on an off-white #FAFAF8 background. Flat vector, no gradient, no shadow, plenty of whitespace, modern open-source software brand.
```
Settings: Style = Design, Magic Prompt = Off, aspect 3:1. Also run it at 1:1 with "icon only, no text".

### 4 · Recraft: real SVG output
```
Vector logo icon: rounded folder, tab shaped as three ascending bars (cap table / ownership), single color #1F6F4A, 2px-equivalent consistent stroke at 24px grid, flat, geometric, no text
```
Style: Vector art → Line art or Flat. Palette: #1F6F4A, #E8F3EC, #111311. Export SVG.

### 5 · App icon (any tool)
```
macOS app icon, rounded square (squircle) background in light green #E8F3EC, centered bold folder glyph in deep green #1F6F4A with three ascending bars on the tab, flat, subtle inner padding, no gradient, no gloss, no text, 1024x1024
```

## After picking
1. Redraw the chosen mark as a clean SVG on a 24px grid. Image generators produce raster sketches, not final vectors.
2. Export: `logo.svg`, `mark.svg`, `favicon.ico` (16/32/48), `icon.icns` + `.ico` + 1024 PNG for Tauri, social card 1200×630.
3. Replace the placeholder folder icon in the app and website (`docs/08-design-system.md`).
4. Quick trademark search for "Capfolder" (USPTO, EUIPO) before the launch post.
