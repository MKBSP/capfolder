// The write tools: AI proposes, the founder confirms. confirm:false builds the same drafts the desktop builds and
// returns a preview (nothing written); confirm:true + preview_id writes exactly those drafts, through the vault's
// locked write path, if the log hasn't changed since. Never openVault here (it rewrites derived files unlocked).
import { stat } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import {
  appendEvents,
  builders as b,
  captableCsv,
  type EventDraft,
  fmtInt,
  fmv,
  MAX_DATE,
  normName,
  reduce,
  type State,
  sha256Hex,
} from "@capfolder/core";
import {
  appendToVault,
  attachDocument,
  baseName,
  createVault,
  DOC_FOLDER,
  join,
  MemoryFs,
  registerCompany,
  resolveFolder,
  SAMPLE_BLOCKED,
  sha256Bytes,
  type Vault,
} from "@capfolder/vault";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { currentVault, type ServerOpts } from "../context";
import { PreviewStore } from "../preview";
import { NO_COMPANY, reply, todayOf } from "./read";

export const SHOW_FIRST =
  "Show the preview first: call this tool with confirm:false, show the founder the preview, and call it with confirm:true and the preview_id only after they say yes. Nothing was recorded.";
const HOW =
  "Call with confirm:false first: that records nothing and returns a preview (what changes and the cap table after). Show the preview to the founder and only call confirm:true with the preview_id after they say yes; then exactly the previewed change is recorded and the other arguments are ignored. The Capfolder engine does all the math: never compute numbers yourself.";
const MAX_DOC_BYTES = 25 * 1024 * 1024;
const NEW_COMPANY = "(new company)"; // the preview key for create_company: there is no folder yet

type Applied = { ok: true; vault?: Vault; derivedError?: string } | { ok: false; errors: string[] };
type Pending = { tool: string; apply: (v: Vault | null) => Promise<Applied> };
type Plan = { summary: string; drafts: EventDraft[]; apply?: (v: Vault) => Promise<Applied> };
type Ctx = { s: State; today: string; currency: string };

const confirmShape = {
  confirm: z
    .boolean()
    .describe(
      "false: preview only, always first. true: record the preview, only after the founder said yes.",
    ),
  preview_id: z.string().optional().describe("The preview_id from the confirm:false call."),
};
const writeAnn = (title: string) => ({
  title,
  readOnlyHint: false,
  destructiveHint: false, // only appends
  openWorldHint: false,
});
const date = z.iso.date();
const count = z.string().regex(/^[1-9]\d*$/, "A whole number, digits only, like 4000000.");
const decimal = z
  .string()
  .regex(/^\d+(\.\d+)?$/, "A plain number like 0.00001 or 500000: no commas or currency.");
const personArg = z
  .string()
  .min(1)
  .describe("The person's id (from list_people) or name. A name not on the cap table adds a new person.");
const vestingArg = z
  .enum(["4y_1y_cliff", "none"])
  .default("4y_1y_cliff")
  .describe("4 years, 1-year cliff, monthly (the default), or none.");
const plus30 = (d: string) => {
  const [y, m, dd] = d.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, dd + 30)).toISOString().slice(0, 10);
};
export const NO_FORMATION_DATE =
  "Capfolder starts from the day your company is formed. Once it's incorporated, tell me the date and I'll set it up.";
export const FULL_PATH = "Give the full path, e.g. ~/Documents/…";
/** The MCP host's working folder is unknown (often /), so only ~ or absolute paths mean what the founder meant. */
const fullPath = (p: string, home: string) =>
  p === "~" || p.startsWith("~/") || isAbsolute(p) ? resolve(resolveFolder(p, home)) : null;
/** Mirrors the desktop's discountFraction (wizard.ts): "20" → "0.2", "7.5" → "0.075"; not a percent → undefined. */
export const discountFraction = (pct: string) => {
  const v = pct.trim();
  if (!/^\d+(\.\d+)?$/.test(v) || !/[1-9]/.test(v)) return undefined;
  const [i, f = ""] = v.split(".");
  const d = i!.padStart(3, "0");
  return `${d.slice(0, -2).replace(/^0+(?=\d)/, "")}.${d.slice(-2)}${f}`.replace(/\.?0+$/, "");
};
const nameOf = (s: State, id: string): string => s.stakeholders.get(id)?.name?.legal_name ?? id;
const n = (x: string) => fmtInt(BigInt(x));

