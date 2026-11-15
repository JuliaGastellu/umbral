import { useEffect, useRef, useState } from "react";
import { addDays, diffDays, fmtDate, toDay, type ISODate } from "../engine/dates";
import type { Evaluation, Scenario } from "../engine/scenario";

interface Props {
  s: Scenario;
  ev: Evaluation;
  /** Cover shown on the calendar (sowing and end-by), if any. */
  cover: { name: string; sowing: ISODate | null; endBy: ISODate | null } | null;
}

/**
 * One shared calendar: field free, cover sowing, canal turns that are dated,
 * canal closure, the date the cover must be ended, soil preparation and the
 * next crop. The cover bar is calendar time, not predicted growth. No water is
 * drawn after the canal closes.
 */
export function PlanCalendar({ s, ev, cover }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const W = Math.max(520, w);
  const release = ev.effective.cal.release;
  const next = ev.effective.cal.nextCrop;
  const soil = ev.window.soilReady;
  const closure = s.water.closure;
  const a = addDays(release, -6);
  const b = addDays(next, 8);
  const span = Math.max(1, diffDays(a, b));
  const L = 92, R = 14;
  const x = (d: ISODate) => L + (Math.max(0, Math.min(span, diffDays(a, d))) / span) * (W - L - R);
  const sch = ev.schedule;
  const turnDates: ISODate[] = sch.kind === "exact" ? sch.dates.filter((d) => toDay(d) >= toDay(release)) : sch.kind === "last-only" ? [sch.lastTurn] : [];
  const rowY = { field: 30, cover: 66, canal: 102 };
  const H = 150;
  const months: ISODate[] = [];
  for (let d = `${a.slice(0, 7)}-01`; toDay(d) <= toDay(b); d = addDays(`${d.slice(0, 7)}-01`, 32).slice(0, 7) + "-01") if (toDay(d) >= toDay(a)) months.push(d);
  const label = `Calendar: field free ${fmtDate(release, true)}; ${cover?.sowing ? `${cover.name} sown ${fmtDate(cover.sowing, true)}, must be ended by ${cover.endBy ? fmtDate(cover.endBy, true) : "—"}; ` : ""}${turnDates.length ? `${turnDates.length} dated canal turn${turnDates.length === 1 ? "" : "s"} from the field-free date, last ${fmtDate(turnDates[turnDates.length - 1], true)}; ` : "canal turn dates not known; "}canal closes ${fmtDate(closure, true)}; soil preparation from ${fmtDate(soil, true)}; next crop ${fmtDate(next, true)}.`;
  return (
    <div className="plancal" ref={ref}>
      <div className="tbl-scroll" tabIndex={0}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="chart">
          {months.map((m) => (
            <g key={m}>
              <line x1={x(m)} x2={x(m)} y1={14} y2={H - 22} stroke="var(--border)" />
              <text x={x(m) + 3} y={H - 6} className="ax">{fmtDate(m).split(" ")[1]}</text>
            </g>
          ))}
          <text x={8} y={rowY.field + 5} className="ax strong">Field</text>
          <rect x={x(release)} y={rowY.field - 9} width={Math.max(2, x(soil) - x(release))} height={18} rx={4} fill="var(--primary-soft)" stroke="var(--primary)" />
          <rect x={x(soil)} y={rowY.field - 9} width={Math.max(2, x(next) - x(soil))} height={18} rx={4} fill="url(#hatch-prep)" stroke="var(--border-strong)" />
          <defs>
            <pattern id="hatch-prep" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="var(--bg)" /><line x1="0" y1="0" x2="0" y2="6" stroke="var(--border-strong)" strokeWidth="2" /></pattern>
          </defs>
          <circle cx={x(next)} cy={rowY.field} r={6} fill="var(--accent)" />
          <text x={Math.min(x(next) - 8, W - R - 4)} y={rowY.field - 14} textAnchor="end" className="ax">next crop {fmtDate(next)}</text>
          <text x={x(release) + 4} y={rowY.field - 14} className="ax">free {fmtDate(release)}</text>

          <text x={8} y={rowY.cover + 5} className="ax strong">Cover</text>
          {cover?.sowing && cover.endBy && toDay(cover.endBy) > toDay(cover.sowing) ? (
            <>
              <rect x={x(cover.sowing)} y={rowY.cover - 9} width={x(cover.endBy) - x(cover.sowing)} height={18} rx={4} fill="var(--ok-soft)" stroke="var(--ok)" />
              <text x={x(cover.sowing) + 6} y={rowY.cover + 4} className="ax">{cover.name}: calendar time, not growth</text>
              <line x1={x(cover.endBy)} x2={x(cover.endBy)} y1={rowY.cover - 12} y2={rowY.cover + 12} stroke="var(--conflict-ink)" strokeWidth={2} />
            </>
          ) : (
            <text x={L} y={rowY.cover + 4} className="ax">{cover ? "no calendar time for a cover on these dates" : "no cover in this plan"}</text>
          )}

          <text x={8} y={rowY.canal + 5} className="ax strong">Canal</text>
          {sch.kind === "phase-unknown" && (
            <text x={x(release) + 4} y={rowY.canal + 4} className="ax">a turn every {sch.frequencyDays} days; dates not known</text>
          )}
          {sch.kind === "unknown" && <text x={x(release) + 4} y={rowY.canal + 4} className="ax">turn dates not known</text>}
          {turnDates.map((d) => <rect key={d} x={x(d) - 3} y={rowY.canal - 8} width={6} height={16} rx={2} fill="var(--water)"><title>Canal turn {fmtDate(d, true)}</title></rect>)}
          <line x1={x(closure)} x2={x(closure)} y1={rowY.canal - 14} y2={rowY.canal + 14} stroke="var(--water-ink)" strokeWidth={2} />
          <text x={x(closure) + 5} y={rowY.canal + 4} className="ax" fill="var(--water-ink)">canal closed from {fmtDate(closure)}</text>
        </svg>
      </div>
      <ul className="plancal-key" aria-hidden="true">
        <li><span className="k k-field" />field free until the soil must be ready</li>
        <li><span className="k k-prep" />soil preparation</li>
        <li><span className="k k-cover" />cover, until it must be ended (red line)</li>
        <li><span className="k k-turn" />dated canal turn</li>
      </ul>
    </div>
  );
}
