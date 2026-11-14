import { useMemo, useState } from "react";
import { STATE_LABEL } from "../engine/calendar";
import { addDays, fmtDate } from "../engine/dates";
import { evaluate, overviewOf, type Evaluation, type Scenario } from "../engine/scenario";
import { actionText, limitText } from "./plain";

interface Props {
  s: Scenario;
  ev: Evaluation;
  focus: "B" | "C";
  apply: (s: Scenario) => void;
}

type Q = "limits" | "delay" | "missing";

const QUESTIONS: { id: Q; text: string }[] = [
  { id: "limits", text: "What limits this option?" },
  { id: "delay", text: "What changes if sowing is delayed?" },
  { id: "missing", text: "What information is missing?" },
];

/** Inputs that are unknown or are assumptions without a local source. */
export function missingInputs(s: Scenario): string[] {
  const out: string[] = [];
  if (s.access !== "me") out.push("Who decides about the plot from April to September.");
  if (!s.water.lastTurn) out.push("The date of the last canal turn (ask the irrigation consortium).");
  if (!s.water.frequencyDays) out.push("How many days pass between canal turns.");
  if (s.water.frequencyDays && !s.water.lastTurn && !s.water.referenceTurn) out.push("The date of one canal turn, to place the others.");
  if (s.water.waterAfterClosure === "unknown") out.push("Whether you have other water after the canal closes.");
  for (const id of ["B", "C"] as const) if (s.covers[id].targetDurationDays === null) out.push(`How many days of ${id === "B" ? "grass" : "legume"} cover you want before ending it.`);
  out.push("How long before the next crop each cover must be ended, from local experience (the example uses US advice).");
  if (s.context.texture === "unknown") out.push("Soil type (sandy, loamy, clay).");
  if (s.context.waterlogging.kind === "unknown") out.push("Whether the plot gets waterlogged.");
  if (s.context.salinity.kind === "unknown") out.push("Salt in the soil, if a lab measured it.");
  if (s.context.healthProblemRecorded === "unknown") out.push("Pests or diseases in the last crops.");
  out.push("This year's canal closing date (the example uses the 2024 date).");
  return out;
}

function delayed(s: Scenario, id: "B" | "C", d: number): Scenario {
  return { ...s, covers: { ...s.covers, [id]: { ...s.covers[id], sowing: addDays(s.covers[id].sowing, d) } } };
}

export function Explainer({ s, ev, focus, apply }: Props) {
  const [q, setQ] = useState<Q | null>(null);
  const r = ev.strategies.find((x) => x.def.id === focus)!;
  const options = useMemo(() => {
    if (q !== "delay") return [];
    return [0, 7, 14].map((d) => {
      const sc = d === 0 ? s : delayed(s, focus, d);
      const rr = evaluate(sc).strategies.find((x) => x.def.id === focus)!;
      return { d, sc, rr, o: overviewOf(rr) };
    });
  }, [q, s, focus]);

  return (
    <section className="card" aria-labelledby="ex-h" id="questions">
      <div className="card-h">
        <h2 id="ex-h">Questions about this example</h2>
        <span className="sub">Answers come from the same date rules as the rest of the page. No AI is used.</span>
      </div>
      <div className="card-b">
        <div className="qbtns">
          {QUESTIONS.map((x) => (
            <button key={x.id} type="button" className="btn" aria-pressed={q === x.id} onClick={() => setQ(x.id)}>{x.text}</button>
          ))}
        </div>
        <div aria-live="polite">
          {q === "limits" && (
            <div className="answer">
              <p><strong>{r.variant?.name}: {STATE_LABEL[r.calendar.state]}.</strong> {limitText(r)}</p>
              <p>Next step: {actionText(r, s)}</p>
            </div>
          )}
          {q === "delay" && (
            <div className="answer">
              <p>The same example, with the {r.variant?.name.toLowerCase()} sown later.</p>
              <div className="tbl-scroll">
                <table className="data">
                  <thead>
                    <tr><th>Sowing</th>{options.map((x) => <th key={x.d} className="r">{x.d === 0 ? "as now" : `+${x.d} days`}<br /><span className="num">{fmtDate(x.rr.inputs.sowing!)}</span></th>)}</tr>
                  </thead>
                  <tbody>
                    <tr><td>Calendar time until the cover must end (days)</td>{options.map((x) => <td key={x.d} className="r num">{x.o.availableDays}</td>)}</tr>
                    <tr><td>Days until the last irrigation</td>{options.map((x) => <td key={x.d} className="r num">{x.o.lastTurnStatus === "upper-bound" ? "not known" : x.o.daysToLastTurn}</td>)}</tr>
                    <tr><td>Canal turns after sowing</td>{options.map((x) => <td key={x.d} className="r num">{x.o.turns === "unknown" ? "not known" : x.o.turns.replace(" (nominal)", "")}</td>)}</tr>
                    <tr><td>Result</td>{options.map((x) => <td key={x.d} className="r">{STATE_LABEL[x.rr.calendar.state]}</td>)}</tr>
                  </tbody>
                </table>
              </div>
              <div className="qbtns" style={{ marginTop: 8 }}>
                {options.filter((x) => x.d > 0).map((x) => (
                  <button key={x.d} type="button" className="btn small" onClick={() => apply(x.sc)}>Apply: sow {focus} on {fmtDate(x.rr.inputs.sowing!)}</button>
                ))}
              </div>
              <p className="chart-foot">Dates and turns only. A later sowing also changes the cold-night count further down.</p>
            </div>
          )}
          {q === "missing" && (
            <div className="answer">
              <p>Things this example does not know, or guesses:</p>
              <ul className="cell-list">{missingInputs(s).map((m) => <li key={m}>{m}</li>)}</ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
