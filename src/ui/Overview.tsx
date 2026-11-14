import { STATE_LABEL } from "../engine/calendar";
import { cropById } from "../engine/catalog";
import { fmtDate } from "../engine/dates";
import { overviewOf, type Evaluation, type Scenario } from "../engine/scenario";
import { actionText, LAST_TURN_STATUS, limitText, priorityLine } from "./plain";
import { fmtT } from "../engine/climate";
import type { ClimateReading } from "../engine/exposure";
import { biasNote } from "./ClimatePanel";
import { missingInputs } from "./Explainer";
import type { StationSummary } from "../engine/exposure";
import { CropIcon } from "./CropIcon";
import { COVER_PURPOSE } from "./purpose";

interface Props {
  ev: Evaluation;
  plan: Evaluation | null;
  s: Scenario;
  focus: "B" | "C";
  setFocus: (f: "B" | "C") => void;
  /** NASA POWER cold-night reading from this cover's sowing date. */
  cold: ClimateReading | null;
  station: StationSummary | null;
}

/** Re-exported for older imports. */
export { limitText as limitingText };

function Unknown({ text }: { text: string }) {
  return <span className="pill-needs">Needs data: {text}</span>;
}

function Delta({ now, before, unit }: { now: number | string | null; before: number | string | null; unit: string }) {
  if (before === null || before === now) return null;
  return <div className="ov-delta">Before "What if": {before}{unit}</div>;
}

