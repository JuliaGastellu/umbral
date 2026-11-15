import { useEffect, useRef } from "react";
import { SOURCES } from "../engine/catalog";
import { fmtT } from "../engine/climate";
import type { AppData } from "../data";
import type { ExportDoc } from "../engine/export";

interface Props {
  open: boolean;
  section: string;
  onClose: () => void;
  data: AppData;
  assumptions: ExportDoc["assumptions"];
}

const SECTIONS: [string, string][] = [
  ["methods", "Methods"],
  ["power", "POWER and check"],
  ["hls", "HLS"],
  ["area", "Study area"],
  ["assumptions", "Assumptions"],
  ["definitions", "Definitions"],
  ["sources", "Sources"],
];

export function Drawer({ open, section, onClose, data, assumptions }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const prevFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    prevFocus.current = document.activeElement as HTMLElement;
    const el = ref.current!;
    el.querySelector<HTMLElement>("button")?.focus();
    const target = el.querySelector(`#ev-${section}`);
    target?.scrollIntoView({ block: "start" });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
      if (e.key === "Tab") {
        const f = Array.from(el.querySelectorAll<HTMLElement>('button, a[href], input, select, summary, [tabindex="0"]')).filter((x) => !x.hasAttribute("disabled"));
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prevFocus.current?.focus?.();
    };
  }, [open, section, onClose]);

  if (!open) return null;
  const pm = data.power?.meta;
  const st = data.station;
  const hm = data.hls?.meta;
  const area = data.area;
  const ps = data.parcels;
  const obs = data.hls?.observations ?? [];
  const clear = obs.filter((o) => o.quality === "clear");
  const monthsWithClear = new Set(clear.map((o) => o.date.slice(0, 7)));
  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-h" ref={ref}>
        <div className="drawer-h">
          <h2 id="drawer-h">Sources and methods</h2>
          <button type="button" className="btn" onClick={onClose}>Close</button>
        </div>
        <nav className="drawer-nav" aria-label="Evidence sections">
          {SECTIONS.map(([id, l]) => (
            <button key={id} type="button" className="btn small" onClick={() => ref.current?.querySelector(`#ev-${id}`)?.scrollIntoView({ block: "start" })}>{l}</button>
          ))}
        </nav>
        <div className="drawer-b">
          <section id="ev-provenance" className="prov">
            <p><strong>Provenance.</strong> NASA POWER retrieved {data.power?.meta.retrieved.slice(0, 10) ?? "—"} (API {data.power?.meta.powerVersion ?? "—"}) and HLS v2.0 via NASA CMR/LP DAAC, processed by the scripts in /scripts; each file's request and checksum are in public/data/provenance.json.</p>
            <p><strong>About.</strong> Umbral is a one-person project for the NASA Space Apps Challenge 2026. The logo was generated with an AI image tool (see docs/AI_DISCLOSURE.md).</p>
          </section>
          <section id="ev-methods">
            <h3>Methods</h3>
            <p>Three production systems are handled separately. In an annual rotation (and beds whose plants are removed) the window runs from the date the field is free to the date the soil must be ready (next-crop date minus preparation). In an orchard, or beds whose plants stay, harvest does not free the plot: only the cover window and area you enter are evaluated, and the main crop is treated as the standing crop. Full rules: docs/METHODS.md.</p>
            <p>In the annual rotation, the window runs from plot release to the date the soil must be ready. A cover must be terminated a termination interval before that date. "Fits" means only that the stated temporal constraints are met: sowing on or after release, termination by the deadline, and the stated number of irrigation turns after sowing. It never implies establishment, growth, biomass or income.</p>
            <p>States: <em>Fits</em>; <em>Needs data</em> (the result depends on a missing input, and the threshold is shown); <em>Doesn't fit even with data</em> (the best case also fails); <em>Doesn't fit</em> (the failing constraint is named). The margin is the smallest slack among the known constraints. There is no default "tight" threshold.</p>
            <p>Irrigation turns come from a reference turn date plus a frequency, ending at the last known turn or at canal closure. They never move with the sowing date. Without a reference date the exact dates are unknown and the count is a range over all phases. "Turns that fit" is a count, not a statement that water is enough.</p>
            <p>Sensitivity shifts each parameter one day at a time (up to 120 d) and reports the first value that changes the status. Plot context never changes the calendar arithmetic; climate never changes the calendar status.</p>
            <p>Dates are plain calendar dates with full years. A window may cross 31 December. For historical years without 29 February, a 29 February date maps to 28 February.</p>
          </section>

          <section id="ev-power">
            <h3>NASA POWER and the regional check</h3>
            {pm ? (
              <>
                <p>Daily T2M_MIN, T2M_MAX, T2M and PRECTOTCORR from the POWER daily point API ({pm.powerVersion}, community AG) at {pm.point.lat}, {pm.point.lon} (irrigated area of General Roca; cell elevation {pm.point.elevationM} m). {pm.grid} Period {pm.start} to {pm.end}; units {Object.entries(pm.units).map(([k, v]) => `${k} ${v}`).join(", ")}. Fill value {pm.fillValue} treated as missing. Valid-year rule: {pm.validYearRule}; {pm.nValidYears} valid years. Retrieved {pm.retrieved.slice(0, 10)}; response SHA-256 <span className="num" style={{ wordBreak: "break-all" }}>{pm.sha256.slice(0, 16)}…</span>.</p>
                <p>One comparison everywhere: a cold night is a day with Tmin at or below T. Two outputs per year. First, the timing of the first cold night between the start and a fixed search end: a date, "none before the search end" (no date is invented), or "missing data". Second, the question "were there at least D days before the first cold night?": <em>yes</em> when the first cold night came on day D or later, or when at least D days were observed without one; <em>no</em> when it came before day D; <em>not evaluable</em> when fewer than D days were observed without one (a search window shorter than D, missing data or the end of the record). A search end before the start is reported as an input error.</p>
                <p>Thresholds of 0, −2 and −4 °C are meteorological references, not damage or survival limits. The global POWER validation (E9: daily Tmin R² 0.87, RMSE 3.15 °C) does not validate threshold crossings in this valley.</p>
              </>
            ) : (
              <p>POWER data not loaded.</p>
            )}
            {st ? (
              <>
                <p><strong>Regional check at Neuquén Aero.</strong> {st.scope} Station {st.station.id} ({st.station.name}), {st.station.variable}; GSOD summarizes on the {st.station.dayDefinition}, POWER on local solar time. Common March–June days: {st.period.commonDays} ({st.period.firstYear}–{st.period.lastYear}).</p>
                <p>Daily Tmin, POWER minus station: bias {st.dailyTmin.biasPowerMinusStationC} °C, RMSE {st.dailyTmin.rmseC} °C, r {st.dailyTmin.pearsonR}.</p>
                <table className="data">
                  <thead>
                    <tr><th>T</th><th className="r">Station days</th><th className="r">POWER days</th><th className="r">Same date</th><th className="r">Share</th><th className="r">First event, median lag</th></tr>
                  </thead>
                  <tbody>
                    {st.thresholdDays.map((t) => {
                      const f = st.firstEvent.find((x) => x.T === t.T);
                      return (
                        <tr key={t.T}>
                          <td className="num">≤ {fmtT(t.T)} °C</td>
                          <td className="r num">{t.stationEventDays}</td>
                          <td className="r num">{t.powerEventDays}</td>
                          <td className="r num">{t.bothAtOrBelow}</td>
                          <td className="r num">{t.hitRate !== null ? `${Math.round(t.hitRate * 100)} %` : "—"}</td>
                          <td className="r num">{f && f.medianDiffDays !== null ? `+${f.medianDiffDays} d (${f.yearsBothFound} yr)` : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p style={{ marginTop: 8 }}>"Same date" counts station days at or below T on which POWER was also at or below T on the same calendar date. GSOD uses the UTC day and POWER the local solar day, so a cold night can fall on neighbouring dates; this share is not a pure detection rate. First-event lags use only years with no missing value before the event in either series ({st.firstEvent[0]?.validYears ?? "—"} years). Reading: at this station POWER's first autumn cold night comes weeks later, so POWER exposure is likely too favourable for a valley-floor plot. This is one station, not a correction for General Roca; no correction was derived or applied. Caveats: {st.caveats.join(" ")}</p>
              </>
            ) : (
              <p>Regional check pending.</p>
            )}
          </section>

          <section id="ev-hls">
            <h3>HLS observations</h3>
            {hm ? (
              <>
                <p>Maps: a satellite photo (EOX Sentinel-2 cloudless 2024) or OpenStreetMap for finding the place, and the dated HLS image from NASA GIBS for evidence, enlarged without smoothing. Example parcels are drawn with their boundaries from the public provincial parcel layer; the dashed line on the NASA map is the area whose pixels were used. Products: {hm.collections.join("; ")}. Searched through CMR STAC without login; files read with Earthdata Login on the author's machine. Season {hm.season.start} to {hm.season.end}: {hm.itemsFound} items found, {hm.itemsProcessed} processed.</p>
                <p>Clean-pixel rule: {hm.cleanRule} NDVI scale factor 0.0001, fill −19999 (from the file metadata). Fmask bits (from the file metadata): 7–6 aerosol level, 5 water, 4 snow/ice, 3 cloud shadow, 2 adjacent to cloud, 1 cloud, 0 cirrus. Display classes: clear ≥ 80 % clean pixels, partly masked ≥ 20 %, mostly masked below that (no NDVI plotted). In the chart, lines join clear dates no more than 20 days apart; longer gaps are left open.</p>
                <p>Valid observations: {clear.length} clear of {obs.length}, in {monthsWithClear.size} calendar months. Gaps between clear observations are visible on the timeline. A few clear observations do not prove that a whole season is represented.</p>
                <p>Fixed notes: residue protects soil without looking green; volunteer weeds look green; edge pixels mix channels and windbreaks; HLS does not date harvest or release. Historical observations are immutable: changing a strategy never generates a predicted NDVI. Cite HLS as NASA/USGS Landsat and ESA Sentinel-2 (partner-agency data).</p>
              </>
            ) : (
              <p>HLS data not loaded.</p>
            )}
          </section>

          <section id="ev-area">
            <h3>Study area</h3>
            {area && (
              <>
                <p>{area.name}. {area.status} {area.orchardScreen}</p>
                <p>Each parcel was buffered {area.inwardBufferM} m inward to remove edge pixels (canals, windbreaks, roads). Pixels per parcel after the buffer: {data.hls?.meta.parcelPixels.map((p) => `${p.label} ${p.pixels}`).join(", ") ?? "—"} (cluster {data.hls?.meta.clusterPixels ?? "—"}).</p>
                <p>{area.outlineNote}</p>
                <p>Parcels come from the public provincial parcel layer (IDERN WFS geonode:PARCELARIO1; Gerencia de Catastro – Agencia de Recaudación Tributaria, Provincia de Río Negro), downloaded with scripts/fetch_parcelario.py. The app shows the boundaries of the four examples and of the surrounding parcels as served, with no owner or crop attached. The service declares no fees or access constraints, and a 2019 provincial statement announces free and open GIS use; no formal licence text was found. The original file is reproduced by download rather than redistributed in the repository.</p>
              </>
            )}
            {ps && <p>Cadastral parcels are not management fields: one farm can hold several fields, orchards included. The layer has no land use or owner information. Layer statistics: {ps.parcelsInLayer} parcels; SUBRURAL median {ps.subrural.medianHa} ha (P25 {ps.subrural.p25Ha}, P75 {ps.subrural.p75Ha}); {ps.excludedPlateauRural} plateau RURAL parcels excluded.</p>}
          </section>

          <section id="ev-assumptions">
            <h3>Inputs and assumptions in this scenario</h3>
            <table className="data">
              <thead>
                <tr><th>Item</th><th>Value</th><th>Status</th><th>Source</th></tr>
              </thead>
              <tbody>
                {assumptions.map((a) => (
                  <tr key={a.item}>
                    <td>{a.item}</td>
                    <td className="num">{a.value}</td>
                    <td>{a.status}</td>
                    <td>{a.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section id="ev-definitions">
            <h3>Definitions</h3>
            <ul>
              <li><strong>Release:</strong> the date the plot is free after harvest, clean-up and tractor work.</li>
              <li><strong>Termination interval:</strong> time between ending the cover and the date the soil must be ready. The values come from US guidance for specific successor crops and management; they are scenario assumptions, not constants.</li>
              <li><strong>Canal closure:</strong> the end of the gravity irrigation season for the whole system (DPA). It is not the last turn of a given plot.</li>
              <li><strong>Observed / Calculated / Assumed:</strong> observed values come from a measurement or record; calculated values come from Umbral's rules; assumed values are scenario inputs or parameters without a local source.</li>
              <li><strong>Plot access:</strong> who controls the plot from April to September. If nobody who can decide is involved, Umbral does not apply.</li>
            </ul>
          </section>

          <section id="ev-registry">
            <h3>Data sources and their status</h3>
            <p>Each source answers one question at its own scale. "Integrated" means the app uses its values; "probed" means a subset was produced and checked; "catalog checked" means only the public catalog was queried. Nothing is filled in for a source that could not be read.</p>
            {data.registry?.origin && <p className="chart-foot">Loaded from: {data.registry.origin}.</p>}
            {data.registry ? (
              <ul className="reg-list">
                {data.registry.entries.map((e) => (
                  <li key={e.id}>
                    <strong>{e.name}</strong> <span className="reg-status">{e.status}</span>
                    <div>{e.question}</div>
                    <small>{[e.version && `Version: ${e.version}`, e.retrieved && `Retrieved: ${e.retrieved.slice(0, 10)}`, e.variables && `Variables: ${e.variables}`, e.dates && `Dates: ${e.dates}`, e.scope && `Scope: ${e.scope}`, e.quality && `Quality: ${e.quality}`, e.processing && `Processing: ${e.processing}`, e.note].filter(Boolean).join(" · ")}</small>
                  </li>
                ))}
              </ul>
            ) : <p>The source registry did not load.</p>}
          </section>

          <section id="ev-sources">
            <h3>Sources</h3>
            <ul className="src-list">
              {Object.values(SOURCES).map((s) => (
                <li key={s.id}>
                  {s.url ? <a href={s.url} target="_blank" rel="noreferrer">{s.title}</a> : s.title}
                  {s.zone ? `. ${s.zone}` : ""}
                  {s.year ? `, ${s.year}` : ""}. {s.status}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
