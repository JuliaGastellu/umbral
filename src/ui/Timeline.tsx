import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { addDays, diffDays, fmtDate, fromDay, monthName, onYear, parts, toDay, type ISODate } from "../engine/dates";
import type { Evaluation, Scenario } from "../engine/scenario";
import { overviewOf } from "../engine/scenario";
import type { ClimateReading } from "../engine/exposure";
import { fmtT } from "../engine/climate";
import type { HlsObservation } from "../data";
import { STATE_LABEL } from "../engine/calendar";

export type HandleId = "release" | "sowB" | "sowC" | "nextCrop" | "lastTurn";

interface Props {
  scenario: Scenario;
  ev: Evaluation;
  plan: Evaluation | null;
  focus: "B" | "C";
  climate: ClimateReading | null;
  hls: HlsObservation[];
  hlsLabel: string;
  interval: [ISODate, ISODate];
  onInterval: (i: [ISODate, ISODate]) => void;
  selectedObs: string | null;
  onSelectObs: (id: string) => void;
  onHandle: (h: HandleId, date: ISODate) => void;
}

const LABEL_W = 132;
const PAD_R = 28;
const MIN_W = 820;
const BAR_H = 20;

/** Places a reference-season observation on the timeline by day and month. */
export function obsOnTimeline(obsDate: ISODate, domain: [number, number]): ISODate | null {
  const p = parts(obsDate);
  const y0 = parts(fromDay(domain[0])).y;
  const y1 = parts(fromDay(domain[1])).y;
  for (let y = y0; y <= y1; y++) {
    const c = onYear(p.m, p.d, y);
    const d = toDay(c);
    if (d >= domain[0] && d <= domain[1]) return c;
  }
  return null;
}

interface KeyMark {
  key: string;
  x: number;
  title: string;
  date: ISODate;
  color: string;
}

