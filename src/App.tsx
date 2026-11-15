import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppData } from "./data";
import { addDays, fmtDate, maxDate, minDate, toDay, type ISODate } from "./engine/dates";
import { evaluate, demoScenario, hasWhatIf, NO_WHATIF, type Scenario } from "./engine/scenario";
import { climateReading, DEFAULT_CLIMATE, type ClimateSettings } from "./engine/exposure";
import { buildPlanExport, coldWindowFor, planMarkdown } from "./engine/planExport";
import { managementPeriod } from "./engine/period";
import { Timeline, type HandleId } from "./ui/Timeline";
import { biasNote } from "./ui/ClimatePanel";
import { fmtT } from "./engine/climate";
import { StrategyCards } from "./ui/StrategyCards";
import { ClimatePanel } from "./ui/ClimatePanel";
import { HlsPanel, hlsLabel } from "./ui/HlsPanel";
import { DateCompare } from "./ui/DateCompare";
import { compareDates, nearestClearObservation } from "./engine/compare";
import { WeatherPanel, type WeatherReport } from "./weather/WeatherPanel";
import { todayInArgentina } from "./weather/model";
import { lastDate as powerLastDate } from "./climate/history";
import { Drawer } from "./ui/Drawer";
import { StrategyPatterns } from "./ui/bits";
import type { DailySeries } from "./engine/climate";
import { EXPLORABLE, candidateScenario, suggest } from "./engine/recommend";
import { Editor, cropName, fieldName, type Field } from "./ui/Editor";
import { Possibilities } from "./ui/Possibilities";
import { MapWorkspace, type Layer } from "./ui/Workspace";
import { conditionFor, exposureByYear, summarize, yearsInRange } from "./engine/climate";
import { seriesYears } from "./engine/exposure";
import { SavedPlans } from "./ui/SavedPlans";
import { EmitCard } from "./ui/EmitCard";
import { selectHls, toExported, type Scope } from "./engine/hlsSelect";
import { addNote, fingerprint, loadStore, saveCopy, saveCopyBeforeOpen, saveStore, updatePlan, type PlanState, type SavedPlan, type Store } from "./engine/planStore";
import { beforeSowing, defaultPlanName, plantsUnconfirmed, standingPhrase } from "./engine/planText";
import { ResultSummary, summarize as summarizeResult } from "./ui/ResultSummary";
import { linksToSaved, useNotice } from "./ui/notice";

type View = "plan" | "climate" | "saved";
const VIEWS: { id: View; label: string }[] = [
  { id: "plan", label: "Plan" },
  { id: "climate", label: "Climate & NASA" },
  { id: "saved", label: "Saved plans" },
];

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

const storage = (() => {
  try {
    return window.localStorage;
  } catch {
    return { getItem: () => null, setItem: () => { throw new Error("no storage"); } } as unknown as Storage;
  }
})();

