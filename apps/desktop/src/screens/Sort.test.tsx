import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, test } from "vitest";
import { App } from "../App";
import { parseAnswer } from "../ai";
import { acmePlatform } from "../test/acme";

const DOCS = resolve(process.cwd(), "../../fixtures/acme-docs");
const fixture = (f: string) => readFileSync(resolve(DOCS, f), "utf8");

async function pdf(text: string) {
  const d = await PDFDocument.create();
  const f = await d.embedFont(StandardFonts.Helvetica);
  const p = d.addPage([612, 792]);
  // wrapped: pdf.js drops text drawn past the page edge
  const lines = text.split("\n").flatMap((l) => l.match(/.{1,110}(\s|$)|\S+/g) ?? [""]);
  lines.forEach((l, i) => {
    p.drawText(l.replace(/[^\x20-\xff]/g, "?"), { x: 30, y: 770 - i * 12, size: 8, font: f });
  });
  return d.save();
}
const events = (fs: { readSync(p: string): string }, root: string) =>
  fs
    .readSync(`${root}/events.jsonl`)
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));

/** Acme with these files in ~/Downloads/messy, picked through "Choose files…". */
async function sorting(
  files: Record<string, Uint8Array | string>,
  opts: Parameters<typeof acmePlatform>[0] = {},
  settings: object = {},
) {
  const picks = Object.keys(files).map((name) => ({ path: `/home/me/Downloads/messy/${name}`, name }));
  const fp = acmePlatform({ pickFiles: picks, ...opts });
  const s = JSON.parse(fp.fs.readSync("/appdata/settings.json"));
  fp.fs.writeSync("/appdata/settings.json", JSON.stringify({ ...s, ...settings }));
  for (const [name, data] of Object.entries(files)) fp.fs.writeSync(`/home/me/Downloads/messy/${name}`, data);
  render(<App platform={fp.platform} />);
  await screen.findByText("Fully diluted");
  await userEvent.click(screen.getByRole("button", { name: "Documents" }));
  await userEvent.click(await screen.findByRole("button", { name: "Add documents" }));
  await userEvent.click(await screen.findByRole("button", { name: "Choose files…" }));
  await screen.findByText(/filed ·/);
  await waitFor(() => expect(screen.queryByText("Reading…")).toBeNull(), { timeout: 10_000 });
  return fp;
}

