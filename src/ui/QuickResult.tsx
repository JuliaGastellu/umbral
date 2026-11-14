import { STATE_LABEL } from "../engine/calendar";
import { cropById } from "../engine/catalog";
import { fmtT } from "../engine/climate";
import { fmtDate, isValidISO, type ISODate } from "../engine/dates";
import type { ClimateReading } from "../engine/exposure";
import { overviewOf, type Evaluation, type Scenario } from "../engine/scenario";
import { CropIcon } from "./CropIcon";

interface Props {
  s: Scenario;
  ev: Evaluation;
  focus: "B" | "C";
  cold: ClimateReading | null;
  setRelease: (d: ISODate) => void;
  showImage: () => void;
}

const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

/** First-screen answer: the example result with the NASA number and one obvious action. */
export function QuickResult({ s, ev, focus, cold, setRelease, showImage }: Props) {
  const r = ev.strategies.find((x) => x.def.id === focus)!;
  const o = overviewOf(r);
  const prev = cropById(s.previousCropId).name.replace(" (processing)", "").toLowerCase();
  const stated = o.lastTurnStatus === "stated";
  const noWater = stated && o.daysToLastTurn !== null && o.daysToLastTurn < 0;
  return (
    <section className="quick" aria-labelledby="quick-h">
      <h2 id="quick-h" className="sr-only">Example result</h2>
      <div className="quick-main">
        <CropIcon id={r.variant?.id ?? "rye"} size={40} />
        <p>
          Example: the {prev} leaves the field on <strong>{fmtDate(ev.effective.cal.release)}</strong>; {r.variant?.name.toLowerCase()} sown that day{" "}
          <span className={`verdict ${r.calendar.state}`}>{STATE_LABEL[r.calendar.state]}</span>
          {noWater
            ? <>: you would sow after the last useful canal turn ({fmtDate(o.lastTurnDate!)}), so the seed would get no canal water.</>
            : <>: <strong>{stated ? `${o.daysToLastTurn} days of canal water` : "last canal turn not known"}</strong>, <strong>{o.turns === "unknown" ? "turns not known" : `${o.turns} turn${o.turns === "1" ? "" : "s"} after sowing`}</strong>.</>}{" "}
          {cold && !cold.error && cold.summary.notEvaluable < cold.summary.total && (
            <>
              <span className="nasa-tag">NASA</span> in <strong>{cold.summary.met} of {cold.summary.total}</strong> past years there were {cold.d}+ days before the first night at or below {fmtT(cold.t)} °C (a regional record that reads optimistic).
            </>
          )}
        </p>
      </div>
      <div className="quick-act">
        <label htmlFor="quick-date"><strong>Try another free date</strong></label>
        <input id="quick-date" className="input date" type="date" value={s.release} onChange={(e) => isValidISO(e.target.value) && setRelease(e.target.value)} />
        <button type="button" className="btn" onClick={showImage}>See the NASA image nearest this date</button>
        <button type="button" className="linkbtn" onClick={() => go("overview")}>Full result</button>
      </div>
    </section>
  );
}
