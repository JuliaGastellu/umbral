import { useCallback, useEffect, useMemo, useState } from "react";
import { useAppData } from "./data";
import { addDays, fmtDate, maxDate, minDate, toDay, type ISODate } from "./engine/dates";
import { evaluate, demoScenario, hasWhatIf, NO_WHATIF, type Scenario } from "./engine/scenario";
import { climateReading, DEFAULT_CLIMATE, type ClimateSettings } from "./engine/exposure";
import { buildExport, exportMarkdown } from "./engine/export";
import { Timeline, obsOnTimeline, type HandleId } from "./ui/Timeline";
import { Rail, FieldDetails } from "./ui/Rail";
import { biasNote } from "./ui/ClimatePanel";
import { fmtT } from "./engine/climate";
import { Overview } from "./ui/Overview";
import { StrategyCards } from "./ui/StrategyCards";
import { ClimatePanel } from "./ui/ClimatePanel";
import { HlsPanel, hlsLabel } from "./ui/HlsPanel";
import { MyField, MyNextSeason } from "./ui/Stages";
import { QuickResult } from "./ui/QuickResult";
import { withReleaseDate } from "./engine/compare";
import { DateCompare } from "./ui/DateCompare";
import { compareDates, nearestClearObservation } from "./engine/compare";
import { CropIcon } from "./ui/CropIcon";
import { WeatherPanel, type WeatherReport } from "./weather/WeatherPanel";
import { todayInArgentina } from "./weather/model";
import { lastDate as powerLastDate } from "./climate/history";
import { Drawer } from "./ui/Drawer";
import { StrategyPatterns } from "./ui/bits";
import type { DailySeries } from "./engine/climate";

