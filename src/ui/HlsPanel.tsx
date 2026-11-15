import { useEffect, useId, useMemo, useRef, useState } from "react";
import { diffDays, fmtDate, onYear, parts, type ISODate } from "../engine/dates";
import type { HlsInterannual, HlsObservation, HlsSeason, StudyParcels } from "../data";
import { ParcelMap } from "./ParcelMap";
import { stepClear } from "../engine/compare";
import { GREEN_STEPS, greenStep, satelliteName } from "./plain";
import { scopeObservation as scopeObs, seasonSummary, type HlsSelection } from "../engine/hlsSelect";
export { seasonSummary };

interface Props {
  hls: HlsSeason | null;
  inter: HlsInterannual | null;
  shapes: StudyParcels | null;
  selected: HlsObservation | null;
  onSelect: (id: string) => void;
  /** Scenario window (release → soil ready), placed on 2024 by day and month. */
  window: [ISODate, ISODate];
  follow: boolean;
  setFollow: (v: boolean) => void;
  /** Plan date being followed and the result of the lookup. */
  followInfo: { planDate: ISODate; offsetDays: number | null } | null;
  /** The shared historical selection (same as the exports). */
  selection: HlsSelection | null;
  parcel: number | null;
  onParcel: (i: number | null) => void;
  powerPeriod: string;
  area: [number, number][] | null;
  outlines?: GeoJSON.FeatureCollection | null;
  openDrawer: (s: string) => void;
  loading: boolean;
}

export function hlsLabel(h: HlsSeason | null): string {
  if (!h || !h.observations.length) return "no satellite dates bundled";
  return `${h.observations.length} satellite dates in 2024`;
}

/** Display rule: do not join clear dates more than this many days apart. */
export const GAP_DAYS = 20;

function onSeason(d: ISODate): ISODate {
  const p = parts(d);
  return onYear(p.m, p.d, 2024);
}

/** One observation seen through the selected parcel (or the whole cluster); same rule as the exports. */
export function scopeObservation(o: HlsObservation, i: number | null): HlsObservation {
  const s = scopeObs(o, i === null ? { kind: "cluster" } : { kind: "parcel", index: i });
  return { ...s, quality: s.quality as HlsObservation["quality"] };
}

