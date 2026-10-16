# Tally — website download form

- **Account:** madskbsp@gmail.com, workspace `wAQeRl`
- **Form:** "Download Capfolder", id **`rjxQjR`**. Status: **published 2026-10-15**.
- **Edit:** https://tally.so/forms/rjxQjR/edit

## Fields
| Field | Type | Required |
|---|---|---|
| Email | email | yes |
| Which computer? | macOS / Windows / Linux | yes |
| Updates: "Email me when there's a new version" | checkbox (consent for update emails) | no |
| Hidden: `utm_source`, `ref` | URL params | — |

**Thank-you page:** "Your download is ready", with download links per OS (links to https://github.com/MKBSP/capfolder/releases/latest), then "Capfolder is free. If it saves you a headache, pay what you want." linking to https://checkout.revolut.com/pay/5f256b0e-5234-478c-b512-e92228c101df

## Wiring the website (done in M8: `apps/website/index.html` opens the popup with `Tally.openPopup` and shows the release links `onSubmit`; if Tally's script is blocked it opens tally.so/r/rjxQjR)
- Replace the mock gate in `design/website/index.html` (`#getdl` click handler) with Tally's popup embed:
```html
<script async src="https://tally.so/widgets/embed.js"></script>
<button data-tally-open="rjxQjR" data-tally-layout="modal" data-tally-emoji-text="" data-tally-hide-title="1">Get the download</button>
```
- Optional: listen for Tally's form-submitted event and reveal the site's own `#dlthanks` panel (OS buttons + Buy me a coffee) instead of Tally's thank-you page. [Verify the event name in Tally's embed docs.]
- Pass `?utm_source=hn` / `?ref=bookface` in launch links so the hidden fields capture the source.
- Publish the form only when real download links exist.

# Tally: Pro waitlist form

- **Form:** "Capfolder Pro: tell me when it's ready", id **`aONDJb`**, published 2026-10-16. Edit: https://tally.so/forms/aONDJb/edit
- **Fields:** Email (required), Company (optional), "What would make Pro worth it for you?" (optional), hidden `utm_source` / `ref`.
- **Promise made on the site and in the form:** everyone on this list gets **25% off the first year** of Pro. Honour it when billing ships (docs/15 item 1).
- **Site:** the Pro card's "I want Pro: tell me when it's ready" button (`#prowait`, Umami event `pro-waitlist`) opens it as a popup.
