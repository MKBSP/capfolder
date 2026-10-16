import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, test } from "vitest";
import { App } from "../App";
import { parseAnswer } from "../ai";
import { acmePlatform } from "../test/acme";

const DOCS = resolve(process.cwd(), "../../fixtures/acme-docs");
const fixture = (f: string) => readFileSync(resolve(DOCS, f), "utf8");

/** A test PDF; signed by default (an e-signature stamp, as DocuSign leaves on every page). */
async function pdf(text: string, signed = true) {
  if (signed) text = `${text}\nDocuSign Envelope ID: 4F1C-TEST`;
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
const sortingFiles = (files: Record<string, Uint8Array | string>) => sorting(files);
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
    await userEvent.click(screen.getByRole("button", { name: /^File as proof for Fund X/ }));
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
    expect(
      screen.getByText("Not on your cap table yet: no SAFE for Seed Fund Z of $75,000. Review to add it."),
    ).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Review 1 document" }));
    expect(screen.getByLabelText("Date")).toHaveValue("2022-01-10");
    expect(
      screen.getByText(
        "A signed SAFE: Seed Fund Z invests $75,000 in Acme Inc. at a $10,000,000 cap, dated 2022-01-10.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Creates Seed Fund Z's $75,000 SAFE on the cap table and files this document as its proof.",
      ),
    ).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Add this SAFE to the cap table" }));
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
            if (!/^http:\/\/localhost:(11434|1234)\//.test(url)) return new Response("", { status: 404 }); // rules pack, ping
            asked.push(url);
            const body = JSON.parse(String(init?.body));
            expect(body.messages[1].content).toMatch(/^<document>/);
            if (/summary/i.test(body.messages[0].content))
              return new Response(
                JSON.stringify({
                  message: { content: "An equity award letter: João Silva receives 40,000 options." },
                }),
              );
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
    expect(
      await screen.findByText("An equity award letter: João Silva receives 40,000 options."),
    ).toBeTruthy();
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
    expect(screen.getByRole("button", { name: "File as a company document" })).toBeTruthy();
  }, 20_000);

  test("an unsigned draft waits for the founder, and filed as a draft it doesn't close the gap", async () => {
    const fp = await sorting({
      "joao-draft.pdf": await pdf(`DRAFT\n${fixture("grant-joao.txt")}`, false),
    });
    expect(screen.getByText(/filed ·/).textContent).toMatch(/0 filed · 1 need you/);
    await userEvent.click(screen.getByRole("button", { name: "Review 1 document" }));
    expect(screen.getAllByText(/looks like an unsigned draft \("DRAFT"\)/).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("button", { name: /^File as proof for/ }));
    await userEvent.click(await screen.findByRole("button", { name: "File as draft" }));
    await screen.findByText(/docs\/grants\/2026-03-02_joao-silva_option-grant\.pdf/);
    const added = events(fp.fs, fp.root)
      .filter((e) => e.type === "doc_added")
      .at(-1);
    expect(added.data.flags).toContain("draft");
  }, 20_000);
});

test("files or a folder dropped on the window are sorted", async () => {
  const fp = acmePlatform();
  fp.fs.writeSync("/home/me/Downloads/drop/joao.pdf", await pdf(fixture("grant-joao.txt")));
  fp.fs.writeSync("/home/me/Downloads/drop/sub/receipt.pdf", await pdf(fixture("receipt.txt")));
  render(<App platform={fp.platform} />);
  await screen.findByText("Fully diluted");
  fp.drop(["/home/me/Downloads/drop"]);
  await screen.findByRole("heading", { name: "Add documents" });
  await waitFor(
    () =>
      expect(screen.getByText(/filed ·/).textContent).toMatch(
        /1 filed · 0 need you · 0 duplicate · 1 not equity/,
      ),
    {
      timeout: 15_000,
    },
  );
}, 20_000);

