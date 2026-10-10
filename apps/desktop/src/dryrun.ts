import {
  appendEvents,
  capTableRows,
  type EventDraft,
  MAX_DATE,
  type Row,
  reduce,
  type State,
} from "@capfolder/core";
import { useEffect, useState } from "react";
import { useApp } from "./state";

/** Applies drafts to an in-memory copy of the log (nothing is written) so a form can show its effect and core's errors. */
export function useDryRun(drafts: EventDraft[] | null) {
  const app = useApp();
  const [result, setResult] = useState<{ state: State; rows: Row[]; errors: string[] | null } | null>(null);
  useEffect(() => {
    const v = app.vault;
    if (!v || !drafts?.length) return setResult(null);
    let current = true; // the latest input wins over a slower earlier run
    appendEvents(v.log, drafts, app.ctx).then((r) => {
      if (!current) return;
      if (!r.ok) return setResult({ state: reduce(v.events, app.asOf), rows: [], errors: r.errors });
      const state = reduce([...v.events, ...r.events], MAX_DATE);
      // Show the effect as of the later of the chosen date and the change's own date, so a change dated today shows up.
      const at = drafts.reduce(
        (d, x) => (typeof x.data.date === "string" && x.data.date > d ? x.data.date : d),
        app.asOf,
      );
      setResult({ state, rows: capTableRows(reduce([...v.events, ...r.events], at)), errors: null });
    });
    return () => {
      current = false;
    };
  }, [drafts, app.vault, app.ctx, app.asOf]);
  return result;
}
