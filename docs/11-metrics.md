# 11 · Launch metrics (MVP)

## What we measure, and where
| Metric | Source | How |
|---|---|---|
| Website visits, by source | Plausible or Umami (cookieless, no banner) | Script on the site; `?ref=hn`, `?ref=bookface` on launch links |
| Download requests | Tally form `rjxQjR` submissions | Count + `utm_source`/`ref` hidden fields |
| Actual downloads | GitHub Releases API `assets[].download_count` | Daily cron writes a snapshot to a sheet/DB |
| Installs (first launch) | Anonymous install ping (below) | Unique `install_id` |
| Active installs | Anonymous weekly ping | Unique `install_id` per week |
| Activation | Same ping, booleans only | `imported`, `has_documents`, `sent_envelope` |
| GitHub stars | GitHub API `stargazers_count` | Daily cron |
| Donations | Revolut | Manual (Revolut has no public API for this payment link). Log the total weekly |

## Install ping: privacy rules (say these on the site and in the app)
- **On by default, disclosed in the terms and conditions** the founder accepts on the Welcome screen (Mads, 2026-10-10: one "I accept the terms" checkbox instead of a separate toggle). The on/off toggle lives in Settings.
- **Payload, exactly:**
```json
{ "install_id": "random uuid, generated locally", "event": "first_run|weekly",
  "app_version": "0.1.0", "os": "macos|windows|linux",
  "imported": true, "has_documents": true, "sent_envelope": false }
```
- **Never sent:** company names, people, numbers, file names, emails, IP addresses (the endpoint drops them).
- The endpoint is `POST /ping` on the relay, which stores rows in Postgres and keeps nothing else.
- The source is in the repo, so anyone can verify it.

## Launch dashboard (pass/fail, 30 days after Show HN)
| Signal | Pass |
|---|---|
| Downloads | ≥ 300 |
| Installs (first_run) | ≥ 100 |
| Activated (`imported` or `has_documents`) | ≥ 15 |
| Real envelopes sent | ≥ 3 |
| GitHub stars | ≥ 250 |
| Donations | ≥ 1 (any amount) |

If it passes, plan the cloud tier (`docs/12-cloud-later.md`). If it misses, read the HN thread and the issues, then decide: pivot or stop.
