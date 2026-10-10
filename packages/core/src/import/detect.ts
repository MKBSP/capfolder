// What kind of file the founder dropped, by content (docs/04 §1).
import { strFromU8, unzipSync } from "fflate";
import { parseCsv } from "./csv";
import { readXlsx } from "./xlsx-read";

export type Detected =
  | { kind: "ocf"; files: Record<string, string> }
  | { kind: "sheets"; sheets: { name: string; rows: string[][] }[] }
  | { kind: "error"; error: string };

const isZip = (b: Uint8Array) => b[0] === 0x50 && b[1] === 0x4b;

export function detectImport(fileName: string, bytes: Uint8Array): Detected {
  const lower = fileName.toLowerCase();
  try {
    if (isZip(bytes)) {
      const files = unzipSync(bytes, {
        filter: (f) => !f.name.endsWith("/") && !f.name.startsWith("__MACOSX/"),
      });
      if (files["xl/workbook.xml"]) return { kind: "sheets", sheets: readXlsx(bytes) };
      const json = Object.fromEntries(
        Object.entries(files)
          .filter(([k]) => k.endsWith(".json"))
          .map(([k, v]) => [k, strFromU8(v)]),
      );
      if (Object.values(json).some((t) => /"file_type"\s*:\s*"OCF_MANIFEST_FILE"/.test(t)))
        return { kind: "ocf", files: json };
      return { kind: "error", error: `${fileName} is a zip, but not an OCF export or an Excel file.` };
    }
    if (lower.endsWith(".json"))
      return { kind: "error", error: "That's one OCF file. Choose the whole OCF export as a .zip." };
    if (lower.endsWith(".csv") || lower.endsWith(".txt"))
      return { kind: "sheets", sheets: [{ name: fileName, rows: parseCsv(strFromU8(bytes)) }] };
  } catch (e) {
    return { kind: "error", error: `Couldn't read ${fileName}: ${(e as Error).message}` };
  }
  return {
    kind: "error",
    error: `Capfolder can't read ${fileName}. Save it as .xlsx or .csv and try again.`,
  };
}
