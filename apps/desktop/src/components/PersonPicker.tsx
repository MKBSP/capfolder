import { builders as b, type EventDraft, normName, type State } from "@capfolder/core";
import { useApp } from "../state";
import { Field } from "./ui";

/** A new person carries its id from the moment it's chosen, so the form's drafts stay stable between renders. */
export type PersonChoice =
  | { id: string }
  | { newId: string; name: string; email: string; type: "INDIVIDUAL" | "INSTITUTION" };
export const newPerson = (type: "INDIVIDUAL" | "INSTITUTION" = "INDIVIDUAL"): PersonChoice => ({
  newId: b.newId("sh"),
  name: "",
  email: "",
  type,
});

/** A name from an Ask AI draft (docs/18): the person already on the cap table, or a new one with that name. */
export function personNamed(
  s: State | null,
  name: string,
  type: "INDIVIDUAL" | "INSTITUTION",
  email = "",
): PersonChoice {
  const k = normName(name);
  const id =
    s &&
    [...s.stakeholders.keys()].find(
      (x) => normName(String(s.stakeholders.get(x)?.name?.legal_name ?? "")) === k,
    );
  return id ? { id } : { ...newPerson(type), name, email };
}

/** Pick an existing stakeholder or describe a new one (created in the same batch as the form's events). */
export function PersonPicker(p: {
  label: string;
  value: PersonChoice;
  onChange(v: PersonChoice): void;
  defaultType?: "INDIVIDUAL" | "INSTITUTION";
}) {
  const s = useApp().latest;
  const people = s ? [...s.stakeholders.values()] : [];
  const isNew = !("id" in p.value);
  return (
    <div className="stack">
      <Field label={p.label}>
        <select
          className="inp"
          value={"id" in p.value ? p.value.id : "__new"}
          onChange={(e) =>
            p.onChange(e.target.value === "__new" ? newPerson(p.defaultType) : { id: e.target.value })
          }
        >
          <option value="__new">+ New person or entity</option>
          {people.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name?.legal_name}
            </option>
          ))}
        </select>
      </Field>
      {isNew && !("id" in p.value) ? (
        <div className="grid2">
          <Field label="Name">
            <input
              className="inp"
              value={p.value.name}
              onChange={(e) => p.onChange({ ...(p.value as object), name: e.target.value } as PersonChoice)}
            />
          </Field>
          <Field label="Email">
            <input
              className="inp"
              type="email"
              value={p.value.email}
              onChange={(e) => p.onChange({ ...(p.value as object), email: e.target.value } as PersonChoice)}
            />
          </Field>
        </div>
      ) : null}
    </div>
  );
}

/** The stakeholder id to use, plus the draft that creates them when they're new (null when the name is empty). */
export function resolvePerson(v: PersonChoice): { id: string; drafts: EventDraft[]; name: string } | null {
  if ("id" in v) return { id: v.id, drafts: [], name: "" };
  if (!v.name.trim()) return null;
  const d = b.stakeholder({
    id: v.newId,
    name: v.name.trim(),
    email: v.email.trim() || undefined,
    type: v.type,
  });
  return { id: v.newId, drafts: [d], name: v.name.trim() };
}
