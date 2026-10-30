import type { AppendCtx } from "@capfolder/core";
import { type Fs, loadRegistry, readVault, type Vault } from "@capfolder/vault";

export type ServerOpts = { fs: Fs; home: string; vault?: string; ctx: AppendCtx };

/** The company folder in use: --vault if given, else the registry's current one. */
export async function currentRoot(o: ServerOpts): Promise<string | null> {
  return o.vault ?? (await loadRegistry(o.fs, o.home)).current;
}

/** Reread on every call, so changes made in the app show up. Read-only: never touches the folder. Throws when it isn't a vault. */
export async function currentVault(o: ServerOpts): Promise<Vault | null> {
  const root = await currentRoot(o);
  return root ? readVault(o.fs, root) : null;
}
