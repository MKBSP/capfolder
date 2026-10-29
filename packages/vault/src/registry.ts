import { type Fs, join } from "./fs/types";

export type Registry = { current: string | null; companies: { name: string; root: string }[] };

const file = (home: string) => join(home, ".capfolder/companies.json");

/** Never throws: a missing or corrupt file is an empty registry. */
export async function loadRegistry(fs: Fs, home: string): Promise<Registry> {
  try {
    const j = JSON.parse(await fs.readText(file(home)));
    const companies = (Array.isArray(j?.companies) ? j.companies : []).filter(
      (c: { name?: unknown; root?: unknown }) => typeof c?.name === "string" && typeof c?.root === "string",
    );
    return { current: typeof j?.current === "string" ? j.current : null, companies };
  } catch {
    return { current: null, companies: [] };
  }
}

async function save(fs: Fs, home: string, r: Registry): Promise<Registry> {
  await fs.mkdir(join(home, ".capfolder"));
  await fs.writeText(file(home), JSON.stringify(r, null, 2));
  return r;
}

/** Adds the company (or updates the one with the same root) and makes it current. */
export async function registerCompany(
  fs: Fs,
  home: string,
  c: { name: string; root: string },
): Promise<Registry> {
  const r = await loadRegistry(fs, home);
  const i = r.companies.findIndex((x) => x.root === c.root);
  const entry = { name: c.name, root: c.root };
  if (i >= 0) r.companies[i] = entry;
  else r.companies.push(entry);
  return save(fs, home, { ...r, current: c.root });
}

export async function setCurrent(fs: Fs, home: string, root: string): Promise<Registry> {
  const r = await loadRegistry(fs, home);
  return save(fs, home, { ...r, current: root });
}

/** "~/x" becomes "<home>/x"; anything else is returned unchanged. */
export const resolveFolder = (input: string, home: string): string =>
  input === "~" || input.startsWith("~/") ? join(home, input.slice(1)) : input;
