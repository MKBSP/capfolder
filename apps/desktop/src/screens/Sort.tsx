import {
  builders as b,
  type FieldName,
  type Fields,
  MAX_DATE,
  nextSecurityIdNumber,
  normName,
  reduce,
  SORT_TYPES,
  type SortType,
} from "@capfolder/core";
import { useEffect, useRef, useState } from "react";
import { DOC_TYPES, docTargets } from "../components/AttachModal";
import { CrumbHeader } from "../components/Header";
import { ErrorList, Field } from "../components/ui";
import { endOcr } from "../docread";
import { fileDoc, learn, loadCorpus, type SortDeps, type SortItem, sortOne, walk } from "../docsort";
import { money, shares } from "../fmt";
import { useApp } from "../state";

const TYPE_LABEL: Record<string, string> = {
  ...Object.fromEntries(DOC_TYPES.map((d) => [d.value, d.label])),
  not_equity: "Not an equity document",
};
const STATUS: Record<SortItem["status"], { label: string; chip: string }> = {
  waiting: { label: "Waiting", chip: "" },
  reading: { label: "Reading…", chip: "" },
  filed: { label: "Filed", chip: "green" },
  review: { label: "Needs you", chip: "amber" },
  duplicate: { label: "Duplicate, skipped", chip: "" },
  skipped: { label: "Not equity, skipped", chip: "" },
  error: { label: "Couldn't read", chip: "red" },
};
const FIELD_LABEL: Record<FieldName, string> = {
  name: "Name",
  company: "Company",
  amount: "Amount",
  cap: "Valuation cap",
  discount: "Discount",
  shares: "Shares",
  price: "Price per share",
  date: "Date",
};
const BY: Record<string, string> = {
  rule: "Title and clauses match a known template.",
  knn: "It looks like documents you confirmed before.",
  ai: "Your AI read it (check every field).",
};

