// F-05: is the vault folder inside something that's backed up? Path heuristics; no network calls.
import { join, parentOf } from "./fs/types";

export type BackupBy = "iCloud Drive" | "Dropbox" | "Google Drive" | "OneDrive" | "git";
export type BackupStatus = { backedUp: true; by: BackupBy } | { backedUp: false };

const RULES: [RegExp, BackupBy][] = [
  [/\/Library\/Mobile Documents\//, "iCloud Drive"],
  [/\/Dropbox(\/|$)/, "Dropbox"],
  [/\/CloudStorage\/GoogleDrive|\/Google Drive(\/|$)/, "Google Drive"],
  [/OneDrive/, "OneDrive"],
];

export async function backupStatus(
  root: string,
  exists: (p: string) => Promise<boolean>,
): Promise<BackupStatus> {
  for (const [re, by] of RULES) if (re.test(root)) return { backedUp: true, by };
  for (let p = root; p !== "/" && p !== ""; p = parentOf(p)) {
    try {
      if (await exists(join(p, ".git"))) return { backedUp: true, by: "git" };
    } catch {
      // outside the fs scope: can't tell, keep looking up
    }
  }
  return { backedUp: false };
}

/** Synced folders on this computer that exist, to offer when the chosen one isn't backed up. */
export async function suggestedFolders(home: string, exists: (p: string) => Promise<boolean>) {
  const candidates: { name: BackupBy; path: string }[] = [
    { name: "iCloud Drive", path: join(home, "Library/Mobile Documents/com~apple~CloudDocs") },
    { name: "Dropbox", path: join(home, "Dropbox") },
    { name: "Google Drive", path: join(home, "Google Drive") },
    { name: "OneDrive", path: join(home, "OneDrive") },
  ];
  const out: { name: BackupBy; path: string }[] = [];
  for (const c of candidates) if (await exists(c.path).catch(() => false)) out.push(c);
  return out;
}