export function Timeline(p: Props) {
  const { ev, scenario } = p;
  const [evidence, setEvidence] = useState(true);
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(1000);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((e) => setWidth(Math.max(MIN_W, Math.floor(e[0].contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cal = ev.effective.cal;
  const domain = useMemo<[number, number]>(() => {
    const a = Math.min(toDay(cal.release), toDay(scenario.release), toDay(p.interval[0])) - 12;
    const b = Math.max(toDay(cal.nextCrop), toDay(scenario.nextCrop), toDay(p.interval[1])) + 14;
    return [a, b];
  }, [cal.release, cal.nextCrop, scenario.release, scenario.nextCrop, p.interval]);

  const Y = useMemo(() => {
    const top = 104;
    const y = { labels: 4, axis: 84, plot: top, A: top + 32, B: top + 64, C: top + 96, turns: top + 134, frost: top + 190, hls: top + 224, bottom: 0 };
    y.bottom = evidence ? y.hls + 32 : y.turns + 52;
    return y;
  }, [evidence]);

  const x0 = LABEL_W;
  const x1 = width - PAD_R;
  const sx = (iso: ISODate | number) => {
    const d = typeof iso === "number" ? iso : toDay(iso);
    return x0 + ((d - domain[0]) / (domain[1] - domain[0])) * (x1 - x0);
  };
  const invert = (x: number) => Math.round(domain[0] + ((x - x0) / (x1 - x0)) * (domain[1] - domain[0]));

  const drag = useRef<{ kind: "handle"; id: HandleId } | { kind: "brush"; from: number } | null>(null);
  const [brush, setBrush] = useState<[number, number] | null>(null);
  const svgX = (e: PointerEvent) => e.clientX - svgRef.current!.getBoundingClientRect().left;
  const onPointerDownHandle = (id: HandleId) => (e: PointerEvent) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drag.current = { kind: "handle", id };
  };
  const onPointerDownTrack = (e: PointerEvent) => {
    const x = svgX(e);
    if (x < x0) return;
    svgRef.current?.setPointerCapture(e.pointerId);
    drag.current = { kind: "brush", from: invert(x) };
    setBrush([invert(x), invert(x)]);
  };
  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const day = Math.min(domain[1], Math.max(domain[0], invert(svgX(e))));
    if (d.kind === "handle") p.onHandle(d.id, fromDay(day));
    else setBrush([d.from, day]);
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.kind === "brush" && brush) {
      const [a, b] = brush[0] <= brush[1] ? brush : [brush[1], brush[0]];
      if (b - a >= 3) p.onInterval([fromDay(a), fromDay(b)]);
      setBrush(null);
    }
  };
  const keyMove = (id: HandleId, current: ISODate) => (e: KeyboardEvent) => {
    const step = e.shiftKey ? 7 : 1;
    let delta = 0;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") delta = step;
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") delta = -step;
    else if (e.key === "PageUp") delta = 30;
    else if (e.key === "PageDown") delta = -30;
    if (!delta) return;
    e.preventDefault();
    p.onHandle(id, addDays(current, delta));
  };

  const months: { x: number; label: string; xEnd: number }[] = [];
  {
    let { y, m } = parts(fromDay(domain[0]));
    let cur = toDay(onYear(m, 1, y));
    while (cur <= domain[1]) {
      const nm = m === 12 ? 1 : m + 1;
      const ny = m === 12 ? y + 1 : y;
      const next = toDay(onYear(nm, 1, ny));
      months.push({ x: sx(Math.max(cur, domain[0])), xEnd: sx(Math.min(next, domain[1])), label: m === 1 || months.length === 0 ? `${monthName(m)} ${y}` : monthName(m) });
      cur = next;
      m = nm;
      y = ny;
    }
  }

  const sched = ev.schedule;
  const turnDates = sched.kind === "exact" ? sched.dates : [];
  const nominal = sched.kind === "exact" && !sched.endIsKnown;
  const closureX = sx(scenario.water.closure);
  const nextX = sx(cal.nextCrop);
  const soilX = sx(ev.window.soilReady);
  const relX = sx(cal.release);
  const focusR = ev.strategies.find((s) => s.def.id === p.focus)!;
  const fo = overviewOf(focusR);

  const keyMarks: KeyMark[] = [{ key: "release", x: relX, title: "Plot free", date: cal.release, color: "var(--primary)" }];
  if (fo.lastTurnDate) keyMarks.push({ key: "last", x: sx(fo.lastTurnDate), title: fo.lastTurnStatus === "upper-bound" ? "Canal closes" : fo.lastTurnStatus === "nominal" ? "Last turn (schedule)" : "Last turn", date: fo.lastTurnDate, color: "var(--water-ink)" });
  for (const id of ["B", "C"] as const) {
    const r = ev.strategies.find((s) => s.def.id === id)!;
    if (r.calendar.terminationDeadline) keyMarks.push({ key: `term${id}`, x: sx(r.calendar.terminationDeadline), title: id === "B" ? "End grass" : "End legume", date: r.calendar.terminationDeadline, color: id === "B" ? "var(--b-ink)" : "var(--c-ink)" });
  }
  keyMarks.push({ key: "next", x: nextX, title: "Next crop", date: cal.nextCrop, color: "var(--accent-ink)" });
  keyMarks.sort((a, b) => a.x - b.x);
  const rowOf: number[] = [];
  const lastXByRow = [-Infinity, -Infinity];
  for (const k of keyMarks) {
    const r = k.x - lastXByRow[0] > 104 ? 0 : k.x - lastXByRow[1] > 104 ? 1 : 0;
    rowOf.push(r);
    lastXByRow[r] = k.x;
  }

  const hlsMarks = useMemo(
    () => p.hls.map((o) => ({ o, at: obsOnTimeline(o.date, domain) })).filter((m): m is { o: HlsObservation; at: ISODate } => m.at !== null),
    [p.hls, domain],
  );
  const inInterval = (d: ISODate) => toDay(d) >= toDay(p.interval[0]) && toDay(d) <= toDay(p.interval[1]);
  const nInInterval = hlsMarks.filter((m) => inInterval(m.at)).length;

  const renderCover = (id: "B" | "C", y: number) => {
    const r = ev.strategies.find((s) => s.def.id === id)!;
    const sow = r.inputs.sowing!;
    const dl = r.calendar.terminationDeadline;
    const planR = p.plan?.strategies.find((s) => s.def.id === id);
    const invalid = r.calendar.state === "invalid";
    const hid: HandleId = id === "B" ? "sowB" : "sowC";
    const xs = sx(sow);
    const xd = dl ? sx(dl) : xs;
    const color = id === "B" ? "var(--b)" : "var(--c)";
    const ink = id === "B" ? "var(--b-ink)" : "var(--c-ink)";
    const target = r.inputs.targetDurationDays;
    const lbl = `${id}. ${r.def.name}: sowing ${fmtDate(sow)}, terminate by ${dl ? fmtDate(dl) : "—"}, ${r.calendar.availableDays} days. ${STATE_LABEL[r.calendar.state]}.`;
    return (
      <g>
        {planR && planR.inputs.sowing && planR.calendar.terminationDeadline && (
          <rect x={sx(planR.inputs.sowing)} y={y - 2} width={Math.max(1, sx(planR.calendar.terminationDeadline) - sx(planR.inputs.sowing))} height={BAR_H + 4} rx={4} fill="none" stroke={color} strokeDasharray="3 3" opacity={0.8} pointerEvents="none" />
        )}
        {!invalid && xd > xs && <rect x={xs} y={y} width={xd - xs} height={BAR_H} rx={4} fill={`url(#pat-${id})`} stroke={color} role="img" aria-label={lbl} />}
        {!invalid && xd <= xs && <rect x={xd} y={y} width={Math.max(2, xs - xd)} height={BAR_H} rx={2} fill="var(--conflict-soft)" stroke="var(--conflict)" strokeDasharray="2 2" role="img" aria-label={lbl} />}
        {dl && <rect x={xd} y={y + 4} width={Math.max(0, soilX - xd)} height={BAR_H - 8} fill="url(#pat-term)" stroke="var(--border-strong)" pointerEvents="none" />}
        {target !== null && !invalid && <line x1={sx(addDays(sow, target))} x2={sx(addDays(sow, target))} y1={y - 4} y2={y + BAR_H + 4} stroke={ink} strokeWidth={2} pointerEvents="none" />}
        {dl && xd - xs > 80 && (
          <g pointerEvents="none">
            <rect x={xs + 12} y={y + 1} width={String(r.calendar.availableDays).length * 8 + 46} height={BAR_H - 2} rx={3} fill="white" />
            <text x={xs + 16} y={y + 15} className="ax" fill={ink} style={{ fontWeight: 600 }}>{r.calendar.availableDays} days</text>
          </g>
        )}
        <Handle x={xs} y={y + BAR_H / 2} shape="circle" color={ink} label={`${id} sowing date`} value={sow} onPointerDown={onPointerDownHandle(hid)} onKeyDown={keyMove(hid, sow)} />
      </g>
    );
  };

  let frostBand: { a: number; b: number; m: number | null; open: boolean } | null = null;
  const frost = p.climate && !p.climate.error ? p.climate : null;
  if (frost) {
    const [q10, q50, q90] = frost.quantiles;
    if (q10 !== null) {
      const open = q90 === null;
      frostBand = { a: sx(addDays(frost.start, q10)), b: open ? sx(frost.end) : sx(addDays(frost.start, q90!)), m: q50 === null ? null : sx(addDays(frost.start, q50)), open };
    }
  }
  const brushRange = brush ? (brush[0] <= brush[1] ? brush : [brush[1], brush[0]]) : null;
  const bracket = focusR.inputs.sowing && fo.lastTurnDate && fo.daysToLastTurn !== null && fo.daysToLastTurn >= 0 ? { a: sx(focusR.inputs.sowing), b: sx(fo.lastTurnDate), d: fo.daysToLastTurn } : null;

  return (
    <div className="card tl-card">
      <div className="tl-head">
        <div className="tl-title">
          <h2 id="cal-h">When does each option start and end?</h2>
          <p className="answer-line">{calendarAnswer(ev)}</p>
        </div>
        <label className="chk tl-evidence">
          <input type="checkbox" checked={evidence} onChange={(e) => setEvidence(e.target.checked)} /> Show past cold nights and satellite dates
        </label>
      </div>
      <div className="tl-scroll" ref={wrapRef}>
        <svg ref={svgRef} className="tl-svg" width={width} height={Y.bottom + 8} role="group" aria-label="Calendar from release to the next crop. Use the handles to move dates: arrow keys move 1 day, Shift + arrow 7 days." onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
          {evidence && <rect x={x0} y={Y.plot - 10} width={x1 - x0} height={Y.bottom - Y.plot + 10} fill="transparent" onPointerDown={onPointerDownTrack} style={{ cursor: "crosshair" }} />}
          {months.map((m, i) => (
            <g key={i} pointerEvents="none">
              {i % 2 === 1 && <rect x={m.x} y={Y.plot - 10} width={m.xEnd - m.x} height={Y.bottom - Y.plot + 10} fill="oklch(95.5% 0.012 95)" />}
              {m.xEnd - m.x > 30 && <text x={m.x + 4} y={Y.axis} className="ax strong">{m.label}</text>}
              <line x1={m.x} x2={m.x} y1={Y.axis + 4} y2={Y.plot - 10} stroke="var(--border-strong)" />
            </g>
          ))}

          <g pointerEvents="none">
            {keyMarks.map((k, i) => {
              const ly = Y.labels + rowOf[i] * 34;
              const anchorEnd = k.x > x1 - 90;
              return (
                <g key={k.key}>
                  <line x1={k.x} x2={k.x} y1={ly + 31} y2={Y.C + BAR_H + 6} stroke={k.color} strokeWidth={1} strokeDasharray="2 3" opacity={0.7} />
                  <text x={anchorEnd ? k.x - 4 : k.x + 4} y={ly + 13} textAnchor={anchorEnd ? "end" : "start"} className="key-title" fill={k.color}>{k.title}</text>
                  <text x={anchorEnd ? k.x - 4 : k.x + 4} y={ly + 28} textAnchor={anchorEnd ? "end" : "start"} className="key-date">{fmtDate(k.date)}</text>
                </g>
              );
            })}
          </g>

          {evidence && (
            <g pointerEvents="none">
              <rect x={sx(p.interval[0])} y={Y.plot - 10} width={Math.max(1, sx(p.interval[1]) - sx(p.interval[0]))} height={Y.bottom - Y.plot + 10} fill="oklch(62% 0.1 230 / 0.07)" stroke="oklch(62% 0.1 230 / 0.35)" strokeDasharray="4 3" />
              {brushRange && <rect x={sx(brushRange[0])} y={Y.plot - 10} width={Math.max(1, sx(brushRange[1]) - sx(brushRange[0]))} height={Y.bottom - Y.plot + 10} fill="oklch(62% 0.1 230 / 0.15)" />}
            </g>
          )}

          <g pointerEvents="none">
            <text x={12} y={Y.plot + 15} className="lane-label strong">Plot</text>
            <text x={12} y={Y.A + 15} className="lane-label strong">Leave as now</text>
            <text x={12} y={Y.B + 15} className="lane-label strong">{ev.strategies[1].variant?.name}</text>
            <text x={12} y={Y.C + 15} className="lane-label strong">{ev.strategies[2].variant?.name}</text>
            <text x={12} y={Y.turns + 15} className="lane-label strong">Canal turns</text>
            {evidence && <text x={12} y={Y.frost + 15} className="lane-label">Cold night ≤ {frost ? fmtT(frost.t) : "T"} °C</text>}
            {evidence && <text x={12} y={Y.hls + 15} className="lane-label">Satellite 2024</text>}
          </g>

          <g pointerEvents="none">
            <rect x={relX} y={Y.plot + 6} width={Math.max(0, soilX - relX)} height={8} rx={4} fill="var(--primary-soft)" stroke="var(--primary)" strokeWidth={0.8} />
            <rect x={soilX} y={Y.plot + 3} width={Math.max(0, nextX - soilX)} height={14} fill="url(#pat-prep)" stroke="var(--accent)" strokeWidth={0.8} />
          </g>
          <g pointerEvents="none">
            <rect x={relX} y={Y.A} width={Math.max(2, soilX - relX)} height={BAR_H} rx={4} fill="var(--a)" role="img" aria-label={`A. Current practice: ${fmtDate(cal.release)} to ${fmtDate(ev.window.soilReady)}, ${ev.window.days} days.`} />
            {soilX - relX > 150 && <text x={relX + 10} y={Y.A + 15} fill="white" className="ax">leftovers, bare soil or weeds</text>}
          </g>
          {renderCover("B", Y.B)}
          {renderCover("C", Y.C)}

          <g>
            <rect x={x0} y={Y.turns} width={1} height={1} fill="transparent" role="img" aria-label={turnsAria(ev, scenario)} />
            {sched.kind === "exact" &&
              turnDates.map((d) => (
                <g key={d} pointerEvents="none">
                  <line x1={sx(d)} x2={sx(d)} y1={Y.turns + 1} y2={Y.turns + BAR_H - 1} stroke="var(--water)" strokeWidth={4} strokeLinecap="round" strokeDasharray={nominal ? "3 2" : undefined} />
                  <title>{nominal ? "Nominal turn" : "Turn"} {fmtDate(d)}</title>
                </g>
              ))}
            {sched.kind !== "exact" && (
              <g pointerEvents="none">
                <rect x={relX} y={Y.turns + 3} width={Math.max(0, Math.min(closureX, x1) - relX)} height={BAR_H - 6} rx={3} fill="var(--water-soft)" stroke="var(--water)" strokeDasharray="3 2" />
                <text x={relX + 6} y={Y.turns + 15} className="ax" fill="var(--water-ink)">{sched.kind === "phase-unknown" ? `every ${sched.frequencyDays} days, dates not known` : sched.kind === "last-only" ? "earlier turn dates not known" : "turn dates not known"}</text>
              </g>
            )}
            {bracket && bracket.b - bracket.a > 24 && (
              <g pointerEvents="none">
                <path d={`M${bracket.a} ${Y.turns + BAR_H + 6} v5 H${bracket.b} v-5`} fill="none" stroke="var(--water-ink)" strokeWidth={1.4} />
                <text x={(bracket.a + bracket.b) / 2} y={Y.turns + BAR_H + 26} textAnchor="middle" className="ax" fill="var(--water-ink)" style={{ fontWeight: 600 }}>{fo.lastTurnStatus === "upper-bound" ? "up to " : ""}{bracket.d} days of canal water</text>
              </g>
            )}
            {closureX <= x1 && (
              <g pointerEvents="none">
                <line x1={closureX} x2={closureX} y1={Y.turns - 6} y2={Y.turns + BAR_H + 4} stroke="var(--water-ink)" strokeWidth={1.4} />
                <text x={closureX + 4} y={Y.turns - 4} className="ax" fill="var(--water-ink)">canal closes</text>
              </g>
            )}
            {scenario.water.lastTurn && <Handle x={sx(scenario.water.lastTurn)} y={Y.turns + BAR_H / 2} shape="square" color="var(--water-ink)" label="Last irrigation turn" value={scenario.water.lastTurn} onPointerDown={onPointerDownHandle("lastTurn")} onKeyDown={keyMove("lastTurn", scenario.water.lastTurn)} />}
          </g>

          {evidence && (
            <g role="img" aria-label={frostAria(frost)} pointerEvents="none">
              {frostBand && (
                <>
                  <rect x={frostBand.a} y={Y.frost + 5} width={Math.max(2, frostBand.b - frostBand.a)} height={BAR_H - 10} rx={5} fill="oklch(85% 0.04 250)" />
                  {frostBand.open && <path d={`M${frostBand.b - 6} ${Y.frost + 3} L${frostBand.b} ${Y.frost + 10} L${frostBand.b - 6} ${Y.frost + 17}`} fill="none" stroke="var(--frost)" strokeWidth={1.5} />}
                  {frostBand.m !== null && <line x1={frostBand.m} x2={frostBand.m} y1={Y.frost} y2={Y.frost + BAR_H} stroke="oklch(45% 0.08 250)" strokeWidth={2} />}
                  <text x={Math.min(frostBand.b + 6, x1 - 230)} y={Y.frost + 15} className="ax" fill="var(--muted)">first cold night in 8 of 10 past years</text>
                </>
              )}
            </g>
          )}
          {evidence &&
            hlsMarks.map(({ o, at }) => {
              const x = sx(at);
              const hi = inInterval(at);
              const sel = p.selectedObs === o.id;
              const fill = o.quality === "clear" ? "var(--primary)" : o.quality === "partial" ? "url(#pat-term)" : "white";
              return (
                <g
                  key={o.id}
                  className="hls-tick"
                  tabIndex={0}
                  role="button"
                  aria-pressed={sel}
                  aria-label={`HLS ${o.sensor} image of ${fmtDate(o.date, true)}, ${o.quality}, ${o.cleanPixels} of ${o.pixels} pixels clear`}
                  onClick={() => p.onSelectObs(o.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      p.onSelectObs(o.id);
                    }
                  }}
                  opacity={hi ? 1 : 0.35}
                >
                  <rect className="hit" x={x - 4} y={Y.hls - 1} width={8} height={BAR_H + 2} fill="transparent" />
                  <rect x={x - 2.5} y={Y.hls + (o.sensor === "L30" ? 1 : 9)} width={5} height={10} fill={fill} stroke="var(--primary)" strokeWidth={1} />
                  {sel && <rect x={x - 5} y={Y.hls - 3} width={10} height={BAR_H + 6} fill="none" stroke="var(--accent)" strokeWidth={2} rx={2} />}
                </g>
              );
            })}

          <line x1={nextX} x2={nextX} y1={Y.plot - 10} y2={Y.bottom} stroke="var(--accent)" strokeWidth={2.5} pointerEvents="none" />
          <Handle x={nextX} y={Y.plot - 4} shape="flag" color="var(--accent-ink)" label="Next-crop date" value={cal.nextCrop} onPointerDown={onPointerDownHandle("nextCrop")} onKeyDown={keyMove("nextCrop", cal.nextCrop)} />
          <Handle x={relX} y={Y.plot + 10} shape="diamond" color="var(--primary)" label="Release date" value={cal.release} onPointerDown={onPointerDownHandle("release")} onKeyDown={keyMove("release", cal.release)} />
        </svg>
      </div>
      <div className="tl-help">
        <span>Drag a round or diamond marker to move a date, or select it and use the arrow keys (Shift moves a week). The date boxes in steps 1 and 2 do the same.</span>
        {evidence && (
          <span>
            Bottom rows: the blue bar spans the first cold night in 8 of 10 past years (regional record, probably later than on your plot); squares are 2024 satellite dates, {nInInterval} of them inside the shaded period. Drag across the rows to change that period.
          </span>
        )}
      </div>
    </div>
  );
}

