# 10 · Research notes (Oct 7, 2026)

## Pulley shutdown
- Announced Sep 15, 2026. Carta is the arranged migration path (first-year pricing matched).
- **Key dates:**
  - Nov 30, 2026: last day to opt into the Carta migration.
  - Dec 8, 2026: Pulley stops operating.
  - Jan 31, 2027: limited data access expected to end.
- **What to keep:** the full cap table and transaction history, stakeholders, classes, options and plans with vesting (cliffs, acceleration), SAFEs and notes, warrants, 409A reports, and every signed document and board approval.
- **Sources:**
  - https://runtimewire.com/article/pulley-shuts-down-carta-customer-migration
  - https://www.bpm.com/insights/pulley-is-shutting-down/
  - https://eqvista.com/?p=39115

## Export paths
- **Pulley:** Dashboard → Download Cap Table, or Company → Reports → Detailed Cap Table. For an as-of date, uncheck "All Time" and pick an end date. https://help.pulley.com/en/articles/6015799-download-an-excel-of-the-cap-table
- **Carta:** Run reports: Cap table report (Summary, Detailed, Securities ledger by type and class), Vesting report, Stakeholder details. Signed documents are not included. https://help.cakeequity.com/article/how-do-i-export-my-cap-table-from-carta
- **Carta "Open Cap Table report" (OCX, the Open Cap Table Excel standard):** under Cap Table → Run reports. https://releasenotes.carta.com/equity-reporting-suite-ocx-1EEcfe
- **Cake:** Compliance → Reporting → Exports: Cap table XLSX, Contact details CSV, Noteholders CSV, Equity grants, Transaction history. https://help.cakeequity.com/article/export-your-cap-table-data
- **Popular tools today:** Carta (dominant; absorbing Pulley customers), Cake Equity, Ledgy, AngelList, Shareworks, Eqvista.

## Open Cap Table Format (OCF)
- An open JSON standard from the Open Cap Table Coalition (founded by law firms).
- **Files:** manifest, stakeholders, stock classes, stock plans, vesting terms, transactions, valuations, financings, documents. Stored as a zip.
- **Transactions cover:** issuance, transfer, cancellation, conversion, exercise, repurchase, retraction, return to pool, splits, vesting start/event/acceleration, and convertible (SAFE) issuance/transfer/conversion.
- **Links:**
  - https://github.com/Open-Cap-Table-Coalition/Open-Cap-Format-OCF
  - Docs: https://open-cap-table-coalition.github.io/Open-Cap-Format-OCF/
  - Python: `pyocf` (MIT, OCF 1.2.0) https://pypi.org/project/pyocf/
  - Gunderson's CE2OCF (formation docs → OCF) https://github.com/gunderson-dettmer/CE2OCF

## Signing
- **Documenso:** AGPL, self-hostable, direct links, webhooks. https://docs.documenso.com/docs/developers/embedding/direct-links
- **DocuSeal:** AGPL alternative.
- On their hosted plans, API/embedding are paid tiers. [Check self-hosted enterprise-license features.] https://verdocs.com/blog/docuseal-vs-documenso

## Updates
Tauri updater: mandatory signatures, static JSON on GitHub Releases or a dynamic server. https://v2.tauri.app/plugin/updater/

## YC SAFE
- Three US post-money versions + side letter, and non-US versions (Canada, Cayman, Singapore). https://www.ycombinator.com/documents
- YC disclaims responsibility for using the forms. The page states no reuse license: use the forms unmodified, credit YC, and link to the source.

## Competitor comparison (website table, checked Oct 9, 2026). Re-check before launch
| Vendor | Free plan | Paid from | Notes | Source |
|---|---|---|---|---|
| Carta | Launch: ≤25 stakeholders and ≤$1M raised | No list prices. Vendr (406 purchases, Feb 2026): median $15,450/yr; <25 stakeholders $3,000–6,000; <50 $3,000–8,000; 50–100 $6,000–12,000; 100–300 $10,000–25,000 · https://www.vendr.com/marketplace/carta | OCX "Open Cap Table report" export; official Pulley migration partner | https://frontdeskreview.com/software/cap-table-management/carta/ · https://releasenotes.carta.com/equity-reporting-suite-ocx-1EEcfe |
| Mantle | Yes | Essentials $1,200/yr; Growth $3,000/yr, unlimited stakeholders | AI assistant "Clerk" reads source documents; Pulley migration offer | https://blog.withmantle.com/pulley-alternative/ |
| Cake Equity | ≤5 stakeholders | Build $1,000/yr (25 stakeholders); Team $2,750/yr (40); Pro custom · https://resources.rework.com/tools/equity-cap-table/best-carta-alternatives | | https://pricingsaas.com/companies/cakeequity |
| Eqvista | ≤20 stakeholders | $2/stakeholder/mo; 409A from $990 | | https://eqvista.com/eqvista-vs-carta/ |
| Ledgy | Launch free, ≤25 stakeholders (sources conflict 25/50; we state 25) | Scale from €5,000/yr; Enterprise from €18,000/yr (rework.com) | Employee-equity focus | https://costbench.com/software/equity-management/ledgy/free-plan/ |
| Pulley | — | — | Shuts down Dec 8, 2026 | see above |
| AngelList | — | — | Closed to new cap-table customers in 2026 | https://flowjam.com/blog/best-cap-table-software-for-startups-in-2025 |
| Captable, Inc. (open source) | — | — | Last commit Sep 18, 2024: inactive | https://github.com/captableinc/captable |

**How competitors' own comparison pages work:** Mantle and Eqvista use 2-column "us vs them" feature checklists (409A, waterfall, HRIS, QSBS, secondary liquidity, onboarding, support), often with soft claims ("intuitive"). Ours compares many vendors on verifiable facts, includes rows where we lose, and invites corrections.
