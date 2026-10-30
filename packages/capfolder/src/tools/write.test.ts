import { cp, mkdir, mkdtemp, readdir, readFile, rm, symlink, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { builders as b } from "@capfolder/core";
import { appendToVault, loadRegistry, readVault, registerCompany } from "@capfolder/vault";
import { NodeFs } from "@capfolder/vault/src/fs/node";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ElicitRequestSchema, type ElicitResult } from "@modelcontextprotocol/sdk/types.js";
import { beforeEach, expect, test } from "vitest";
import { createServer } from "../server";

const FIXTURE = join(import.meta.dirname, "../../../../fixtures/acme-vault");
const fs = new NodeFs();
let n = 0;
const clock = { t: Date.parse("2026-10-07T12:00:00Z") };
const ctx = { now: () => new Date(clock.t), newId: () => `evt_w${++n}`, deviceId: "test" };
let home: string;
let root: string;

beforeEach(async () => {
  clock.t = Date.parse("2026-10-07T12:00:00Z");
  home = await mkdtemp(join(tmpdir(), "capfolder-home-"));
  root = join(await mkdtemp(join(tmpdir(), "capfolder-vault-")), "acme");
  await cp(FIXTURE, root, { recursive: true });
  await registerCompany(fs, home, { name: "Acme Inc.", root });
});

async function connect(elicit?: (r: unknown) => ElicitResult) {
  const server = createServer({ fs, home, ctx });
  const [a, c] = InMemoryTransport.createLinkedPair();
  const client = new Client(
    { name: "test", version: "0" },
    elicit ? { capabilities: { elicitation: {} } } : {},
  );
  if (elicit) client.setRequestHandler(ElicitRequestSchema, async (req) => elicit(req));
  await Promise.all([server.connect(a), client.connect(c)]);
  return client;
}
type R = { content: { type: string; text: string }[]; structuredContent?: Record<string, unknown> };
const call = async (c: Client, name: string, args: Record<string, unknown> = {}) =>
  (await c.callTool({ name, arguments: args })) as unknown as R;
const text = (r: R) => r.content.map((x) => x.text).join("\n");
const log = (r = root) => readFile(join(r, "events.jsonl"), "utf8");
const previewId = (r: R) => r.structuredContent?.preview_id as string;

/** preview, then confirm with the preview's id */
async function write(c: Client, name: string, args: Record<string, unknown>) {
  const p = await call(c, name, { ...args, confirm: false });
  if (!previewId(p)) throw new Error(`no preview for ${name}: ${text(p)}`);
  return call(c, name, { ...args, confirm: true, preview_id: previewId(p) });
}

const WRITE_TOOLS = [
  "add_409a",
  "add_grant",
  "add_person",
  "add_safe",
  "add_share_class",
  "create_company",
  "create_option_pool",
  "file_document",
  "issue_shares",
  "set_setup_answers",
];

