import { useState } from "react";

const RELEASES = "https://github.com/MKBSP/capfolder/releases";
const TABS = [
  {
    id: "Claude Code",
    cmd: ["/plugin marketplace add MKBSP/capfolder", "/plugin install capfolder@capfolder"],
  },
  { id: "Claude Desktop", cmd: [] },
  { id: "Codex", cmd: ["codex mcp add capfolder -- npx -y capfolder mcp"] },
  { id: "Gemini CLI", cmd: ["gemini extensions install https://github.com/MKBSP/capfolder"] },
  { id: "Other", cmd: ["npx capfolder install"] },
];

export function ConnectAi() {
  const [i, setI] = useState(0);
  const [copied, setCopied] = useState(false);
  const tab = TABS[i] ?? { id: "", cmd: [] as string[] };
  const pick = (n: number) => {
    setI((n + TABS.length) % TABS.length);
    setCopied(false);
  };
  return (
    <section className="card stack" aria-label="Connect your AI">
      <h2>Connect your AI</h2>
      <p className="small muted" style={{ margin: 0 }}>
        Run Capfolder from your own AI. Pick yours and paste the command.
      </p>
      <div role="tablist" aria-label="Your AI" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {TABS.map((t, n) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`ai-tab-${n}`}
            aria-selected={n === i}
            aria-controls="ai-panel"
            tabIndex={n === i ? 0 : -1}
            className={`btn${n === i ? " primary" : ""}`}
            onClick={() => pick(n)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") pick(i + 1);
              if (e.key === "ArrowLeft") pick(i - 1);
            }}
          >
            {t.id}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="ai-panel" aria-labelledby={`ai-tab-${i}`} className="stack">
        {tab.cmd.length ? (
          <>
            <pre className="num" style={{ margin: 0, overflowX: "auto" }}>
              {tab.cmd.map((c) => (
                <div key={c}>{c}</div>
              ))}
            </pre>
            <div>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  navigator.clipboard?.writeText(tab.cmd.join("\n"));
                  setCopied(true);
                }}
              >
                Copy
              </button>
              {copied ? <span className="small muted"> Copied.</span> : null}
            </div>
          </>
        ) : (
          <p style={{ margin: 0 }}>
            Download capfolder.mcpb from{" "}
            <a href={RELEASES} target="_blank" rel="noreferrer">
              GitHub Releases
            </a>{" "}
            and double-click it.
          </p>
        )}
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        ChatGPT: <strong>Coming</strong>
      </p>
      <p style={{ margin: 0 }}>Your AI opens this same folder.</p>
      <p className="small muted" style={{ margin: 0 }}>
        Then ask your AI: "What's on my cap table?"
      </p>
    </section>
  );
}
