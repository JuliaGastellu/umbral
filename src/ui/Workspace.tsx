import { useMemo } from "react";
import type { AppData, HlsObservation } from "../data";
import { conditionFor, exposureByYear, fmtT, summarize, yearsInRange, type DailySeries } from "../engine/climate";
import { fmtDate, type ISODate } from "../engine/dates";
import { seriesYears, type ClimateSettings, type StationSummary } from "../engine/exposure";
import type { Candidate } from "../engine/recommend";
import { ParcelMap } from "./ParcelMap";
import { ImageDateBar, Trajectory, scopeObservation } from "./HlsPanel";
import { useObservation } from "../api/observations";
import { GREEN_STEPS, NO_VALUE_LABEL, greenStep, satelliteName } from "./plain";
import type { Field } from "./Editor";

export type Layer = "location" | "hls" | "emit" | "power";

const LAYERS: { id: Layer; title: string; question: string; icon: string }[] = [
  { id: "location", title: "Location", question: "Where am I planning?", icon: "⌖" },
  { id: "hls", title: "Green vegetation · NASA HLS", question: "What was green on this date?", icon: "❧" },
  { id: "emit", title: "Ground cover · NASA EMIT", question: "Green plants, dry material or exposed soil?", icon: "≋" },
  { id: "power", title: "Weather history · NASA POWER", question: "What weather occurred in this window?", icon: "☁" },
];

interface Props {
  data: AppData;
  field: Field;
  setField: (f: Field) => void;
  layer: Layer;
  setLayer: (l: Layer) => void;
  selected: HlsObservation | null;
  onSelectObs: (id: string) => void;
  follow: boolean;
  setFollow: (v: boolean) => void;
  followInfo: { planDate: ISODate; offsetDays: number | null } | null;
  planWindow: [ISODate, ISODate];
  /** Dates the cold-night question is asked for: the active candidate's sowing to its end, or the orchard/bed window. */
  coldWindow: [ISODate, ISODate] | null;
  cfg: ClimateSettings;
  setCfg: (c: ClimateSettings) => void;
  station: StationSummary | null;
  active: Candidate | null;
  /** The main crop stays in place (orchard, or beds with plants kept). */
  permanent: boolean;
  onSources: () => void;
}

const POWER_SERIES = (d: AppData): DailySeries | null => (d.power ? { startDate: d.power.startDate, tmin: d.power.tmin } : null);