export function Overview({ ev, plan, s, focus, setFocus, cold, station }: Props) {
  const r = ev.strategies.find((x) => x.def.id === focus)!;
  const p = plan?.strategies.find((x) => x.def.id === focus) ?? null;
  const o = overviewOf(r);
  const po = p ? overviewOf(p) : null;
  const lastKnown = o.lastTurnStatus === "stated" || o.lastTurnStatus === "nominal";
  const turnsKnown = o.turns !== "unknown" && !o.turns.startsWith("0–");
  const prev = cropById(s.previousCropId).name.replace(" (processing)", "");
  const next = cropById(s.nextCropId).name.replace(" (processing)", "");
  return (
    <section className="card stage overview" aria-labelledby="ov-h" id="overview">
      <div className="stage-n" aria-hidden="true">3</div>
      <div className="stage-b">
      <div className="ov-head">
        <div>
          <h2 id="ov-h">Compare options</h2>
          <p className="ov-sub">
            Main crops: {prev} harvested, field free {fmtDate(ev.effective.cal.release)}; {next} planted {fmtDate(ev.effective.cal.nextCrop)}. Winter cover in between: {r.variant?.name.toLowerCase()} (or none).
          </p>
        </div>
        <div className="seg ov-focus" role="radiogroup" aria-label="Cover shown">
          {(["B", "C"] as const).map((id) => {
            const x = ev.strategies.find((y) => y.def.id === id)!;
            return (
              <button key={id} type="button" role="radio" aria-checked={focus === id} onClick={() => setFocus(id)} className="crop-btn">
                <CropIcon id={x.variant?.id ?? "rye"} size={24} />
                <span>{x.variant?.name} <small>(winter cover)</small></span>
              </button>
            );
          })}
        </div>
      </div>
      <p className="ov-answer">
        <span className={`verdict ${r.calendar.state}`}>{STATE_LABEL[r.calendar.state]}</span>{" "}
        <strong>{r.variant?.name}</strong> sown on {fmtDate(r.inputs.sowing!)}: {limitText(r)}
      </p>
      <p className="ov-caveat">This checks dates and canal turns only. It does not say how well the cover will grow.</p>
      <div className="ov-tiles">
        <div className="ov-tile">
          <div className="ov-label">Calendar time available</div>
          <div className="ov-value">{o.availableDays ?? "—"} <span className="ov-unit">days</span></div>
          <div className="ov-why">From sowing until the cover must be ended ({r.calendar.terminationDeadline ? fmtDate(r.calendar.terminationDeadline) : "—"}) to prepare the soil for the {next.toLowerCase()}. Calendar days, not a growth prediction.</div>
          <Delta now={o.availableDays} before={po?.availableDays ?? null} unit=" days" />
        </div>
        <div className="ov-tile">
          <div className="ov-label">Time until the last irrigation</div>
          {lastKnown ? (
            <div className="ov-value">{o.daysToLastTurn} <span className="ov-unit">days</span></div>
          ) : (
            <Unknown text="last canal turn" />
          )}
          <div className="ov-why">
            {lastKnown
              ? `The new cover needs water to start. After ${fmtDate(o.lastTurnDate!)} the canal gives no more (${LAST_TURN_STATUS[o.lastTurnStatus!]}).`
              : `The new cover needs water to start. The canal closes on ${fmtDate(s.water.closure)} at the latest.`}
          </div>
          <Delta now={o.daysToLastTurn} before={po?.daysToLastTurn ?? null} unit=" days" />
        </div>
        <div className="ov-tile">
          <div className="ov-label">Canal turns remaining after sowing</div>
          {turnsKnown ? (
            <div className="ov-value">{o.turns.replace(" (nominal)", "")} <span className="ov-unit">{o.turns === "1" ? "turn" : "turns"}</span></div>
          ) : (
            <Unknown text="turn dates" />
          )}
          <div className="ov-why">Each turn is a chance to water the seed after sowing.{o.turnsStatus === "nominal" ? " Taken from the turn schedule; not confirmed." : ""}</div>
          <Delta now={o.turns} before={po?.turns ?? null} unit="" />
        </div>
        <div className="ov-tile nasa">
          <div className="ov-label"><span className="nasa-tag">NASA</span> Past years with {cold?.d ?? 30}+ days before the first night at or below {fmtT(cold?.t ?? 0)} °C</div>
          {cold && !cold.error ? (
            cold.summary.notEvaluable === cold.summary.total ? (
              <span className="pill-needs">Needs a longer period</span>
            ) : (
              <div className="ov-value">{cold.summary.met} <span className="ov-unit">of {cold.summary.total}</span></div>
            )
          ) : (
            <span className="pill-needs">Weather record not loaded</span>
          )}
          <div className="ov-why">Counted from sowing ({fmtDate(r.inputs.sowing!)}), NASA POWER {cold ? `${cold.summary.firstYear}–${cold.summary.lastYear}` : ""}. {biasNote(station, cold?.t ?? 0)}</div>
        </div>
      </div>
      {s.priority === "explore-cover" && COVER_PURPOSE[r.variant?.id ?? "rye"] && (
        <p className="ov-purpose"><strong>What the {r.variant?.name.toLowerCase()} is for:</strong> {COVER_PURPOSE[r.variant?.id ?? "rye"].text} <span className="opt-sub">({COVER_PURPOSE[r.variant?.id ?? "rye"].source})</span></p>
      )}
      <p className="ov-priority">{priorityLine(s, ev.strategies, focus)}</p>
      <p className="ov-next"><strong>Next step:</strong> {actionText(r, s)}</p>
      <p className="ov-not"><strong>What this does not tell you:</strong> whether the cover will establish or grow, how much water each turn brings, the weather of {ev.effective.cal.release.slice(0, 4)}, or any saving in money, yield or soil.</p>
      <div className="ov-links">
        <details className="more">
          <summary>What limits this option?</summary>
          <p>{limitText(r)} The check covers {r.calendar.covers.join("; ")}. It does not cover {r.calendar.notCovered.join("; ")}.</p>
        </details>
        <details className="more">
          <summary>What information is missing?</summary>
          <ul className="cell-list">{missingInputs(s).map((m) => <li key={m}>{m}</li>)}</ul>
        </details>
      </div>
      </div>
    </section>
  );
}
