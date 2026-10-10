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
