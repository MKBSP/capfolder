// Free templates for the documents checklist (docs/17). Linked, not copied, unless the licence allows it:
// Series Seed is CC0 and ships with the app (templates/series-seed); the rest are free to use from their own sites.

import spa from "../../../templates/series-seed/Series Seed - Preferred Stock Investment Agreement.md?raw";
import charter from "../../../templates/series-seed/Series Seed - Restated Certificate of Incorporation.md?raw";
import term from "../../../templates/series-seed/Series Seed - Term Sheet.md?raw";
import source from "../../../templates/series-seed/SOURCE.md?raw";

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
