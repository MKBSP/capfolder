import { CURRENCIES, REGIONS, US_STATES } from "../regions";

/** "Your country": sets the number format (and how typed dates are read). */
export function YourCountry(p: { value: string; onChange(code: string): void }) {
  const sample = new Intl.NumberFormat(REGIONS.find((r) => r.code === p.value)?.locale ?? "en-US", {
    minimumFractionDigits: 2,
  }).format(1234567.89);
  return (
    <div className="field">
      <label style={{ display: "block" }}>
        <span className="lbl">Your country</span>
        <select className="inp" value={p.value} onChange={(e) => p.onChange(e.target.value)}>
          {REGIONS.map((r) => (
            <option key={r.code} value={r.code}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
      <span className="meta" style={{ display: "block", marginTop: 4 }}>
        Numbers look like {sample}; dates are typed {p.value === "US" ? "month/day/year" : "day/month/year"}.
      </span>
    </div>
  );
}

/** Where the company is incorporated, and the currency its records use. */
export function CompanyPlace(p: {
  country: string;
  subdivision: string;
  currency: string;
  onChange(v: { country: string; subdivision: string; currency: string }): void;
}) {
  return (
    <div className="grid2">
      <label className="field" style={{ display: "block" }}>
        <span className="lbl">Country of incorporation</span>
        <select
          className="inp"
          value={p.country}
          onChange={(e) => {
            const country = e.target.value;
            const currency = REGIONS.find((r) => r.code === country)?.currency ?? p.currency;
            p.onChange({ country, subdivision: country === "US" ? "DE" : "", currency });
          }}
        >
          {REGIONS.map((r) => (
            <option key={r.code} value={r.code}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
      {p.country === "US" ? (
        <label className="field" style={{ display: "block" }}>
          <span className="lbl">State</span>
          <select
            className="inp"
            value={p.subdivision}
            onChange={(e) => p.onChange({ ...p, subdivision: e.target.value })}
          >
            {US_STATES.map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label className="field" style={{ display: "block" }}>
          <span className="lbl">Region or state (optional)</span>
          <input
            className="inp"
            value={p.subdivision}
            placeholder="e.g. Lisboa"
            onChange={(e) => p.onChange({ ...p, subdivision: e.target.value })}
          />
        </label>
      )}
      <label className="field" style={{ display: "block" }}>
        <span className="lbl">Currency</span>
        <select
          className="inp"
          value={p.currency}
          onChange={(e) => p.onChange({ ...p, currency: e.target.value })}
        >
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
