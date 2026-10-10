import { type Fs, parentOf } from "./types";

/** In-memory Fs for tests. Sync helpers (…Sync) let tests set up and inspect files directly. */
export class MemoryFs implements Fs {
  private files = new Map<string, string | Uint8Array>();
  private dirs = new Set<string>(["/"]);

  mkdirSync(path: string): void {
    for (let p = path; p !== "/" && !this.dirs.has(p); p = parentOf(p)) this.dirs.add(p);
  }
  writeSync(path: string, data: string | Uint8Array): void {
    this.mkdirSync(parentOf(path));
    this.files.set(path, data);
  }
  readSync(path: string): string {
    const f = this.files.get(path);
    if (f === undefined) throw new Error(`No such file: ${path}`);
    return typeof f === "string" ? f : new TextDecoder().decode(f);
  }
  existsSync(path: string): boolean {
    return this.files.has(path) || this.dirs.has(path);
  }
  deleteSync(path: string): void {
    this.files.delete(path);
  }

  async readText(path: string) {
    return this.readSync(path);
  }
  async writeText(path: string, text: string) {
    this.writeSync(path, text);
  }
  async appendText(path: string, text: string) {
    this.writeSync(path, (this.files.has(path) ? this.readSync(path) : "") + text);
  }
  async readBytes(path: string) {
    const f = this.files.get(path);
    if (f === undefined) throw new Error(`No such file: ${path}`);
    return typeof f === "string" ? new TextEncoder().encode(f) : f;
  }
  async writeBytes(path: string, bytes: Uint8Array) {
    this.writeSync(path, bytes);
  }
  async exists(path: string) {
    return this.existsSync(path);
  }
  async mkdir(path: string) {
    this.mkdirSync(path);
  }
  async list(path: string) {
    const prefix = path.endsWith("/") ? path : `${path}/`;
    const names = new Set<string>();
    for (const p of [...this.files.keys(), ...this.dirs])
      if (p.startsWith(prefix) && p !== prefix) names.add(p.slice(prefix.length).split("/")[0]!);
    return [...names];
  }
  async rename(from: string, to: string) {
    const f = this.files.get(from);
    if (f === undefined) throw new Error(`No such file: ${from}`);
    this.files.delete(from);
    this.writeSync(to, f);
  }
}
