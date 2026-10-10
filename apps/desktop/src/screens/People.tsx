import { capTableRows, capTableTotals } from "@capfolder/core";
import { MainHeader } from "../components/Header";
import { shares, usd } from "../fmt";
import { useApp } from "../state";

/** Everyone in the vault, with what they hold as of the chosen date. */
export function People() {
  const app = useApp();
  const s = app.state;
  if (!s) return null;
  const rows = capTableRows(s);
  return (
    <>
      <MainHeader>
        <button type="button" className="btn primary" onClick={() => app.go({ name: "newPerson" })}>
          + Person
        </button>
      </MainHeader>
      <main className="page">
        <div className="card" style={{ padding: 0 }}>
          <table className="tbl">
            <thead>
              <tr>
                <th className="th">Name</th>
                <th className="th">Email</th>
                <th className="th right">Shares & options</th>
                <th className="th right">SAFEs</th>
              </tr>
            </thead>
            <tbody>
              {[...s.stakeholders.values()].map((p) => {
                const mine = rows.filter((r) => s.securities.get(r.securityId)?.stakeholderId === p.id);
                const t = capTableTotals(mine.filter((r) => r.group !== 2));
                const held = t.fullyDiluted;
                const safes = mine.filter((r) => r.group === 3);
                return (
                  <tr key={p.id} className="click" onClick={() => app.go({ name: "person", id: p.id })}>
                    <td className="td">
                      <button type="button" className="btn link">
                        {p.name?.legal_name}
                      </button>
                    </td>
                    <td className="td muted">{p.contact_info?.emails?.[0]?.email_address ?? ""}</td>
                    <td className="td num right">{held ? shares(held) : "—"}</td>
                    <td className="td num right">{safes.length ? usd(t.safeAmount) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