export function calendarAnswer(ev: Evaluation): string {
  const b = ev.strategies[1];
  const c = ev.strategies[2];
  const fo = overviewOf(b);
  const last = fo.lastTurnStatus === "stated" ? `last canal turn ${fmtDate(fo.lastTurnDate!)}` : fo.lastTurnStatus === "nominal" ? `last turn on the schedule ${fmtDate(fo.lastTurnDate!)} (not confirmed)` : `last canal turn not known (canal closes ${fmtDate(fo.lastTurnDate!)})`;
  return `Sow on ${fmtDate(b.inputs.sowing!)}; ${last}; end the grass by ${b.calendar.terminationDeadline ? fmtDate(b.calendar.terminationDeadline) : "—"} or the legume by ${c.calendar.terminationDeadline ? fmtDate(c.calendar.terminationDeadline) : "—"}; next crop on ${fmtDate(ev.effective.cal.nextCrop)}.`;
}

function turnsAria(ev: Evaluation, s: Scenario): string {
  const sc = ev.schedule;
  if (sc.kind === "exact") return `Irrigation turns${sc.endIsKnown ? "" : " (nominal, not confirmed)"}: ${sc.dates.map((d) => fmtDate(d)).join(", ") || "none"}. Canal closure ${fmtDate(s.water.closure)}.`;
  if (sc.kind === "phase-unknown") return `Irrigation turns every ${sc.frequencyDays} days, dates unknown, up to closure on ${fmtDate(s.water.closure)}.`;
  return `Irrigation turn dates unknown; canal closure ${fmtDate(s.water.closure)}.`;
}

