// Recordable steps → real events on an in-memory log → State. Same builders and checks as the app.
import { appendEvents, defaultCtx } from "../append";
import * as b from "../builders";
import { canonicalLine } from "../chain";
import { toInt } from "../num";
import { reduce } from "../reduce";
import type { EventDraft, State, VaultEvent } from "../types";
import type { RecordableStep, Vesting } from "./types";

const DEFAULT_AUTHORIZED = 10_000_000n;
const DEFAULT_VESTING: Vesting = { months: 48, cliffMonths: 12 };

/** A whole positive share count, or the reason it isn't. */
function whole(s: string, what: string): bigint {
  let n: bigint;
  try {
    n = toInt(s);
  } catch {
    throw new Error(`${what}: "${s}" is not a whole number.`);
  }
  if (n <= 0n) throw new Error(`${what}: must be more than 0.`);
  return n;
}

const commonClass = (s: State) =>
  [...s.classes.entries()].find(([, c]) => c.data.class_type === "COMMON")?.[0];

function personId(s: State, name: string, drafts: EventDraft[], type: "INDIVIDUAL" | "INSTITUTION") {
  for (const [id, d] of s.stakeholders) if (d.name?.legal_name === name) return id;
  const d = b.stakeholder({ name, type });
  drafts.push(d);
  return d.data.id as string;
}

function vestingId(s: State, v: Vesting, drafts: EventDraft[]) {
  const d = b.vestingTerms(v);
  for (const [id, t] of s.vestingTerms) if (t.name === d.data.name) return id;
  drafts.push(d);
  return d.data.id as string;
}

/** Drafts for one step against the state so far. Throws with founder-readable text on bad input. */
function draftsFor(s: State, step: RecordableStep, today: string): EventDraft[] {
  const date = step.date ?? today;
  const out: EventDraft[] = [];
  switch (step.kind) {
    case "founders": {
      if (!step.founders.length) throw new Error("Founders: name at least one founder.");
      const shares = step.founders.map((f) => whole(f.shares, `${f.name}'s shares`));
      let classId = commonClass(s);
      if (!s.issuer) {
        if (s.classes.size || s.securities.size || s.promises.size)
          throw new Error("The company isn't incorporated yet. Record the incorporation first.");
        const sum = shares.reduce((a, n) => a + n, 0n);
        const authorized = step.authorized
          ? whole(step.authorized, "Authorized shares")
          : sum > DEFAULT_AUTHORIZED
            ? sum
            : DEFAULT_AUTHORIZED;
        const cls = b.stockClass({ name: "Common", authorized: authorized.toString() });
        out.push(b.issuer({ name: "Scenario", formationDate: date }), cls);
        classId = cls.data.id as string;
      }
      if (!classId) throw new Error("The company has no common stock class.");
      step.founders.forEach((f, i) => {
        const stakeholderId = personId(s, f.name, out, "INDIVIDUAL");
        out.push(
          ...b.stockIssuance({
            state: s,
            stakeholderId,
            classId,
            quantity: shares[i]!.toString(),
            price: "0",
            date,
            vestingTermsId: vestingId(s, f.vesting ?? DEFAULT_VESTING, out),
            securityId: `CS-${b.nextSecurityIdNumber(s, "CS") + i}`,
          }),
        );
      });
      return out;
    }
    case "pool": {
      const classId = commonClass(s);
      if (!classId) throw new Error("Option pool: add the founders first.");
      let reserve: bigint;
      if (step.shares) reserve = whole(step.shares, "Option pool");
      else if (step.percent) {
        const p = toInt(step.percent.replace(/\.0+$/, ""));
        if (p <= 0n || p >= 100n) throw new Error("Option pool: the percent must be between 0 and 100.");
        const held = [...s.securities.values()]
          .filter((x) => x.kind !== "convertible")
          .reduce((a, x) => a + x.quantity, 0n);
        reserve = (held * p) / (100n - p); // floor: a pool is whole shares
      } else throw new Error("Option pool: give a number of shares or a percent.");
      const [planId, plan] = [...s.plans.entries()][0] ?? [];
      if (planId && plan) {
        const granted = [...s.securities.values()]
          .filter((x) => x.planId === planId)
          .reduce((a, x) => a + x.originalQuantity, 0n);
        out.push(
          b.poolAdjustment({ planId, newTotal: (reserve + granted - plan.returned).toString(), date }),
        );
      } else
        out.push(
          b.stockPlan({ name: "Option plan", reserved: reserve.toString(), boardApprovalDate: date, classId }),
        );
      return out;
    }
    case "safe": {
      whole(step.amount.split(".")[0] || "0", "SAFE amount");
      const stakeholderId = personId(s, step.investor, out, "INSTITUTION");
      out.push(
        b.safe({
          state: s,
          stakeholderId,
          amount: step.amount,
          cap: step.cap,
          discount: step.discount,
          mfn: step.mfn ?? false,
          date,
        }),
      );
      return out;
    }
    case "grant": {
      const [planId, plan] = [...s.plans.entries()][0] ?? [];
      if (!planId || !plan) throw new Error("Option grant: create the option pool first.");
      const quantity = whole(step.options, `${step.person}'s options`);
      const stakeholderId = personId(s, step.person, out, "INDIVIDUAL");
      out.push(
        ...b.optionGrant({
          state: s,
          stakeholderId,
          planId,
          classId: plan.data.stock_class_ids[0],
          quantity: quantity.toString(),
          strike: step.strike ?? "0.01",
          date,
          vestingTermsId: vestingId(s, step.vesting ?? DEFAULT_VESTING, out),
        }),
      );
      return out;
    }
  }
}

/**
 * Apply recordable steps to an in-memory copy of the log (the company's events, or nothing). The result is the
 * reduced state and the events that would be saved; nothing is written. Errors are the engine's own words.
 */
export async function stateFrom(
  base: VaultEvent[] | null,
  steps: RecordableStep[],
  today: string,
): Promise<{ state: State; events: VaultEvent[] } | { error: string }> {
  let log = (base ?? []).map((e) => `${canonicalLine(e)}\n`).join("");
  const events: VaultEvent[] = [];
  const ctx = defaultCtx("scenario");
  let state = reduce(base ?? [], today);
  for (const step of steps) {
    let drafts: EventDraft[];
    try {
      drafts = draftsFor(state, step, today);
    } catch (e) {
      return { error: (e as Error).message };
    }
    const r = await appendEvents(log, drafts, ctx);
    if (!r.ok) return { error: r.errors.join(" ") };
    log += r.text;
    events.push(...r.events);
    state = reduce([...(base ?? []), ...events], today);
  }
  return { state, events };
}
