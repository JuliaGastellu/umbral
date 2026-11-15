import { STATUS_LABEL, type Candidate, type Check, type Status, type Suggestion } from "../engine/recommend";

export interface SummaryState {
  tone: "ok" | "cond" | "warn";
  title: string;
  status: string;
  checks: string;
  note: string | null;
  /** Short form for the mobile bar: no repetition, fits two short lines. */
  short: string;
}

const TONE: Record<Status, SummaryState["tone"]> = {
  suggested: "ok",
  provisional: "cond",
  experimental: "cond",
  "partial-match": "cond",
  "not-for-this-goal": "cond",
  "not-on-these-dates": "warn",
  "not-for-this-system": "warn",
};

/** One compact reading of the current result, derived from the same state as the result itself. */
export function summarize(active: Candidate | null, sug: Pick<Suggestion, "main" | "headline">, review: { all: Check[] }, incomplete: boolean): SummaryState {
  const note = incomplete ? "A date is being edited: this is the last valid result." : null;
  if (!active) return { tone: "warn", title: sug.headline, status: "No option fits these inputs", checks: "Change the dates or the system to see options.", note, short: "No option fits" };
  const n = review.all.length;
  const checks = n === 0 ? "Nothing blocking in your inputs" : `${n} check${n === 1 ? "" : "s"} before sowing`;
  const tail = n ? ` · ${n} check${n === 1 ? "" : "s"}` : "";
  if (sug.main.length === 0) return { tone: "warn", title: active.name, status: `No main option fits · exploring: ${STATUS_LABEL[active.status]}`, checks, note, short: `Exploring ${active.name}${tail}` };
  return { tone: TONE[active.status], title: active.name, status: STATUS_LABEL[active.status], checks, note, short: `${active.name}${tail}` };
}

/** Compact, always-current result line for the editing area. Not a live region: it does not announce every keystroke. */
export function ResultSummary({ state }: { state: SummaryState }) {
  return (
    <div className={`result-sum ${state.tone}`} role="group" aria-label="Current result">
      <p className="rs-line">
        <span className="rs-k">Result now</span>
        <strong>{state.title}</strong>
        <span className={`rs-status ${state.tone}`}>{state.status}</span>
        <span className="rs-checks">{state.checks}</span>
        <a href="#result" className="rs-link">View result</a>
      </p>
      {state.note && <p className="rs-note">{state.note}</p>}
    </div>
  );
}
