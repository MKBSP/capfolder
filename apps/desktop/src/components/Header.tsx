import { type ReactNode, useEffect, useState } from "react";
import { type BackupStatus, backupStatus } from "../backup";
import { progress } from "../docsort";
import { baseName } from "../fs/types";
import { openCompany, type Route, useApp } from "../state";
import { AskAiButton } from "./AskAi";
import { Chip, Logo, Menu } from "./ui";

const NAV: { label: string; route: Route }[] = [
  { label: "Cap table", route: { name: "home" } },
  { label: "People", route: { name: "people" } },
  { label: "Documents", route: { name: "documents" } },
  { label: "Signatures", route: { name: "signatures" } },
  { label: "Settings", route: { name: "settings" } },
];

/** Main.html header: company, folder, backup chip, nav, then screen actions on the right. */
export function MainHeader({ children }: { children?: ReactNode }) {
  const app = useApp();
  const { vault, route, go, platform, latest } = app;
  const [backup, setBackup] = useState<BackupStatus | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  useEffect(() => {
    if (vault) backupStatus(vault.root, (p) => platform.fs.exists(p)).then(setBackup);
  }, [vault, platform]);
  const name = latest?.issuer?.legal_name ?? (vault ? baseName(vault.root) : "");
  return (
    <header className="app-header">
      <Logo />
      <Menu
        className="switcher"
        align="left"
        label={
          <>
            <span style={{ display: "block", fontWeight: 600 }}>{name}</span>
            <span className="mono meta switcher-path" title={vault?.root}>
              {vault?.root.replace(/^\/Users\/[^/]+/, "~")}
            </span>
          </>
        }
        items={[
          ...app.settings.recentVaults.map((r) => ({
            id: r.root,
            label: r.name,
            current: r.root === vault?.root,
            onClick: () => {
              if (r.root === vault?.root) return;
              setOpenError(null);
              openCompany(app, r.root).catch((e) => setOpenError(`Couldn't open ${r.name}: ${e.message}`));
            },
          })),
          { label: "Add a company…", onClick: () => go({ name: "create" }) },
          {
            label: "Open a company folder…",
            onClick: async () => {
              const root = await platform.pickFolder("Open a Capfolder company folder");
              if (!root) return;
              setOpenError(null);
              openCompany(app, root).catch((e) => setOpenError(`Couldn't open that folder: ${e.message}`));
            },
          },
        ]}
      />
      {openError ? <Chip tone="amber">{openError}</Chip> : null}
      {backup ? (
        backup.backedUp ? (
          <Chip tone="green">Backed up · {backup.by}</Chip>
        ) : (
          <Chip tone="amber">Not backed up</Chip>
        )
      ) : null}
      <SortChip />
      <nav className="nav" aria-label="Main">
        {NAV.map((n) => (
          <button
            type="button"
            key={n.label}
            data-tour={n.route.name}
            className={
              route.name === n.route.name || (n.route.name === "people" && route.name === "person")
                ? "on"
                : ""
            }
            aria-current={route.name === n.route.name ? "page" : undefined}
            onClick={() => go(n.route)}
          >
            {n.label}
          </button>
        ))}
      </nav>
      <AskAiButton />
      {children ? <div className="header-actions">{children}</div> : null}
    </header>
  );
}

/** Person.html / NewSafe.html header: "← Cap table / Title". */
export function CrumbHeader({
  title,
  back,
  children,
}: {
  title: string;
  back?: Route;
  children?: ReactNode;
}) {
  const { go } = useApp();
  const to = back ?? { name: "home" as const };
  return (
    <header className="app-header">
      <span className="crumb">
        <button type="button" className="btn link" onClick={() => go(to)}>
          ← {to.name === "people" ? "People" : to.name === "documents" ? "Documents" : "Cap table"}
        </button>
        <span className="sep">/</span>
        <span style={{ color: "var(--ink)" }}>{title}</span>
      </span>
      <div className="row grow" style={{ justifyContent: "flex-end" }}>
        {children}
      </div>
    </header>
  );
}

/** While documents are being sorted, or wait for the founder: one click back to them. */
function SortChip() {
  const { sort, vault, go } = useApp();
  if (sort.root !== vault?.root) return null;
  const need = sort.items.filter((x) => x.status === "review").length;
  const { done } = progress(sort.items, 0, 0);
  if (!sort.running && !need) return null;
  return (
    <button type="button" className="chip amber" onClick={() => go({ name: "sort" })}>
      {sort.running
        ? `Sorting ${done}/${sort.items.length}`
        : `${need} document${need === 1 ? " needs" : "s need"} you`}
    </button>
  );
}