/** Section 01: the real map, P1–P4, a layer rail and the panel for the chosen layer. */
export function MapWorkspace(p: Props) {
  const { data, field, setField, layer, setLayer, selected } = p;
  const parcel = typeof field === "number" ? field : null;
  const scopeName = parcel === null ? "All four examples" : `Example P${parcel + 1}`;
  const status: Record<Layer, string> = {
    location: data.shapes ? "Connected" : "Not loaded",
    hls: data.hls ? "Connected" : "Not loaded",
    emit: data.emit ? "Connected" : "Not loaded",
    power: data.power ? "Connected" : "Not loaded",
  };
  return (
    <section className="ws card" aria-labelledby="ws-h" id="locate">
      <div className="ws-head">
        <div>
          <p className="kicker">01 / Locate &amp; understand</p>
          <h2 id="ws-h">{field === null ? "General Roca study area" : `${field === "cluster" ? "All four" : `P${(field as number) + 1}`} · General Roca study area`}</h2>
        </div>
        <button type="button" className="btn" onClick={p.onSources}>Source details</button>
      </div>
      <div className="ws-grid">
        <div className="ws-map">
          {data.shapes ? (
            <ParcelMap shapes={data.shapes} area={(data.area?.outline as [number, number][]) ?? null} outlines={data.outlines} mode={layer === "hls" ? "nasa" : "context"} selected={selected} parcel={parcel} onParcel={(i) => setField(i === null ? "cluster" : i)} height={360} />
          ) : (
            <p className="note">{data.loading ? "Loading the map…" : "The parcel layer did not load."}</p>
          )}
          <div className="study-cap" id="study-cap">
            <p><strong>Study examples</strong></p>
            <p>Satellite readings are available for these four parcels only. Choose one as a reference; your own field has not been processed.</p>
          </div>
          <div className="choice-row ws-pick" role="radiogroup" aria-label="Study example" aria-describedby="study-cap">
            {[0, 1, 2, 3].map((i) => <button key={i} type="button" role="radio" className="choice" aria-checked={field === i} onClick={() => setField(i)}>P{i + 1}</button>)}
            <button type="button" role="radio" className="choice" aria-checked={field === "cluster"} onClick={() => setField("cluster")}>All four</button>
          </div>
          <div className="layer-rail" role="radiogroup" aria-label="Map layer">
            {LAYERS.map((l) => (
              <button key={l.id} type="button" role="radio" aria-checked={layer === l.id} className="layer-btn" onClick={() => setLayer(l.id)}>
                <span className="layer-ic" aria-hidden="true">{l.icon}</span>
                <span className="layer-txt"><strong>{l.title}</strong><small>{l.question}</small></span>
                <span className={`layer-st${status[l.id] === "Connected" ? " ok" : ""}`}>{status[l.id]}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="ws-panel" aria-live="polite">
          {layer === "location" && <LocationPanel data={data} scopeName={scopeName} parcel={parcel} />}
          {layer === "hls" && <HlsLayerPanel {...p} parcel={parcel} scopeName={scopeName} />}
          {layer === "emit" && <EmitPanel data={data} parcel={parcel} />}
          {layer === "power" && <PowerPanel {...p} />}
        </div>
      </div>
      <div className="ev-strip" role="group" aria-label="NASA evidence for this plan">
        <span className="ev-strip-h">NASA evidence<br />for this plan</span>
        <button type="button" className="ev-btn" aria-pressed={layer === "power"} onClick={() => setLayer("power")}><strong>Past weather</strong><small>NASA POWER · regional temperature history</small></button>
        <button type="button" className="ev-btn" aria-pressed={layer === "hls"} onClick={() => setLayer("hls")}><strong>Vegetation history</strong><small>NASA HLS · dated greenness of the examples</small></button>
        <button type="button" className="ev-btn" aria-pressed={layer === "emit"} onClick={() => setLayer("emit")}><strong>Ground-cover observations</strong><small>NASA EMIT · cluster surface fractions</small></button>
      </div>
    </section>
  );
}

function LocationPanel({ data, scopeName, parcel }: { data: AppData; scopeName: string; parcel: number | null }) {
  const ex = parcel !== null ? data.shapes?.parcels[parcel] : null;
  return (
    <div className="lp">
      <p className="chip-line"><span className="pchip your-input">Public parcel layer</span></p>
      <h3>Where am I planning?</h3>
      <p>Four parcels in the General Roca horticultural belt were processed with NASA satellite data: P1–P4. The map also shows the surrounding parcels of the public provincial layer, but only these four have processed observations.</p>
      {ex ? <p><strong>{scopeName}</strong>: {ex.type.toLowerCase()} parcel, {ex.declaredHa} ha declared, object {ex.objectid} in the layer. A cadastral parcel is not necessarily one management field; no owner or crop is known.</p> : <p><strong>All four examples</strong>: about 17 ha together; values for the cluster pool their sampled pixels.</p>}
      <p className="chart-foot">Parcels: Parcelario provincial, IDERN (Gerencia de Catastro – Agencia de Recaudación Tributaria, Provincia de Río Negro). Background: EOX Sentinel-2 cloudless 2024 or OpenStreetMap. A background map is not NASA analysis.</p>
    </div>
  );
}

function HlsLayerPanel(p: Props & { parcel: number | null; scopeName: string }) {
  const { data, selected, parcel } = p;
  const obs = useMemo(() => (data.hls ? data.hls.observations.map((o) => scopeObservation(o, parcel)) : []), [data.hls, parcel]);
  const view = useObservation(selected, parcel);
  const scoped = selected ? scopeObservation(selected, parcel) : null;
  if (!data.hls) return <p className="note">HLS observations did not load.</p>;
  const step = view && view.ndviMedian !== null && view.totalPixels && view.cleanPixels / view.totalPixels >= 0.2 ? greenStep(view.ndviMedian) : null;
  return (
    <div className="lp">
      <p className="chip-line"><span className="pchip nasa-obs">NASA observation</span> <span className="chip-src">{view?.origin === "Umbral API" ? "via Umbral API" : "bundled snapshot"}</span></p>
      <h3>What was green on this date?</h3>
      <ImageDateBar obs={obs} selected={scoped} onSelect={(id) => { p.setFollow(false); p.onSelectObs(id); }} follow={p.follow} setFollow={p.setFollow} followInfo={p.followInfo} window={p.planWindow} />
      {view ? (
        <div className="hls-now">
          <div className="chips">
            {view.rgbUrl && <figure><img src={view.rgbUrl} alt={`True colour, ${fmtDate(view.acquisitionDate, true)}, 30 m pixels`} width={96} height={96} /><figcaption>True colour</figcaption></figure>}
            {view.ndviUrl && <figure><img src={view.ndviUrl} alt={`Vegetation index, ${fmtDate(view.acquisitionDate, true)}, 30 m pixels`} width={96} height={96} /><figcaption>Vegetation</figcaption></figure>}
          </div>
          <p>
            <strong>{p.scopeName}, {fmtDate(view.acquisitionDate, true)}</strong> ({satelliteName(view.sensor as "L30" | "S30")}): {step === null ? NO_VALUE_LABEL : `${GREEN_STEPS[step].label}, greenness index (NDVI) ${view.ndviMedian!.toFixed(2)}`}; {view.cleanPixels} of {view.totalPixels} pixels clear ({view.quality}).
          </p>
          <p className="chart-foot">900 m around the examples. Little green is not proof of bare soil (residue may cover it); in orchards a pixel mixes canopy, interrow and shadow.</p>
        </div>
      ) : <p className="note">No observation selected.</p>}
      <details className="more">
        <summary>Greenness through the 2024 season (every date)</summary>
        <Trajectory obs={obs} selected={scoped} onSelect={(id) => { p.setFollow(false); p.onSelectObs(id); }} start={data.hls.meta.season.start} end={data.hls.meta.season.end} window={p.planWindow.map((d) => `2024${d.slice(4)}`) as [ISODate, ISODate]} />
      </details>
    </div>
  );
}

function EmitPanel({ data, parcel }: { data: AppData; parcel: number | null }) {
  const e = data.emit;
  if (!e) return <p className="note">EMIT summaries did not load.</p>;
  // One entry per acquisition date: a scene with values wins over its twin with fill only.
  const byDate = new Map<string, (typeof e.scenes)[number]>();
  for (const s of e.scenes) {
    const prev = byDate.get(s.acquired);
    if (!prev || (prev.status !== "values" && s.status === "values")) byDate.set(s.acquired, s);
  }
  const dates = [...byDate.values()].sort((a, b) => a.acquired.localeCompare(b.acquired));
  const pct = (v: number) => `${Math.round(v * 100)} %`;
  return (
    <div className="lp">
      <p className="chip-line"><span className="pchip nasa-obs">NASA observation</span> <span className="chip-src">cluster summary, 60 m pixels</span></p>
      <h3>Green plants, dry material or exposed soil?</h3>
      {parcel !== null && <p className="banner">EMIT was processed for the four examples together. There is no separate value for P{parcel + 1}.</p>}
      {dates.map((s) => (
        <div key={s.acquired} className="emit-row">
          <p className="emit-date"><strong>{fmtDate(s.acquired, true)}</strong> {s.status === "values" ? `· ${s.validPixels} valid pixels (product quality code QC 0)` : "· no valid pixels"}</p>
          {s.status === "values" && s.median ? (
            <ul className="emit-bars" aria-label={`Medians on ${fmtDate(s.acquired, true)}`}>
              {([["Green plants", s.median.PV, s.medianUncertainty?.PV, "pv"], ["Dry plant material", s.median.NPV, s.medianUncertainty?.NPV, "npv"], ["Bare soil", s.median.BARE, s.medianUncertainty?.BARE, "bare"]] as const).map(([label, v, u, k]) => (
                <li key={k}><span className="eb-l">{label}</span><span className="eb-track"><span className={`eb-fill ${k}`} style={{ width: `${Math.round(v * 100)}%` }} /></span><span className="eb-v">{pct(v)}{u !== undefined ? <small className="eb-u"> · median per-pixel uncertainty {pct(u)}</small> : null}</span></li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}
      <p className="chart-foot">Medians of each share, taken separately: they need not add to 100 %. Median per-pixel uncertainty: the median of the uncertainties EMIT publishes for each pixel; it is not the uncertainty or a confidence interval of the cluster value, and none is computed here. QC 0 is the product's code for pixels it marks valid. No EMIT scene covers the area between March and October 2024. Dry material is more than crop residue. Not a nitrogen measurement. {e.product}.</p>
    </div>
  );
}

function PowerPanel(p: Props) {
  const series = POWER_SERIES(p.data);
  const { cfg, setCfg, coldWindow } = p;
  const res = useMemo(() => {
    if (!series || !coldWindow) return null;
    const { first, last } = seriesYears(series);
    const rows = exposureByYear(series, { start: coldWindow[0], end: coldWindow[1], t: cfg.t, years: yearsInRange(first, last) });
    return { rows, sum: summarize(rows, cfg.d), cond: rows.map((r) => conditionFor(r, cfg.d)) };
  }, [series, coldWindow, cfg.t, cfg.d]);
  const lag = p.station?.firstEventMedianLagDays[String(cfg.t)];
  return (
    <div className="lp">
      <p className="chip-line"><span className="pchip nasa-model">NASA historical model</span> <span className="chip-src">regional, about 55 km</span></p>
      <h3>How long before a cold night?</h3>
      <div className="pair">
        <div className="field"><label htmlFor="pw-t">Cold-night threshold (°C)</label><input id="pw-t" className="input" type="number" min={-10} max={5} step={1} value={cfg.t} onChange={(e) => e.target.value !== "" && setCfg({ ...cfg, t: Math.max(-10, Math.min(5, Math.round(+e.target.value))) })} /></div>
        <div className="field"><label htmlFor="pw-d">Days needed (duration)</label><input id="pw-d" className="input" type="number" min={1} max={120} value={cfg.d} onChange={(e) => e.target.value !== "" && setCfg({ ...cfg, d: Math.max(1, Math.min(120, Math.round(+e.target.value))) })} /></div>
      </div>
      {!series ? <p className="note">The NASA POWER record did not load.</p> : !coldWindow || !res ? <p className="note">No cover window to evaluate on these dates.</p> : (
        <>
          <p className="pw-q">From <strong>{fmtDate(coldWindow[0], true)}</strong>{p.permanent ? " (start of the cover window you entered)" : p.active ? ` (${p.active.name.toLowerCase()} sowing)` : ""} · threshold ≤ {fmtT(cfg.t)} °C · {cfg.d} days · years {res.rows[0]?.year}–{res.rows.at(-1)?.year}</p>
          <p className="pw-big"><strong>{res.sum.met}</strong> of {res.sum.total} years <span>had at least {cfg.d} days before a cold night.</span></p>
          <div className="pw-tiles">
            <div className="pw-tile met"><strong>{res.sum.met}</strong><span>{cfg.d}+ days</span></div>
            <div className="pw-tile not"><strong>{res.sum.notMet}</strong><span>fewer</span></div>
            {res.sum.notEvaluable > 0 && <div className="pw-tile na"><strong>{res.sum.notEvaluable}</strong><span>can't tell</span></div>}
          </div>
          <ol className="yeargrid" aria-label="Each year">
            {res.rows.map((r, i) => <li key={r.year} className={res.cond[i]} title={`${r.year}: ${r.outcome === "event" ? `first night ≤ ${fmtT(cfg.t)} °C after ${r.days} days` : r.outcome === "none" ? "no such night in the window" : "missing data"}`}><span className="sr-only">{r.year}: {res.cond[i]}</span><span aria-hidden="true">{String(r.year).slice(2)}</span></li>)}
          </ol>
          <p className="caveat-line">{lag ? `This regional record places the first such night about ${Math.round(lag)} days later than the Neuquén airport station: read it as optimistic.` : "Station check pending for this threshold."} A past frequency, not crop-success probability; the threshold is your choice, not a species injury limit.</p>
        </>
      )}
    </div>
  );
}
