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
import { aiSummary } from "../ai";
import { DOC_TYPES, docTargets } from "../components/AttachModal";
import { CrumbHeader } from "../components/Header";
import { ErrorList, Field, Modal } from "../components/ui";
import { endOcr, isImage, isReadable, renderPdfPage } from "../docread";
import {
  fileDoc,
  learn,
  loadCorpus,
  progress,
  type SortDeps,
  type SortItem,
  sortOne,
  walk,
} from "../docsort";
import { money, shares } from "../fmt";
import { baseName } from "../fs/types";
import { type App, useApp } from "../state";

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

type Picked = { path: string; name: string };

/** Walks dropped or chosen folders (files are taken as they are), then sorts what it found. */
async function scan(get: () => App, paths: string[]) {
  const a = get();
  if (!a.vault || a.sort.running) return;
  const folder = baseName(paths[0] ?? "");
  a.setSort({
    root: a.vault.root,
    items: [],
    running: true,
    started: Date.now(),
    scanning: { folder, found: 0 },
  });
  const files: Picked[] = [];
  let truncated = false;
  for (const p of paths) {
    const name = p.split(/[\\/]/).at(-1) ?? p;
    if (isReadable(name)) files.push({ path: p, name });
    else {
      const before = files.length;
      const w = await walk(a.platform.fs, p, a.vault.root, (n) =>
        get().setSort((s) => ({ ...s, scanning: { folder, found: before + n } })),
      );
      files.push(...w.files);
      truncated ||= w.truncated;
    }
  }
  if (!files.length) {
    get().setSort((s) => ({
      ...s,
      running: false,
      scanning: undefined,
      note: `No PDFs or images found in ${folder}. Capfolder reads PDF, JPG and PNG files.`,
    }));
    return;
  }
  await runSort(get, files, truncated);
}

/** Sorts the files one by one. Runs in the app, so leaving the screen doesn't stop it or lose the results. */
async function runSort(get: () => App, files: Picked[], truncated = false) {
  const a = get();
  if (!files.length || !a.vault) return;
  const root = a.vault.root;
  const list: SortItem[] = files.map((f) => ({ ...f, status: "waiting" }));
  a.setSort({ root, items: [...list], running: true, started: Date.now(), truncated });
  const d: SortDeps = {
    platform: a.platform,
    settings: a.settings,
    ctx: a.ctx,
    rules: a.rules.doc_types,
    corpus: await loadCorpus(a.platform.fs, await a.platform.appDataDir()),
  };
  let vault = a.vault;
  const seen = new Set<string>();
  for (let i = 0; i < list.length; i++) {
    const now = get().vault;
    if (now?.root !== root) break; // another company was opened: stop
    if (now.events.length > vault.events.length) vault = now; // the founder saved something meanwhile
    list[i] = { ...list[i]!, status: "reading" };
    get().setSort((s) => ({ ...s, items: [...list] }));
    const r = await sortOne(d, vault, list[i]!, seen);
    list[i] = r.item;
    if (r.vault !== vault) {
      vault = r.vault;
      get().setVault(vault);
    }
    get().setSort((s) => ({ ...s, items: [...list] }));
  }
  await endOcr();
  get().setSort((s) => ({ ...s, running: false }));
}

/** A "Needs you" row in plain words: every reason, and "not on your cap table yet" when nothing matched. */
function explain(x: SortItem): string {
  const r = x.result;
  if (!r) return "";
  return r.problems
    .map((p) =>
      /^No holding matches this (amount|share count) and name\.$/.test(p)
        ? `Not on your cap table yet: no ${TYPE_LABEL[r.type ?? ""] ?? "holding"}${r.fields.name ? ` for ${r.fields.name}` : ""}${
            r.fields.amount && r.fields.amount !== "unreadable"
              ? ` of ${money(r.fields.amount)}`
              : r.fields.shares && r.fields.shares !== "unreadable"
                ? ` of ${shares(BigInt(r.fields.shares))} shares`
                : ""
          }. Review to add it.`
        : p,
    )
    .join(" ");
}

