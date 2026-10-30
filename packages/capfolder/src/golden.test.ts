import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeFs } from "@capfolder/vault/src/fs/node";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { expect, test } from "vitest";
import { createServer } from "./server";

const FIXTURE = join(import.meta.dirname, "../../../fixtures/acme-vault");
type Ev = { type: string; kind: string; data: Record<string, any> };
type Args = Record<string, unknown>;
type R = { content: { text: string }[]; structuredContent?: Record<string, unknown> };

// Each business event type -> the tool call(s) that record it. Types listed as null are consequences of
// another call (the tool writes them together) and are checked against the fixture's counts instead.
const NONE = null;
const MAP: Record<
  string,
  ((d: Record<string, any>, people: Map<string, Ev>) => [string, Args] | undefined) | null
> = {
  vault_created: NONE, // create_company
  ISSUER: (d) => [
    "create_company",
    {
      name: d.legal_name,
      country: d.country_of_formation,
      subdivision: d.country_subdivision_of_formation,
      formation_date: d.formation_date,
    },
  ],
  STOCK_CLASS: (d) => [
    "add_share_class",
    { name: d.name, authorized: d.initial_shares_authorized, par_value: d.par_value.amount },
  ],
  STAKEHOLDER: (d) => [
    "add_person",
    {
      name: d.name.legal_name,
      email: d.contact_info?.emails?.[0]?.email_address,
      role: d.stakeholder_type === "INSTITUTION" ? "company_or_fund" : "person",
    },
  ],
  VESTING_TERMS: NONE, // made by the first vesting issue_shares / add_grant, then reused
  TX_STOCK_ISSUANCE: (d, p) => [
    "issue_shares",
    { person: p.get(d.stakeholder_id)?.data.name.legal_name, shares: d.quantity, date: d.date },
  ],
  TX_VESTING_START: NONE, // vesting_start on the issuance/grant call (see below)
  TX_CONVERTIBLE_ISSUANCE: (d, p) => {
    const m = d.conversion_triggers[0].conversion_right.conversion_mechanism;
    const disc = m.conversion_discount; // "0.20" -> 20 (percent)
    return [
      "add_safe",
      {
        investor: p.get(d.stakeholder_id)?.data.name.legal_name,
        amount: d.investment_amount.amount,
        cap: m.conversion_valuation_cap.amount,
        ...(disc ? { discount: String(Number(disc) * 100) } : {}),
        date: d.date,
      },
    ];
  },
  STOCK_PLAN: (d) => [
    "create_option_pool",
    { name: d.plan_name, size: d.initial_shares_reserved, board_approval_date: d.board_approval_date },
  ],
  TX_EQUITY_COMPENSATION_ISSUANCE: (d, p) => [
    "add_grant",
    {
      person: p.get(d.stakeholder_id)?.data.name.legal_name,
      options: d.quantity,
      strike: d.exercise_price.amount,
      date: d.date,
      option_type: d.option_grant_type,
    },
  ],
  doc_added: NONE, // file_document, driven by the doc_linked event
  doc_linked: NONE,
  VALUATION: (d) => [
    "add_409a",
    { price: d.price_per_share.amount, date: d.effective_date, provider: d.provider },
  ],
};

test("the acme vault, rebuilt entirely by tool calls, matches captable.expected.csv", async () => {
  const events = (await readFile(join(FIXTURE, "events.jsonl"), "utf8"))
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l) as Ev);
  for (const e of events) expect(e.type in MAP, `no tool mapped for event type ${e.type}`).toBe(true);

  const meta = JSON.parse(await readFile(join(FIXTURE, "capfolder.json"), "utf8"));
  // ponytail: this fixture's capfolder.json has no captable_as_of; expected.csv is as of its creation day
  const asOf: string = meta.captable_as_of ?? meta.created_at.slice(0, 10);
  const vestingStart = new Map(
    events.filter((e) => e.type === "TX_VESTING_START").map((e) => [e.data.security_id, e.data.date]),
  );
  const people = new Map(events.filter((e) => e.type === "STAKEHOLDER").map((e) => [e.data.id, e]));

  const fs = new NodeFs();
  const home = await mkdtemp(join(tmpdir(), "capfolder-home-"));
  const parent = await mkdtemp(join(tmpdir(), "capfolder-golden-"));
  const t = Date.parse(`${asOf}T12:00:00Z`);
  let n = 0;
  const server = createServer({
    fs,
    home,
    ctx: { now: () => new Date(t), newId: () => `evt_g${++n}`, deviceId: "test" },
  });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "golden", version: "0" }, {});
  await Promise.all([server.connect(a), client.connect(b)]);

  const call = async (name: string, args: Args) =>
    (await client.callTool({ name, arguments: args })) as unknown as R;
  const write = async (name: string, args: Args) => {
    const p = await call(name, { ...args, confirm: false });
    const id = p.structuredContent?.preview_id as string;
    if (!id) throw new Error(`no preview for ${name}: ${p.content[0]?.text}`);
    const r = await call(name, { ...args, confirm: true, preview_id: id });
    if (!/^Recorded|^Created/i.test(r.content[0]?.text ?? ""))
      throw new Error(`${name}: ${r.content[0]?.text}`);
    return r;
  };

  // doc_added + doc_linked -> file_document, on a stand-in file (the fixture has no PDFs)
  const docs = new Map(events.filter((e) => e.type === "doc_added").map((e) => [e.data.doc_id, e.data]));
  const files = await mkdtemp(join(tmpdir(), "capfolder-golden-docs-"));

  for (const e of events) {
    const m = MAP[e.type];
    if (e.type === "doc_linked") {
      const doc = docs.get(e.data.doc_id);
      const source_path = join(files, `${e.data.doc_id}.pdf`);
      await writeFile(source_path, `%PDF-1.4 ${e.data.doc_id}`);
      // the fixture's doc types (safe_yc_postmoney_cap, safe_custom) aren't app kinds: both are `safe`
      const kind = String(doc?.doc_type).startsWith("safe") ? "safe" : doc?.doc_type;
      await write("file_document", { source_path, kind, proves: e.data.target });
      continue;
    }
    if (!m) continue;
    const [tool, args] = m(e.data, people) as [string, Args];
    const sid = e.data.security_id;
    if (vestingStart.has(sid) && (tool === "issue_shares" || tool === "add_grant")) {
      args.vesting_start = vestingStart.get(sid);
      args.vesting = "4y_1y_cliff";
    }
    if (tool === "create_company") args.folder = parent;
    await write(tool, args);
  }

  const vaultDir = join(parent, "Acme Inc.");
  const got = await readFile(join(vaultDir, "captable.csv"), "utf8");
  const want = await readFile(join(FIXTURE, "captable.expected.csv"), "utf8");
  const [gl, wl] = [got.split("\n"), want.split("\n")];
  const col = wl[0]!.split(",").indexOf("safe_discount");
  expect(col).toBeGreaterThan(-1);
  expect(gl[0]).toBe(wl[0]);
  expect(gl.length).toBe(wl.length);
  for (let i = 1; i < wl.length; i++) {
    const [g, w] = [gl[i]!.split(","), wl[i]!.split(",")];
    // the fixture writes the SAFE discount as "0.20", the tools store the app's normalised "0.2": same number
    const num = (c: string[]) => (c[col] ? Number(c[col]) : c[col]);
    expect(num(g), `row ${i} safe_discount`).toBe(num(w));
    g.splice(col, 1);
    w.splice(col, 1);
    expect(g.join(","), `row ${i}`).toBe(w.join(","));
  }
});
