// Free templates for the documents checklist (docs/17). Linked, not copied, unless the licence allows it:
// Series Seed is CC0 and ships with the app (templates/series-seed); the rest are free to use from their own sites.

import type { Form } from "@capfolder/core";
import spa from "../../../templates/series-seed/Series Seed - Preferred Stock Investment Agreement.md?raw";
import charter from "../../../templates/series-seed/Series Seed - Restated Certificate of Incorporation.md?raw";
import term from "../../../templates/series-seed/Series Seed - Term Sheet.md?raw";
import source from "../../../templates/series-seed/SOURCE.md?raw";
import proRata from "../../../templates/yc/pro-rata-side-letter.json";
import safeCap from "../../../templates/yc/safe-cap.json";
import safeDiscount from "../../../templates/yc/safe-discount.json";
import safeMfn from "../../../templates/yc/safe-mfn.json";

const COOLEY = "https://www.cooleygo.com/documents/"; // founder stock, IP assignment, bylaws, plans, consents
const YC = "https://www.ycombinator.com/documents";
const IRS_83B = "https://www.irs.gov/pub/irs-pdf/f15620.pdf"; // Form 15620, the IRS's own 83(b) election form

/** Where to get a blank one, by checklist doc type (US/Delaware forms). */
export const TEMPLATE_LINKS: Record<string, string> = {
  company_certificate: COOLEY,
  company_bylaws: COOLEY,
  plan: COOLEY,
  board_consent: COOLEY,
  spa: COOLEY,
  ciiaa: COOLEY,
  option_grant: COOLEY,
  safe: YC,
  "83b": IRS_83B,
};

/** Bundled, public domain: copied into the vault's drafts/ for the founder (or their AI) to fill in. */
export const SERIES_SEED: Record<string, string> = {
  "Series Seed - Term Sheet.md": term,
  "Series Seed - Preferred Stock Investment Agreement.md": spa,
  "Series Seed - Restated Certificate of Incorporation.md": charter,
  "SOURCE.md": source,
};

/** YC's forms (CC BY-ND 4.0), filled in and sent unmodified: templates/yc/, made by scripts/docx-to-form.mjs. */
export const YC_FORMS = {
  "safe-cap": { label: "YC post-money SAFE (valuation cap)", form: safeCap as Form },
  "safe-discount": { label: "YC post-money SAFE (discount)", form: safeDiscount as Form },
  "safe-mfn": { label: "YC post-money SAFE (MFN)", form: safeMfn as Form },
  "pro-rata-side-letter": { label: "YC pro rata side letter", form: proRata as Form },
};

/** Which YC SAFE fits these terms, or why none does. */
export function ycSafeFor(t: {
  cap: boolean;
  discount: boolean;
  mfn: boolean;
}): keyof typeof YC_FORMS | { none: string } {
  if (t.cap && t.discount)
    return { none: "YC has no SAFE with both a valuation cap and a discount. Upload your own PDF." };
  if (t.mfn && (t.cap || t.discount))
    return { none: "YC's MFN SAFE has no cap or discount. Upload your own PDF for these terms." };
  if (t.cap) return "safe-cap";
  if (t.discount) return "safe-discount";
  if (t.mfn) return "safe-mfn";
  return { none: "YC's SAFEs need a valuation cap, a discount or MFN. Upload your own PDF for these terms." };
}