/** F-09 / F-26: drop a messy folder; certain documents are filed, the rest wait in "Needs you" (ImportReview.html). */
export function Sort() {
  const app = useApp();
  const [items, setItems] = useState<SortItem[]>([]);
  const [running, setRunning] = useState(false);
  const [reviewing, setReviewing] = useState<number | null>(null);
  const [truncated, setTruncated] = useState(false);
  const runningRef = useRef(false);
  const latest = useRef(app);
  latest.current = app;
  // leaving mid-run: the loop finishes on its own and frees OCR itself
  useEffect(() => () => void (runningRef.current || endOcr()), []);

  async function deps(): Promise<SortDeps> {
    const a = latest.current;
    return {
      platform: a.platform,
      settings: a.settings,
      ctx: a.ctx,
      rules: a.rules.doc_types,
      corpus: await loadCorpus(a.platform.fs, await a.platform.appDataDir()),
    };
  }

  async function run(files: { path: string; name: string }[]) {
    if (!files.length || !latest.current.vault) return;
    setRunning(true);
    runningRef.current = true;
    setReviewing(null);
    const list: SortItem[] = files.map((f) => ({ ...f, status: "waiting" }));
    setItems([...list]);
    const d = await deps();
    let vault = latest.current.vault!;
    const seen = new Set<string>();
    for (let i = 0; i < list.length; i++) {
      const app = latest.current.vault;
      if (app && app.events.length > vault.events.length) vault = app; // the founder saved something meanwhile
      list[i] = { ...list[i]!, status: "reading" };
      setItems([...list]);
      const r = await sortOne(d, vault, list[i]!, seen);
      list[i] = r.item;
      if (r.vault !== vault) {
        vault = r.vault;
        latest.current.setVault(vault);
      }
      setItems([...list]);
    }
    await endOcr();
    runningRef.current = false;
    setRunning(false);
  }

  const count = (s: SortItem["status"]) => items.filter((x) => x.status === s).length;
  const queue = items.map((x, i) => ({ x, i })).filter(({ x }) => x.status === "review");
  const update = (i: number, x: SortItem) => setItems((all) => all.map((y, j) => (j === i ? x : y)));

  const reviewable = (x?: SortItem) => x?.status === "review" || (x?.status === "skipped" && !!x.result);
  if (reviewing !== null && reviewable(items[reviewing])) {
    const pos = queue.findIndex((q) => q.i === reviewing);
    return (
      <>
        <CrumbHeader title="Sort documents" />
        <Review
          key={reviewing}
          item={items[reviewing]!}
          position={`${pos + 1} of ${queue.length}`}
          onBack={() => setReviewing(null)}
          onDone={(x) => {
            update(reviewing, x);
            const next = queue.find((q) => q.i > reviewing) ?? queue.find((q) => q.i !== reviewing);
            setReviewing(next ? next.i : null);
          }}
        />
      </>
    );
  }

  return (
    <>
      <CrumbHeader title="Sort documents" />
      <main className="medium stack">
        <h1 style={{ margin: 0 }}>Add documents</h1>
        <p className="muted" style={{ margin: 0 }}>
          Choose a folder or files: signed SAFEs, grant notices, purchase agreements, 83(b)s, consents, scans
          and photos. Capfolder reads each one on this computer, files what it's sure of and asks you about
          the rest. Your originals are never moved or changed.
        </p>
        <div className="row wrap">
          <button
            type="button"
            className="btn primary"
            disabled={running}
            onClick={async () => {
              const dir = await app.platform.pickFolder("Choose a folder of documents");
              if (!dir) return;
              const w = await walk(app.platform.fs, dir, app.vault?.root ?? null);
              setTruncated(w.truncated);
              await run(w.files);
            }}
          >
            Choose a folder…
          </button>
          <button
            type="button"
            className="btn"
            disabled={running}
            onClick={async () => run(await app.platform.pickFiles("Choose documents"))}
          >
            Choose files…
          </button>
          <span className="meta">
            {app.settings.ai.sortWithAi && app.settings.ai.provider
              ? `AI: ${app.settings.ai.model} on this computer`
              : "No AI connected: rules and your past choices only (Settings → AI)"}
          </span>
        </div>
        {truncated ? (
          <div className="banner amber small">
            That folder has more than 500 documents: these are the first 500. Choose its subfolders one at a
            time for the rest.
          </div>
        ) : null}
        {items.length ? (
          <section className="card stack">
            <div className="row spread wrap">
              <span>
                <b>{count("filed")}</b> filed · <b>{count("review")}</b> need you · {count("duplicate")}{" "}
                duplicate · {count("skipped")} not equity
                {count("error") ? ` · ${count("error")} couldn't be read` : ""}
              </span>
              {queue.length && !running ? (
                <button type="button" className="btn primary" onClick={() => setReviewing(queue[0]!.i)}>
                  Review {queue.length} document{queue.length === 1 ? "" : "s"}
                </button>
              ) : null}
            </div>
            {items.map((x, i) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: one row per picked file, in order
                key={i}
                className="row spread wrap"
                style={{ borderTop: "1px solid var(--row-divider)", paddingTop: 8 }}
              >
                <span className="grow">
                  <span className="mono small">{x.name}</span>
                  {x.status === "filed" ? (
                    <span className="meta" style={{ display: "block" }}>
                      {TYPE_LABEL[x.result?.type ?? ""] ?? x.result?.type} → {x.filed}
                    </span>
                  ) : x.status === "review" ? (
                    <span className="meta" style={{ display: "block" }}>
                      {x.result?.problems[0]}
                    </span>
                  ) : x.error ? (
                    <span className="meta" style={{ display: "block" }}>
                      {x.error}
                    </span>
                  ) : null}
                </span>
                {reviewable(x) && !running ? (
                  <button type="button" className="btn small" onClick={() => setReviewing(i)}>
                    Review
                  </button>
                ) : null}
                <span className={`chip ${STATUS[x.status].chip}`}>{STATUS[x.status].label}</span>
              </div>
            ))}
          </section>
        ) : null}
        {!running && items.length && !queue.length ? (
          <div className="row">
            <button type="button" className="btn" onClick={() => app.go({ name: "documents" })}>
              See what's still missing
            </button>
          </div>
        ) : null}
      </main>
    </>
  );
}

