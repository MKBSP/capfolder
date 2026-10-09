# 12 · Cloud tier (LATER, only if launch passes) — do not build in MVP

## Offer
| Plan | Price | Includes |
|---|---|---|
| Free | $0 | Everything local (MVP) |
| Cloud | **$50/month** | Cloud copy of the vault, sync between several computers, logins and roles, unlimited users, **up to 2 companies** |
| Bespoke | Custom | More than 2 companies (law firms, accelerators, fund admins) |
| AI credits | Usage-based add-on | For people without their own AI. Priced at cost + margin |

## Shape
- The cloud is **another replica** of the same event log, not the master. Local folders keep working offline and stay the user's own copy.
- **Sync:** each device appends events locally, then pushes and pulls through the cloud.
- **Merge:** the event log is already a set of immutable events.
  - Non-conflicting events merge automatically.
  - Conflicts (the same security changed on two devices) go to a review screen. This is F-35, generalized.
- **IAM:** org → members → roles.
  - **Admin:** everything.
  - **Editor:** draft and propose.
  - **Viewer:** read.
  - **Lawyer:** read + export.
  - A change from an Editor needs Admin approval before it's appended (four-eyes).
- **Auth:** email magic link + passkeys, and SSO later. [Pick an open-source option, e.g. self-hosted auth such as Ory/Keycloak/Better Auth.]
- **Billing:** Stripe subscriptions, with seats uncounted and companies counted.

## Rules the MVP must already follow (so sync is possible later)
1. **Event ids are globally unique and sortable** (ULID). `seq` is only a per-device counter and is never used as identity.
2. **Every event records its author device.** `meta.device_id` is a random id per install, and later `meta.user_id` too.
3. **Reducer ordering is deterministic without `seq`:** sort by (OCF `date`, `ts`, `id`). Two devices must produce the same cap table from the same set of events.
4. **The hash chain is per device branch** in the cloud era. Keep the verify code able to handle a merge event with two parents (`prev: [a, b]`).
5. **No absolute paths in events.** Document paths are relative to the vault root.
6. **App settings stay out of the vault** (already the rule), so per-user preferences never collide.

## Open questions for that phase
- Does the AGPL hosted relay plus a paid cloud need a CLA from contributors, so we can offer commercial terms? Decide before accepting outside PRs, ideally at launch.
- Data residency (EU vs US) for the cloud copy.
