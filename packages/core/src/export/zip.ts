// Zip files in and out (fflate). Paths use "/".
import { strToU8, unzipSync, zipSync } from "fflate";

export const zip = (files: Record<string, Uint8Array | string>): Uint8Array =>
  zipSync(
    Object.fromEntries(Object.entries(files).map(([k, v]) => [k, typeof v === "string" ? strToU8(v) : v])),
  );

/** File path → bytes. Folders and macOS resource forks (__MACOSX/) are skipped. */
export const unzip = (bytes: Uint8Array): Record<string, Uint8Array> =>
  unzipSync(bytes, { filter: (f) => !f.name.endsWith("/") && !f.name.startsWith("__MACOSX/") });
