# 13 · Licensing and CLA

## Decision
- **Code license:** AGPL-3.0 for everything in the repo.
- **Contributions:** a **CLA (Contributor License Agreement)**, collected automatically by the **CLA Assistant** GitHub app on every first pull request.
  - **Base text:** Apache Software Foundation Individual CLA (ICLA) v2.2, plus the Corporate CLA (CCLA) for company contributors.
  - Contributors keep their copyright. They grant us a broad, perpetual license **including the right to relicense**.
  - **Set it up before the first outside PR is merged.** Adding it later means chasing every past contributor.

## Why a CLA and not a DCO
| | CLA | DCO (sign-off only) |
|---|---|---|
| Friction for contributors | One click, once | `git commit -s` every time |
| Lets us offer commercial terms or a closed enterprise add-on later | Yes | No |
| Lets us change the license later (e.g. AGPL to Apache/MIT) | Yes | No |
| HN reaction | Some grumbling, widely accepted for open-core | Friendlier |

**Note:** running our own paid cloud on AGPL code does **not** need a CLA. AGPL allows it as long as we publish the source. The CLA protects the *option* to dual-license or add closed enterprise features to the $50/mo cloud tier (`docs/12`).

**Reference:** Documenso (which we use) is dual-licensed, with an AGPL Community Edition plus a commercial Enterprise Edition.

## To do (M0)
1. Copy the Apache ICLA/CCLA, replace "The Apache Software Foundation" with our legal entity, save as `CLA.md` + `CCLA.md`. **[Have a lawyer read it once.]**
2. Install CLA Assistant on the GitHub org and point it at `CLA.md`.
3. Add `CONTRIBUTING.md`: how to build, the golden-test rule, and "First PR asks you to sign the CLA".
4. Add `THIRD_PARTY_LICENSES.md` (generated in CI) and check every dependency is AGPL-compatible.
5. **Owner / CLA counterparty: Mads Schmidt Petersen (personally), for now.** Move it to a company later with an assignment if the cloud tier happens.

**Disclaimer:** not legal advice. The CLA text and entity choice need a lawyer's review before launch.