function frostAria(f: ClimateReading | null): string {
  if (!f) return "Frost timing not available.";
  const [a, m, b] = f.quantiles;
  const t = (q: number | null) => (q === null ? "after the search end" : fmtDate(addDays(f.start, q)));
  return `First day with a minimum at or below ${fmtT(f.t)} degrees after ${fmtDate(f.start)}, NASA POWER regional reanalysis: 10 % of years by ${t(a)}, half by ${t(m)}, 90 % by ${t(b)}.`;
}

function Handle(props: { x: number; y: number; shape: "circle" | "diamond" | "flag" | "square"; color: string; label: string; value: ISODate; onPointerDown: (e: PointerEvent) => void; onKeyDown: (e: KeyboardEvent) => void }) {
  const { x, y, shape, color } = props;
  let mark;
  if (shape === "circle") mark = <circle cx={x} cy={y} r={8} fill="white" stroke={color} strokeWidth={2.5} />;
  else if (shape === "diamond") mark = <path d={`M${x} ${y - 10} L${x + 10} ${y} L${x} ${y + 10} L${x - 10} ${y} Z`} fill={color} stroke="white" strokeWidth={1.5} />;
  else if (shape === "square") mark = <rect x={x - 6} y={y - 8} width={12} height={16} rx={2} fill="white" stroke={color} strokeWidth={2.5} />;
  else mark = <path d={`M${x} ${y - 14} L${x + 11} ${y - 8} L${x} ${y - 2} Z`} fill={color} />;
  return (
    <g className="handle" tabIndex={0} role="slider" aria-label={props.label} aria-valuetext={fmtDate(props.value, true)} aria-valuenow={diffDays("1970-01-01", props.value)} onPointerDown={props.onPointerDown} onKeyDown={props.onKeyDown}>
      <circle className="handle-ring" cx={x} cy={shape === "flag" ? y - 8 : y} r={14} fill="transparent" />
      {mark}
      <title>{props.label}: {fmtDate(props.value, true)}</title>
    </g>
  );
}
