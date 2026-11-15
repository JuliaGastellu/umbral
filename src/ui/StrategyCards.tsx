import { STATE_LABEL } from "../engine/calendar";
import { SOURCES } from "../engine/catalog";
import { fmtDate } from "../engine/dates";
import type { ClimateReading } from "../engine/exposure";
import { overviewOf, type Evaluation, type Scenario } from "../engine/scenario";
import { CropIcon } from "./CropIcon";
import { actionText } from "./plain";
import { COVER_PURPOSE, LOCAL_VETCH_CONTEXT } from "./purpose";
import { fmtT } from "../engine/climate";

interface Props {
  ev: Evaluation;
  s: Scenario;
  whatIfActive: boolean;
  climateBy: Record<"A" | "B" | "C", ClimateReading | null>;
}

const WATER_AFTER: Record<string, string> = { yes: "yes (stated)", no: "no", unknown: "not known" };

/** One row per option, only what differs between them. Shared facts are stated once above. */
export function StrategyCards({ ev, s, whatIfActive, climateBy }: Props) {
  const b = ev.strategies[1];
  const turns = overviewOf(b).turns;
  const purposeFirst = s.priority === "explore-cover";
  const cold = climateBy.C;
  const purposeCell = (key: string) => {
    const p = COVER_PURPOSE[key];
    return (
      <td className="opt-purpose">
        {p.text}
        {p.source && <div className="opt-sub">{p.source}</div>}
        {(key === "vetch" || key === "vetch-oat") && cold && !cold.error && cold.summary.notEvaluable < cold.summary.total && (
          <div className="opt-link">
            <a href="#nasa-climate">For this sowing date ({fmtDate(cold.start)}): in {cold.summary.met} of {cold.summary.total} past years there were {cold.d}+ days before the first night at or below {fmtT(cold.t)} °C</a> (NASA POWER, reads optimistic; a night at or below {fmtT(cold.t)} °C is not the same as SARE's "killing frost").
          </div>
        )}
      </td>
    );
  };
  return (
    <section className="card" aria-labelledby="sc-h" id="options">
      <div className="card-h">
        <h2 id="sc-h">Three options for the winter</h2>
      </div>
      <div className="card-b">
        <p className="shared">
          Same for all three: field free {fmtDate(ev.effective.cal.release)}; last canal turn {s.water.lastTurn ? fmtDate(s.water.lastTurn) : "not known"} ({turns === "unknown" ? "turns after sowing not known" : `${turns} turn${turns === "1" ? "" : "s"} after sowing`}); canal closes {fmtDate(s.water.closure)}; other water after that: {WATER_AFTER[s.water.waterAfterClosure]}; soil ready by {fmtDate(ev.window.soilReady)}. The label checks dates only; it does not rank the covers.
        </p>
        <div className="tbl-scroll" tabIndex={0}>
          <table className="data options">
            <thead>
              <tr>
                <th scope="col">Option</th>
                {purposeFirst && <th scope="col">What it is for</th>}
                <th scope="col">Calendar check</th>
                <th scope="col" className="r">Calendar time</th>
                <th scope="col">Must be ended by</th>
                <th scope="col">Extra field work</th>
                {!purposeFirst && <th scope="col">What it is for</th>}
                <th scope="col">Next step</th>
              </tr>
            </thead>
            <tbody>
              {ev.strategies.map((r) => {
                const isA = r.def.id === "A";
                const c = r.calendar;
                const changed = whatIfActive && r.plan.state !== c.state;
                return (
                  <tr key={r.def.id}>
                    <th scope="row">
                      <span className="opt-name">
                        <CropIcon id={isA ? "leftovers" : r.variant?.id ?? "rye"} size={28} />
                        <span><strong>{isA ? "Leave it as now" : r.variant?.name}</strong><br /><small>{isA ? "no winter cover" : "winter cover"}</small></span>
                      </span>
                    </th>
                    {purposeFirst && purposeCell(isA ? "A" : r.variant?.id ?? "rye")}
                    <td>{isA ? <span className="verdict baseline">Baseline</span> : <span className={`verdict ${c.state}`}>{STATE_LABEL[c.state]}</span>}{changed && <div className="changed">before "What if": {STATE_LABEL[r.plan.state]}</div>}</td>
                    <td className="r num">{isA ? `${ev.window.days} days` : `${c.availableDays} days`}<div className="opt-sub">{isA ? "until soil preparation" : "from sowing"}</div></td>
                    <td>{isA ? "—" : <>{c.terminationDeadline ? fmtDate(c.terminationDeadline) : "—"}<div className="opt-sub">{r.inputs.terminationDays} days before soil ready ({r.variant?.terminationSourceId ? `${SOURCES[r.variant.terminationSourceId].short}, US` : "no source"})</div></>}</td>
                    <td>{isA ? "none" : "sow and end it"}</td>
                    {!purposeFirst && purposeCell(isA ? "A" : r.variant?.id ?? "rye")}
                    <td className="opt-next">{actionText(r, s)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="chart-foot">{LOCAL_VETCH_CONTEXT} No amounts of nitrogen, yield or savings are shown: Umbral does not compute them.</p>
      </div>
    </section>
  );
}