/** One "Needs you" document: check the type, fields and holding, then file it (or say it isn't equity). */
function Review(p: { item: SortItem; position: string; onBack(): void; onDone(x: SortItem): void }) {
  const app = useApp();
  const r = p.item.result!;
  const s = app.latest!;
  const initial = r.targets[0] ?? r.suggestion ?? "";
  const [type, setType] = useState<SortType | "">(
    r.type && r.type !== "other" && r.type !== "not_equity" ? r.type : "",
  );
  const [fields, setFields] = useState<Fields>(r.fields);
  const [target, setTarget] = useState(initial);
  // on only when the number matched and just the name differed; otherwise an odd name would stick as an alias
  const [remember, setRemember] = useState(
    !!r.suggestion && r.checks.some((c) => c.field === "name" && c.state === "differs"),
  );
  const [errors, setErrors] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const targets = docTargets(s);
  const holder = s.securities.get(target)?.stakeholderId ?? (s.stakeholders.has(target) ? target : undefined);
  const holderName = holder ? String(s.stakeholders.get(holder)?.name?.legal_name ?? "") : "";
  const canRemember =
    !!holder &&
    !!fields.name &&
    fields.name !== "unreadable" &&
    normName(fields.name) !== normName(holderName);
  const checks = target === initial ? r.checks : [];
  const shown = [...new Set([...(Object.keys(fields) as FieldName[]), ...checks.map((c) => c.field)])];
  const canAddSafe = type === "safe" && !target && !!fields.name && /^\d+(\.\d+)?$/.test(fields.amount ?? "");

  const fmt = (f: FieldName, v?: string) =>
    !v ? "" : f === "amount" || f === "cap" ? money(v) : f === "shares" ? shares(BigInt(v)) : v;

  async function file(extraTarget?: { id: string; drafts: ReturnType<typeof b.safe>[] }) {
    if (!type) return setErrors(["Choose what kind of document this is."]);
    if (!app.vault) return;
    setBusy(true);
    try {
      const d: SortDeps = {
        platform: app.platform,
        settings: app.settings,
        ctx: app.ctx,
        corpus: [],
      };
      const bytes = await app.platform.fs.readBytes(p.item.path);
      const linked = extraTarget
        ? [extraTarget.id]
        : target === initial && r.targets.length > 1
          ? r.targets
          : target
            ? [target]
            : [];
      const res = await fileDoc(d, app.vault, p.item, bytes, {
        type,
        fields,
        targets: linked,
        person: extraTarget ? fields.name! : holderName || "company",
        date: /^\d{4}-\d\d-\d\d$/.test(fields.date ?? "") ? fields.date : s.securities.get(target)?.date,
        by: r.by ? `${r.by}+founder` : "founder",
        extra: [
          ...(extraTarget?.drafts ?? []),
          ...(canRemember && remember
            ? [b.stakeholderAlias({ stakeholderId: holder!, alias: fields.name! })]
            : []),
        ],
      });
      if (!res.ok) return setErrors(res.errors);
      app.setVault(res.vault);
      // filed is filed: a failure to remember the example mustn't strand the item
      await learn(app.platform.fs, await app.platform.appDataDir(), {
        sha256: p.item.sha256!,
        type,
        text: p.item.text ?? "",
      }).catch(() => {});
      p.onDone({ ...p.item, status: "filed", filed: res.filed, result: { ...r, type } });
    } finally {
      setBusy(false);
    }
  }

  async function addSafe() {
    // someone already on the cap table under that name keeps their record (no second "Angel A")
    const existing = [...s.stakeholders.entries()].find(
      ([, x]) => normName(String(x.name?.legal_name ?? "")) === normName(fields.name!),
    )?.[0];
    const person = existing ?? b.newId("sh");
    const id = `SAFE-${nextSecurityIdNumber(reduce(app.vault!.events, MAX_DATE), "SAFE")}`;
    await file({
      id,
      drafts: [
        ...(existing ? [] : [b.stakeholder({ id: person, name: fields.name!, type: "INSTITUTION" })]),
        b.safe({
          currency: app.currency,
          state: s,
          stakeholderId: person,
          amount: fields.amount!,
          cap: fields.cap && fields.cap !== "unreadable" ? fields.cap : undefined,
          discount: fields.discount && fields.discount !== "unreadable" ? fields.discount : undefined,
          mfn: false,
          date: /^\d{4}-\d\d-\d\d$/.test(fields.date ?? "")
            ? fields.date!
            : app.ctx.now().toISOString().slice(0, 10),
          securityId: id,
        }),
      ],
    });
  }

  return (
    <main className="page" style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>
      <section className="card stack" style={{ flex: "1 1 420px", minWidth: 0 }}>
        <div className="row spread">
          <button type="button" className="btn link small" onClick={p.onBack}>
            ← All documents
          </button>
          <span className="meta">Needs you · {p.position}</span>
        </div>
        <div className="mono small">
          {p.item.name}
          {p.item.ocr ? " · scanned" : ""}
        </div>
        <pre
          className="small"
          style={{
            whiteSpace: "pre-wrap",
            maxHeight: 520,
            overflow: "auto",
            margin: 0,
            padding: 12,
            background: "var(--surface-2, #f6f6f4)",
            borderRadius: 8,
          }}
        >
          {(p.item.text ?? "").slice(0, 6000) || "(no text could be read)"}
        </pre>
      </section>
      <section className="card stack" style={{ flex: "1 1 340px", maxWidth: 460 }}>
        {r.problems.length ? (
          <div className="banner amber small">
            {r.problems.map((x) => (
              <div key={x}>{x}</div>
            ))}
          </div>
        ) : null}
        <Field label="What is it?">
          <select className="inp" value={type} onChange={(e) => setType(e.target.value as SortType)}>
            <option value="">Choose…</option>
            {SORT_TYPES.filter((t) => t !== "not_equity").map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t] ?? t}
              </option>
            ))}
          </select>
        </Field>
        {shown.map((f) => {
          const c = checks.find((x) => x.field === f);
          return (
            <Field
              key={f}
              label={FIELD_LABEL[f]}
              hint={
                c?.state === "match" ? (
                  <span className="chip green">matches the cap table</span>
                ) : c?.state === "differs" ? (
                  <span className="chip red">cap table: {fmt(f, c.expected)}</span>
                ) : c?.state === "unreadable" || fields[f] === "unreadable" ? (
                  <span className="chip amber">
                    unreadable{c?.expected ? `, cap table: ${fmt(f, c.expected)}` : ""}
                  </span>
                ) : c?.state === "missing" ? (
                  <span className="chip">
                    not found{c.expected ? `, cap table: ${fmt(f, c.expected)}` : ""}
                  </span>
                ) : undefined
              }
            >
              <input
                className="inp"
                aria-label={FIELD_LABEL[f]}
                value={fields[f] ?? ""}
                onChange={(e) => setFields({ ...fields, [f]: e.target.value })}
              />
            </Field>
          );
        })}
        <Field label="Proof for">
          <select className="inp" value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Company document (not linked)</option>
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        {canRemember ? (
          <label className="row small">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            <span>
              Remember: “{fields.name}” is {holderName}
            </span>
          </label>
        ) : null}
        <ErrorList errors={errors} />
        <div className="row wrap" style={{ justifyContent: "flex-end" }}>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={async () => {
              await learn(app.platform.fs, await app.platform.appDataDir(), {
                sha256: p.item.sha256!,
                type: "not_equity",
                text: p.item.text ?? "",
              });
              p.onDone({ ...p.item, status: "skipped" });
            }}
          >
            Not an equity document
          </button>
          {canAddSafe ? (
            <button type="button" className="btn" disabled={busy} onClick={addSafe}>
              Add to cap table & file
            </button>
          ) : null}
          <button type="button" className="btn primary" disabled={busy} onClick={() => file()}>
            Confirm & file
          </button>
        </div>
        <div className="stack small">
          <b>How this was sorted</b>
          <ol style={{ margin: 0, paddingLeft: 18 }} className="muted">
            <li>
              Read:{" "}
              {p.item.ocr ? "no text layer, so OCR ran on this computer (Tesseract)." : "the PDF's text."}
            </li>
            <li>
              Type:{" "}
              {r.by
                ? `${BY[r.by]}${p.item.ai ? ` ${p.item.ai}, on this computer.` : ""}`
                : "no rule or past document matched."}
            </li>
            <li>Match: {r.problems[0] ?? "a holding on the cap table."}</li>
            <li>File: copied into docs/, the original stays where it is.</li>
          </ol>
        </div>
      </section>
    </main>
  );
}