/** The id-or-name the model gave: an existing stakeholder (by id, then by name like the app), or a new one. */
function personFor(s: State, person: string, email: string | undefined, type: "INDIVIDUAL" | "INSTITUTION") {
  const want = person.trim();
  const k = normName(want);
  const id = s.stakeholders.has(want)
    ? want
    : [...s.stakeholders.keys()].find((x) => normName(String(nameOf(s, x))) === k);
  if (id) return { id, name: nameOf(s, id), drafts: [] as EventDraft[], note: "" };
  const d = b.stakeholder({ name: want, email: email?.trim() || undefined, type });
  return {
    id: d.data.id as string,
    name: want,
    drafts: [d],
    note: ` (new on the cap table${email ? `, ${email}` : ""})`,
  };
}

/** The standard 4y / 1y-cliff / monthly terms: the vault's copy, or a new one (as the desktop's terms.ts). */
function standardTerms(s: State): { id: string; drafts: EventDraft[] } {
  for (const [id, t] of s.vestingTerms)
    if (t.name === "4 years, 1-year cliff, monthly") return { id, drafts: [] };
  const id = b.newId("vt");
  return { id, drafts: [b.vestingTerms4y1y(id)] };
}

function classFor(s: State, want?: string) {
  const all = [...s.classes.entries()];
  const hit = want
    ? all.find(([id, c]) => id === want || String(c.data.name).toLowerCase() === want.trim().toLowerCase())
    : all[0];
  return hit ? { id: hit[0], data: hit[1].data } : null;
}

/** With elicitation, the server asks the founder itself, so a misbehaving agent can't skip the yes. */
async function founderSaysYes(server: McpServer, summary: string): Promise<boolean> {
  if (!server.server.getClientCapabilities()?.elicitation?.form) return true; // the model relays the yes (spec)
  try {
    const r = await server.server.elicitInput({
      message: `${summary}\n\nRecord this in the cap table?`,
      requestedSchema: {
        type: "object",
        properties: { confirm: { type: "boolean", title: "Yes, record this" } },
        required: ["confirm"],
      },
    });
    return r.action === "accept" && r.content?.confirm === true;
  } catch {
    return false;
  }
}

