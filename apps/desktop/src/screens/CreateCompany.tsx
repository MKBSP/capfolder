import { useEffect, useState } from "react";
import { type BackupStatus, backupStatus, suggestedFolders } from "../backup";
import { DateInput } from "../components/DateInput";
import { CompanyPlace } from "../components/RegionFields";
import { ErrorList, Stepper } from "../components/ui";
import { todayIso } from "../fmt";
import { join } from "../fs/types";
import { regionOf } from "../regions";
import { addRecent } from "../settings";
import { useApp } from "../state";
import { createVault } from "../vault";

/** CreateCompany.html (F-05). */
export function CreateCompany() {
  const app = useApp();
  const { platform } = app;
  const [name, setName] = useState("");
  const home = regionOf(app.settings.region);
  const [place, setPlace] = useState({
    country: home.code,
    subdivision: home.code === "US" ? "DE" : "",
    currency: home.currency,
  });
  const [date, setDate] = useState("");
  const [parent, setParent] = useState<string | null>(null);
  const [backup, setBackup] = useState<BackupStatus | null>(null);
  const [synced, setSynced] = useState<{ name: string; path: string }[]>([]);
  const [errors, setErrors] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    platform.documentDir().then((d) => setParent((p) => p ?? d));
    platform.homeDir().then((h) => suggestedFolders(h, (p) => platform.fs.exists(p)).then(setSynced));
  }, [platform]);
  const folder = parent ? join(parent, name.trim() || "Company") : "";
  useEffect(() => {
    if (folder) backupStatus(folder, (p) => platform.fs.exists(p)).then(setBackup);
  }, [folder, platform]);

  async function create() {
    const errs: string[] = [];
    if (!name.trim()) errs.push("Enter the company's legal name.");
    if (!date) errs.push("Enter the date of incorporation.");
    else if (date > todayIso()) errs.push("The incorporation date can't be in the future.");
    if (errs.length) return setErrors(errs);
    setBusy(true);
    try {
      const v = await createVault(platform.fs, app.ctx, {
        parent: parent!,
        company: { name: name.trim(), formationDate: date, ...place, subdivision: place.subdivision.trim() },
      });
      await app.setSettings({
        ...app.settings,
        recentVaults: addRecent(app.settings.recentVaults, { name: name.trim(), root: v.root }),
      });
      app.setVault(v);
      app.go({ name: "start" });
    } catch (e) {
      setErrors([(e as Error).message]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="narrow" style={{ maxWidth: 600 }}>
      <Stepper current={3} />
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
      >
        <h1>Your company</h1>
        <label>
          <span className="lbl">Legal name</span>
          <input
            className="inp"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme Inc."
          />
        </label>
        <label>
          <span className="lbl">Incorporated</span>
          <DateInput value={date} onChange={setDate} />
        </label>
        <CompanyPlace {...place} onChange={setPlace} />
        {place.country !== "US" || place.subdivision !== "DE" ? (
          <div className="banner amber">
            Templates and checks are written for Delaware companies for now. You can still track your cap
            table.
          </div>
        ) : null}
        <div>
          <span className="lbl">Where should the folder live?</span>
          <div className="row">
            <span className="mono small grow">{folder}</span>
            <button
              type="button"
              className="btn"
              onClick={async () => {
                const p = await platform.pickFolder("Choose where the company folder goes");
                if (p) setParent(p);
              }}
            >
              Change…
            </button>
          </div>
        </div>
        {backup?.backedUp ? (
          <div className="banner green">Backed up by {backup.by}</div>
        ) : backup ? (
          <div className="banner amber">
            This folder isn't backed up. If this laptop dies, the cap table goes with it.
            {synced.length ? (
              <div className="row wrap" style={{ marginTop: 8 }}>
                {synced.map((s) => (
                  <button type="button" key={s.path} className="btn" onClick={() => setParent(s.path)}>
                    Use {s.name}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="card tight">
          <div className="meta">We'll create</div>
          <pre className="mono small" style={{ margin: "6px 0 0" }}>
            {`${name.trim() || "Company"}/\n├── README.txt\n├── events.jsonl\n├── captable.csv\n└── docs/`}
          </pre>
        </div>
        <ErrorList errors={errors} />
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn primary" type="submit" disabled={busy}>
            Create folder
          </button>
        </div>
      </form>
    </main>
  );
}