export function HlsPanel({ hls, inter, shapes, selected, onSelect, window, follow, setFollow, followInfo, selection, parcel, onParcel, powerPeriod, area, outlines, openDrawer, loading }: Props) {
  const scoped = useMemo(() => (hls ? hls.observations.map((o) => scopeObservation(o, parcel)) : []), [hls, parcel]);
  const scopedSel = selected ? scopeObservation(selected, parcel) : null;
  const scopeName = parcel === null ? "the four parcels" : `Parcel ${parcel + 1}`;
  const summary = useMemo(() => (scoped.length ? seasonSummary(scoped) : null), [scoped]);
  const mapAnswer = useMemo(() => {
    if (!selected) return null;
    if (parcel !== null) {
      const p = selected.parcels[parcel];
      const shown = p && p.ndviMedian !== null && p.cleanFraction >= 0.2;
      const st = shown ? greenStep(p.ndviMedian) : null;
      return `Parcel ${parcel + 1} on ${fmtDate(selected.date, true)}: ${st === null ? "no valid image (clouds or missing data)" : `${GREEN_STEPS[st].label}, greenness index ${p.ndviMedian!.toFixed(2)}`}; ${p ? `${p.cleanPixels} of ${p.pixels} pixels visible` : ""}.`;
    }
    const steps = selected.parcels.map((p) => (p.ndviMedian !== null && p.cleanFraction >= 0.2 ? greenStep(p.ndviMedian) : null));
    const hidden = steps.filter((s) => s === null).length;
    const green = steps.filter((s) => s !== null && s >= 2).length;
    const bare = steps.filter((s) => s === 0).length;
    const parts: string[] = [];
    if (green) parts.push(`${green} of ${steps.length} parcels were green or very green`);
    if (bare) parts.push(`${bare} had little or no green cover`);
    if (hidden) parts.push(`${hidden} ${hidden === 1 ? "was" : "were"} hidden by clouds`);
    const rest = steps.length - green - bare - hidden;
    if (rest) parts.push(`${rest} had some green`);
    return `On ${fmtDate(selected.date, true)}, ${parts.join(", ")}.`;
  }, [selected, parcel]);
  return (
    <section className="card" aria-labelledby="hls-h" id="fields">
      <div className="card-h">
        <h2 id="hls-h">What NASA HLS saw on the examples (2024 season)</h2>
      </div>
      <div className="card-b">
        {loading && <div className="skel" style={{ height: 220 }} aria-label="Loading satellite data" />}
        {!loading && !hls && <p className="note">Satellite data is not available in this build. The rest of the page works without it.</p>}
        {hls && (
          <>
            <div className="parcel-pick" role="radiogroup" aria-label="Example shown in the satellite evidence">
              <button type="button" role="radio" aria-checked={parcel === null} className="btn" onClick={() => onParcel(null)}>All four</button>
              {[0, 1, 2, 3].map((i) => <button key={i} type="button" role="radio" aria-checked={parcel === i} className="btn" onClick={() => onParcel(i)}>Example P{i + 1}</button>)}
            </div>
            <ImageDateBar obs={scoped} selected={scopedSel} onSelect={(id) => { setFollow(false); onSelect(id); }} follow={follow} setFollow={setFollow} followInfo={followInfo} window={window} />
            {shapes ? <ParcelMap shapes={shapes} area={area} outlines={outlines} mode="nasa" selected={selected} parcel={parcel} onParcel={onParcel} /> : <p className="note">The parcel shapes did not load.</p>}
            {mapAnswer && <p className="answer-line">{mapAnswer}</p>}
            <p className="chart-foot">Four processed example parcels about 3 km southwest of central General Roca. Only these four have satellite readings; other fields on the map have none here.</p>
            <div className="nasa-card" aria-label="NASA data for this selection">
              <div><span className="nasa-tag">NASA HLS</span> {scopedSel ? <>image of <strong>{fmtDate(scopedSel.date, true)}</strong>, {scopedSel.sensor === "L30" ? "Landsat" : "Sentinel-2"}, {scopedSel.cleanPixels} of {scopedSel.pixels} pixels visible for {scopeName}</> : "no image selected"}</div>
              <div><span className="nasa-tag">NASA POWER</span> daily weather record {powerPeriod}, regional (about 55 km): one value for the whole area, not per parcel</div>
            </div>

            <h3 className="sub-q">{parcel === null ? "How green were the four parcels through 2024?" : `How green was Parcel ${parcel + 1} through 2024?`}</h3>
            {summary && <p className="answer-line">{summary}</p>}
            {selection && (
              <p className="chart-foot">
                Your plan's period, {fmtDate(selection.interval.plan[0], true)} to {fmtDate(selection.interval.plan[1], true)}, matches {fmtDate(selection.interval.historical[0], true)} to {fmtDate(selection.interval.historical[1], true)} in the satellite record (same days of the year): {selection.observations.length} image date{selection.observations.length === 1 ? "" : "s"}, {selection.observations.filter((o) => o.quality === "clear").length} clear for {selection.scope}. These are the dates the export lists.
              </p>
            )}
            <Trajectory obs={scoped} selected={scopedSel} onSelect={(id) => { setFollow(false); onSelect(id); }} start={hls.meta.season.start} end={hls.meta.season.end} window={selection ? selection.interval.historical : [onSeason(window[0]), onSeason(window[1])]} />

            <details className="more">
              <summary>Winters 2016–2025</summary>
              <Interannual inter={inter} />
            </details>
            <details className="more">
              <summary>How this was built</summary>
              <p className="chart-foot">
                Greenness is NDVI from NASA HLS v2.0 (HLSL30_VI and HLSS30_VI), 30 m pixels. Each parcel was shrunk 30 m inward to skip edges (canals, windbreaks, roads). Clouds and shadows are removed with the Fmask layer. The value for a date is the median of the visible pixels; when clouds hide part of the area, it comes from fewer pixels. Colour steps: below 0.2, 0.2–0.35, 0.35–0.5, 0.5–0.65, 0.65 and above (a display rule, not a crop diagnosis). Satellites: {satelliteName("L30")} and {satelliteName("S30")}.{" "}
                <button type="button" className="linkbtn" onClick={() => openDrawer("hls")}>Full method</button>
              </p>
            </details>
          </>
        )}
      </div>
    </section>
  );
}

