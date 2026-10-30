// What a write tool showed the founder, kept until they say yes. Single-use, 10 minutes, tied to the log it was made on.
import { builders as b } from "@capfolder/core";

export const TTL_MS = 10 * 60_000;
export const CHANGED = "The folder changed since the preview. Ask again to see the new preview.";

type Entry<T> = { root: string; logHash: string; value: T; summary: string; at: number };

// ponytail: in-process Map; previews die with the server, which is what we want
export class PreviewStore<T> {
  private entries = new Map<string, Entry<T>>();
  constructor(private now: () => Date) {}

  put(root: string, logHash: string, value: T, summary: string): string {
    const at = this.now().getTime();
    for (const [id, e] of this.entries) if (at - e.at > TTL_MS) this.entries.delete(id);
    const id = b.newId("pvw");
    this.entries.set(id, { root, logHash, value, summary, at });
    return id;
  }

  /** Consumes the preview, whatever the answer: a refused one has to be asked for again. */
  take(id: string, root: string, currentLogHash: string): { value: T; summary: string } | Error {
    const e = this.entries.get(id);
    this.entries.delete(id);
    if (!e)
      return new Error(
        "That preview was already used or doesn't exist. Ask again to see a new preview, and confirm it only after the founder says yes.",
      );
    if (this.now().getTime() - e.at > TTL_MS)
      return new Error("That preview is more than 10 minutes old. Ask again to see a new preview.");
    if (e.root !== root)
      return new Error("That preview was for another company. Ask again to see a new preview.");
    if (e.logHash !== currentLogHash) return new Error(CHANGED);
    return { value: e.value, summary: e.summary };
  }
}
