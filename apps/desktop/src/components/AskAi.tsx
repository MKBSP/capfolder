// docs/18 · Ask AI: the header button and the collapsible side panel (like Gemini in Gmail).
import { type ReactNode, useEffect, useRef, useState } from "react";
import { aiLabel, isCloud } from "../ai";
import { askChat, type ChatMsg, type DraftCard, type GoTo, type Source } from "../chat";
import { aiFor } from "../settings";
import { type Route, useApp } from "../state";

const LOOKING: Partial<Record<Route["name"], string>> = {
  home: "Cap table",
  people: "People",
  person: "a person",
  documents: "Documents",
  signatures: "Signatures",
  settings: "Settings",
  sort: "Sort documents",
  newSafe: "New SAFE",
  newGrant: "New grant",
  newShares: "New shares",
  pool: "Option pool",
  newPerson: "New person",
  import: "Import",
};
const FORM: Record<DraftCard["kind"], string> = {
  grant: "grant form",
  vesting: "grant form",
  safe: "SAFE form",
  person: "person form",
  plan: "option pool form",
};
const ATTENTION_Q = "What needs my attention?";
const SUGGEST = [ATTENTION_Q, "Who has unvested options?", "Draft a SAFE"];

/** After "Take me there": scroll the row into view and pulse it (the screen may still be rendering). */
function flash(id: string, tries = 20) {
  const el = [...document.querySelectorAll("[data-focus]")].find((e) => e.getAttribute("data-focus") === id);
  if (!el) {
    if (tries) setTimeout(() => flash(id, tries - 1), 50);
    return;
  }
  el.scrollIntoView?.({ block: "center", behavior: "smooth" });
  el.classList.add("pulse");
  setTimeout(() => el.classList.remove("pulse"), 2400);
}

/** Opens or closes the panel; the choice is kept in settings (never the vault). */
function useToggle() {
  const app = useApp();
  return (open: boolean) => app.setSettings((s) => ({ ...s, chat: { ...s.chat, open } }));
}

export function AskAiButton() {
  const app = useApp();
  const toggle = useToggle();
  const open = app.settings.chat.open;
  return (
    <button type="button" className="ask-ai" aria-pressed={open} onClick={() => toggle(!open)}>
      ✦ Ask AI <kbd>⌘K</kbd>
    </button>
  );
}

/** The screen, plus the panel on the right while it's open. ⌘K / Ctrl+K toggles, Esc closes. */
export function ChatShell({ children }: { children: ReactNode }) {
  const app = useApp();
  const toggle = useToggle();
  const open = app.settings.chat.open && !!app.vault;
  const openRef = useRef(open);
  openRef.current = open;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        toggle(!openRef.current);
      } else if (e.key === "Escape" && openRef.current && !document.querySelector("[role=dialog]"))
        toggle(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div className="shell">
      <div className="shell-main">{children}</div>
      {open ? <Panel onClose={() => toggle(false)} /> : null}
    </div>
  );
}