/** F-09 / F-26: drop a messy folder; certain documents are filed, the rest wait in "Needs you" (ImportReview.html). */
export function Sort() {
  const app = useApp();
  const [reviewing, setReviewing] = useState<number | null>(null);
  const [, tick] = useState(0);
  const run = app.sort.root === app.vault?.root ? app.sort : { items: [], running: false, started: 0 };
  const { items, running } = run;
  // leaving while idle frees OCR; mid-run the loop frees it itself when it ends
  useEffect(() => () => void (app.fresh().sort.running || endOcr()), [app]);
  // the "time left" line moves on its own between files
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => tick((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, [running]);

  // dropped on the window: folders are walked like "Choose a folder", files are taken as they are
  const dropped = app.route.name === "sort" ? app.route.dropped : undefined;
  // biome-ignore lint/correctness/useExhaustiveDependencies: once per drop
  useEffect(() => {
    if (dropped?.length) scan(app.fresh, dropped);
  }, [dropped]);

  const count = (s: SortItem["status"]) => items.filter((x) => x.status === s).length;
  const queue = items.map((x, i) => ({ x, i })).filter(({ x }) => x.status === "review");
  const update = (i: number, x: SortItem) =>
    app.setSort((s) => ({ ...s, items: s.items.map((y, j) => (j === i ? x : y)) }));
  const p = progress(items, run.started, Date.now());

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
          Choose a folder or files, or drop them on this window: signed SAFEs, grant notices, purchase
          agreements, 83(b)s, consents, scans and photos. Capfolder reads each one on this computer, files
          what it's sure of and asks you about the rest. Your originals are never moved or changed.
        </p>
        <div className="row wrap">
          <button
            type="button"
            className="btn primary"
            disabled={running}
            onClick={async () => {
              const dir = await app.platform.pickFolder("Choose a folder of documents");
              if (dir) await scan(app.fresh, [dir]);
            }}
          >
            Choose a folder…
          </button>
          <button
            type="button"
            className="btn"
            disabled={running}
            onClick={async () => runSort(app.fresh, await app.platform.pickFiles("Choose documents"))}
          >
            Choose files…
          </button>
          <span className="meta">
            {app.settings.ai.sortWithAi && app.settings.ai.provider
              ? `AI: ${app.settings.ai.model} on this computer`
              : "No AI connected: rules and your past choices only (Settings → AI)"}
          </span>
        </div>
        {run.scanning ? (
          <div className="banner small" role="status">
            Looking through {run.scanning.folder}… {run.scanning.found} document
            {run.scanning.found === 1 ? "" : "s"} found so far
          </div>
        ) : null}
        {"note" in run && run.note && !run.scanning ? (
          <div className="banner amber small" role="status">
            {run.note}
          </div>
        ) : null}
        {"truncated" in run && run.truncated ? (
          <div className="banner amber small">
            That folder has more than 500 documents: these are the first 500. Choose its subfolders one at a
            time for the rest.
          </div>
        ) : null}
        {running && items.length ? (
          <div className="stack small" role="status">
            <progress value={p.done} max={p.total} style={{ width: "100%" }} />
            <span>
              Reading {Math.min(p.done + 1, p.total)} of {p.total}
              {p.left ? ` · ${p.left}` : ""}
            </span>
          </div>
        ) : null}
        {items.length ? (
          <p className="meta" style={{ margin: 0 }}>
            You can leave this page. Sorting keeps going, and the results wait here.
          </p>
        ) : null}
        {queue.length && !app.latest?.securities.size ? (
          <div className="banner amber small">
            Your cap table is empty, so nothing can be matched. Review each document to add it, or import your
            cap table first.
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
                      {explain(x)}
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
  // no signature visible (or a draft marker): filing asks first, and only a ticked box files it as proof
  const unsure = !!(r.draft || r.noSignature);
  const [asking, setAsking] = useState(false);
  const [override, setOverride] = useState(false);
  const [errors, setErrors] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const targets = docTargets(s);
  const company = String(s.issuer?.legal_name ?? "");
  const [summary, setSummary] = useState(() => summarize(r.type ?? "", r.fields, unsure, company));
  // a connected local AI may say it better; its answer replaces ours only when it's plain and short
  useEffect(() => {
    const ai = app.settings.ai;
    if (!ai.provider || !ai.model || !p.item.text?.trim()) return;
    let live = true;
    aiSummary(app.platform, { provider: ai.provider, model: ai.model }, p.item.text).then((t) => {
      if (live && t) setSummary(t);
    });
    return () => {
      live = false;
    };
  }, []);
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

  async function file(
    extraTarget?: { id: string; drafts: ReturnType<typeof b.safe>[] },
    signed: boolean = !unsure,
  ) {
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
        draft: !signed,
        signedByFounder: unsure && signed,
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
        <DocPreview path={p.item.path} name={p.item.name} text={p.item.text ?? ""} />
      </section>
      <section className="card stack" style={{ flex: "1 1 340px", maxWidth: 460 }}>
        {r.problems.length ? (
          <div className="banner amber small">
            {r.problems.map((x) => (
              <div key={x}>{x}</div>
            ))}
          </div>
        ) : null}
        <p style={{ margin: 0 }}>{summary}</p>
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
              Add this SAFE to the cap table
            </button>
          ) : null}
          <button
            type="button"
            className="btn primary"
            disabled={busy}
            onClick={() => (unsure ? setAsking(true) : file())}
          >
            {target
              ? `File as proof for ${targets.find((t) => t.id === target)?.label ?? target}`
              : "File as a company document"}
          </button>
        </div>
        <div className="meta">
          {canAddSafe ? (
            <div>
              Creates {fields.name}'s {money(fields.amount!)} SAFE on the cap table and files this document as
              its proof.
            </div>
          ) : null}
          <div>
            {target
              ? "Keeps a copy in your folder, linked to that holding as its signed proof."
              : "Keeps a copy in your folder as a company document, not linked to anyone."}
          </div>
        </div>
        {asking ? (
          <Modal open onClose={() => setAsking(false)} title="No signature found">
            <div className="stack">
              <p>
                {r.draft
                  ? `This looks like an unsigned draft ("${r.draft}").`
                  : "Capfolder can't see a signature in this copy: no e-signature, and it isn't a scan."}{" "}
                Filed as a draft, it's kept but doesn't count as proof.
              </p>
              <label className="row small">
                <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />
                <span>It has been signed: count this copy as the signed document</span>
              </label>
              <div className="row" style={{ justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setAsking(false);
                    file(undefined, false);
                  }}
                >
                  File as draft
                </button>
                <button
                  type="button"
                  className="btn primary"
                  disabled={!override}
                  onClick={() => {
                    setAsking(false);
                    file(undefined, true);
                  }}
                >
                  File as signed
                </button>
              </div>
            </div>
          </Modal>
        ) : null}
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

/** What the document is, in one sentence, from its kind and fields (the AI's version replaces it when there is one). */
function summarize(type: string, f: Fields, unsure: boolean, company: string): string {
  const ok = (v?: string) => (v && v !== "unreadable" ? v : undefined);
  const signed = unsure ? "An unsigned" : "A signed";
  const kind = TYPE_LABEL[type];
  const dated = ok(f.date) ? `, dated ${f.date}` : "";
  const to = ok(f.company) ?? company;
  if (type === "safe") {
    const amount = ok(f.amount) ? ` invests ${money(f.amount!)}` : " invests";
    const cap = ok(f.cap) ? ` at a ${money(f.cap!)} cap` : "";
    const discount = ok(f.discount) ? ` with a ${Math.round(Number(f.discount) * 100)}% discount` : "";
    return `${signed} SAFE: ${ok(f.name) ?? "an investor"}${amount}${to ? ` in ${to}` : ""}${cap}${discount}${dated}.`;
  }
  if (type === "option_grant" || type === "spa") {
    const what = type === "spa" ? "buys" : "gets options for";
    const n = ok(f.shares) ? ` ${shares(BigInt(f.shares!))}` : "";
    const price = ok(f.price) ? ` at ${money(f.price!)} each` : "";
    return `${signed} ${kind?.toLowerCase()}: ${ok(f.name) ?? "someone"} ${what}${n} shares${price}${dated}.`;
  }
  if (!kind || type === "other" || type === "not_equity")
    return "Capfolder couldn't tell what this document is. Choose its kind below.";
  return `${unsure ? "An unsigned" : "A"} ${kind}${ok(f.name) ? ` for ${f.name}` : ""}${dated}.`;
}

/** The document itself: PDF pages drawn on a canvas, images as images, its text one click away. */
function DocPreview(p: { path: string; name: string; text: string }) {
  const app = useApp();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [img, setImg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [showText, setShowText] = useState(false);
  useEffect(() => {
    let live = true;
    let url: string | null = null;
    (async () => {
      try {
        const bytes = await app.platform.fs.readBytes(p.path);
        if (isImage(p.name)) {
          url = URL.createObjectURL(new Blob([bytes as BlobPart]));
          if (live) setImg(url);
        } else if (canvas.current) {
          const n = await renderPdfPage(bytes, page, canvas.current);
          if (live) setPages(n);
        }
      } catch {
        if (live) setFailed(true); // no preview (or a test's canvas-less DOM): the text still shows
      }
    })();
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [page]);
  const text = (
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
      {p.text.slice(0, 6000) || "(no text could be read)"}
    </pre>
  );
  if (failed) return text;
  return (
    <div className="stack">
      {showText ? (
        text
      ) : img ? (
        <img src={img} alt={p.name} style={{ maxWidth: "100%", border: "1px solid var(--row-divider)" }} />
      ) : (
        <canvas
          ref={canvas}
          aria-label={`Page ${page} of ${p.name}`}
          style={{ width: "100%", border: "1px solid var(--row-divider)", borderRadius: 4 }}
        />
      )}
      <div className="row spread">
        {pages > 1 && !showText ? (
          <span className="row small">
            <button
              type="button"
              className="btn small"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              ← Previous
            </button>
            <span className="meta">
              Page {page} of {pages}
            </span>
            <button
              type="button"
              className="btn small"
              disabled={page >= pages}
              onClick={() => setPage(page + 1)}
            >
              Next →
            </button>
          </span>
        ) : (
          <span />
        )}
        <button type="button" className="btn link small" onClick={() => setShowText(!showText)}>
          {showText ? "Show document" : "Show text"}
        </button>
      </div>
    </div>
  );
}
