// OCF payloads are validated by ajv against the vendored schemas, so `any` here is deliberate.
export type Data = Record<string, any>;

export interface EventMeta {
  source: string;
  device_id?: string;
  note?: string;
  doc_ids?: string[];
}

export interface VaultEvent {
  seq: number;
  id: string;
  ts: string;
  kind: "ocf" | "app";
  type: string;
  data: Data;
  meta: EventMeta;
  prev: string | string[];
  hash: string;
}

export interface EventDraft {
  kind: "ocf" | "app";
  type: string;
  data: Data;
  meta?: Partial<EventMeta>;
}

export interface Security {
  id: string; // OCF security_id
  txId: string; // OCF issuance transaction id
  kind: "stock" | "equity" | "convertible";
  stakeholderId: string;
  date: string;
  classId?: string;
  planId?: string;
  compensationType?: string;
  convertibleType?: string;
  originalQuantity: bigint;
  quantity: bigint; // outstanding now (0 when fully consumed)
  exercised: bigint;
  amount?: string; // convertibles: outstanding investment amount
  cap?: string;
  discount?: string;
  timing?: string;
  vestingTermsId?: string;
  vestingStart?: { date: string; conditionId: string };
  vestings?: { date: string; amount: string }[];
  stoppedAt?: string; // vesting stops at a cancellation/repurchase date
  earlyExercisable: boolean;
  note?: string; // e.g. "imported snapshot"
  price?: string; // stock: share price paid; options: exercise price
  priceCurrency?: string;
}

export interface Plan {
  data: Data;
  reserved: bigint;
  returned: bigint;
}

export interface Doc {
  data: Data;
  links: Set<string>;
  removed: boolean;
}

export interface State {
  asOf: string;
  issuer?: Data;
  stakeholders: Map<string, Data>;
  classes: Map<string, { data: Data; authorized: bigint }>;
  plans: Map<string, Plan>;
  vestingTerms: Map<string, Data>;
  securities: Map<string, Security>;
  docs: Map<string, Doc>;
  unknownEventTypes: string[];
  violations: string[]; // problems found while replaying (invariants 4, 5, bad references, bad numbers)
  allSecurityIds: Set<string>; // every security_id in the log, regardless of asOf (for picking new ids)
}

export interface Row {
  group: 0 | 1 | 2 | 3; // 0 stock, 1 equity comp, 2 pool, 3 convertibles
  date: string;
  securityId: string; // plan id for pool rows
  stakeholder: string;
  type: string;
  class: string;
  shares: bigint | null;
  vested: bigint | null;
  unvested: bigint | null;
  fdPercent: string;
  safeAmount: string;
  safeCap: string;
  safeDiscount: string;
  asConverted: string;
  docStatus: "signed" | "missing" | "";
  math: Record<string, string>;
}
