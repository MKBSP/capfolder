import type { AppendCtx } from "@capfolder/core";
import { type Fs, loadRegistry, openVault, type Vault } from "@capfolder/vault";

export type ServerOpts = { fs: Fs; home: string; vault?: string; ctx: AppendCtx };

/** The company folder in use: --vault if given, else the registry's current one. */
export async function currentRoot(o: ServerOpts): Promise<string | null> {
  return o.vault ?? (await loadRegistry(o.fs, o.home)).current;
}

/** Reopened on every call, so changes made in the app show up. Throws when the folder isn't a vault. */
export async function currentVault(o: ServerOpts): Promise<Vault | null> {
  const root = await currentRoot(o);
  return root ? openVault(o.fs, root, o.ctx) : null;
}
