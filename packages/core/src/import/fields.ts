// The columns the generic importer understands (docs/04 canonical fields), and header guessing.

export type Field =
  | "name"
  | "email"
  | "holderType"
  | "kind"
  | "class"
  | "shares"
  | "price"
  | "strike"
  | "issueDate"
  | "vestingStart"
  | "vestingMonths"
  | "cliffMonths"
  | "vested"
  | "safeAmount"
  | "safeCap"
  | "safeDiscount"
  | "safeMfn";

export const FIELDS: { id: Field; label: string; synonyms: string[] }[] = [
  {
    id: "name",
    label: "Name",
    synonyms: [
      "name",
      "stakeholder",
      "stakeholdername",
      "holder",
      "holdername",
      "investor",
      "investorname",
      "shareholder",
      "legalname",
      "fullname",
      "employee",
      "grantee",
      "optionholder",
    ],
  },
  { id: "email", label: "Email", synonyms: ["email", "emailaddress", "contactemail", "stakeholderemail"] },
  {
    id: "holderType",
    label: "Person or entity",
    synonyms: ["stakeholdertype", "holdertype", "entitytype", "investortype"],
  },
  {
    id: "kind",
    label: "Security type (common, preferred, option, SAFE)",
    synonyms: [
      "securitytype",
      "type",
      "instrument",
      "instrumenttype",
      "equitytype",
      "awardtype",
      "kind",
      "security",
    ],
  },
  {
    id: "class",
    label: "Share class",
    synonyms: ["shareclass", "class", "stockclass", "classname", "series"],
  },
  {
    id: "shares",
    label: "Shares or options",
    synonyms: [
      "shares",
      "quantity",
      "numberofshares",
      "sharesoutstanding",
      "outstanding",
      "options",
      "optionsgranted",
      "sharesissued",
      "quantityissued",
      "granted",
      "outstandingshares",
      "noofshares",
    ],
  },
  {
    id: "price",
    label: "Price per share",
    synonyms: [
      "pricepershare",
      "shareprice",
      "issueprice",
      "purchaseprice",
      "costpershare",
      "originalissueprice",
    ],
  },
  { id: "strike", label: "Strike (exercise) price", synonyms: ["exerciseprice", "strikeprice", "strike"] },
  {
    id: "issueDate",
    label: "Issue or grant date",
    synonyms: [
      "issuedate",
      "grantdate",
      "dateissued",
      "date",
      "issued",
      "investmentdate",
      "purchasedate",
      "dateofissue",
    ],
  },
  {
    id: "vestingStart",
    label: "Vesting start",
    synonyms: ["vestingstart", "vestingstartdate", "vestingcommencementdate", "vcd", "vestingbegins"],
  },
  {
    id: "vestingMonths",
    label: "Vesting length (months)",
    synonyms: [
      "vestingmonths",
      "vestingperiod",
      "vestingperiodmonths",
      "vestingterm",
      "totalvestingmonths",
      "vestingduration",
      "vestinglength",
    ],
  },
  {
    id: "cliffMonths",
    label: "Cliff (months)",
    synonyms: ["cliff", "cliffmonths", "cliffperiod", "cliffperiodmonths", "cliffduration"],
  },
  {
    id: "vested",
    label: "Vested so far",
    synonyms: ["vested", "vestedshares", "vestedtodate", "sharesvested", "vestedoptions", "vestedquantity"],
  },
  {
    id: "safeAmount",
    label: "SAFE amount",
    synonyms: [
      "investment",
      "investmentamount",
      "amount",
      "purchaseamount",
      "principal",
      "amountinvested",
      "safeamount",
      "investmentusd",
    ],
  },
  {
    id: "safeCap",
    label: "SAFE valuation cap",
    synonyms: ["valuationcap", "cap", "postmoneyvaluationcap", "postmoneycap", "safecap"],
  },
  { id: "safeDiscount", label: "SAFE discount", synonyms: ["discount", "discountrate", "safediscount"] },
  { id: "safeMfn", label: "SAFE MFN", synonyms: ["mfn", "mostfavorednation", "mostfavourednation"] },
];

const norm = (h: string) =>
  h
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9]/g, "");
const BY_SYNONYM = new Map(FIELDS.flatMap((f) => f.synonyms.map((s) => [s, f.id] as const)));

/** One field (or null) per column; a field is used once, by the first column that matches. */
export function guessMapping(header: string[]): (Field | null)[] {
  const used = new Set<Field>();
  return header.map((h) => {
    const f = BY_SYNONYM.get(norm(h)) ?? BY_SYNONYM.get(h.toLowerCase().replace(/[^a-z0-9]/g, ""));
    if (!f || used.has(f)) return null;
    used.add(f);
    return f;
  });
}

/** The header row: the one in the first 20 with the most recognised column names. */
export function guessHeaderRow(rows: string[][]): number {
  let best = 0;
  let score = -1;
  rows.slice(0, 20).forEach((r, i) => {
    const s = guessMapping(r).filter(Boolean).length;
    if (s > score) [best, score] = [i, s];
  });
  return best;
}