const EMPTY_SERIES: DailySeries = { startDate: "1981-01-01", tmin: [] };

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function App() {
  const data = useAppData();
  const [s, setS] = useState<Scenario>(demoScenario);
  const [cfg, setCfg] = useState<ClimateSettings>(DEFAULT_CLIMATE);
  const [focus, setFocus] = useState<"B" | "C">("B");
  const [customInterval, setCustomInterval] = useState<[ISODate, ISODate] | null>(null);
  const [selObs, setSelObs] = useState<string | null>(null);
  const [altDate, setAltDate] = useState<ISODate>("2027-03-25");
  const [follow, setFollow] = useState(false);
  const [parcel, setParcel] = useState<number | null>(null);
  const [wxPeriod, setWxPeriod] = useState<[ISODate, ISODate]>(() => { const d = todayInArgentina(); return [d, addDays(d, 6)]; });
  const [wxReport, setWxReport] = useState<WeatherReport | null>(null);
  const [fcReport, setFcReport] = useState<WeatherReport | null>(null);
  const [nasaPeriod, setNasaPeriod] = useState<[ISODate, ISODate]>(() => { const d = demoScenario().release; return [d, addDays(d, 30)]; });
  const [drawer, setDrawer] = useState<{ open: boolean; section: string }>({ open: false, section: "methods" });
  const [exportOpen, setExportOpen] = useState(false);

  const set = useCallback((f: (s: Scenario) => Scenario) => setS((x) => f(x)), []);
  const openDrawer = useCallback((section: string) => setDrawer({ open: true, section }), []);
  const closeDrawer = useCallback(() => setDrawer((d) => ({ ...d, open: false })), []);

  const ev = useMemo(() => evaluate(s), [s]);
  const whatIf = hasWhatIf(s.whatIf);
  const plan = useMemo(() => (whatIf ? evaluate({ ...s, whatIf: NO_WHATIF }) : null), [s, whatIf]);
  const series: DailySeries | null = data.power;
  const station = data.station?.summary ?? null;

  const climate = useMemo(() => (series ? climateReading(ev, series, cfg) : null), [ev, series, cfg]);
  const climateBy = useMemo(() => {
    if (!series) return { A: null, B: null, C: null };
    return { A: climateReading(ev, series, { ...cfg, strategy: "A" }), B: climateReading(ev, series, { ...cfg, strategy: "B" }), C: climateReading(ev, series, { ...cfg, strategy: "C" }) };
  }, [ev, series, cfg]);

  const interval: [ISODate, ISODate] = customInterval ?? [ev.effective.cal.release, toDay(ev.window.soilReady) > toDay(ev.effective.cal.release) ? ev.window.soilReady : addDays(ev.effective.cal.release, 1)];
  const obs = data.hls?.observations ?? [];
  const tlDomain = useMemo<[number, number]>(() => {
    const a = Math.min(toDay(ev.effective.cal.release), toDay(s.release), toDay(interval[0])) - 12;
    const b = Math.max(toDay(ev.effective.cal.nextCrop), toDay(s.nextCrop), toDay(interval[1])) + 14;
    return [a, b];
  }, [ev.effective.cal.release, ev.effective.cal.nextCrop, s.release, s.nextCrop, interval]);
  const inInterval = useCallback(
    (o: { date: string }) => {
      const at = obsOnTimeline(o.date, tlDomain);
      return at !== null && toDay(at) >= toDay(interval[0]) && toDay(at) <= toDay(interval[1]);
    },
    [tlDomain, interval],
  );
  // Historical image date: chosen explicitly (or by "follow"), never changed silently by planning controls.
  const seasonYear = data.hls ? Number(data.hls.meta.season.start.slice(0, 4)) : 2024;
  const planSowing = ev.effective.strategies[focus].sowing ?? ev.effective.cal.release;
  const followHit = useMemo(() => (follow && obs.length ? nearestClearObservation(obs, planSowing, seasonYear) : null), [follow, obs, planSowing, seasonYear]);
  useEffect(() => {
    if (selObs || !obs.length) return;
    const first = nearestClearObservation(obs, s.release, seasonYear, 60)?.obs ?? obs.find((o) => o.quality === "clear");
    if (first) setSelObs(first.id);
  }, [obs, selObs, s.release, seasonYear]);
  useEffect(() => {
    if (followHit) setSelObs(followHit.obs.id);
  }, [followHit]);
  const selected = obs.find((o) => o.id === selObs) ?? null;
  const followInfo = follow ? { planDate: planSowing, offsetDays: followHit ? followHit.offsetDays : null } : null;
  const cmp = useMemo(() => compareDates(s, altDate), [s, altDate]);
  const frost = useMemo(() => {
    const a = climateBy.A;
    if (!a || a.error) return [];
    const q50 = a.quantiles[1];
    const half = q50 === null ? `in half of the years there was no such night before ${fmtDate(a.end)}` : `in half of the years that night came by ${fmtDate(addDays(a.start, q50))}`;
    return [
      `From the date your field is free (${fmtDate(a.start)}): in ${a.summary.met} of ${a.summary.total} years there were ${a.d}+ days before the first night at or below ${fmtT(a.t)} °C; ${half}.`,
      biasNote(station, a.t),
    ];
  }, [climateBy, station]);
  const label = hlsLabel(data.hls);

  const onHandle = useCallback((h: HandleId, eff: ISODate) => {
    setS((x) => {
      const w = x.whatIf;
      if (h === "release") {
        const v = minDate(addDays(eff, -w.releaseDelay), addDays(x.nextCrop, -2));
        const shift = (d: ISODate) => (d === x.release ? v : maxDate(d, v));
        return { ...x, release: v, covers: { B: { ...x.covers.B, sowing: shift(x.covers.B.sowing) }, C: { ...x.covers.C, sowing: shift(x.covers.C.sowing) } } };
      }
      if (h === "sowB" || h === "sowC") {
        const id = h === "sowB" ? "B" : "C";
        return { ...x, covers: { ...x.covers, [id]: { ...x.covers[id], sowing: maxDate(addDays(eff, -w.tractorDelay), x.release) } } };
      }
      if (h === "nextCrop") return { ...x, nextCrop: maxDate(addDays(eff, w.earlierTransplant), addDays(x.release, 2)) };
      if (h === "lastTurn") return { ...x, water: { ...x.water, lastTurn: minDate(eff, x.water.closure) } };
      return x;
    });
  }, []);

  const exportDoc = useMemo(() => {
    const hls = data.hls
      ? { label, interval, observations: obs.filter((o) => inInterval(o)).map((o) => ({ date: o.date, sensor: o.sensor, quality: o.quality, cleanFraction: o.cleanFraction, ndviMedian: o.ndviMedian })) }
      : null;
    const doc = buildExport(s, ev, series ?? EMPTY_SERIES, cfg, hls, station);
    if (!series) doc.climate.sentence = "Climate exposure not available: POWER data was not loaded.";
    const side = (x: typeof cmp.plan) => ({ fieldFree: x.date, cover: focus, calendarDaysUntilCoverMustEnd: x[focus].availableDays, daysUntilLastIrrigation: x[focus].daysToLastTurn, lastIrrigationStatus: x[focus].lastTurnStatus, canalTurnsAfterSowing: x[focus].turns, calendarCheck: x.ev.strategies.find((r) => r.def.id === focus)!.calendar.state, yearsMeetingColdNightQuestion: series ? climateReading(x.ev, series, { ...cfg, strategy: focus }).summary.met : null });
    doc.comparison = { plan: side(cmp.plan), other: side(cmp.proposed) };
    doc.parcelScope = parcel === null ? "cluster of four example parcels" : `example parcel ${parcel + 1} (anonymous)`;
    if (wxReport || fcReport) doc.weather = { note: "Forecast and NASA history are separate sources; they are never joined into one record.", history: wxReport?.history ?? null, segments: wxReport?.segments ?? [], forecast: fcReport?.forecast ?? null, forecastSegments: fcReport?.segments ?? [] };
    if (doc.hls) doc.hls.selectedImage = selected ? { acquisitionDate: selected.date, sensor: selected.sensor, quality: selected.quality, followPlanDate: follow, planDate: followInfo?.planDate ?? null, offsetDays: followInfo?.offsetDays ?? null, note: "Real 2024 observation; not an image of the plan year." } : null;
    return doc;
  }, [s, ev, series, cfg, data.hls, label, interval, obs, inInterval, station, cmp, focus, selected, follow, followInfo, parcel, wxReport, fcReport]);

  return (
    <>
      <StrategyPatterns />
      <a href="#main" className="sr-only">Skip to the results</a>
      <header className="topbar">
        <div className="wordmark"><img src="logo-mark.svg" alt="" width={48} height={32} />Umbral</div>
        <span className="badge">Example plot</span>
        <div className="spacer" />
        <button type="button" className="btn" onClick={() => openDrawer("methods")}>Sources<span className="wide-only"> and methods</span></button>
        <div style={{ position: "relative" }}>
          <button type="button" className="btn primary" aria-expanded={exportOpen} aria-haspopup="true" onClick={() => setExportOpen(!exportOpen)}>Export</button>
          {exportOpen && (
            <div className="card export-pop" onKeyDown={(e) => e.key === "Escape" && setExportOpen(false)}>
              <p className="note">Inputs, assumptions, sources and results, as shown on screen.</p>
              <button type="button" className="btn" onClick={() => { download("umbral-scenario.json", JSON.stringify(exportDoc, null, 2), "application/json"); setExportOpen(false); }}>Download JSON</button>
              <button type="button" className="btn" onClick={async () => { let logo: string | undefined; try { const svg = await (await fetch("logo.svg")).text(); logo = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`; } catch { logo = undefined; } download("umbral-summary.md", exportMarkdown(exportDoc, logo), "text/markdown"); setExportOpen(false); }}>Download summary (Markdown)</button>
              <button type="button" className="btn" onClick={() => { setExportOpen(false); setTimeout(() => window.print(), 50); }}>Print this page</button>
            </div>
          )}
        </div>
      </header>

      <main className="flow" id="main">
        <section className="intro" aria-labelledby="intro-h">
          <h1 id="intro-h">Does a winter cover fit before the canals close and the cold arrives?</h1>
          <p className="purpose">In the Alto Valle of Río Negro, vegetable plots are irrigated from canals that close for winter, around late April, and reopen in August. Between the summer harvest and the next spring crop, the plot often sits bare. Umbral helps growers use that gap without wasting seed, fuel and work. Before anything is spent, it compares leaving the plot as it is with a grass cover and a legume cover. For each one it shows whether the dates fit and the last canal turns, how often those dates met an early cold night (NASA POWER), what real parcels looked like in a past season (NASA HLS), what each cover is for, and what your field's conditions add. The decision stays with the grower.</p>
          <QuickResult s={s} ev={ev} focus={focus} cold={climateBy[focus]} setRelease={(d) => setS((x) => withReleaseDate(x, d))} showImage={() => { setFollow(true); document.getElementById("fields")?.scrollIntoView({ behavior: "smooth", block: "start" }); }} />
          <div className="nasa-strip" aria-label="What NASA data does here">
            <span className="nasa-strip-h">What NASA data does here</span>
            <a href="#nasa-climate"><span className="nasa-tag">NASA POWER</span> gives the 45-year cold-night count for your dates.</a>
            <a href="#fields"><span className="nasa-tag">NASA HLS</span> shows what real parcels looked like on each 2024 date.</a>
          </div>
          <p className="intro-scope">For irrigated annual fields in the Alto Valle (vegetables and maize). <strong>Main crop</strong>: the one you harvest and the one you plant next. <strong>Winter cover</strong>: an optional crop in between, such as <span className="inline-crop"><CropIcon id="rye" size={18} />rye</span>, <span className="inline-crop"><CropIcon id="oat" size={18} />oat</span> or <span className="inline-crop"><CropIcon id="vetch" size={18} />vetch</span>. Orchards (apple, pear) are a different system and are not covered.</p>
        </section>
        {data.errors.length > 0 && <div className="banner" role="status">Some data files did not load ({data.errors.join(" ")}). The date comparison keeps working; affected sections say what is missing.</div>}
        {!ev.applies && <div className="banner stop" role="status"><strong>{ev.notApplicableText}</strong> The comparison below is kept for that person to read.</div>}
        <div className="hub">
          <HlsPanel hls={data.hls} inter={data.hlsInter} shapes={data.shapes} selected={selected} onSelect={setSelObs} window={[ev.effective.cal.release, ev.window.soilReady]} follow={follow} setFollow={setFollow} followInfo={followInfo} parcel={parcel} onParcel={setParcel} outlines={data.outlines} powerPeriod={data.power ? `${data.power.startDate.slice(0, 4)}–${powerLastDate({ startDate: data.power.startDate, tmin: data.power.tmin, tmax: data.power.tmax, tmean: data.power.tmean, precip: data.power.precip }).slice(0, 4)}` : "not loaded"} openDrawer={openDrawer} loading={data.loading} />
          <WeatherPanel variant="nasa" frost={frost} place={{ name: "General Roca area", lat: -39.053, lon: -67.6 }} series={data.power ? { startDate: data.power.startDate, tmin: data.power.tmin, tmax: data.power.tmax, tmean: data.power.tmean, precip: data.power.precip } : null} station={station} period={nasaPeriod} setPeriod={setNasaPeriod} planWindow={[ev.effective.cal.release, addDays(ev.effective.cal.release, 30)]} cold={{ t: cfg.t, d: cfg.d }} onReport={setWxReport} />
        </div>
        <h2 className="evidence-h" id="plan-h">Your plan for this field</h2>
        <div className="stages12">
          <MyField s={s} set={set} />
          <MyNextSeason s={s} set={set} />
        </div>
        <FieldDetails s={s} set={set} parcels={data.parcels} />
        <details className="card adjust">
          <summary>Adjust assumptions and more about my field</summary>
          <Rail s={s} set={set} openDrawer={openDrawer} parcels={data.parcels} />
        </details>
        <Overview ev={ev} plan={plan} s={s} focus={focus} setFocus={setFocus} cold={climateBy[focus]} station={station} />
        <DateCompare s={s} alt={altDate} setAlt={setAltDate} focus={focus} series={series} cfg={cfg} apply={(d) => { set((x) => ({ ...x, release: d, covers: cmp.proposed.scenario.covers })); setAltDate(s.release); }} />
        <StrategyCards ev={ev} s={s} whatIfActive={whatIf} climateBy={climateBy} />

        <details className="card evidence" id="evidence">
          <summary>Inspect the evidence: full calendar and year-by-year cold nights</summary>
          <div className="evidence-b">
        {data.loading ? (
          <div className="card" style={{ padding: 20 }} aria-busy="true" aria-label="Loading calendar">
            <div className="skel" style={{ height: 22, width: 220 }} />
          </div>
        ) : (
          <Timeline scenario={s} ev={ev} plan={plan} focus={focus} climate={climate} hls={obs} hlsLabel={label} interval={interval} onInterval={(i) => setCustomInterval(i)} selectedObs={selected?.id ?? null} onSelectObs={(id) => { setFollow(false); setSelObs(id); }} onHandle={onHandle} />
        )}
        {customInterval && (
          <div>
            <button type="button" className="btn small" onClick={() => setCustomInterval(null)}>Reset the shaded period</button>
          </div>
        )}
        <ClimatePanel reading={climate} cfg={cfg} setCfg={setCfg} meta={data.power?.meta ?? null} station={station} nextCrop={ev.effective.cal.nextCrop} openDrawer={openDrawer} loading={data.loading} compare={series ? { planDate: cmp.plan.date, altDate: cmp.proposed.date, plan: climateReading(cmp.plan.ev, series, cfg).summary, alt: climateReading(cmp.proposed.ev, series, cfg).summary } : null} />
          </div>
        </details>
        <details className="card adjust wx-later">
          <summary>Weather now and forecast (Open-Meteo, not NASA)</summary>
          <WeatherPanel variant="forecast" place={{ name: "General Roca area", lat: -39.053, lon: -67.6 }} series={data.power ? { startDate: data.power.startDate, tmin: data.power.tmin, tmax: data.power.tmax, tmean: data.power.tmean, precip: data.power.precip } : null} station={station} period={wxPeriod} setPeriod={setWxPeriod} planWindow={[ev.effective.cal.release, addDays(ev.effective.cal.release, 30)]} cold={{ t: cfg.t, d: cfg.d }} onReport={setFcReport} />
        </details>

      </main>
      <footer className="foot">
        <p>Umbral checks dates, canal turns and past weather for one question: does a winter cover fit between two crops? It does not decide for you and does not predict how a crop will grow.</p>
        <p>Data: NASA POWER, NASA HLS (Landsat and Sentinel-2), NOAA weather station records, Río Negro land registry (parcel shapes simplified). Maps: EOX Sentinel-2 cloudless, NASA GIBS, OpenStreetMap. Logo generated with an AI image tool. <button type="button" className="linkbtn" onClick={() => openDrawer("sources")}>Sources</button></p>
      </footer>
      <Drawer open={drawer.open} section={drawer.section} onClose={closeDrawer} data={data} assumptions={exportDoc.assumptions} />
    </>
  );
}