test("the write tools are listed with their annotations", async () => {
  const { tools } = await (await connect()).listTools();
  for (const name of WRITE_TOOLS) {
    const t = tools.find((x) => x.name === name);
    expect(t, name).toBeTruthy();
    expect(t?.title).toBeTruthy();
    if (name === "set_setup_answers") {
      expect(t?.annotations?.readOnlyHint).toBe(true);
      continue;
    }
    expect(t?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    expect(t?.description).toMatch(/confirm:false first/);
    expect(t?.inputSchema.properties).toHaveProperty("confirm");
    expect(t?.inputSchema.properties).toHaveProperty("preview_id");
  }
});

test("confirm:true without a preview_id writes nothing and says to show the preview first", async () => {
  const before = await log();
  const r = await call(await connect(), "add_person", { name: "Ada", confirm: true });
  expect(text(r)).toContain("Show the preview first");
  expect(await log()).toBe(before);
});

test("preview writes nothing; confirm appends exactly the previewed events, once", async () => {
  const c = await connect();
  const before = await log();
  const p = await call(c, "add_person", { name: "Ada Lovelace", email: "ada@x.com", confirm: false });
  expect(await log()).toBe(before);
  expect(text(p)).toContain("Ada Lovelace");
  expect(p.structuredContent?.captable_after).toContain("Tim Apple,common,Common,4000000");
  const drafts = p.structuredContent?.events as { type: string; data: Record<string, unknown> }[];
  expect(drafts.map((d) => d.type)).toEqual(["STAKEHOLDER"]);

  const r = await call(c, "add_person", { name: "Ada Lovelace", confirm: true, preview_id: previewId(p) });
  expect(text(r)).toMatch(/^Recorded/);
  const added = (await log())
    .slice(before.length)
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
  expect(added.map((e) => ({ type: e.type, data: e.data }))).toEqual(
    drafts.map((d) => ({ type: d.type, data: d.data })),
  );

  const again = await call(c, "add_person", {
    name: "Ada Lovelace",
    confirm: true,
    preview_id: previewId(p),
  });
  expect(text(again)).not.toMatch(/^Recorded/);
  expect((await log()).split("\n").length).toBe(before.split("\n").length + 1);
});

test("a change to the folder after the preview refuses the confirm", async () => {
  const c = await connect();
  const p = await call(c, "add_person", { name: "Ada", confirm: false });
  const v = await readVault(fs, root);
  const out = await appendToVault(fs, v, [b.stakeholder({ name: "Outsider", type: "INDIVIDUAL" })], ctx);
  expect(out.ok).toBe(true);
  const before = await log();
  const r = await call(c, "add_person", { name: "Ada", confirm: true, preview_id: previewId(p) });
  expect(text(r)).toBe("The folder changed since the preview. Ask again to see the new preview.");
  expect(await log()).toBe(before);
});

test("a confirm more than 10 minutes after the preview is refused", async () => {
  const c = await connect();
  const before = await log();
  const p = await call(c, "add_person", { name: "Ada", confirm: false });
  clock.t += 10 * 60_000 + 1000;
  const r = await call(c, "add_person", { name: "Ada", confirm: true, preview_id: previewId(p) });
  expect(text(r)).toMatch(/10 minutes/);
  expect(await log()).toBe(before);
});

test("a preview id only confirms the tool that made it", async () => {
  const c = await connect();
  const before = await log();
  const p = await call(c, "add_person", { name: "Ada", confirm: false });
  const r = await call(c, "add_409a", { price: "0.5", confirm: true, preview_id: previewId(p) });
  expect(text(r)).not.toMatch(/^Recorded/);
  expect(await log()).toBe(before);
});

test("create_company: the app's name error, a missing formation date, and a real company", async () => {
  const c = await connect();
  const parent = await mkdtemp(join(tmpdir(), "capfolder-parent-"));
  const bad = await call(c, "create_company", {
    name: "Acme/Inc",
    country: "US",
    formation_date: "2024-01-02",
    folder: parent,
    confirm: false,
  });
  expect(text(bad)).toBe("A company name can't contain / or \\ or start with a dot.");

  const noDate = await call(c, "create_company", {
    name: "Beta Inc",
    country: "US",
    folder: parent,
    confirm: false,
  });
  expect(previewId(noDate)).toBeUndefined();
  expect(text(noDate)).toBe(
    "Capfolder starts from the day your company is formed. Once it's incorporated, tell me the date and I'll set it up.",
  );
  expect(await readdir(parent)).toEqual([]);

  const r = await write(c, "create_company", {
    name: "Beta Inc",
    country: "US",
    subdivision: "DE",
    formation_date: "2024-01-02",
    folder: parent,
  });
  expect(text(r)).toMatch(/^Recorded/);
  const reg = await loadRegistry(fs, home);
  expect(reg.current).toBe(join(parent, "Beta Inc"));
  const v = await readVault(fs, join(parent, "Beta Inc"));
  expect(v.events.map((e) => e.type)).toEqual(["vault_created", "ISSUER"]);
  // the new company is the current one for the next tools
  expect(text(await call(c, "get_gaps"))).not.toContain("Tim");
});

test("create_company: a name starting with a dot gets the app's error; an emoji is fine", async () => {
  const c = await connect();
  const parent = await mkdtemp(join(tmpdir(), "capfolder-parent-"));
  const dot = await call(c, "create_company", {
    name: ".Acme",
    country: "US",
    formation_date: "2024-01-02",
    folder: parent,
    confirm: false,
  });
  expect(text(dot)).toBe("A company name can't contain / or \\ or start with a dot.");
  expect(previewId(dot)).toBeUndefined();
  const emoji = await call(c, "create_company", {
    name: "Acme 🚀",
    country: "US",
    formation_date: "2024-01-02",
    folder: parent,
    confirm: false,
  });
  expect(previewId(emoji)).toBeTruthy();
  expect(await readdir(parent)).toEqual([]);
});

test("create_company defaults to ~/Documents/Capfolder/<name>", async () => {
  const c = await connect();
  await write(c, "create_company", { name: "Gamma", country: "US", formation_date: "2024-01-02" });
  expect((await loadRegistry(fs, home)).current).toBe(join(home, "Documents/Capfolder/Gamma"));
});

test("file_document copies the file into docs/<folder>/ and never writes outside the vault", async () => {
  const c = await connect();
  const outside = await mkdtemp(join(tmpdir(), "capfolder-src-"));
  await mkdir(join(outside, "sub"));
  await writeFile(join(outside, "escape.pdf"), "%PDF-1.4 fund x safe");
  const snap = async () => (await readdir(outside, { recursive: true })).sort();
  const before = await snap();
  const r = await write(c, "file_document", {
    source_path: join(outside, "sub", "..", "escape.pdf"),
    kind: "safe",
    proves: "SAFE-3",
  });
  expect(text(r)).toMatch(/^Recorded/);
  expect(await snap()).toEqual(before);
  expect(await readFile(join(outside, "escape.pdf"), "utf8")).toBe("%PDF-1.4 fund x safe");
  const safes = await readdir(join(root, "docs", "safes"));
  expect(safes).toHaveLength(1);
  expect(await readFile(join(root, "docs", "safes", safes[0]!), "utf8")).toBe("%PDF-1.4 fund x safe");
  expect(text(await call(c, "get_cap_table", { as_of: "2026-10-07" }))).toContain(
    "Fund X,safe,,,,,,250000,10000000,,2.50,signed",
  );
});

test("file_document refuses directories, missing files and files over 25 MB", async () => {
  const c = await connect();
  const before = await log();
  const dir = await mkdtemp(join(tmpdir(), "capfolder-src-"));
  const big = join(dir, "big.pdf");
  await writeFile(big, "");
  await truncate(big, 25 * 1024 * 1024 + 1);
  for (const [source_path, msg] of [
    [dir, /folder/],
    [join(dir, "nope.pdf"), /no file/i],
    [big, /25 MB/],
  ] as const) {
    const r = await call(c, "file_document", { source_path, kind: "other", confirm: false });
    expect(text(r)).toMatch(msg);
    expect(previewId(r)).toBeUndefined();
  }
  expect(await log()).toBe(before);
});

test("file_document only takes the document types the app takes: PDF, PNG, JPG", async () => {
  const c = await connect();
  const before = await log();
  const dir = await mkdtemp(join(tmpdir(), "capfolder-src-"));
  for (const name of ["notes.docx", "run.sh", "noext"]) {
    await writeFile(join(dir, name), "x");
    const r = await call(c, "file_document", { source_path: join(dir, name), kind: "other", confirm: false });
    expect(text(r)).toBe(`${name} isn't a document Capfolder can file. Use a PDF, PNG or JPG.`);
    expect(previewId(r)).toBeUndefined();
  }
  for (const name of ["a.PDF", "b.png", "c.jpg", "d.jpeg"]) {
    await writeFile(join(dir, name), `%PDF-1.4 ${name}`);
    const r = await call(c, "file_document", { source_path: join(dir, name), kind: "other", confirm: false });
    expect(previewId(r)).toBeTruthy();
  }
  expect(await log()).toBe(before);
});

test("file_document refuses a vault whose docs/<folder> is a symlink, writing nothing outside it", async () => {
  const c = await connect();
  const src = await mkdtemp(join(tmpdir(), "capfolder-src-"));
  await writeFile(join(src, "safe.pdf"), "%PDF-1.4 linked");
  const elsewhere = await mkdtemp(join(tmpdir(), "capfolder-elsewhere-"));
  for (const link of [join(root, "docs", "safes"), join(root, "docs")]) {
    await rm(join(root, "docs"), { recursive: true, force: true });
    if (link.endsWith("safes")) await mkdir(join(root, "docs"));
    await symlink(elsewhere, link);
    const before = await log();
    const r = await write(c, "file_document", { source_path: join(src, "safe.pdf"), kind: "safe" });
    expect(text(r)).toContain("is a link to somewhere else");
    expect(await readdir(elsewhere)).toEqual([]);
    expect(await log()).toBe(before);
    await rm(link);
  }
});

test("with elicitation, the server asks the founder first; decline writes nothing, accept writes", async () => {
  const asked: unknown[] = [];
  let answer: ElicitResult = { action: "decline" };
  const c = await connect((req) => {
    asked.push(req);
    return answer;
  });
  const before = await log();
  const p = await call(c, "add_person", { name: "Ada", confirm: false });
  expect(asked).toHaveLength(0);
  const r = await call(c, "add_person", { name: "Ada", confirm: true, preview_id: previewId(p) });
  expect(asked).toHaveLength(1);
  expect(JSON.stringify(asked[0])).toContain("elicitation/create");
  expect(JSON.stringify(asked[0])).toContain("Ada");
  expect(text(r)).toMatch(/Nothing was recorded/);
  expect(await log()).toBe(before);

  answer = { action: "accept", content: { confirm: true } };
  const p2 = await call(c, "add_person", { name: "Ada", confirm: false });
  const r2 = await call(c, "add_person", { name: "Ada", confirm: true, preview_id: previewId(p2) });
  expect(text(r2)).toMatch(/^Recorded/);
  expect(await log()).not.toBe(before);
});

test("set_setup_answers writes nothing and lists the next steps", async () => {
  const before = await log();
  const r = await call(await connect(), "set_setup_answers", { safes: true, pool: false, priced: false });
  expect(text(r)).toContain("SAFE");
  expect(text(r)).not.toContain("option pool");
  expect(text(r)).not.toContain("Priced round");
  expect(text(r)).toContain("ocument");
  expect(await log()).toBe(before);
});

test("issue_shares vests 4 years with a 1-year cliff by default, reusing the vault's terms", async () => {
  const p = await call(await connect(), "issue_shares", {
    person: "sh_tim",
    shares: "1000",
    date: "2026-10-01",
    confirm: false,
  });
  const drafts = p.structuredContent?.events as { type: string; data: Record<string, unknown> }[];
  expect(drafts.map((d) => d.type)).toEqual(["TX_STOCK_ISSUANCE", "TX_VESTING_START"]);
  expect(drafts[0]?.data).toMatchObject({
    security_id: "CS-3",
    vesting_terms_id: "vt_4y1c_monthly",
    share_price: { amount: "0.00001", currency: "USD" },
  });
});

test("a whole cap table set up by tool calls, as the engine computes it", async () => {
  const c = await connect();
  const parent = await mkdtemp(join(tmpdir(), "capfolder-parent-"));
  await write(c, "create_company", {
    name: "Delta",
    country: "US",
    formation_date: "2021-09-14",
    folder: parent,
  });
  await write(c, "add_share_class", { name: "Common", authorized: "10000000", par_value: "0.00001" });
  await write(c, "add_person", { name: "Tim Apple", email: "tim@apple.com" });
  await write(c, "add_person", { name: "Angel A" });
  await write(c, "issue_shares", {
    person: "Tim Apple",
    shares: "4000000",
    date: "2021-09-14",
    vesting_start: "2023-10-07",
  });
  await write(c, "add_safe", {
    investor: "Y Combinator",
    amount: "500000",
    cap: "10000000",
    date: "2022-01-10",
  });
  await write(c, "add_safe", {
    investor: "Angel A",
    amount: "150000",
    cap: "8000000",
    discount: "20",
    date: "2023-02-20",
  });
  await write(c, "create_option_pool", {
    name: "2025 Equity Incentive Plan",
    size: "1000000",
    board_approval_date: "2025-09-30",
  });
  await write(c, "add_grant", {
    person: "Steve Wozniak",
    options: "40000",
    strike: "0.12",
    date: "2025-10-07",
  });
  const r = await write(c, "add_409a", {
    price: "0.42",
    date: "2026-06-15",
    provider: "Acme Valuations LLC",
  });
  expect(text(r)).toMatch(/^Recorded/);
  const csv = text(await call(c, "get_cap_table", { as_of: "2026-10-07" }));
  expect(csv).toContain("Tim Apple,common,Common,4000000,");
  expect(csv).toContain(",3000000,1000000,,,,,missing");
  expect(csv).toContain("Steve Wozniak,option,Common,40000,");
  expect(csv).toContain("Option pool (available),pool,Common,960000,");
  expect(csv).toContain("Y Combinator,safe,,,,,,500000,10000000,,");
  expect(csv).toContain("Angel A,safe,,,,,,150000,8000000,0.2,"); // the app's discountFraction("20")
  const v = await readVault(fs, join(parent, "Delta"));
  expect(v.events.find((e) => e.type === "VALUATION")?.data).toMatchObject({
    provider: "Acme Valuations LLC",
  });
  const angel = v.events.filter(
    (e) =>
      e.type === "STAKEHOLDER" && (e.data as { name: { legal_name: string } }).name.legal_name === "Angel A",
  );
  expect(angel).toHaveLength(1); // the SAFE reused the person, by name
});

const FULL_PATH = "Give the full path, e.g. ~/Documents/…";

test("relative paths are refused: the server's working folder is unknown", async () => {
  const c = await connect();
  const before = await log();
  const a = await call(c, "create_company", {
    name: "Rel",
    country: "US",
    formation_date: "2024-01-02",
    folder: "Documents/Capfolder",
    confirm: false,
  });
  expect(text(a)).toBe(FULL_PATH);
  const d = await call(c, "file_document", { source_path: "safe.pdf", kind: "safe", confirm: false });
  expect(text(d)).toBe(FULL_PATH);
  expect(previewId(a)).toBeUndefined();
  expect(previewId(d)).toBeUndefined();
  expect(await log()).toBe(before);
});

test("a SAFE discount is a percent, stored as the app stores it", async () => {
  const c = await connect();
  for (const [pct, stored] of [
    ["20", "0.2"],
    ["15", "0.15"],
    ["7.5", "0.075"],
  ]) {
    const p = await call(c, "add_safe", {
      investor: "Fund X",
      amount: "1000",
      discount: pct,
      confirm: false,
    });
    const drafts = p.structuredContent?.events as { type: string; data: Record<string, unknown> }[];
    expect(JSON.stringify(drafts.at(-1)?.data)).toContain(`"conversion_discount":"${stored}"`);
  }
  const bad = await call(c, "add_safe", {
    investor: "Fund X",
    amount: "1000",
    discount: "0",
    confirm: false,
  });
  expect(previewId(bad)).toBeUndefined();
});