function Panel({ onClose }: { onClose(): void }) {
  const app = useApp();
  const root = app.vault!.root;
  const thread = app.chat[root] ?? [];
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const ai = aiFor(app.settings, "chat"); // the default AI, unless Advanced picks another
  const cloudDocs = app.settings.chat.cloudDocs;
  const person =
    app.route.name === "person" ? app.latest?.stakeholders.get(app.route.id)?.name?.legal_name : null;
  const looking = person ? String(person) : (LOOKING[app.route.name] ?? "Capfolder");
  const add = (m: ChatMsg) => app.setChat((all) => ({ ...all, [root]: [...(all[root] ?? []), m] }));
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: "end" });
  }, [thread.length, busy]);

  async function send(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    setQ("");
    add({ role: "user", text: question });
    setBusy(true);
    const a = app.fresh();
    const answer = await askChat(
      {
        platform: a.platform,
        vault: a.vault!,
        asOf: a.asOf,
        ctx: a.ctx,
        currency: a.currency,
        looking,
        chat: { provider: "", model: "", ...aiFor(a.settings, "chat"), cloudDocs: a.settings.chat.cloudDocs },
      },
      thread,
      question,
    );
    add(answer);
    setBusy(false);
  }

  const go = (x: Source) =>
    x.kind === "doc"
      ? app.go({ name: "documents" })
      : x.personId
        ? app.go({ name: "person", id: x.personId })
        : undefined;

  return (
    <aside className="ask-panel" aria-label="Ask AI">
      <div className="ask-head">
        <b>✦ Ask AI</b>
        <span className="meta">
          {ai
            ? `${aiLabel(ai)}${isCloud(ai.provider) && !cloudDocs ? " · cap-table data only" : ""}`
            : "no AI connected"}
        </span>
        <button type="button" className="ask-x" aria-label="Close Ask AI" onClick={onClose}>
          ×
        </button>
      </div>
      <div className="meta ask-ctx">
        Looking at: {looking}, as of {app.asOf}
      </div>
      <div className="ask-thread" aria-live="polite">
        {!ai ? (
          <div className="stack small">
            <p style={{ margin: 0 }}>
              Ask about your cap table, or describe a grant or SAFE and get a draft you check before saving.
            </p>
            <button type="button" className="btn small" onClick={() => send(ATTENTION_Q)}>
              {ATTENTION_Q}
            </button>
            <button type="button" className="btn primary small" onClick={() => app.go({ name: "settings" })}>
              Connect an AI
            </button>
          </div>
        ) : !thread.length ? (
          <p className="meta" style={{ margin: 0 }}>
            Ask about ownership, vesting, dilution or what's missing. Describe a grant or SAFE to get a draft.
          </p>
        ) : null}
        {thread.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="ask-me">
              {m.text}
            </div>
          ) : (
            <div key={i} className="stack" style={{ gap: 8 }}>
              {m.text ? <p className={m.error ? "ask-error" : ""}>{m.text}</p> : null}
              {m.goto?.length ? (
                <ol className="ask-goto">
                  {m.goto.map((g: GoTo) => (
                    <li key={g.text}>
                      <span>{g.text}</span>
                      <button
                        type="button"
                        className="btn link small"
                        onClick={() => {
                          app.go(g.to);
                          if (g.focus) flash(g.focus);
                        }}
                      >
                        Take me there →
                      </button>
                    </li>
                  ))}
                </ol>
              ) : null}
              {m.sources?.length ? (
                <div className="ask-src">
                  {m.sources.map((x) => (
                    <button type="button" key={`${x.kind}:${x.id}`} onClick={() => go(x)}>
                      {x.label}
                    </button>
                  ))}
                </div>
              ) : null}
              {m.drafts?.map((d, j) => (
                <Draft key={j} d={d} />
              ))}
              {m.note ? <p className="meta">{m.note}</p> : null}
            </div>
          ),
        )}
        {busy ? <p className="meta">Thinking…</p> : null}
        <div ref={end} />
      </div>
      {ai ? (
        <div className="ask-suggest">
          {SUGGEST.map((s) => (
            <button type="button" key={s} disabled={busy} onClick={() => send(s)}>
              {s}
            </button>
          ))}
        </div>
      ) : null}
      <form
        className="ask-input"
        onSubmit={(e) => {
          e.preventDefault();
          send(q);
        }}
      >
        <input
          className="inp"
          aria-label="Ask a question"
          placeholder="Ask about your cap table, or tell it what to add…"
          value={q}
          disabled={!ai}
          onChange={(e) => setQ(e.target.value)}
        />
        <button type="submit" className="btn primary" disabled={busy || !q.trim()}>
          Send
        </button>
      </form>
      <div className="meta ask-foot">
        AI suggests, you confirm. It never saves, sends or signs on its own.
      </div>
    </aside>
  );
}

function Draft({ d }: { d: DraftCard }) {
  const app = useApp();
  const [gone, setGone] = useState(false);
  const template = d.template && "name" in d.template ? d.template : null;
  if (gone) return <p className="meta">Draft discarded.</p>;
  return (
    <>
      <div className="ask-card">
        <span className="ask-k">{`Draft · ${d.title}`}</span>
        <dl>
          {d.rows.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
          {template ? (
            <div>
              <dt>Template</dt>
              <dd>
                {template.url ? (
                  <button
                    type="button"
                    className="btn link small"
                    onClick={() => app.platform.openUrl(template.url!)}
                  >
                    {template.name}
                  </button>
                ) : (
                  template.name
                )}
              </dd>
            </div>
          ) : null}
        </dl>
        <div className="row wrap">
          <button type="button" className="btn primary small" onClick={() => app.go(d.route)}>
            Open in the {FORM[d.kind]}
          </button>
          <button type="button" className="btn small" onClick={() => setGone(true)}>
            Discard
          </button>
        </div>
      </div>
      {d.template && "none" in d.template ? (
        <div className="ask-card warn">
          <span className="ask-k">No template for this</span>
          <p>{d.template.none}</p>
        </div>
      ) : null}
    </>
  );
}