export default function App() {
  const data = useAppData();
  const [view, setView] = useState<View>("plan");
  const [s, setS] = useState<Scenario>(demoScenario);
  const [cfg, setCfg] = useState<ClimateSettings>(DEFAULT_CLIMATE);
  const [field, setField] = useState<Field>(null);
  const [customInterval, setCustomInterval] = useState<[ISODate, ISODate] | null>(null);
  const [selObs, setSelObs] = useState<string | null>(null);
  const [altDate, setAltDate] = useState<ISODate>("2027-03-25");
  const [follow, setFollow] = useState(false);
  const [wxPeriod, setWxPeriod] = useState<[ISODate, ISODate]>(() => { const d = todayInArgentina(); return [d, addDays(d, 6)]; });
  const [wxReport, setWxReport] = useState<WeatherReport | null>(null);
  // NASA history follows the plan unless the person edits the dates; then it says so and offers a way back.
  const [nasaManual, setNasaManual] = useState<[ISODate, ISODate] | null>(null);
  const [store, setStore] = useState<Store>(() => loadStore(storage, { climate: DEFAULT_CLIMATE, base: demoScenario() }));
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [storageOk, setStorageOk] = useState(true);
  const [drawer, setDrawer] = useState<{ open: boolean; section: string }>({ open: false, section: "methods" });
  const [exportOpen, setExportOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [layer, setLayer] = useState<Layer>("hls");
  const [incompleteIds, setIncompleteIds] = useState<string[]>([]);
  const report = useCallback((id: string, bad: boolean) => setIncompleteIds((xs) => (bad ? (xs.includes(id) ? xs : [...xs, id]) : xs.filter((x) => x !== id))), []);
  const incomplete = incompleteIds.length > 0;
  const exportBtn = useRef<HTMLButtonElement>(null);

  const set = useCallback((f: (s: Scenario) => Scenario) => setS((x) => f(x)), []);
  const openDrawer = useCallback((section: string) => setDrawer({ open: true, section }), []);
  const closeDrawer = useCallback(() => setDrawer((d) => ({ ...d, open: false })), []);
  const parcel = typeof field === "number" ? field : null;
  const setParcel = useCallback((i: number | null) => setField(i === null ? "cluster" : i), []);

  // Sticky elements sit below the real topbar, whose height changes when it wraps.
  useEffect(() => {
    const bar = document.querySelector<HTMLElement>(".topbar");
    if (!bar || typeof ResizeObserver === "undefined") return;
    const setH = () => document.documentElement.style.setProperty("--topbar-h", `${Math.ceil(bar.getBoundingClientRect().height)}px`);
    setH();
    const ro = new ResizeObserver(setH);
    ro.observe(bar);
    return () => ro.disconnect();
  }, []);

  // Leaflet maps in a view that was hidden need their size recomputed when shown.
  useEffect(() => {
    const t = setTimeout(() => window.dispatchEvent(new Event("resize")), 30);
    window.scrollTo({ top: 0 });
    return () => clearTimeout(t);
  }, [view]);

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
  const sug = useMemo(() => suggest(s, s.goal, climateBy, ev, series), [s, climateBy, ev, series]);
  // One active candidate for calendar, comparison, applied changes, exports and saved plans.
  // Every candidate whose dates and system allow it is selectable; a weaker goal match is shown as a limit, not an exclusion.
  const pool = useMemo(() => [...sug.main, ...sug.others, ...sug.experimental].filter((c) => EXPLORABLE.has(c.status)), [sug]);
  const active = pool.find((c) => c.id === activeId) ?? sug.main[0] ?? null;
  const lostActive = activeId !== null && !pool.some((c) => c.id === activeId);
  // A notice describes the plan state it was issued for; the next change of that state clears it.
  const stateKey = JSON.stringify([s, field, active?.id ?? null]);
  const { notice, notify, dismiss } = useNotice(stateKey);
  useEffect(() => {
    if (lostActive) {
      const lost = [...sug.main, ...sug.others, ...sug.experimental].find((c) => c.id === activeId);
      notify("warning", `${lost ? lost.name : "Your chosen cover"} no longer fits these inputs. ${active ? `Showing ${active.name} instead.` : "No cover is selected."}`);
      setActiveId(null);
    }
  }, [lostActive]); // eslint-disable-line react-hooks/exhaustive-deps
  const cand = useMemo(() => (active ? candidateScenario(s, active.id) : null), [s, active]);
  const focus: "B" | "C" = cand?.strategy ?? "C";
  // The management period, derived once from the system: history, HLS, the cold-night question and exports all use it.
  const period = useMemo(() => managementPeriod(s, ev), [s, ev]);
  const permanentPlan = period.permanent;
  // One cold-night question for the map panel, the cards and the export: from the active cover's sowing
  // to the next crop (annual), or over the window the person entered (orchard / kept beds).
  const coldWindow = coldWindowFor(s, ev, period, active);
  const coldSummary = useMemo(() => {
    if (!series || !coldWindow || toDay(coldWindow[1]) <= toDay(coldWindow[0])) return null;
    const { first, last } = seriesYears(series);
    const rows = exposureByYear(series, { start: coldWindow[0], end: coldWindow[1], t: cfg.t, years: yearsInRange(first, last) });
    void conditionFor;
    return { summary: summarize(rows, cfg.d), start: coldWindow[0], t: cfg.t, d: cfg.d, lagDays: data.station?.summary?.firstEventMedianLagDays[String(cfg.t)] ?? null };
  }, [series, coldWindow?.[0], coldWindow?.[1], cfg.t, cfg.d, data.station]); // eslint-disable-line react-hooks/exhaustive-deps

  const interval: [ISODate, ISODate] = customInterval ?? [period.start, period.end];
  const obs = data.hls?.observations ?? [];
  // Historical image date: chosen explicitly (or by "follow"), never changed silently by planning controls.
  const seasonYear = data.hls ? Number(data.hls.meta.season.start.slice(0, 4)) : 2024;
  const planSowing = permanentPlan ? period.start : active?.calendar.sowing ?? ev.effective.strategies[focus].sowing ?? ev.effective.cal.release;
  const followHit = useMemo(() => (follow && obs.length ? nearestClearObservation(obs, planSowing, seasonYear) : null), [follow, obs, planSowing, seasonYear]);
  useEffect(() => {
    if (selObs || !obs.length) return;
    const first = nearestClearObservation(obs, period.start, seasonYear, 60)?.obs ?? obs.find((o) => o.quality === "clear");
    if (first) setSelObs(first.id);
  }, [obs, selObs, period.start, seasonYear]);
  useEffect(() => {
    if (followHit) setSelObs(followHit.obs.id);
  }, [followHit]);
  const selected = obs.find((o) => o.id === selObs) ?? null;
  const followInfo = follow ? { planDate: planSowing, offsetDays: followHit ? followHit.offsetDays : null } : null;
  const cmp = useMemo(() => compareDates(cand?.scenario ?? s, altDate), [cand, s, altDate]);
  const frost = useMemo(() => {
    if (permanentPlan) {
      if (!coldSummary) return [];
      return [`Over your cover window from ${fmtDate(coldSummary.start)}: in ${coldSummary.summary.met} of ${coldSummary.summary.total} years there were ${coldSummary.d}+ days before the first night at or below ${fmtT(coldSummary.t)} °C.`, biasNote(station, coldSummary.t)];
    }
    const a = climateBy.A;
    if (!a || a.error) return [];
    const q50 = a.quantiles[1];
    const half = q50 === null ? `in half of the years there was no such night before ${fmtDate(a.end)}` : `in half of the years that night came by ${fmtDate(addDays(a.start, q50))}`;
    return [
      `From the date your field is free (${fmtDate(a.start)}): in ${a.summary.met} of ${a.summary.total} years there were ${a.d}+ days before the first night at or below ${fmtT(a.t)} °C; ${half}.`,
      biasNote(station, a.t),
    ];
  }, [climateBy, station, permanentPlan, coldSummary]);
  const label = hlsLabel(data.hls);
  const planWindow: [ISODate, ISODate] = period.history;
  const nasaPeriod = nasaManual ?? planWindow;
  // A plan months ahead has no forecast: open the weather on NASA history for its dates.
  const beyondForecast = toDay(planWindow[0]) > toDay(addDays(todayInArgentina(), 15));
  const scope: Scope = parcel === null ? { kind: "cluster" } : { kind: "parcel", index: parcel };
  // One selection of historical evidence, shared by the evidence panel and both exports.
  const hlsSel = useMemo(() => (data.hls ? selectHls(obs, interval, seasonYear, scope) : null), [data.hls, obs, interval[0], interval[1], seasonYear, parcel]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const current = store.plans.find((p) => p.id === currentId) ?? null;
  const notes = current ? current.notes : store.unassignedNotes;
  const persist = (st: Store) => {
    setStore(st);
    setStorageOk(saveStore(storage, st));
  };
  const suggestedName = defaultPlanName(s, field);
  const planState: PlanState = { scenario: s, field, climate: cfg, evidence: { imageId: selObs, followPlan: follow, historyPeriod: nasaManual }, activeCandidate: active?.id ?? null, inputState: incomplete ? "incomplete" : "complete" };
  const dirty = current ? fingerprint(planState) !== fingerprint(current) : true;
  const fieldChanged = current ? current.field !== field : false;
  const savedMsg = (name: string, verb: string, ok: boolean) =>
    ok ? notify("saved", `${verb} "${name}" in this browser${incomplete ? ", with a date still being edited (marked incomplete)" : ""}.`) : notify("warning", `"${name}" could not be stored in this browser. Use Export plan to keep a copy.`);
  const saveNew = (name: string) => {
    const { store: st, plan: p } = saveCopy(store, name, planState);
    setStore(st);
    const ok = saveStore(storage, st);
    setStorageOk(ok);
    setCurrentId(p.id);
    savedMsg(p.name, "Saved", ok);
  };
  const updateCurrent = () => {
    if (!current) return;
    const { store: st, plan: p } = updatePlan(store, current.id, planState);
    setStore(st);
    const ok = saveStore(storage, st);
    setStorageOk(ok);
    savedMsg(p.name, "Updated", ok);
  };
  // Opening another plan must not silently discard work on screen. The untouched example is not "work".
  const untouched = !current && field === null && activeId === null && JSON.stringify(s) === JSON.stringify(demoScenario());
  const unsaved = current ? dirty : !untouched;
  const [pendingOpen, setPendingOpen] = useState<SavedPlan | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const requestOpen = (p: SavedPlan) => {
    setOpenError(null);
    // Reopening the current plan also replaces unsaved edits, so it asks too.
    if (unsaved) setPendingOpen(p);
    else openPlan(p);
  };
  const resolveOpen = (choice: "save" | "discard" | "cancel") => {
    const p = pendingOpen;
    if (!p) return;
    if (choice === "cancel") {
      setPendingOpen(null);
      return;
    }
    if (choice === "save") {
      const r = saveCopyBeforeOpen(storage, store, current ? current.name : suggestedName, planState);
      if (!r.ok) {
        setStorageOk(false);
        setOpenError("Your current plan could not be saved in this browser, so nothing was opened. Use Export plan to keep it, or choose Discard and open.");
        return;
      }
      setStore(r.store);
      setStorageOk(true);
    }
    setPendingOpen(null);
    openPlan(p);
  };
  const openPlan = (p: SavedPlan) => {
    setS(p.scenario);
    setField(p.field);
    setCfg(p.climate);
    setSelObs(p.evidence.imageId);
    setFollow(p.evidence.followPlan);
    setNasaManual(p.evidence.historyPeriod);
    setActiveId(p.activeCandidate);
    setCurrentId(p.id);
    setView("plan");
    notify("opened", `Opened "${p.name}"${p.inputState === "incomplete" ? " (saved while a date was incomplete)" : ""}.`);
  };

  const review = useMemo(() => beforeSowing(active, sug), [active, sug]);
  const resultState = summarizeResult(active, sug, review, incomplete);

  const exportDoc = useMemo(() => {
    const selectedImage = selected ? { ...toExported(selected, scope), followPlanDate: follow, planDate: followInfo?.planDate ?? null, offsetDays: followInfo?.offsetDays ?? null, note: `Real ${seasonYear} observation; not an image of the plan year.` } : null;
    const hls = data.hls && hlsSel ? { label, selection: hlsSel, selectedImage } : null;
    const side = (x: typeof cmp.plan) => ({ fieldFree: x.date, cover: active?.name ?? null, coverGroup: focus, calendarDaysUntilCoverMustEnd: x[focus].availableDays, daysUntilLastIrrigation: x[focus].daysToLastTurn, lastIrrigationStatus: x[focus].lastTurnStatus, canalTurnsAfterSowing: x[focus].turns, calendarCheck: x.ev.strategies.find((r) => r.def.id === focus)!.calendar.state, yearsMeetingColdNightQuestion: series ? climateReading(x.ev, series, { ...cfg, strategy: focus }).summary.met : null });
    const weather = wxReport ? { note: "Forecast (Open-Meteo, weather models) and NASA history (POWER, regional reanalysis) are separate sources; they are never joined into one record.", history: { ...wxReport.history, followsPlan: nasaManual === null, planPeriod: period.history, planPeriodLabel: period.historyLabel, ...(nasaManual ? { exploring: "A period chosen to explore, not the plan's period." } : {}) }, segments: wxReport.segments, forecast: wxReport.forecast, forecastSegments: wxReport.forecastSegments } : null;
    return buildPlanExport({
      s, ev, sug, active, series, cfg, station, hls, weather, notes, incomplete,
      fieldLabel: `${fieldName(field)}; evidence scope: ${hlsSel?.scope ?? "cluster of four example parcels"}`,
      comparison: !permanentPlan && active ? { plan: side(cmp.plan), other: side(cmp.proposed) } : null,
    });
  }, [s, ev, series, cfg, data.hls, label, hlsSel, station, cmp, focus, selected, follow, followInfo, field, wxReport, seasonYear, sug, notes, active, incomplete, permanentPlan, nasaManual, period]); // eslint-disable-line react-hooks/exhaustive-deps

  const tabKeys = (e: React.KeyboardEvent) => {
    const i = VIEWS.findIndex((v) => v.id === view);
    let j = i;
    if (e.key === "ArrowRight") j = (i + 1) % VIEWS.length;
    else if (e.key === "ArrowLeft") j = (i - 1 + VIEWS.length) % VIEWS.length;
    else return;
    e.preventDefault();
    dismiss();
    setView(VIEWS[j].id);
    document.getElementById(`view-tab-${VIEWS[j].id}`)?.focus();
  };

  return (
    <>
      <StrategyPatterns />
      <a href="#main" className="sr-only">Skip to the content</a>
      <header className="topbar">
        <div className="wordmark"><img src="logo-mark.svg" alt="Umbral logo, AI-generated" width={38} height={26} /><span className="wm-name">umbral<b>.</b></span><span className="wm-tag">A little space.<br />A living possibility.<small className="ai-mark">Logo: AI-generated</small></span></div>
        <nav className="views" role="tablist" aria-label="Views" onKeyDown={tabKeys}>
          {VIEWS.map((v) => (
            <button key={v.id} id={`view-tab-${v.id}`} type="button" role="tab" aria-selected={view === v.id} aria-controls={`view-${v.id}`} tabIndex={view === v.id ? 0 : -1} onClick={() => { if (v.id !== view) dismiss(); setView(v.id); }}>{v.label}</button>
          ))}
        </nav>
        <div className="actions">
          <button type="button" className="btn ghost" onClick={() => openDrawer("methods")}>Sources</button>
        </div>
      </header>
      <div className="notice-region" role="status" aria-live="polite">
        {notice && (
          <p className={`toast ${notice.kind}`}>
            <span>{notice.text}</span>
            {linksToSaved(notice.kind) && <button type="button" className="linkbtn" onClick={() => { dismiss(); setView("saved"); }}>Saved plans</button>}
            <button type="button" className="toast-x" aria-label="Dismiss notification" onClick={dismiss}>×</button>
          </p>
        )}
      </div>

      <main id="main" className="workspace">
        {data.errors.length > 0 && <div className="banner" role="status">Some data files did not load ({data.errors.join(" ")}). The date check keeps working; affected parts say what is missing.</div>}

        <div id="view-plan" role="tabpanel" aria-labelledby="view-tab-plan" hidden={view !== "plan"}>
          <div className="page-head">
            <div>
              <p className="kicker">General Roca · Alto Valle, Argentina</p>
              <h1>A plan for living soil.</h1>
              <p className="page-sub">Explore what could grow in the space and time around your commercial crop, and what it could do for the soil and that crop.</p>
            </div>
            <div className="page-actions">
              <div className="export-wrap">
                <button ref={exportBtn} type="button" className="btn" aria-expanded={exportOpen} aria-haspopup="true" onClick={() => setExportOpen(!exportOpen)}>Export plan</button>
                {exportOpen && (
                  <div className="card export-pop" onKeyDown={(e) => { if (e.key === "Escape") { setExportOpen(false); exportBtn.current?.focus(); } }}>
                    <p className="note">The plan as it is on screen now, including unsaved changes: inputs, selected option, checks, evidence scope and sources.</p>
                    <button type="button" className="btn" autoFocus onClick={() => { download("umbral-plan.json", JSON.stringify(exportDoc, null, 2), "application/json"); setExportOpen(false); }}>Download JSON</button>
                    <button type="button" className="btn" onClick={async () => { let logo: string | undefined; try { const svg = await (await fetch("logo.svg")).text(); logo = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`; } catch { logo = undefined; } download("umbral-summary.md", planMarkdown(exportDoc, logo), "text/markdown"); setExportOpen(false); }}>Download summary (Markdown)</button>
                    <button type="button" className="btn" onClick={() => { setExportOpen(false); setTimeout(() => window.print(), 50); }}>Print this view</button>
                  </div>
                )}
              </div>
              {current ? (
                <>
                  <span className="save-state" aria-live="polite">{dirty ? "Unsaved changes" : "Saved"}</span>
                  <button type="button" className="btn" onClick={() => saveNew(current.name)}>Save a copy</button>
                  <button type="button" className="btn primary" disabled={!dirty} onClick={updateCurrent}>{fieldChanged ? `Update plan (field ${current.field === null ? "?" : current.field === "cluster" ? "all four" : `P${current.field + 1}`} → ${field === null ? "?" : field === "cluster" ? "all four" : `P${field + 1}`})` : "Update plan"}</button>
                </>
              ) : (
                <button type="button" className="btn primary" onClick={() => saveNew(suggestedName)}>Save plan</button>
              )}
            </div>
          </div>
          <MapWorkspace
            data={data}
            field={field}
            setField={setField}
            layer={layer}
            setLayer={setLayer}
            selected={selected}
            onSelectObs={setSelObs}
            follow={follow}
            setFollow={setFollow}
            followInfo={followInfo}
            planWindow={[period.start, period.end]}
            coldWindow={coldWindow}
            cfg={cfg}
            setCfg={setCfg}
            station={station}
            active={active}
            permanent={permanentPlan}
            onSources={() => openDrawer("registry")}
          />
          <a href="#edit" className="btn primary next-step">Next: set crops, dates &amp; water</a>
          <div className="plan-grid">
            <Editor s={s} set={set} parcels={data.parcels} report={report} summary={<ResultSummary state={resultState} />} />
            <Possibilities
              s={s}
              ev={ev}
              sug={sug}
              active={active}
              setActive={setActiveId}
              cold={coldSummary}
              evidence={{ hls: hlsSel ? { clear: hlsSel.observations.filter((o) => o.quality === "clear").length, total: hlsSel.observations.length, period: hlsSel.interval.historical } : null, emitDates: [...new Set((data.emit?.scenes ?? []).filter((x) => x.status === "values").map((x) => x.acquired))] }}
              incomplete={incomplete}
              scopeLabel={field === null ? "General Roca" : field === "cluster" ? "All four" : `P${field + 1}`}
              onExplore={(l) => { setLayer(l); document.getElementById("locate")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
              compare={<DateCompare s={cand?.scenario ?? s} alt={altDate} setAlt={setAltDate} focus={focus} series={series} cfg={cfg} apply={(d) => { const pc = cmp.proposed.scenario.covers; set((x) => ({ ...x, release: d, covers: { B: { ...x.covers.B, sowing: pc.B.sowing }, C: { ...x.covers.C, sowing: pc.C.sowing } } })); setAltDate(s.release); notify("info", `Plan moved to free date ${fmtDate(d, true)}.`); }} />}
              table={<StrategyCards ev={ev} s={s} whatIfActive={whatIf} climateBy={climateBy} />}
            />
          </div>
          <nav className="mobile-bar" aria-label="Plan sections">
            <a href="#locate" className="btn">Map</a>
            <a href="#edit" className="btn">Edit plan</a>
            <a href="#result" className={`btn primary mb-result ${resultState.tone}`} aria-label={`View result: ${resultState.title}, ${resultState.status}, ${resultState.checks}`}><span>View result</span><small>{incomplete ? "Last valid result" : resultState.short}</small></a>
          </nav>
        </div>

        <div id="view-climate" role="tabpanel" aria-labelledby="view-tab-climate" hidden={view !== "climate"} className="climate-view">
          <h1 className="view-h1">Climate &amp; NASA evidence</h1>
          <p className="ctx-line">For <strong>{fieldName(field)}</strong>: {permanentPlan ? `${standingPhrase(s).stays}; cover window ${fmtDate(s.orchard.window[0], true)} to ${fmtDate(s.orchard.window[1], true)}` : `${cropName(s.previousCropId)} to ${cropName(s.nextCropId)}, field free ${fmtDate(s.release, true)}`}. <button type="button" className="linkbtn" onClick={() => setView("plan")}>Back to the plan</button></p>
          <div className="climate-grid">
            <WeatherPanel initialTab={beyondForecast ? "history" : "now"} frost={frost} place={{ name: "General Roca area", lat: -39.053, lon: -67.6 }} series={data.power ? { startDate: data.power.startDate, tmin: data.power.tmin, tmax: data.power.tmax, tmean: data.power.tmean, precip: data.power.precip } : null} station={station} cold={{ t: cfg.t, d: cfg.d }} onReport={setWxReport} history={{ period: nasaPeriod, following: nasaManual === null, planWindow, planLabel: period.historyLabel, setManual: setNasaManual, followPlan: () => setNasaManual(null) }} forecastPeriod={wxPeriod} setForecastPeriod={setWxPeriod} />
            <HlsPanel hls={data.hls} inter={data.hlsInter} shapes={data.shapes} selected={selected} onSelect={setSelObs} window={[period.start, period.end]} follow={follow} setFollow={setFollow} followInfo={followInfo} selection={hlsSel} parcel={parcel} onParcel={setParcel} area={(data.area?.outline as [number, number][]) ?? null} outlines={data.outlines} powerPeriod={data.power ? `${data.power.startDate.slice(0, 4)}–${powerLastDate({ startDate: data.power.startDate, tmin: data.power.tmin, tmax: data.power.tmax, tmean: data.power.tmean, precip: data.power.precip }).slice(0, 4)}` : "not loaded"} openDrawer={openDrawer} loading={data.loading} />
          </div>
          <EmitCard emit={data.emit} onSources={() => openDrawer("registry")} />
          {permanentPlan ? (
            <p className="card note-card">The annual calendar (field free, soil preparation, next crop) does not apply {plantsUnconfirmed(s) ? `if the ${cropName(s.previousCropId).toLowerCase()} plants stay (not confirmed)` : `while the ${cropName(s.previousCropId).toLowerCase()} stays in place`}. The cold-night question for your cover window, year by year, is in Plan → Weather history.</p>
          ) : (
            <details className="card evidence">
              <summary>Full calendar and year-by-year cold nights</summary>
              <div className="evidence-b">
                {data.loading ? <div className="skel" style={{ height: 22, width: 220 }} aria-label="Loading calendar" /> : (
                  <Timeline scenario={s} ev={ev} plan={plan} focus={focus} climate={climate} hls={obs} hlsLabel={label} interval={interval} onInterval={(i) => setCustomInterval(i)} selectedObs={selected?.id ?? null} onSelectObs={(id) => { setFollow(false); setSelObs(id); }} onHandle={onHandle} />
                )}
                {customInterval && <div><button type="button" className="btn small" onClick={() => setCustomInterval(null)}>Reset the shaded period</button></div>}
                <ClimatePanel reading={climate} cfg={cfg} setCfg={setCfg} meta={data.power?.meta ?? null} station={station} nextCrop={ev.effective.cal.nextCrop} openDrawer={openDrawer} loading={data.loading} compare={series ? { planDate: cmp.plan.date, altDate: cmp.proposed.date, plan: climateReading(cmp.plan.ev, series, cfg).summary, alt: climateReading(cmp.proposed.ev, series, cfg).summary } : null} />
              </div>
            </details>
          )}
          <p className="chart-foot">Each source's status (used, probed, catalog only, authorization required) is under <button type="button" className="linkbtn" onClick={() => openDrawer("registry")}>Sources and methods</button>.</p>
        </div>

        <div id="view-saved" role="tabpanel" aria-labelledby="view-tab-saved" hidden={view !== "saved"}>
          <h1 className="view-h1">Saved plans and field notes</h1>
          <SavedPlans
            store={store}
            currentId={currentId}
            storageOk={storageOk}
            suggestedName={suggestedName}
            onSave={saveNew}
            onOpen={requestOpen}
            pendingOpen={pendingOpen}
            onResolveOpen={resolveOpen}
            openError={openError}
            currentUnsaved={unsaved}
            onDelete={(id) => { persist({ ...store, plans: store.plans.filter((p) => p.id !== id) }); if (id === currentId) setCurrentId(null); if (pendingOpen?.id === id) setPendingOpen(null); }}
            onAddNote={(pid, date, text) => persist(addNote(store, pid, { date, text }))}
            onDeleteNote={(pid, i) => persist(pid ? { ...store, plans: store.plans.map((p) => (p.id === pid ? { ...p, notes: p.notes.filter((_, j) => j !== i) } : p)) } : { ...store, unassignedNotes: store.unassignedNotes.filter((_, j) => j !== i) })}
          />
        </div>
      </main>
      <footer className="foot">
        <p>Umbral helps explore service crops for the time and space around a commercial crop: between annual crops, in an orchard interrow or beside beds. It checks dates, water, past weather and published evidence; it does not decide for you or predict how a crop will grow, and it computes no money, yield or nitrogen amount. No NASA endorsement is implied. Data: NASA POWER, NASA HLS, NASA EMIT, NOAA station records, Río Negro provincial parcel layer (IDERN). Forecast: Open-Meteo. Maps: EOX Sentinel-2 cloudless, NASA GIBS, OpenStreetMap. Logo generated with an AI image tool.</p>
      </footer>
      <Drawer open={drawer.open} section={drawer.section} onClose={closeDrawer} data={data} assumptions={exportDoc.assumptions} />
    </>
  );
}
