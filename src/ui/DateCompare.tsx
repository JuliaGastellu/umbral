import { useMemo } from "react";
import { STATE_LABEL } from "../engine/calendar";
import { compareDates, type DateSide } from "../engine/compare";
import { fmtT, type DailySeries } from "../engine/climate";
import { addDays, fmtDate, isValidISO, parts, toDay, type ISODate } from "../engine/dates";
import { climateReading, type ClimateSettings } from "../engine/exposure";
import type { Scenario } from "../engine/scenario";
import { CropIcon } from "./CropIcon";

interface Props {
  s: Scenario;
  alt: ISODate;
  setAlt: (d: ISODate) => void;
  focus: "B" | "C";
  series: DailySeries | null;
  cfg: ClimateSettings;
  apply: (d: ISODate) => void;
}

const W = 720;
const L = 132;
const R = 20;

function signed(n: number, unit: string): string {
  if (n === 0) return "same";
  return `${n > 0 ? "+" : "−"}${Math.abs(n)} ${unit}`;
}

export function DateCompare({ s, alt, setAlt, focus, series, cfg, apply }: Props) {
  const { plan, proposed } = useMemo(() => compareDates(s, alt), [s, alt]);
  const cold = useMemo(() => {
    if (!series) return null;
    const c = { ...cfg, strategy: focus };
    const a = climateReading(plan.ev, series, c);
    const b = climateReading(proposed.ev, series, c);
    return a.error || b.error ? null : { plan: a.summary, proposed: b.summary, t: a.t, d: a.d };
  }, [series, cfg, focus, plan, proposed]);
  const cover = plan.ev.strategies.find((x) => x.def.id === focus)!;
  const name = cover.variant?.name ?? "cover";
  const p = plan[focus];
  const q = proposed[focus];
  const yr = parts(s.release).y;

  const sentence = (() => {
    if (p.daysToLastTurn === null || q.daysToLastTurn === null || p.lastTurnStatus !== "stated") {
      return `With the last canal turn unknown, both dates depend on that turn. The ${name.toLowerCase()} has ${q.availableDays} days of calendar time from ${fmtDate(alt)} and ${p.availableDays} days from ${fmtDate(s.release)}.`;
    }
    const water = q.daysToLastTurn - p.daysToLastTurn;
    const turns = Number(q.turns) - Number(p.turns);
    const amount = (n: number, unit: string) => `${Math.abs(n)} ${n >= 0 ? "more" : "fewer"} ${unit}${Math.abs(n) === 1 ? "" : "s"}`;
    if (water === 0) return `Both dates leave the same canal water: the last turn is on ${fmtDate(p.lastTurnDate!)} either way.`;
    return `Freeing the field on ${fmtDate(alt)} instead of ${fmtDate(s.release)} gives the ${name.toLowerCase()} ${amount(water, "day")} of canal water and ${Number.isFinite(turns) ? amount(turns, "canal turn") : "a different number of turns"}, because the last turn stays on ${fmtDate(p.lastTurnDate!)} whichever date you choose.`;
  })();

  return (
    <section className="card" aria-labelledby="dc-h" id="compare-dates">
      <div className="card-h">
        <h2 id="dc-h">What changes if the field is free on another date?</h2>
      </div>
      <div className="card-b">
        <p className="answer-line">{sentence}</p>
        <div className="dc-controls">
          <div className="field">
            <span className="lbl">Your plan</span>
            <div className="dc-date plan">{fmtDate(s.release, true)}</div>
          </div>
          <div className="field">
            <label htmlFor="dc-alt">Compare with</label>
            <input id="dc-alt" className="input date" type="date" value={alt} onChange={(e) => isValidISO(e.target.value) && setAlt(e.target.value)} />
          </div>
          <div className="presets" aria-label="Quick dates to compare">
            {([["−15 days", -15], ["−7 days", -7], ["+7 days", 7], ["+15 days", 15]] as const).map(([l, d]) => (
              <button key={l} type="button" className="btn small" onClick={() => setAlt(addDays(s.release, d))}>{l}</button>
            ))}
            <button type="button" className="btn small" onClick={() => setAlt(`${yr}-03-25`)}>25 Mar</button>
          </div>
          <button type="button" className="btn" onClick={() => apply(alt)} disabled={alt === s.release}>Make {fmtDate(alt)} my plan</button>
        </div>
        <TwoTimelines plan={plan} proposed={proposed} focus={focus} name={name} />
        <div className="tbl-scroll">
          <table className="data dc-table">
            <caption className="sr-only">Plan compared with the other date</caption>
            <thead>
              <tr><th scope="col">For the {name.toLowerCase()}</th><th scope="col" className="r">Plan: {fmtDate(s.release)}</th><th scope="col" className="r">Other: {fmtDate(alt)}</th><th scope="col" className="r">Difference</th></tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Days of canal water left after sowing</th>
                <td className="r num">{p.lastTurnStatus === "stated" ? p.daysToLastTurn : "not known"}</td>
                <td className="r num">{q.lastTurnStatus === "stated" ? q.daysToLastTurn : "not known"}</td>
                <td className="r num">{p.lastTurnStatus === "stated" && p.daysToLastTurn !== null && q.daysToLastTurn !== null ? signed(q.daysToLastTurn - p.daysToLastTurn, "days") : "—"}</td>
              </tr>
              <tr>
                <th scope="row">Canal turns after sowing</th>
                <td className="r num">{p.turns === "unknown" ? "not known" : p.turns}</td>
                <td className="r num">{q.turns === "unknown" ? "not known" : q.turns}</td>
                <td className="r num">{/^\d+$/.test(p.turns) && /^\d+$/.test(q.turns) ? signed(Number(q.turns) - Number(p.turns), "turns") : "—"}</td>
              </tr>
              <tr>
                <th scope="row">Calendar time until the cover must end</th>
                <td className="r num">{p.availableDays} days</td>
                <td className="r num">{q.availableDays} days</td>
                <td className="r num">{p.availableDays !== null && q.availableDays !== null ? signed(q.availableDays - p.availableDays, "days") : "—"}</td>
              </tr>
              <tr>
                <th scope="row">Calendar check</th>
                <td className="r">{STATE_LABEL[plan.ev.strategies.find((x) => x.def.id === focus)!.calendar.state]}</td>
                <td className="r">{STATE_LABEL[proposed.ev.strategies.find((x) => x.def.id === focus)!.calendar.state]}</td>
                <td className="r">—</td>
              </tr>
              {cold && (
                <tr>
                  <th scope="row">Past years with {cold.d}+ days before the first night at or below {fmtT(cold.t)} °C</th>
                  <td className="r num">{cold.plan.met} of {cold.plan.total}</td>
                  <td className="r num">{cold.proposed.met} of {cold.proposed.total}</td>
                  <td className="r num">{signed(cold.proposed.met - cold.plan.met, "years")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="chart-foot">Calendar time is the number of days between sowing and the date the cover must be ended. It is not a prediction of growth: winter cold and the water actually applied decide that. Cold-night years come from a regional weather record that tends to be optimistic for valley-floor plots.</p>
      </div>
    </section>
  );
}

function TwoTimelines({ plan, proposed, focus, name }: { plan: DateSide; proposed: DateSide; focus: "B" | "C"; name: string }) {
  const rows = [
    { key: "plan", label: "Your plan", side: plan },
    { key: "other", label: "Other date", side: proposed },
  ];
  const lastTurn = plan[focus].lastTurnDate;
  const closure = plan.scenario.water.closure;
  const start = Math.min(toDay(plan.date), toDay(proposed.date)) - 6;
  const endDate = lastTurn ? addDays(lastTurn, 0) : closure;
  const end = Math.max(toDay(endDate), toDay(closure)) + 22;
  const sx = (d: ISODate) => L + ((toDay(d) - start) / (end - start)) * (W - L - R);
  const H = 64 + rows.length * 74;
  const ticks: ISODate[] = [];
  for (let d = start; d <= end; d++) {
    const iso = addDays(plan.date, d - toDay(plan.date));
    if (iso.endsWith("-01") || iso.endsWith("-15")) ticks.push(iso);
  }
  return (
    <div className="tbl-scroll">
      <svg width={W} height={H} className="dc-svg" role="img" aria-label={`Two timelines. Your plan: field free ${fmtDate(plan.date)}, ${plan[focus].daysToLastTurn ?? "unknown"} days of canal water. Other date: field free ${fmtDate(proposed.date)}, ${proposed[focus].daysToLastTurn ?? "unknown"} days of canal water.`}>
        {ticks.map((d) => (
          <g key={d}>
            <line x1={sx(d)} x2={sx(d)} y1={40} y2={H - 8} stroke="var(--border)" />
            <text x={sx(d) + 3} y={H - 0} className="ax">{fmtDate(d)}</text>
          </g>
        ))}
        {lastTurn && (
          <g>
            <line x1={sx(lastTurn)} x2={sx(lastTurn)} y1={22} y2={H - 14} stroke="var(--water-ink)" strokeWidth={2} />
            <text x={sx(lastTurn) + 4} y={18} className="ax strong" fill="var(--water-ink)">Last canal turn {fmtDate(lastTurn)}</text>
          </g>
        )}
        <g>
          <line x1={sx(closure)} x2={sx(closure)} y1={30} y2={H - 14} stroke="var(--water-ink)" strokeDasharray="4 3" />
          <text x={sx(closure) + 4} y={36} className="ax" fill="var(--water-ink)">canal closes {fmtDate(closure)}</text>
        </g>
        {rows.map((r, i) => {
          const y = 56 + i * 74;
          const o = r.side[focus];
          const sow = r.side.ev.strategies.find((x) => x.def.id === focus)!.inputs.sowing!;
          const turns = r.side.ev.schedule.kind === "exact" ? r.side.ev.schedule.dates : [];
          return (
            <g key={r.key}>
              <text x={8} y={y + 14} className="ax strong">{r.label}</text>
              <text x={8} y={y + 32} className="ax">field free {fmtDate(r.side.date)}</text>
              <line x1={L} x2={W - R} y1={y + 20} y2={y + 20} stroke="var(--border-strong)" />
              {turns.map((d) => {
                const after = toDay(d) >= toDay(sow);
                return <line key={d} x1={sx(d)} x2={sx(d)} y1={y + 8} y2={y + 32} stroke="var(--water)" strokeWidth={after ? 5 : 2} opacity={after ? 1 : 0.35} strokeLinecap="round"><title>{after ? "Turn after sowing" : "Turn before sowing (does not count)"} {fmtDate(d)}</title></line>;
              })}
              {o.lastTurnStatus === "stated" && o.daysToLastTurn !== null && o.daysToLastTurn >= 0 && (
                <g>
                  <path d={`M${sx(sow)} ${y + 40} v5 H${sx(o.lastTurnDate!)} v-5`} fill="none" stroke="var(--water-ink)" strokeWidth={1.5} />
                  <text x={(sx(sow) + sx(o.lastTurnDate!)) / 2} y={y + 60} textAnchor="middle" className="ax strong" fill="var(--water-ink)">{o.daysToLastTurn} days of water, {o.turns} turn{o.turns === "1" ? "" : "s"}</text>
                </g>
              )}
              <g transform={`translate(${sx(sow) - 12} ${y + 6})`}><CropIcon id={focus === "B" ? (r.side.ev.strategies[1].variant?.id ?? "rye") : (r.side.ev.strategies[2].variant?.id ?? "vetch")} size={24} /></g>
              <text x={sx(sow) + 14} y={y + 4} className="ax" fill="var(--text)">sow {name.toLowerCase()}</text>
            </g>
          );
        })}
      </svg>
      <p className="chart-foot">Thick blue marks: canal turns after sowing. Faint marks: turns before sowing, which do not help the new cover.</p>
    </div>
  );
}