export function Trajectory({ obs, selected, onSelect, start, end, window }: { obs: HlsObservation[]; selected: HlsObservation | null; onSelect: (id: string) => void; start: string; end: string; window: [ISODate, ISODate] }) {
  // The chart is drawn at the width of its box, so axis text keeps its size and the box never
  // scrolls on wide screens. Below MIN_W it keeps MIN_W and scrolls inside its own box.
  const MIN_W = 520;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [boxW, setBoxW] = useState(760);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBoxW(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const W = Math.max(MIN_W, boxW);
  const H = 250;
  const L = 64;
  const R = 16;
  const top = 30;
  const plotH = 150;
  const span = diffDays(start, end);
  const sx = (d: string) => L + (Math.max(0, Math.min(span, diffDays(start, d))) / span) * (W - L - R);
  const sy = (v: number) => top + (1 - v / 0.9) * plotH;
  const months = ["02", "03", "04", "05", "06", "07", "08", "09", "10", "11"].map((m) => `2024-${m}-01`);
  const clear = obs.filter((o) => o.quality === "clear" && o.ndviMedian !== null);
  const segs: string[] = [];
  let cur = "";
  clear.forEach((o, i) => {
    const gap = i > 0 ? diffDays(clear[i - 1].date, o.date) : 0;
    if (i === 0 || gap > GAP_DAYS) {
      if (cur) segs.push(cur);
      cur = `M${sx(o.date).toFixed(1)} ${sy(o.ndviMedian!).toFixed(1)}`;
    } else cur += ` L${sx(o.date).toFixed(1)} ${sy(o.ndviMedian!).toFixed(1)}`;
  });
  if (cur) segs.push(cur);
  const cloudY = top + plotH + 26;
  const wa = sx(window[0]);
  const wb = sx(window[1]);
  return (
    <div className="traj-wrap" ref={wrapRef}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className="traj chart" role="group" aria-label="Greenness of the four parcels on each 2024 satellite date. Select a point to show that date on the map.">
        {wb > wa && (
          <g>
            <rect x={wa} y={top} width={wb - wa} height={plotH} fill="oklch(93% 0.04 50)" />
            <text x={wa + 6} y={top + 16} className="ax" fill="var(--accent-ink)">your plan's field-free period (placed on 2024)</text>
          </g>
        )}
        {[0, 0.2, 0.4, 0.6, 0.8].map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={sy(v)} y2={sy(v)} stroke="var(--border)" />
            <text x={L - 8} y={sy(v) + 4} textAnchor="end" className="ax">{v.toFixed(1)}</text>
          </g>
        ))}
        <text x={14} y={top + plotH / 2} className="ax" transform={`rotate(-90 14 ${top + plotH / 2})`} textAnchor="middle">Greenness (NDVI), axis 0–0.9</text>
        <text x={W - R} y={top - 10} textAnchor="end" className="ax">more green plants ↑</text>
        <text x={W - R} y={sy(0) - 6} textAnchor="end" className="ax">↓ little or no green cover</text>
        {months.map((m) => (
          <text key={m} x={sx(m) + 3} y={H - 6} className="ax">{fmtDate(m).split(" ")[1]}</text>
        ))}
        <line x1={L} x2={W - R} y1={cloudY} y2={cloudY} stroke="var(--border)" strokeDasharray="2 3" />
        <text x={L} y={cloudY - 6} className="ax">dates hidden by clouds</text>
        {segs.map((d, i) => <path key={i} d={d} fill="none" stroke="var(--primary)" strokeWidth={2} />)}
        {selected && (
          <g>
            <line x1={sx(selected.date)} x2={sx(selected.date)} y1={top} y2={cloudY + 6} stroke="var(--accent)" strokeWidth={2} />
            <text x={Math.min(sx(selected.date) + 6, W - 120)} y={top + plotH + 12} className="ax strong" fill="var(--accent-ink)">{fmtDate(selected.date)}</text>
          </g>
        )}
        {obs.map((o) => {
          const plotted = o.ndviMedian !== null && o.quality !== "obscured";
          const y = plotted ? sy(o.ndviMedian!) : cloudY;
          const sel = selected?.id === o.id;
          return (
            <g
              key={o.id}
              tabIndex={0}
              role="button"
              aria-pressed={sel}
              aria-label={`${fmtDate(o.date, true)}: ${plotted ? `greenness ${o.ndviMedian!.toFixed(2)}, ${GREEN_STEPS[greenStep(o.ndviMedian)!].label}` : "hidden by clouds"}${o.quality === "partial" ? ", partly cloudy" : ""}`}
              onClick={() => onSelect(o.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(o.id);
                }
              }}
              className="traj-pt"
            >
              <circle cx={sx(o.date)} cy={y} r={11} fill="transparent" />
              <circle cx={sx(o.date)} cy={y} r={4.5} fill={o.quality === "clear" ? "var(--primary)" : "white"} stroke="var(--primary)" strokeWidth={1.5} />
              {sel && <circle cx={sx(o.date)} cy={y} r={9} fill="none" stroke="var(--accent)" strokeWidth={2.4} />}
              <title>{fmtDate(o.date, true)}: {plotted ? o.ndviMedian!.toFixed(2) : "hidden by clouds"}</title>
            </g>
          );
        })}
      </svg>
      <p className="chart-foot">NDVI can range from −1 to +1; the axis shows 0 to 0.9, where these parcels' clear values fall. A hollow dot or a break is missing data (cloud, shadow), not low greenness. Each dot is one satellite date. Hollow dots: partly cloudy (top) or fully hidden (bottom row). The line breaks where no clear image exists for more than {GAP_DAYS} days.</p>
    </div>
  );
}