test("no signature found: filing asks, and only a ticked override counts it as proof", async () => {
  const fp = await sortingFiles({ "joao.pdf": await pdf(fixture("grant-joao.txt"), false) });
  expect(screen.getByText(/filed ·/).textContent).toMatch(/0 filed · 1 need you/);
  await userEvent.click(screen.getByRole("button", { name: "Review 1 document" }));
  expect(screen.getAllByText(/can't see a signature/).length).toBeGreaterThan(0);
  await userEvent.click(screen.getByRole("button", { name: /^File as proof for/ }));
  const dialog = await screen.findByRole("dialog", { name: "No signature found" });
  expect(within(dialog).getByRole("button", { name: "File as signed" })).toBeDisabled();
  await userEvent.click(within(dialog).getByRole("checkbox", { name: /It has been signed/ }));
  await userEvent.click(within(dialog).getByRole("button", { name: "File as signed" }));
  await screen.findByText(/docs\/grants\/2026-03-02_joao-silva_option-grant\.pdf/);
  const added = events(fp.fs, fp.root)
    .filter((e) => e.type === "doc_added")
    .at(-1);
  expect(added.data.flags).toContain("signed:founder");
  expect(added.data.flags).not.toContain("draft");
}, 20_000);

describe("knowing what's going on (Mads' test, 2026-10-16)", () => {
  test("a folder with no documents says so", async () => {
    const fp = acmePlatform({ pickFolder: "/home/me/Downloads/empty" });
    fp.fs.writeSync("/home/me/Downloads/empty/notes.txt", "x");
    render(<App platform={fp.platform} />);
    await screen.findByText("Fully diluted");
    await userEvent.click(screen.getByRole("button", { name: "Documents" }));
    await userEvent.click(await screen.findByRole("button", { name: "Add documents" }));
    await userEvent.click(await screen.findByRole("button", { name: "Choose a folder…" }));
    expect(await screen.findByText(/No PDFs or images found in empty\./)).toBeTruthy();
  });

  test("walking a folder reports how many documents it found so far", async () => {
    const { walk } = await import("../docsort");
    const fp = acmePlatform();
    fp.fs.writeSync("/home/me/messy/a.pdf", "x");
    fp.fs.writeSync("/home/me/messy/sub/b.jpg", "x");
    const seen: number[] = [];
    await walk(fp.fs, "/home/me/messy", null, (n) => seen.push(n));
    expect(seen.at(-1)).toBe(2);
  });

  test("progress: how far, and roughly how long is left", async () => {
    const { progress } = await import("../docsort");
    const item = (status: string) => ({ path: "", name: "", status }) as never;
    expect(progress([item("filed"), item("reading"), item("waiting")], 0, 60_000)).toEqual({
      done: 1,
      total: 3,
      left: "about 2 min left",
    });
    expect(progress([item("filed"), item("waiting")], 0, 1_000).left).toBe("under a minute left");
  });

  test("leaving the page keeps the results, and the header leads back", async () => {
    await sortingFiles({ "scan_0042.pdf": await pdf(fixture("scan_0042.txt")) });
    expect(screen.getByText(/You can leave this page/)).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "← Cap table" }));
    await screen.findByText("Fully diluted");
    await userEvent.click(screen.getByRole("button", { name: "1 document needs you" }));
    expect(await screen.findByText("scan_0042.pdf")).toBeTruthy();
    expect(screen.getByText(/filed ·/).textContent).toMatch(/1 need you/);
  }, 20_000);

  test("the document's text is one click away from the preview", async () => {
    await sortingFiles({ "scan_0042.pdf": await pdf(fixture("scan_0042.txt")) });
    await userEvent.click(screen.getByRole("button", { name: "Review 1 document" }));
    // jsdom has no canvas, so the preview falls back to the text; in the app "Show text" switches to it
    const toggle = screen.queryByRole("button", { name: "Show text" });
    if (toggle) await userEvent.click(toggle);
    expect(await screen.findByText(/Fund X Ventures I, L\.P\./, { selector: "pre" })).toBeTruthy();
  }, 20_000);
});