export function registerWriteTools(server: McpServer, o: ServerOpts) {
  const store = new PreviewStore<Pending>(o.ctx.now);

  async function confirm(tool: string, id: string, root: string, hash: string, v: Vault | null) {
    const t = store.take(id, root, hash);
    if (t instanceof Error) return reply(t.message);
    if (t.value.tool !== tool)
      return reply(
        `That preview is for ${t.value.tool}, not ${tool}. Nothing was recorded. Ask again to see a new preview.`,
      );
    if (!(await founderSaysYes(server, t.summary)))
      return reply("Nothing was recorded: the founder didn't say yes.", { recorded: false });
    let r: Applied;
    try {
      r = await t.value.apply(v);
    } catch (e) {
      r = { ok: false, errors: [(e as Error).message] };
    }
    if (!r.ok)
      return reply(`Nothing was recorded: ${r.errors.join(" ")}`, { recorded: false, errors: r.errors });
    const extra = [
      r.vault && !v ? `The folder is ${r.vault.root}.` : "",
      r.derivedError ? `Recorded, but ${r.derivedError}` : "",
    ].filter(Boolean);
    return reply([`Recorded. ${t.summary}`, ...extra].join("\n\n"), {
      recorded: true,
      summary: t.summary,
      ...(r.vault ? { root: r.vault.root } : {}),
    });
  }

  async function preview(
    tool: string,
    root: string,
    log: string,
    events: Vault["events"],
    p: Plan,
    apply: Pending["apply"],
  ) {
    const r = await appendEvents(log, p.drafts, o.ctx); // in memory: the engine's checks, nothing written
    if (!r.ok) return reply(`This can't be recorded: ${r.errors.join(" ")}`, { errors: r.errors });
    const asOf = todayOf(o);
    const csv = captableCsv([...events, ...r.events], asOf);
    const id = store.put(root, await sha256Hex(log), { tool, apply }, p.summary);
    return reply(
      `Preview (nothing is recorded yet):\n${p.summary}\n\nCap table after, as of ${asOf} (CSV):\n\n${csv}\nShow this to the founder. Only after they say yes, call ${tool} with confirm:true and preview_id "${id}". The preview expires in 10 minutes.`,
      {
        preview_id: id,
        summary: p.summary,
        events: p.drafts.map((d) => ({ kind: d.kind, type: d.type, data: d.data })),
        as_of: asOf,
        captable_after: csv,
      },
    );
  }

  /** A write to the current company: preview on confirm:false, the locked append on confirm:true. */
  function vaultTool<S extends z.ZodRawShape>(
    name: string,
    title: string,
    description: string,
    shape: S,
    plan: (a: z.infer<z.ZodObject<S>>, c: Ctx) => Promise<Plan | string> | Plan | string,
  ) {
    const handler = async (a: z.infer<z.ZodObject<S>> & { confirm: boolean; preview_id?: string }) => {
      let v: Vault | null;
      try {
        v = await currentVault(o);
      } catch (e) {
        return reply(`I couldn't open the company folder: ${(e as Error).message}`);
      }
      if (!v) return reply(NO_COMPANY);
      if (a.confirm) {
        if (!a.preview_id) return reply(SHOW_FIRST);
        return confirm(name, a.preview_id, v.root, await sha256Hex(v.log), v);
      }
      if (v.meta.sample) return reply(SAMPLE_BLOCKED);
      if (v.broken)
        return reply(`The record is broken at line ${v.broken.line}. Restore the folder from your backup.`);
      const s = reduce(v.events, MAX_DATE);
      const p = await plan(a, { s, today: todayOf(o), currency: String(v.meta.currency ?? "USD") });
      if (typeof p === "string") return reply(p);
      return preview(name, v.root, v.log, v.events, p, (fresh) =>
        p.apply ? p.apply(fresh!) : appendToVault(o.fs, fresh!, p.drafts, o.ctx),
      );
    };
    server.registerTool(
      name,
      {
        title,
        description: `${description} ${HOW}`,
        inputSchema: { ...shape, ...confirmShape },
        annotations: writeAnn(title),
      },
      handler as never, // the SDK can't type a callback over a generic shape
    );
  }

  // ---------- create_company: no folder yet ----------

  server.registerTool(
    "create_company",
    {
      title: "Create company",
      description: `Creates the company's cap table folder (the record) and makes it the current company. ${HOW}`,
      inputSchema: {
        name: z.string().min(1).describe("The company's legal name, as on the certificate of incorporation."),
        country: z.string().length(2).describe("Country of formation, ISO 3166-1 alpha-2, e.g. US."),
        subdivision: z
          .string()
          .optional()
          .describe("State or region code, e.g. DE for Delaware. Leave out if none."),
        formation_date: date.optional().describe("Date of incorporation, YYYY-MM-DD."),
        folder: z
          .string()
          .optional()
          .describe(
            "Where the company folder goes; the company name is added. Default ~/Documents/Capfolder.",
          ),
        currency: z.string().length(3).optional().describe("ISO 4217, e.g. USD (the default) or EUR."),
        ...confirmShape,
      },
      annotations: writeAnn("Create company"),
    },
    async (a) => {
      if (a.confirm) {
        if (!a.preview_id) return reply(SHOW_FIRST);
        return confirm("create_company", a.preview_id, NEW_COMPANY, await sha256Hex(""), null);
      }
      const name = a.name.trim();
      // the record format (OCF Issuer) requires a formation date: never invent one
      if (!a.formation_date) return reply(NO_FORMATION_DATE);
      if (a.formation_date > todayOf(o)) return reply("The incorporation date can't be in the future.");
      const parent = fullPath(a.folder ?? "~/Documents/Capfolder", o.home);
      if (!parent) return reply(FULL_PATH);
      const company = {
        name,
        formationDate: a.formation_date,
        country: a.country.toUpperCase(),
        subdivision: a.subdivision?.trim().toUpperCase() ?? "",
        currency: a.currency?.toUpperCase(),
      };
      let draft: Vault;
      try {
        // the same createVault, on a throwaway in-memory folder: its checks and events, nothing on disk
        draft = await createVault(new MemoryFs(), o.ctx, { parent: "/preview", company });
      } catch (e) {
        return reply((e as Error).message);
      }
      const where = [company.country, company.subdivision].filter(Boolean).join("-");
      const summary = `Creates the company ${name} (incorporated ${a.formation_date}, ${where}, currency ${company.currency ?? "USD"}) in a new folder ${join(parent, name)}, and makes it the current company.`;
      return preview(
        "create_company",
        NEW_COMPANY,
        "",
        [],
        {
          summary,
          drafts: draft.events.map((e) => ({ kind: e.kind, type: e.type, data: e.data }) as EventDraft),
        },
        async () => {
          const v = await createVault(o.fs, o.ctx, { parent, company });
          await registerCompany(o.fs, o.home, { name, root: v.root });
          o.vault = undefined; // the new company is the current one now, as with switch_company
          return { ok: true, vault: v };
        },
      );
    },
  );

  // ---------- setup answers: nothing to write ----------

  server.registerTool(
    "set_setup_answers",
    {
      title: "Setup questions",
      description:
        "The founder's answers to the three setup questions (any SAFEs? an option pool? a priced round?). Writes nothing; returns which setup steps come next.",
      inputSchema: {
        safes: z.boolean().describe("Has the company raised money on SAFEs?"),
        pool: z.boolean().describe("Is there an option pool, or will there be one?"),
        priced: z.boolean().describe("Has the company done a priced round (preferred shares)?"),
      },
      annotations: { title: "Setup questions", readOnlyHint: true, openWorldHint: false },
    },
    ({ safes, pool, priced }) => {
      const steps = [
        "Founders and their shares: add_share_class (authorized shares and par value), then issue_shares for each founder, with their vesting.",
        pool && "Option pool and grants: create_option_pool, then add_grant for each grant.",
        safes && "SAFEs: add_safe for each SAFE.",
        priced &&
          "Priced round: preferred shares are imported in the Capfolder app, from your old tool or your lawyer's spreadsheet.",
        "Documents: file_document for each signed document, linked to what it proves.",
      ].filter((x): x is string => !!x);
      return reply(`Next steps:\n${steps.map((x, i) => `${i + 1}. ${x}`).join("\n")}`, {
        answers: { safes, pool, priced },
        steps,
      });
    },
  );

  // ---------- writes to the current company ----------

  vaultTool(
    "add_person",
    "Add person",
    "Adds a person, or a company or fund, to the cap table, without holdings yet (an investor about to sign, a new hire).",
    {
      name: z.string().min(1),
      email: z.string().optional(),
      role: z
        .enum(["person", "company_or_fund"])
        .default("person")
        .describe("A person (the default), or a company or fund."),
    },
    (a) => {
      const name = a.name.trim();
      if (!name) return "Enter a name.";
      const type = a.role === "company_or_fund" ? "INSTITUTION" : "INDIVIDUAL";
      const email = a.email?.trim() || undefined;
      return {
        summary: `Adds ${name}${email ? ` (${email})` : ""} to the cap table as ${type === "INDIVIDUAL" ? "a person" : "a company or fund"}, with no holdings yet.`,
        drafts: [b.stakeholder({ name, email, type })],
      };
    },
  );

  vaultTool(
    "add_share_class",
    "Add share class",
    "Sets up a class of shares: how many the company can issue (authorized) and their par value.",
    {
      name: z.string().min(1).describe("Usually Common."),
      authorized: count.describe("Authorized shares, e.g. 10000000."),
      par_value: decimal.optional().describe("Par value per share, e.g. 0.00001."),
      preferred: z.boolean().default(false).describe("true for preferred shares."),
    },
    (a, c) => ({
      summary: `Sets up ${a.name.trim()}${a.preferred ? " (preferred)" : ""}: ${n(a.authorized)} shares authorized${a.par_value ? `, par value ${a.par_value} ${c.currency}` : ""}.`,
      drafts: [
        b.stockClass({
          currency: c.currency,
          name: a.name.trim(),
          authorized: a.authorized,
          parValue: a.par_value,
          preferred: a.preferred,
        }),
      ],
    }),
  );

  vaultTool(
    "issue_shares",
    "Issue shares",
    "Records shares issued to a founder, advisor or other holder.",
    {
      person: personArg,
      email: z.string().optional().describe("Only for a new person."),
      shares: count,
      share_class: z.string().optional().describe("Class id or name. Default: the first class (Common)."),
      price: decimal.optional().describe("Price per share. Default: the class's par value."),
      date: date.optional().describe("Issue date, YYYY-MM-DD. Default today."),
      vesting: vestingArg,
      vesting_start: date.optional().describe("Vesting start date. Default: the issue date."),
    },
    (a, c) => {
      const cls = classFor(c.s, a.share_class);
      if (!cls)
        return a.share_class
          ? `There's no share class ${a.share_class}.`
          : "Set up authorized shares first: add_share_class.";
      const who = personFor(c.s, a.person, a.email, "INDIVIDUAL");
      const day = a.date ?? c.today;
      const terms = a.vesting === "none" ? null : standardTerms(c.s);
      const start = a.vesting_start ?? day;
      const price = a.price ?? cls.data.par_value?.amount ?? "0";
      const issue = b.stockIssuance({
        currency: c.currency,
        state: c.s,
        stakeholderId: who.id,
        classId: cls.id,
        quantity: a.shares,
        price,
        date: day,
        ...(terms ? { vestingTermsId: terms.id, vestingStart: start } : {}),
      });
      const warn =
        terms && plus30(day) >= c.today
          ? `\nFile the 83(b) within 30 days of ${day}: by ${plus30(day)}.`
          : "";
      return {
        summary: `Issues ${n(a.shares)} ${cls.data.name} shares (${issue[0]!.data.security_id}) to ${who.name}${who.note} on ${day} at ${price} ${c.currency} each, ${terms ? `vesting 4 years with a 1-year cliff, monthly, from ${start}` : "with no vesting"}.${warn}`,
        drafts: [...who.drafts, ...(terms?.drafts ?? []), ...issue],
      };
    },
  );

  vaultTool(
    "create_option_pool",
    "Option pool",
    "Creates the option pool (equity incentive plan). If the company already has one, sets its new total instead (an increase).",
    {
      size: count.describe("Shares reserved; for an increase, the new total."),
      name: z.string().optional().describe("Plan name. Default: <this year> Equity Incentive Plan."),
      board_approval_date: date.optional().describe("YYYY-MM-DD. Default today."),
      plan_id: z.string().optional().describe("For an increase when there are several plans."),
    },
    (a, c) => {
      const day = a.board_approval_date ?? c.today;
      const plans = [...c.s.plans.entries()];
      if (!plans.length) {
        const cls = classFor(c.s);
        if (!cls) return "Set up authorized shares first: add_share_class.";
        const name = a.name?.trim() || `${c.today.slice(0, 4)} Equity Incentive Plan`;
        return {
          summary: `Creates the option pool ${name}: ${n(a.size)} ${cls.data.name} shares reserved, board approved on ${day}.`,
          drafts: [b.stockPlan({ name, reserved: a.size, boardApprovalDate: day, classId: cls.id })],
        };
      }
      const hit = a.plan_id ? plans.find(([id]) => id === a.plan_id) : plans[0];
      if (!hit) return `There's no plan ${a.plan_id}.`;
      const [planId, plan] = hit;
      if (BigInt(a.size) <= plan.reserved)
        return `The new total must be more than the current ${fmtInt(plan.reserved)} reserved.`;
      return {
        summary: `Increases ${plan.data.plan_name} from ${fmtInt(plan.reserved)} to ${n(a.size)} shares reserved, board approved on ${day}.`,
        drafts: [b.poolAdjustment({ planId, newTotal: a.size, date: day })],
      };
    },
  );

  vaultTool(
    "add_grant",
    "Add grant",
    "Records an option grant from the option pool.",
    {
      person: personArg,
      email: z.string().optional().describe("Only for a new person."),
      options: count,
      strike: decimal
        .optional()
        .describe("Exercise price per share, usually the latest 409A price. Default 0."),
      date: date.optional().describe("Grant date, YYYY-MM-DD. Default today."),
      vesting: vestingArg,
      vesting_start: date.optional().describe("Vesting start date. Default: the grant date."),
      option_type: z.enum(["ISO", "NSO"]).default("ISO"),
      plan_id: z.string().optional().describe("Default: the first plan."),
    },
    (a, c) => {
      const plans = [...c.s.plans.entries()];
      if (!plans.length) return "Grants come from an option pool. Create the pool first: create_option_pool.";
      const hit = a.plan_id ? plans.find(([id]) => id === a.plan_id) : plans[0];
      if (!hit) return `There's no plan ${a.plan_id}.`;
      const [planId, plan] = hit;
      const who = personFor(c.s, a.person, a.email, "INDIVIDUAL");
      const day = a.date ?? c.today;
      const terms = a.vesting === "none" ? null : standardTerms(c.s);
      const start = a.vesting_start ?? day;
      const strike = a.strike ?? "0";
      const grant = b.optionGrant({
        currency: c.currency,
        state: c.s,
        stakeholderId: who.id,
        planId,
        classId: plan.data.stock_class_ids?.[0],
        quantity: a.options,
        strike,
        date: day,
        type: a.option_type === "NSO" ? "OPTION_NSO" : "OPTION_ISO",
        ...(terms ? { vestingTermsId: terms.id, vestingStart: start } : {}),
      });
      const price = fmv(c.s);
      const warn =
        Number(strike) === 0
          ? "\nStrike may be challenged. Get a 409A."
          : price && Number(strike) < Number(price.amount)
            ? `\nThe strike is below the 409A price of ${price.amount} ${price.currency} (from ${price.date}). Options priced under fair market value can bring tax penalties for the employee (Section 409A).`
            : "";
      return {
        summary: `Grants ${n(a.options)} ${a.option_type} options (${grant[0]!.data.security_id}) from ${plan.data.plan_name} to ${who.name}${who.note} on ${day}, strike ${strike} ${c.currency}, ${terms ? `vesting 4 years with a 1-year cliff, monthly, from ${start}` : "with no vesting"}.${warn}`,
        drafts: [...who.drafts, ...(terms?.drafts ?? []), ...grant],
      };
    },
  );

  vaultTool(
    "add_safe",
    "Add SAFE",
    "Records a signed SAFE (money an investor gave that converts into shares at a later round).",
    {
      investor: personArg,
      email: z.string().optional().describe("Only for a new investor."),
      investor_type: z
        .enum(["person", "company_or_fund"])
        .default("company_or_fund")
        .describe("Only for a new investor. Default: a company or fund."),
      amount: decimal,
      cap: decimal.optional().describe("Post-money valuation cap."),
      discount: z.string().optional().describe("As a percent, e.g. 20 for 20%."),
      mfn: z.boolean().default(false).describe("Most favored nation."),
      date: date.optional().describe("YYYY-MM-DD. Default today."),
    },
    (a, c) => {
      const discount = a.discount === undefined ? undefined : discountFraction(a.discount);
      if (a.discount !== undefined && !discount) return "Give the discount as a percent, like 20 for 20%.";
      const who = personFor(
        c.s,
        a.investor,
        a.email,
        a.investor_type === "person" ? "INDIVIDUAL" : "INSTITUTION",
      );
      const day = a.date ?? c.today;
      const safe = b.safe({
        currency: c.currency,
        state: c.s,
        stakeholderId: who.id,
        amount: a.amount,
        cap: a.cap,
        discount,
        mfn: a.mfn,
        date: day,
      });
      const terms = [
        a.cap ? `post-money cap ${a.cap} ${c.currency}` : "no cap",
        a.discount ? `discount ${a.discount.trim()}%` : "",
        a.mfn ? "MFN" : "",
      ].filter(Boolean);
      return {
        summary: `Records a SAFE (${safe.data.security_id}) from ${who.name}${who.note}: ${a.amount} ${c.currency} on ${day}, ${terms.join(", ")}.`,
        drafts: [...who.drafts, safe],
      };
    },
  );

  vaultTool(
    "add_409a",
    "Add 409A",
    "Records a 409A valuation: the board-approved fair market value of one common share.",
    {
      price: z
        .string()
        .regex(/^\d+(\.\d{1,10})?$/, "The price per share from the 409A report, like 0.42.")
        .describe("Price per common share, e.g. 0.42."),
      date: date.optional().describe("Effective date, YYYY-MM-DD. Default today."),
      provider: z.string().optional().describe("Who did the valuation."),
    },
    (a, c) => {
      if (Number(a.price) <= 0) return "Enter the price per share from the 409A report, like 0.42.";
      const common = [...c.s.classes.entries()].find(([, x]) => x.data.class_type === "COMMON")?.[0];
      const classId = common ?? [...c.s.classes.keys()][0];
      if (!classId) return "Set up authorized shares first: add_share_class.";
      const day = a.date ?? c.today;
      const provider = a.provider?.trim() || undefined;
      return {
        summary: `Records a 409A valuation of ${a.price} ${c.currency} per common share, effective ${day}${provider ? `, by ${provider}` : ""}.`,
        drafts: [b.valuation409a({ price: a.price, date: day, classId, provider, currency: c.currency })],
      };
    },
  );

  vaultTool(
    "file_document",
    "File a document",
    "Copies a signed document from anywhere on this computer into the company's docs/ folder and links it to what it proves. The original file is left where it is.",
    {
      source_path: z.string().min(1).describe("The file's path, e.g. ~/Downloads/safe.pdf."),
      kind: z.enum(Object.keys(DOC_FOLDER) as [string, ...string[]]).describe("What the document is."),
      proves: z
        .string()
        .optional()
        .describe("The id of the holding (e.g. SAFE-1, CS-2, OPT-1), person or plan it proves."),
    },
    async (a, c) => {
      const path = fullPath(a.source_path.trim(), o.home);
      if (!path) return FULL_PATH;
      const st = await stat(path).catch(() => null);
      if (!st) return `There's no file at ${path}.`;
      if (st.isDirectory()) return `${path} is a folder. Point to one file.`;
      if (!st.isFile()) return `${path} isn't a regular file.`;
      if (st.size > MAX_DOC_BYTES) return `${baseName(path)} is larger than 25 MB, too big to file.`;
      const sec = a.proves ? c.s.securities.get(a.proves) : undefined;
      if (a.proves && !sec && !c.s.stakeholders.has(a.proves) && !c.s.plans.has(a.proves))
        return `There's nothing with the id ${a.proves}. Use list_people to see the holdings and people.`;
      const bytes = await o.fs.readBytes(path);
      const sha256 = await sha256Bytes(bytes);
      if ([...c.s.docs.values()].some((d) => !d.removed && d.data.sha256 === sha256))
        return "This file is already in your folder (same content).";
      const person = sec
        ? nameOf(c.s, sec.stakeholderId)
        : a.proves && c.s.stakeholders.has(a.proves)
          ? nameOf(c.s, a.proves)
          : "company";
      const day = sec?.date ?? c.today; // as the app's Attach: the holding's date
      const docId = b.newId("doc");
      const folder = DOC_FOLDER[a.kind] ?? "company";
      return {
        summary: `Copies ${baseName(path)} into the company's docs/${folder}/ folder as a ${a.kind.replaceAll("_", " ")}${a.proves ? `, as proof for ${a.proves}${sec ? ` (${person})` : ""}` : ""}. The original stays where it is.`,
        // preview only (the cap table's document column); attachDocument writes its own, same shape
        drafts: [
          b.docAdded({
            docId,
            path: `docs/${folder}/${baseName(path)}`,
            sha256,
            docType: a.kind,
            originalName: baseName(path),
          }),
          ...(a.proves ? [b.docLinked({ docId, target: a.proves })] : []),
        ],
        apply: async (v) => {
          await o.fs.mkdir(join(v.root, "docs", folder)); // a copied or git-cloned vault can lack the empty docs/ folders
          const r = await attachDocument(o.fs, v, o.ctx, {
            originalName: baseName(path),
            bytes,
            docType: a.kind,
            date: day,
            person,
            target: a.proves,
          });
          return r.ok === "duplicate"
            ? { ok: false, errors: ["This file is already in your folder (same content)."] }
            : r;
        },
      };
    },
  );
}