const QWORD: Record<string, string> = { clear: "clear", partial: "partly cloudy", obscured: "no valid image" };

export function ImageDateBar({ obs, selected, onSelect, follow, setFollow, followInfo, window }: { window: [ISODate, ISODate]; obs: HlsObservation[]; selected: HlsObservation | null; onSelect: (id: string) => void; follow: boolean; setFollow: (v: boolean) => void; followInfo: { planDate: ISODate; offsetDays: number | null } | null }) {
  const prev = stepClear(obs, selected?.id ?? null, -1);
  const next = stepClear(obs, selected?.id ?? null, 1);
  // The Plan and Climate views both mount this control; ids must stay unique.
  const uid = useId();
  const lid = `imgdate-l${uid}`;
  const sid = `imgdate-sel${uid}`;
  return (
    <div className="imgdate" role="group" aria-labelledby={lid}>
      <div className="imgdate-row">
        <span id={lid} className="imgdate-title">Historical image date</span>
        <button type="button" className="btn" onClick={() => prev && onSelect(prev.id)} disabled={!prev} aria-label={prev ? `Previous clear image, ${fmtDate(prev.date, true)}` : "No earlier clear image"}>◀ Previous clear</button>
        <label className="sr-only" htmlFor={sid}>Choose an image date</label>
        <select id={sid} className="input" value={selected?.id ?? ""} onChange={(e) => onSelect(e.target.value)}>
          {obs.map((o) => <option key={o.id} value={o.id}>{fmtDate(o.date, true)} ({QWORD[o.quality]})</option>)}
        </select>
        <button type="button" className="btn" onClick={() => next && onSelect(next.id)} disabled={!next} aria-label={next ? `Next clear image, ${fmtDate(next.date, true)}` : "No later clear image"}>Next clear ▶</button>
      </div>
      <label className="chk">
        <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> Follow my plan's date (nearest clear 2024 image)
      </label>
      <p className="imgdate-note" aria-live="polite">
        {selected ? <>Real image of <strong>{fmtDate(selected.date, true)}</strong>, a past season (your plan is for {window[0].slice(0, 4)}).</> : "No image selected."}{" "}
        {follow && followInfo ? (followInfo.offsetDays === null ? `No clear 2024 image within 20 days of ${fmtDate(followInfo.planDate)}; the image above was kept.` : `Your plan's date is ${fmtDate(followInfo.planDate)}; this is the nearest clear 2024 image, ${followInfo.offsetDays === 0 ? "same day of the year" : `${Math.abs(followInfo.offsetDays)} day${Math.abs(followInfo.offsetDays) === 1 ? "" : "s"} ${followInfo.offsetDays > 0 ? "later" : "earlier"} in the year`}.`) : "Your crops and dates do not change it."}
      </p>
    </div>
  );
}

function Interannual({ inter }: { inter: HlsInterannual | null }) {
  if (!inter) return <p className="note">The winter summary is not bundled.</p>;
  return (
    <>
      <p className="chart-foot">Same four parcels, 1 June to 31 August of each year. A few clear dates may not represent a whole winter.</p>
      <div className="tbl-scroll" tabIndex={0}>
        <table className="data">
          <thead><tr><th>Winter</th><th className="r">Satellite dates</th><th className="r">Clear dates</th><th className="r">Typical greenness</th></tr></thead>
          <tbody>
            {inter.years.map((y) => (
              <tr key={y.year}><td className="num">{y.year}</td><td className="r num">{y.processed}</td><td className="r num">{y.clearObservations}</td><td className="r num">{y.ndviMedianOfClear?.toFixed(2) ?? "—"}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
