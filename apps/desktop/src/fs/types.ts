/** The only file access the app has. Tauri implements it for real; MemoryFs for tests. Paths are absolute. */
export interface Fs {
  readText(path: string): Promise<string>;
  writeText(path: string, text: string): Promise<void>;
  appendText(path: string, text: string): Promise<void>;
  readBytes(path: string): Promise<Uint8Array>;
  writeBytes(path: string, bytes: Uint8Array): Promise<void>;
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>; // recursive
  list(path: string): Promise<string[]>; // child names
  rename(from: string, to: string): Promise<void>;
}

/** Joins with "/". Tauri accepts forward slashes on every desktop OS. */
export const join = (...parts: string[]): string =>
  parts
    .filter(Boolean)
    .join("/")
    .replace(/\/{2,}/g, "/");
/** Parent folder; understands "/" and "\\" (Windows). A root ("/", "C:") is its own parent. */
export const parentOf = (path: string): string => {
  const p = path.replace(/[\\/]+$/, "");
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  if (i < 0) return p || "/";
  return p.slice(0, i) || "/";
};
export const baseName = (path: string): string =>
  path
    .replace(/[\\/]+$/, "")
    .split(/[\\/]/)
    .at(-1) ?? path;
