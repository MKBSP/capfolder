// Countries the app knows how to format for, and the currency a company there usually reports in.
// ponytail: a short list; add a row when someone asks (Intl does the formatting).

export interface Region {
  code: string; // ISO 3166-1 alpha-2, also OCF country_of_formation
  name: string;
  locale: string; // BCP 47, for number formatting
  currency: string; // ISO 4217
}

export const REGIONS: Region[] = [
  { code: "US", name: "United States", locale: "en-US", currency: "USD" },
  { code: "CA", name: "Canada", locale: "en-CA", currency: "CAD" },
  { code: "GB", name: "United Kingdom", locale: "en-GB", currency: "GBP" },
  { code: "IE", name: "Ireland", locale: "en-IE", currency: "EUR" },
  { code: "PT", name: "Portugal", locale: "pt-PT", currency: "EUR" },
  { code: "ES", name: "Spain", locale: "es-ES", currency: "EUR" },
  { code: "FR", name: "France", locale: "fr-FR", currency: "EUR" },
  { code: "DE", name: "Germany", locale: "de-DE", currency: "EUR" },
  { code: "NL", name: "Netherlands", locale: "nl-NL", currency: "EUR" },
  { code: "IT", name: "Italy", locale: "it-IT", currency: "EUR" },
  { code: "DK", name: "Denmark", locale: "da-DK", currency: "DKK" },
  { code: "SE", name: "Sweden", locale: "sv-SE", currency: "SEK" },
  { code: "NO", name: "Norway", locale: "nb-NO", currency: "NOK" },
  { code: "CH", name: "Switzerland", locale: "de-CH", currency: "CHF" },
  { code: "BR", name: "Brazil", locale: "pt-BR", currency: "BRL" },
  { code: "MX", name: "Mexico", locale: "es-MX", currency: "MXN" },
  { code: "IN", name: "India", locale: "en-IN", currency: "INR" },
  { code: "SG", name: "Singapore", locale: "en-SG", currency: "SGD" },
  { code: "AU", name: "Australia", locale: "en-AU", currency: "AUD" },
  { code: "JP", name: "Japan", locale: "ja-JP", currency: "JPY" },
  { code: "CN", name: "China", locale: "zh-CN", currency: "CNY" },
  { code: "IL", name: "Israel", locale: "he-IL", currency: "ILS" },
];

export const CURRENCIES = [...new Set(["USD", "EUR", "GBP", ...REGIONS.map((r) => r.currency)])];

export const regionOf = (code: string | undefined): Region =>
  REGIONS.find((r) => r.code === code) ?? REGIONS[0]!;

/** The OS language's country (en-US → US), if we know it. */
export function guessRegion(lang = typeof navigator === "undefined" ? "en-US" : navigator.language): string {
  const cc = lang.split("-")[1]?.toUpperCase();
  return REGIONS.some((r) => r.code === cc) ? cc! : "US";
}

/** US states most startups incorporate in, then every other state. */
export const US_STATES = [
  ["DE", "Delaware"],
  ["CA", "California"],
  ["NY", "New York"],
  ["WY", "Wyoming"],
  ["NV", "Nevada"],
  ["TX", "Texas"],
  ["FL", "Florida"],
  ["WA", "Washington"],
  ["MA", "Massachusetts"],
  ["CO", "Colorado"],
  ["AL", "Alabama"],
  ["AK", "Alaska"],
  ["AZ", "Arizona"],
  ["AR", "Arkansas"],
  ["CT", "Connecticut"],
  ["DC", "District of Columbia"],
  ["GA", "Georgia"],
  ["HI", "Hawaii"],
  ["ID", "Idaho"],
  ["IL", "Illinois"],
  ["IN", "Indiana"],
  ["IA", "Iowa"],
  ["KS", "Kansas"],
  ["KY", "Kentucky"],
  ["LA", "Louisiana"],
  ["ME", "Maine"],
  ["MD", "Maryland"],
  ["MI", "Michigan"],
  ["MN", "Minnesota"],
  ["MS", "Mississippi"],
  ["MO", "Missouri"],
  ["MT", "Montana"],
  ["NE", "Nebraska"],
  ["NH", "New Hampshire"],
  ["NJ", "New Jersey"],
  ["NM", "New Mexico"],
  ["NC", "North Carolina"],
  ["ND", "North Dakota"],
  ["OH", "Ohio"],
  ["OK", "Oklahoma"],
  ["OR", "Oregon"],
  ["PA", "Pennsylvania"],
  ["RI", "Rhode Island"],
  ["SC", "South Carolina"],
  ["SD", "South Dakota"],
  ["TN", "Tennessee"],
  ["UT", "Utah"],
  ["VT", "Vermont"],
  ["VA", "Virginia"],
  ["WV", "West Virginia"],
  ["WI", "Wisconsin"],
] as const;
