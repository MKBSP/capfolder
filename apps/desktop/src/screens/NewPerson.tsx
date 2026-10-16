import { builders as b } from "@capfolder/core";
import { useState } from "react";
import { CrumbHeader } from "../components/Header";
import { ErrorList, Field } from "../components/ui";
import { useApp } from "../state";

/** A stakeholder without holdings yet (an investor about to sign, a new hire). */
export function NewPerson() {
  const app = useApp();
  const pre = (app.route.name === "newPerson" && app.route.prefill) || {}; // an Ask AI draft (docs/18)
  const [name, setName] = useState(pre.name ?? "");
  const [email, setEmail] = useState(pre.email ?? "");
  const [type, setType] = useState<"INDIVIDUAL" | "INSTITUTION">(
    pre.type === "INSTITUTION" ? "INSTITUTION" : "INDIVIDUAL",
  );
  const [errors, setErrors] = useState<string[] | null>(null);
  return (
    <>
      <CrumbHeader title="New person" back={{ name: "people" }} />
      <main className="narrow">
        <form
          className="card stack"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim()) return setErrors(["Enter a name."]);
            const errs = await app.run([
              b.stakeholder({ name: name.trim(), email: email.trim() || undefined, type }),
            ]);
            if (errs) return setErrors(errs);
            app.go({ name: "people" });
          }}
        >
          <Field label="Name">
            <input className="inp" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Email">
            <input className="inp" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <div className="row">
            <label className="row small">
              <input type="radio" checked={type === "INDIVIDUAL"} onChange={() => setType("INDIVIDUAL")} />{" "}
              Person
            </label>
            <label className="row small">
              <input type="radio" checked={type === "INSTITUTION"} onChange={() => setType("INSTITUTION")} />{" "}
              Company or fund
            </label>
          </div>
          <ErrorList errors={errors} />
          <button className="btn primary" type="submit">
            Add
          </button>
        </form>
      </main>
    </>
  );
}