describe("sorting a messy folder (F-09)", () => {
  test("files what's certain, skips duplicates and receipts, queues the rest", async () => {
    const joao = await pdf(fixture("grant-joao.txt"));
    const fp = await sorting({
      "joao.pdf": joao,
      "joao copy.pdf": joao,
      "scan_0042.pdf": await pdf(fixture("scan_0042.txt")),
      "receipt.pdf": await pdf(fixture("receipt.txt")),
    });
    expect(screen.getByText(/filed ·/).textContent).toMatch(
      /1 filed · 1 need you · 1 duplicate · 1 not equity/,
    );
    expect(
      screen.getByText(/Option grant → docs\/grants\/2026-03-02_joao-silva_option-grant\.pdf/),
    ).toBeTruthy();
    const ev = events(fp.fs, fp.root);
    const added = ev.filter((e) => e.type === "doc_added").at(-1);
    expect(added.data).toMatchObject({
      doc_type: "option_grant",
      original_name: "joao.pdf",
      fields: { name: "João Silva", shares: "40000", price: "0.12", date: "2026-03-02" },
      flags: ["sorted:rule"],
    });
    expect(ev.at(-1)).toMatchObject({
      type: "doc_linked",
      data: { doc_id: added.data.doc_id, target: "OPT-2" },
    });
    expect(fp.fs.readSync("/home/me/Downloads/messy/receipt.pdf")).toBeTruthy(); // originals untouched
    expect(ev.filter((e) => e.data.original_name === "receipt.pdf")).toEqual([]);
  }, 20_000);

  test("Needs you: confirm the suggested holding and remember the other name", async () => {
    const fp = await sorting({
      "scan_0042.pdf": await pdf(fixture("scan_0042.txt").replace("$1[illegible],000,000", "$10,000,000")),
    });
    await userEvent.click(screen.getByRole("button", { name: "Review 1 document" }));
    expect(
      screen.getAllByText(/The amount matches Fund X's, but the name is Fund X Ventures I, L.P./).length,
    ).toBeGreaterThan(0);
    expect(screen.getByLabelText("Amount")).toHaveValue("250000");
    expect(screen.getAllByText("matches the cap table").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("checkbox", { name: /Remember: “Fund X Ventures I, L.P.” is Fund X/ }),
    ).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Confirm & file" }));
    await screen.findByText(
      /Safe → docs\/safes\/2023-03-14_fund-x_safe\.pdf|SAFE → docs\/safes\/2023-03-14_fund-x_safe\.pdf/,
    );
    const ev = events(fp.fs, fp.root);
    expect(ev.find((e) => e.type === "stakeholder_alias")?.data).toEqual({
      stakeholder_id: "sh_fundx",
      alias: "Fund X Ventures I, L.P.",
    });
    expect(ev.at(-1)).toMatchObject({ type: "doc_linked", data: { target: "SAFE-3" } });
    expect(ev.filter((e) => e.type === "doc_added").at(-1).data.flags).toEqual(["sorted:rule+founder"]);
    expect(JSON.parse(fp.fs.readSync("/appdata/sorting.json")).docs).toHaveLength(1);
  }, 20_000);

  test("an unknown SAFE can be added to the cap table and filed in one step", async () => {
    const fp = await sorting({
      "new.pdf": await pdf(
        fixture("yc-safe.txt").replaceAll("Y Combinator", "Seed Fund Z").replace("$500,000", "$75,000"),
      ),
    });
    await userEvent.click(screen.getByRole("button", { name: "Review 1 document" }));
    expect(screen.getByLabelText("Date")).toHaveValue("2022-01-10");
    await userEvent.click(screen.getByRole("button", { name: "Add to cap table & file" }));
    await screen.findByText(/→ docs\/safes\/2022-01-10_seed-fund-z_safe\.pdf/);
    const ev = events(fp.fs, fp.root);
    const safe = ev.find(
      (e) => e.type === "TX_CONVERTIBLE_ISSUANCE" && e.data.investment_amount.amount === "75000",
    );
    expect(safe.data.security_id).toBe("SAFE-4");
    expect(ev.at(-1)).toMatchObject({ type: "doc_linked", data: { target: "SAFE-4" } });
  }, 20_000);

  test("a photo goes through OCR", async () => {
    await sorting({ "photo.jpg": new Uint8Array([1, 2, 3]) }, { ocrText: fixture("ciiaa-mads.txt") });
    expect(screen.getByText(/IP assignment \(CIIAA\) → docs\/employees\//)).toBeTruthy();
  }, 20_000);

  test("AI proposes, never files: its answer waits for the founder", async () => {
    const answer = {
      type: "option_grant",
      fields: { name: "João Silva", shares: 40000, date: "2026-03-02" },
    };
    const asked: string[] = [];
    const fp = await sorting(
      { "odd.pdf": await pdf("Equity award letter\nDear João Silva, you receive 40,000 options.") },
      {
        relay: {
          fetch: async (url: string, init?: RequestInit) => {
            if (!url.startsWith("http://localhost:")) return new Response("", { status: 404 }); // rules pack check
            asked.push(url);
            expect(JSON.parse(String(init?.body)).messages[1].content).toMatch(/^<document>/);
            return new Response(JSON.stringify({ message: { content: JSON.stringify(answer) } }));
          },
        },
      },
      { ai: { provider: "ollama", model: "llama3.1", sortWithAi: true } },
    );
    expect(asked).toEqual(["http://localhost:11434/api/chat"]);
    expect(screen.getByText("Sorted by AI: check it before filing.")).toBeTruthy();
    expect(events(fp.fs, fp.root).filter((e) => e.data.original_name === "odd.pdf")).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "Review 1 document" }));
    expect(screen.getByText(/Your AI read it \(check every field\)\. Ollama · llama3\.1/)).toBeTruthy();
    expect(screen.getByLabelText("Shares")).toHaveValue("40000");
  }, 20_000);
});

describe("AI answers are checked", () => {
  test("a valid answer keeps only valid fields", () =>
    expect(
      parseAnswer(
        '```json\n{"type":"safe","fields":{"name":"Fund X","amount":"$250,000","cap":"lots","discount":20,"date":"2023-03-14","evil":"x"}}\n```',
      ),
    ).toEqual({ type: "safe", fields: { name: "Fund X", amount: "250000", date: "2023-03-14" } }));
  test("an unknown type or broken JSON is no answer", () => {
    expect(parseAnswer('{"type":"wire_transfer","fields":{}}')).toBeNull();
    expect(parseAnswer("I think it's a SAFE")).toBeNull();
  });
});

describe("M4 review fixes", () => {
  test("a folder named like a file (Fund X Ventures I, L.P) is still searched", async () => {
    const { walk } = await import("../docsort");
    const fp = acmePlatform();
    fp.fs.writeSync("/home/me/messy/Fund X Ventures I, L.P/safe.pdf", "x");
    fp.fs.writeSync("/home/me/messy/notes.txt", "x");
    expect((await walk(fp.fs, "/home/me/messy", null)).files.map((f) => f.name)).toEqual(["safe.pdf"]);
  });
  test("a skipped file can still be opened and filed", async () => {
    await sorting({ "receipt.pdf": await pdf(fixture("receipt.txt")) });
    await userEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(screen.getByRole("button", { name: "Confirm & file" })).toBeTruthy();
  }, 20_000);
});
