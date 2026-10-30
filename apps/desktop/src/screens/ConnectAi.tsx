import { useRef, useState } from "react";
import { useApp } from "../state";

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
  const app = useApp();
  const [copied, setCopied] = useState<"ok" | "fail" | null>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const tab = TABS[i] ?? { id: "", cmd: [] as string[] };
  const pick = (n: number) => {
    const k = (n + TABS.length) % TABS.length;
    setI(k);
    setCopied(null);
    tabs.current[k]?.focus();
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
            ref={(el) => {
              tabs.current[n] = el;
            }}
            onKeyDown={(e) => {
              const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: TABS.length - 1 }[e.key];
              if (to === undefined) return;
              e.preventDefault();
              pick(to);
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
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(tab.cmd.join("\n"));
                    setCopied("ok");
                  } catch {
                    setCopied("fail");
                  }
                }}
              >
                Copy
              </button>
              {copied ? (
                <span className="small muted">
                  {" "}
                  {copied === "ok" ? "Copied." : "Copy failed — select the text above"}
                </span>
              ) : null}
            </div>
          </>
        ) : (
          <p style={{ margin: 0 }}>
            Download capfolder.mcpb from{" "}
            <a
              href={RELEASES}
              onClick={(e) => {
                e.preventDefault();
                app.platform.openUrl(RELEASES);
              }}
            >
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
