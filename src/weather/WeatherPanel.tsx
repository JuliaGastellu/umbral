import { useEffect, useMemo, useRef, useState } from "react";

/** Width of a chart's own box, so charts fill their container instead of a fixed size. */
function useBoxWidth(min = 300): [React.RefObject<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(560);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, Math.max(min, w)];
}
import { addDays, diffDays, fmtDate, isValidISO, parts, toDay, type ISODate } from "../engine/dates";
import { exposureByYear, fmtT, summarize, type DailySeries } from "../engine/climate";
import type { StationSummary } from "../engine/exposure";
import { climatology, lastDate, periodInYear, periodStats, type PowerSeries } from "../climate/history";
import { forecastFacts, segmentPeriod, todayInArgentina, weatherWord, type DailyWeather, type HourlyWeather, type Place, type Segment } from "./model";
import { useForecast, useLivePower, type LiveState } from "./useWeather";
import { WeatherIcon } from "./WeatherIcon";

type Tab = "now" | "forecast" | "history";

interface Props {
  place: Place;
  series: PowerSeries | null;
  station: StationSummary | null;
  cold: { t: number; d: number };
  onReport?: (r: WeatherReport) => void;
  /** NASA history period: follows the plan unless the person edits it. */
  history: { period: [ISODate, ISODate]; following: boolean; planWindow: [ISODate, ISODate]; /** How the plan's period is described, from the shared management period. */ planLabel: string; setManual: (p: [ISODate, ISODate]) => void; followPlan: () => void };
  /** Forecast consultation period; browsing it never changes the plan. */
  forecastPeriod: [ISODate, ISODate];
  setForecastPeriod: (p: [ISODate, ISODate]) => void;
  /** Short cold-night summary for the plan's free date (shown with the NASA history). */
  frost?: string[];
  /** Tab shown first: NASA history when the plan is beyond the forecast horizon. */
  initialTab?: Tab;
}

export interface WeatherReport {
  forecast: { provider: string; model: string; retrievedAt: string | null; status: string; grid: string | null; available: [ISODate, ISODate] | null; units: Record<string, string>; requested: [ISODate, ISODate] } | null;
  forecastSegments: Segment[];
  history: { source: string; requested: [ISODate, ISODate]; followsPlan: boolean; bundled: [ISODate, ISODate]; live: { status: string; validDays: number; lastValid: ISODate | null; retrievedAt: string | null; version: string | null } | null };
  segments: Segment[];
}

const KIND_TEXT: Record<Segment["kind"], string> = {
  forecast: "forecast (Open-Meteo)",
  "nasa-bundled": "NASA POWER record (bundled)",
  "nasa-live": "NASA POWER record (fetched now)",
  "none-future": "no daily forecast available",
  "none-past": "no data available",
};

const fmtTime = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString("en-GB", { timeZone: "America/Argentina/Buenos_Aires", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};
const f1 = (v: number | null | undefined) => (v === null || v === undefined ? "—" : (Math.round(v * 10) / 10).toString());
const dow = (d: ISODate) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(`${d}T12:00:00Z`).getUTCDay()];

const TAB_NAME: Record<Tab, string> = { now: "Today", forecast: "Next days", history: "NASA history" };

/**
 * Weather consultation for the example area: Today and Next days come from the
 * Open-Meteo forecast (weather models, not NASA); NASA history comes from the
 * NASA POWER regional record. One value for the whole area: all four example
 * parcels share it. Nothing here changes the plan's dates.
 */
export function WeatherPanel({ place, series, station, cold, onReport, history, forecastPeriod, setForecastPeriod, frost, initialTab = "now" }: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);
  // Links elsewhere on the page that point at the NASA history open that tab.
  useEffect(() => {
    const on = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.('a[href="#nasa-climate"]');
      if (a) setTab("history");
    };
    document.addEventListener("click", on);
    return () => document.removeEventListener("click", on);
  }, []);
  const fc = useForecast(place, true);
  const today = todayInArgentina();
  const forecast = fc.forecast;
  const period = history.period;
  const bundledFirst = series?.startDate ?? "1981-01-01";
  const bundledLast = series ? lastDate(series) : "2025-12-31";
  // live NASA only for past dates after the bundled record
  const liveRange: [ISODate, ISODate] | null = useMemo(() => {
    const a = toDay(period[0]) > toDay(bundledLast) ? period[0] : addDays(bundledLast, 1);
    const b = toDay(period[1]) < toDay(today) ? period[1] : addDays(today, -1);
    return toDay(a) <= toDay(b) && toDay(period[1]) > toDay(bundledLast) ? [a, b] : null;
  }, [period, bundledLast, today]);
  const live = useLivePower(liveRange);
  const cov = { today, forecastFirst: forecast?.firstDate ?? null, forecastLast: forecast?.lastDate ?? null, bundledFirst, bundledLast };
  const segments = segmentPeriod(period[0], period[1], { ...cov, liveDays: live.status === "ok" ? live.validDays : null });
  const fcSegments = segmentPeriod(forecastPeriod[0], forecastPeriod[1], { ...cov, liveDays: null });

  const report: WeatherReport = {
    forecast: forecast ? { provider: "Open-Meteo (open-meteo.com), CC BY 4.0", model: forecast.model, retrievedAt: forecast.retrievedAt, status: fc.status, grid: `${forecast.gridLat.toFixed(3)}, ${forecast.gridLon.toFixed(3)}`, available: forecast.firstDate && forecast.lastDate ? [forecast.firstDate, forecast.lastDate] : null, units: forecast.units, requested: forecastPeriod } : null,
    forecastSegments: fcSegments,
    history: { source: "NASA POWER daily, regional reanalysis (MERRA-2 / GEOS-IT, about 55 km), General Roca reference point", requested: period, followsPlan: history.following, bundled: [bundledFirst, bundledLast], live: liveRange ? { status: live.status, validDays: live.validDays.length, lastValid: live.lastValid, retrievedAt: live.retrievedAt, version: live.version } : null },
    segments,
  };
  const reportKey = JSON.stringify(report);
  useEffect(() => onReport?.(JSON.parse(reportKey)), [reportKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="card wx" aria-labelledby="wx-h" id="nasa-climate">
      <div className="wx-head">
        <div>
          <h2 id="wx-h">Weather and climate for the example area</h2>
          <p className="wx-loc">One value for the whole area near −39.05, −67.60: the four example parcels share it. Browsing dates here does not change your plan.</p>
        </div>
        <div className="tabs wx-tabs" role="tablist" aria-label="Weather views">
          {(["now", "forecast", "history"] as Tab[]).map((t) => (
            <button key={t} id={`wx-tab-${t}`} role="tab" type="button" aria-selected={tab === t} aria-controls="wx-panel" tabIndex={tab === t ? 0 : -1} onClick={() => setTab(t)}>{TAB_NAME[t]}</button>
          ))}
        </div>
      </div>
      <p className="wx-src" aria-live="polite">
        {tab === "history" ? "Source: NASA POWER, regional reanalysis (grid about 55 km), daily record 1981–2025 plus recent days fetched live. A past record, not a forecast." : "Source: Open-Meteo forecast (weather models, grid a few km). Not NASA data and not an official SMN warning. It reaches about 16 days ahead."}
      </p>
      <div id="wx-panel" role="tabpanel" aria-labelledby={`wx-tab-${tab}`}>
        {tab === "history" && !history.following && frost && frost.length > 0 && (
          <div className="frost-sum">
            {frost.map((f, i) => <p key={i} className={i === 0 ? "frost-main" : "caveat-line"}>{f}</p>)}
          </div>
        )}
        {tab === "history" && <HistoryPeriodBar history={history} segments={segments} />}
        {tab === "forecast" && <ForecastPeriodBar period={forecastPeriod} setPeriod={setForecastPeriod} today={today} planStart={history.planWindow[0]} segments={fcSegments} />}
        <div className="wx-body">
          {tab === "now" && <NowView state={fc} today={today} />}
          {tab === "forecast" && <ForecastView state={fc} period={forecastPeriod} today={today} onHistory={() => setTab("history")} />}
          {tab === "history" && <HistoryView series={series} live={live} period={period} today={today} station={station} cold={cold} bundledLast={bundledLast} />}
        </div>
      </div>
      {tab !== "history" && (
        <p className="wx-attrib">Forecast data: <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> (CC BY 4.0, free non-commercial use).</p>
      )}
    </section>
  );
}

function Coverage({ segments, past }: { segments: Segment[]; past?: boolean }) {
  const text = (k: Segment["kind"]) => (past && (k === "none-future" || k === "forecast") ? "has not happened yet: shown through the same calendar dates in past years" : KIND_TEXT[k]);
  return (
    <p className="wx-coverage" aria-live="polite">
      {segments.length === 0 ? "Choose an end date after the start date." : segments.map((s, i) => (
        <span key={i} className={past && (s.kind === "none-future" || s.kind === "forecast") ? "" : `seg-${s.kind}`}>{fmtDate(s.from, true)}{s.to !== s.from ? `–${fmtDate(s.to, true)}` : ""}: {text(s.kind)}{i < segments.length - 1 ? "; " : ""}</span>
      ))}
    </p>
  );
}

function DateInputs({ period, onChange }: { period: [ISODate, ISODate]; onChange: (p: [ISODate, ISODate]) => void }) {
  return (
    <>
      <label>From <input className="input date" type="date" value={period[0]} onChange={(e) => isValidISO(e.target.value) && onChange([e.target.value, toDay(e.target.value) > toDay(period[1]) ? e.target.value : period[1]])} /></label>
      <label>to <input className="input date" type="date" value={period[1]} onChange={(e) => isValidISO(e.target.value) && toDay(e.target.value) >= toDay(period[0]) && onChange([period[0], e.target.value])} /></label>
    </>
  );
}

function HistoryPeriodBar({ history, segments }: { history: Props["history"]; segments: Segment[] }) {
  return (
    <div className="wx-period">
      <div className="wx-period-row">
        <DateInputs period={history.period} onChange={history.setManual} />
      </div>
      {history.following ? (
        <p className="wx-follow">Following your plan: {history.planLabel}. Change the dates to explore another period.</p>
      ) : (
        <p className="wx-follow manual" role="status">
          Exploring a period you chose, not your plan's ({fmtDate(history.planWindow[0], true)}–{fmtDate(history.planWindow[1], true)}).{" "}
          <button type="button" className="btn small" onClick={history.followPlan}>Follow my plan again</button>
        </p>
      )}
      <Coverage segments={segments} past />
    </div>
  );
}

function ForecastPeriodBar({ period, setPeriod, today, planStart, segments }: { period: [ISODate, ISODate]; setPeriod: (p: [ISODate, ISODate]) => void; today: ISODate; planStart: ISODate; segments: Segment[] }) {
  return (
    <div className="wx-period">
      <div className="wx-period-row">
        <DateInputs period={period} onChange={setPeriod} />
        <button type="button" className="btn small" onClick={() => setPeriod([today, addDays(today, 6)])}>Next 7 days</button>
        <button type="button" className="btn small" onClick={() => setPeriod([today, addDays(today, 15)])}>Next 16 days</button>
        <button type="button" className="btn small" onClick={() => setPeriod([planStart, addDays(planStart, 6)])}>My plan's free date ({fmtDate(planStart)})</button>
      </div>
      <Coverage segments={segments} />
    </div>
  );
}

function NowView({ state, today }: { state: ReturnType<typeof useForecast>; today: ISODate }) {
  if (state.status === "loading") return <div className="skel" style={{ height: 140 }} aria-label="Loading current weather" />;
  if (state.status === "error") return <p className="banner" role="status">The forecast service could not be reached ({state.error}). The NASA climate history and the planning tools still work.</p>;
  const f = state.forecast;
  const c = f.current;
  const d = f.daily.find((x) => x.date === today) ?? f.daily[0];
  return (
    <div className="wx-now">
      {state.status === "stale" && <p className="banner" role="status">Showing the last saved forecast, retrieved {fmtTime(f.retrievedAt)}. It could not be refreshed ({state.error}).</p>}
      {c ? (
        <div className="wx-now-main">
          <WeatherIcon code={c.code} size={84} />
          <div>
            <div className="wx-big">{c.temp !== null ? `${Math.round(c.temp)} °C` : "—"}</div>
            <div className="wx-word">{weatherWord(c.code)}</div>
            <div className="wx-time">Model estimate for {c.time.slice(11, 16)}, {fmtDate(c.time.slice(0, 10))} (local time)</div>
          </div>
          <dl className="wx-facts">
            <dt>Today</dt><dd>{d?.tmin ?? "—"} °C to {d?.tmax ?? "—"} °C</dd>
            <dt>Humidity</dt><dd>{c.humidityPct ?? "—"} %</dd>
            <dt>Wind</dt><dd>{c.windKmh ?? "—"} km/h, gusts {c.gustKmh ?? "—"} km/h</dd>
            <dt>Rain today</dt><dd>{d?.rainMm ?? "—"} mm expected{d?.rainProbMaxPct !== null && d?.rainProbMaxPct !== undefined ? ` (chance up to ${d.rainProbMaxPct} %)` : ""}</dd>
          </dl>
        </div>
      ) : (
        <p className="note">The provider returned no current values.</p>
      )}
      <p className="chart-foot">Retrieved {fmtTime(f.retrievedAt)}. "Now" is a weather-model value for a 15-minute step at the nearest model grid point ({f.gridLat.toFixed(2)}, {f.gridLon.toFixed(2)}), not a measurement at the field.</p>
    </div>
  );
}

function ForecastView({ state, period, today, onHistory }: { state: ReturnType<typeof useForecast>; period: [ISODate, ISODate]; today: ISODate; onHistory: () => void }) {
  const [day, setDay] = useState<ISODate | null>(null);
  if (state.status === "loading") return <div className="skel" style={{ height: 160 }} aria-label="Loading forecast" />;
  if (state.status === "error") return <p className="banner" role="status">The forecast service could not be reached ({state.error}). Try again later; the NASA climate history still works.</p>;
  const f = state.forecast;
  const days = f.daily.filter((d) => toDay(d.date) >= toDay(period[0]) && toDay(d.date) <= toDay(period[1]));
  const sel = days.find((d) => d.date === day) ?? days[0];
  // Days that could have a forecast: from today (or the period start) to the period end.
  const from = toDay(period[0]) > toDay(today) ? period[0] : today;
  const expected = Math.max(0, diffDays(from, period[1]) + 1);
  if (!days.length) {
    return (
      <div className="wx-empty">
        <p className="answer-line">No daily forecast is available for {fmtDate(period[0], true)}–{fmtDate(period[1], true)}. The forecast runs from {f.firstDate ? fmtDate(f.firstDate, true) : "—"} to {f.lastDate ? fmtDate(f.lastDate, true) : "—"}; dates further ahead, such as next autumn, cannot be forecast.</p>
        <button type="button" className="btn" onClick={onHistory}>See NASA history for your plan's dates</button>
      </div>
    );
  }
  return (
    <div>
      {state.status === "stale" && <p className="banner" role="status">Last saved forecast, retrieved {fmtTime(f.retrievedAt)}; it could not be refreshed. Days before today are no longer a forecast.</p>}
      <ul className="wx-facts-list">{forecastFacts(days, expected).map((x) => <li key={x}>{x}</li>)}</ul>
      <div className="wx-days" role="radiogroup" aria-label="Forecast days">
        {days.map((d) => (
          <button key={d.date} type="button" role="radio" aria-checked={sel?.date === d.date} className="wx-day" onClick={() => setDay(d.date)}>
            <span className="wx-dow">{dow(d.date)} {fmtDate(d.date)}</span>
            <WeatherIcon code={d.code} size={40} />
            <span className="wx-mm"><strong>{d.tmax ?? "—"}°</strong> / {d.tmin ?? "—"}°</span>
            <span className="wx-rain">{d.rainMm ?? "—"} mm{d.rainProbMaxPct !== null ? ` · ${d.rainProbMaxPct} %` : ""}</span>
          </button>
        ))}
      </div>
      {sel && <HourlyChart day={sel} hours={f.hourly.filter((h) => h.date === sel.date)} />}
      <p className="chart-foot">Each card: highest / lowest temperature (°C), expected rain (mm) and the highest hourly chance of rain (%). Forecasts lose detail further ahead. A forecast minimum at or below 0 °C is a temperature reading, not a measure of crop damage; rain is not irrigation advice.</p>
    </div>
  );
}

function HourlyChart({ day, hours }: { day: DailyWeather; hours: HourlyWeather[] }) {
  const [box, W] = useBoxWidth(300);
  const L = 40, R = 40, T = 26, H1 = 130, G = 30, H2 = 70;
  if (!hours.length) return <p className="note">No hourly values for this day.</p>;
  const temps = hours.map((h) => h.temp).filter((v): v is number => v !== null);
  const lo = Math.floor(Math.min(...temps) - 1), hi = Math.ceil(Math.max(...temps) + 1);
  if (!temps.length) return <p className="note">No hourly temperatures for this day.</p>;
  const rains = hours.map((h) => h.rainMm).filter((v): v is number => v !== null);
  const rmax = Math.max(1, Math.ceil(Math.max(0, ...rains)));
  const missingT = hours.filter((h) => h.temp === null).length;
  const missingR = hours.filter((h) => h.rainMm === null).length;
  const x = (hr: number) => L + (hr / 23) * (W - L - R);
  const yT = (v: number) => T + (1 - (v - lo) / (hi - lo)) * H1;
  const yR0 = T + H1 + G + H2;
  const hR = (v: number) => (v / rmax) * H2;
  // Break the line where an hour has no value; never join across a gap.
  const path = hours.map((h, i) => (h.temp === null ? "" : `${i && hours[i - 1].temp !== null ? "L" : "M"}${x(h.hour).toFixed(1)} ${yT(h.temp).toFixed(1)}`)).join(" ");
  return (
    <div className="tbl-scroll" tabIndex={0} ref={box}>
      <h3 className="sub-q">{dow(day.date)} {fmtDate(day.date, true)}, hour by hour</h3>
      <svg width={W} height={yR0 + 30} role="img" aria-label={`Hourly forecast for ${fmtDate(day.date, true)}: temperature from ${Math.min(...temps)} to ${Math.max(...temps)} °C; ${rains.reduce((a, b) => a + b, 0).toFixed(1)} mm of rain${missingR ? ` over the ${hours.length - missingR} hours with a value` : " in total"}.`}>
        <text x={L} y={14} className="ax strong">Temperature (°C)</text>
        {[lo, Math.round((lo + hi) / 2), hi].map((v) => (
          <g key={v}><line x1={L} x2={W - R} y1={yT(v)} y2={yT(v)} stroke="var(--border)" /><text x={L - 6} y={yT(v) + 4} textAnchor="end" className="ax">{v}</text></g>
        ))}
        {lo <= 0 && hi >= 0 && <g><line x1={L} x2={W - R} y1={yT(0)} y2={yT(0)} stroke="var(--water-ink)" strokeDasharray="4 3" /><text x={W - R + 4} y={yT(0) + 4} className="ax" fill="var(--water-ink)">0 °C</text></g>}
        <path d={path} fill="none" stroke="var(--accent-ink)" strokeWidth={2.4} />
        <text x={L} y={T + H1 + G - 6} className="ax strong">Rain (mm per hour)</text>
        <line x1={L} x2={W - R} y1={yR0} y2={yR0} stroke="var(--border-strong)" />
        <text x={L - 6} y={yR0 - H2 + 4} textAnchor="end" className="ax">{rmax}</text>
        <text x={L - 6} y={yR0 + 4} textAnchor="end" className="ax">0</text>
        {hours.map((h) => h.rainMm === null
          ? <text key={h.time} x={x(h.hour)} y={yR0 - 4} textAnchor="middle" className="ax" fill="var(--muted)">?<title>{h.time.slice(11, 16)}: no rain value</title></text>
          : <rect key={h.time} x={x(h.hour) - 7} y={yR0 - hR(h.rainMm)} width={14} height={hR(h.rainMm)} fill="var(--water)"><title>{h.time.slice(11, 16)}: {h.rainMm} mm, chance {h.rainProbPct ?? "—"} %, humidity {h.humidityPct ?? "—"} %, wind {h.windKmh ?? "—"} km/h</title></rect>)}
        {[0, 6, 12, 18].map((hr) => <text key={hr} x={x(hr)} y={yR0 + 18} textAnchor="middle" className="ax">{String(hr).padStart(2, "0")}:00</text>)}
      </svg>
      {(missingT > 0 || missingR > 0 || hours.length < 24) && (
        <p className="chart-foot">
          {hours.length < 24 ? `${hours.length} of 24 hours returned. ` : ""}
          {missingT > 0 ? `${missingT} hour${missingT === 1 ? "" : "s"} without a temperature: the line breaks there. ` : ""}
          {missingR > 0 ? `${missingR} hour${missingR === 1 ? "" : "s"} without a rain value, marked "?", not counted as dry.` : ""}
        </p>
      )}
    </div>
  );
}

/* ---------------- NASA climate history ---------------- */

function HistoryView({ series, live, period, today, station, cold, bundledLast }: { series: PowerSeries | null; live: LiveState; period: [ISODate, ISODate]; today: ISODate; station: StationSummary | null; cold: { t: number; d: number }; bundledLast: ISODate }) {
  const liveStatus = live.status;
  const liveError = live.error;
  const [mode, setMode] = useState<"all" | "year">("all");
  const lastBundledYear = parts(bundledLast).y;
  const [year, setYear] = useState<number>(Math.min(lastBundledYear, 2024));
  const length = diffDays(period[0], period[1]) + 1;
  const clim = useMemo(() => (series && length > 0 && length <= 366 ? climatology(series, period[0], period[1], parts(series.startDate).y, lastBundledYear) : null), [series, period, length, lastBundledYear]);
  const coldSummary = useMemo(() => {
    if (!series) return null;
    const s: DailySeries = { startDate: series.startDate, tmin: series.tmin };
    const years = [];
    for (let y = parts(series.startDate).y; y <= lastBundledYear; y++) years.push(y);
    return summarize(exposureByYear(s, { start: period[0], end: period[1], t: cold.t, years }), cold.d);
  }, [series, period, cold, lastBundledYear]);
  if (!series) return <p className="banner">The bundled NASA POWER record did not load.</p>;
  if (length < 1 || length > 366) return <p className="banner">Choose a period between 1 day and one year.</p>;
  // Specific-year view: the actual dates if the period itself is in the record; otherwise the same calendar dates in the chosen year.
  const periodYear = parts(period[0]).y;
  const actualInBundled = toDay(period[1]) <= toDay(bundledLast);
  // Only a finished answer for exactly these dates is shown as the actual period.
  const actualLive = !actualInBundled && toDay(period[0]) > toDay(bundledLast) && toDay(period[1]) < toDay(today) && live.status === "ok" && live.series !== null && live.range?.[0] === period[0] && live.range?.[1] === period[1];
  const yearDays = actualInBundled
    ? periodInYear(series, period[0], length, periodYear)
    : actualLive
      ? periodInYear(live.series!, period[0], length, periodYear)
      : periodInYear(series, period[0], length, year);
  const yStats = periodStats(yearDays);
  const yearLabel = actualInBundled ? `${fmtDate(yearDays.start, true)}–${fmtDate(yearDays.end, true)}` : actualLive ? `${fmtDate(yearDays.start, true)}–${fmtDate(yearDays.end, true)} (fetched from NASA POWER now)` : `same calendar dates in ${year}: ${fmtDate(yearDays.start, true)}–${fmtDate(yearDays.end, true)}`;
  const lag = station?.firstEventMedianLagDays[String(cold.t)];
  return (
    <div>
      <div className="seg wx-mode" role="radiogroup" aria-label="History view">
        <button type="button" role="radio" aria-checked={mode === "all"} onClick={() => setMode("all")}>All years, same dates</button>
        <button type="button" role="radio" aria-checked={mode === "year"} onClick={() => setMode("year")}>One specific year</button>
      </div>
      {mode === "all" && clim && (
        <div>
          <p className="answer-line">
            For {fmtDate(period[0])}–{fmtDate(period[1])} in {clim.years.length} years ({clim.years[0]}–{clim.years[clim.years.length - 1]}): total rain was usually {clim.rainTotal.p10}–{clim.rainTotal.p90} mm (median {clim.rainTotal.p50} mm); the lowest night was usually {f1(clim.lowestMin.p10)} to {f1(clim.lowestMin.p90)} °C; coldest {f1(clim.lowestMin.coldest?.value)} °C on {clim.lowestMin.coldest ? fmtDate(clim.lowestMin.coldest.date, true) : "—"}.
          </p>
          {coldSummary && coldSummary.notEvaluable === coldSummary.total && (
            <p className="answer-line">The cold-night question needs at least {cold.d} days of record; this period has {length}. Choose a longer period to see it.</p>
          )}
          {coldSummary && coldSummary.notEvaluable < coldSummary.total && (
            <p className="answer-line">
              In <strong>{coldSummary.met} of {coldSummary.total}</strong> years there were at least {cold.d} days from {fmtDate(period[0])} before the first night at or below {fmtT(cold.t)} °C (looking until {fmtDate(period[1])}); sooner in {coldSummary.notMet}; can't tell in {coldSummary.notEvaluable}.
            </p>
          )}
          <p className="caveat-line">{lag !== undefined && lag !== null ? `This regional record tends to place the first cold night later than the Neuquén airport station (about ${Math.round(lag)} days at ${fmtT(cold.t)} °C), so read it as optimistic.` : "Regional check pending."} A past frequency, not next season's probability.</p>
          <BandChart clim={clim} start={period[0]} />
          {clim.excluded.length > 0 && <p className="chart-foot">Years left out for missing data or outside the record: {clim.excluded.join(", ")}.</p>}
          <details className="more">
            <summary>Every year for these dates</summary>
            <div className="yrows-wrap" tabIndex={0} role="region" aria-label="Every year of the weather history, scrollable table">
              <table className="data">
                <thead><tr><th>Year</th><th className="r">Rain (mm)</th><th className="r">Lowest night (°C)</th><th>On</th><th className="r">Highest day (°C)</th><th>On</th></tr></thead>
                <tbody>
                  {clim.perYear.map((y) => (
                    <tr key={y.year}><td className="num">{y.year}</td><td className="r num">{y.stats.rainTotal ?? "incomplete"}</td><td className="r num">{f1(y.stats.lowestMin?.value)}</td><td className="num">{y.stats.lowestMin ? fmtDate(y.stats.lowestMin.date) : "—"}</td><td className="r num">{f1(y.stats.highestMax?.value)}</td><td className="num">{y.stats.highestMax ? fmtDate(y.stats.highestMax.date) : "—"}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <p className="chart-foot">Same calendar dates in each year: the period starts on the same day and month and lasts {clim.length} days (29 Feb starts on 28 Feb in non-leap years). Ranges are the 10th–90th percentile of complete years.</p>
        </div>
      )}
      {mode === "year" && (
        <div>
          {!actualInBundled && !actualLive && (
            <label className="wx-year">Year <select className="input" value={year} onChange={(e) => setYear(+e.target.value)}>{Array.from({ length: lastBundledYear - 1980 }, (_, i) => 1981 + i).reverse().map((y) => <option key={y} value={y}>{y}</option>)}</select></label>
          )}
          {!actualInBundled && toDay(period[0]) > toDay(bundledLast) && toDay(period[1]) < toDay(today) && liveStatus !== "ok" && (
            <p className="note">{liveStatus === "loading" ? "Fetching these dates from NASA POWER…" : `NASA POWER for these dates is not available (${liveError ?? "not requested"}); showing the same calendar dates in ${year}.`}</p>
          )}
          <p className="answer-line">
            {yearLabel}: rain {yStats.rainTotal !== null ? `${yStats.rainTotal} mm in total` : `incomplete (${yStats.rainDaysMissing} days missing)`}{yStats.rainiestDay && yStats.rainiestDay.value > 0 ? `, most on ${fmtDate(yStats.rainiestDay.date, true)} (${f1(yStats.rainiestDay.value)} mm)` : ""}; lowest night {yStats.lowestMin ? `${f1(yStats.lowestMin.value)} °C on ${fmtDate(yStats.lowestMin.date, true)}` : "—"}; warmest day {yStats.highestMax ? `${f1(yStats.highestMax.value)} °C on ${fmtDate(yStats.highestMax.date, true)}` : "—"}.
          </p>
          <YearChart days={yearDays.days} start={yearDays.start} />
          {yStats.missingDays > 0 && <p className="chart-foot">{yStats.missingDays} days without complete values are left empty, not filled.</p>}
        </div>
      )}
    </div>
  );
}

/** Date ticks spaced so labels (about 56 px each) never overlap at the chart's actual width. */
function axisDates(start: ISODate, n: number, plotW = 600): { k: number; d: ISODate }[] {
  const out: { k: number; d: ISODate }[] = [];
  const need = Math.ceil((n * 64) / Math.max(1, plotW));
  const step = [1, 2, 7, 14, 30, 61, 92].find((x) => x >= need) ?? 92;
  for (let k = 0; k < n; k += step) out.push({ k, d: addDays(start, k) });
  return out;
}

function YearChart({ days, start }: { days: ({ tmin: number | null; tmax: number | null; tmean: number | null; rain: number | null; date: ISODate } | null)[]; start: ISODate }) {
  const n = days.length;
  const [box, W] = useBoxWidth(300);
  const L = 40, R = 16, T = 26, H1 = 150, G = 34, H2 = 70;
  const vals = days.flatMap((d) => (d ? [d.tmin, d.tmax] : [])).filter((v): v is number => v !== null);
  if (!vals.length) return <p className="note">No values in the record for these dates.</p>;
  const lo = Math.floor(Math.min(...vals) - 1), hi = Math.ceil(Math.max(...vals) + 1);
  const rmax = Math.max(1, Math.ceil(Math.max(...days.map((d) => d?.rain ?? 0))));
  const x = (k: number) => L + (n === 1 ? 0.5 : k / (n - 1)) * (W - L - R);
  const yT = (v: number) => T + (1 - (v - lo) / (hi - lo)) * H1;
  const yR0 = T + H1 + G + H2;
  const band: string[] = [];
  const segs: string[][] = [[]];
  days.forEach((d, k) => {
    if (d && d.tmin !== null && d.tmax !== null) segs[segs.length - 1].push(`${x(k).toFixed(1)},${yT(d.tmax).toFixed(1)}|${x(k).toFixed(1)},${yT(d.tmin).toFixed(1)}`);
    else if (segs[segs.length - 1].length) segs.push([]);
  });
  for (const s of segs) if (s.length) band.push(s.map((p) => p.split("|")[0]).join(" ") + " " + [...s].reverse().map((p) => p.split("|")[1]).join(" "));
  const mean = days.map((d, k) => (d && d.tmean !== null ? `${x(k).toFixed(1)} ${yT(d.tmean).toFixed(1)}` : null));
  let meanPath = "";
  mean.forEach((p, i) => { if (p) meanPath += `${i && mean[i - 1] ? "L" : "M"}${p} `; });
  return (
    <div className="tbl-scroll" tabIndex={0} ref={box}>
      <svg width={W} height={yR0 + 30} role="img" aria-label="Daily temperature range and rain for the chosen dates. A table of every year is available.">
        <text x={L} y={14} className="ax strong">Temperature (°C): lowest to highest each day; line = daily mean</text>
        {[lo, Math.round((lo + hi) / 2), hi].map((v) => <g key={v}><line x1={L} x2={W - R} y1={yT(v)} y2={yT(v)} stroke="var(--border)" /><text x={L - 6} y={yT(v) + 4} textAnchor="end" className="ax">{v}</text></g>)}
        {lo <= 0 && hi >= 0 && <line x1={L} x2={W - R} y1={yT(0)} y2={yT(0)} stroke="var(--water-ink)" strokeDasharray="4 3" />}
        {band.map((b, i) => <polygon key={i} points={b} fill="oklch(85% 0.06 50 / 0.7)" stroke="oklch(60% 0.1 50)" strokeWidth={0.8} />)}
        <path d={meanPath} fill="none" stroke="var(--accent-ink)" strokeWidth={1.8} />
        <text x={L} y={T + H1 + G - 6} className="ax strong">Rain (mm per day)</text>
        <line x1={L} x2={W - R} y1={yR0} y2={yR0} stroke="var(--border-strong)" />
        <text x={L - 6} y={yR0 - H2 + 4} textAnchor="end" className="ax">{rmax}</text>
        <text x={L - 6} y={yR0 + 4} textAnchor="end" className="ax">0</text>
        {days.map((d, k) => d && d.rain !== null && d.rain > 0 ? <rect key={k} x={x(k) - 3} y={yR0 - (d.rain / rmax) * H2} width={6} height={(d.rain / rmax) * H2} fill="var(--water)"><title>{fmtDate(d.date, true)}: {d.rain} mm</title></rect> : null)}
        {axisDates(start, n, W - L - R).map(({ k, d }) => <text key={k} x={x(k)} y={yR0 + 18} textAnchor="middle" className="ax">{fmtDate(d)}</text>)}
      </svg>
    </div>
  );
}

function BandChart({ clim, start }: { clim: NonNullable<ReturnType<typeof climatology>>; start: ISODate }) {
  const n = clim.length;
  const [box, W] = useBoxWidth(300);
  const L = 40, R = 16, T = 26, H = 170;
  const vals = clim.bands.flatMap((b) => [b.tminP10, b.tmaxP90]).filter((v): v is number => v !== null);
  if (!vals.length) return null;
  const lo = Math.floor(Math.min(...vals) - 1), hi = Math.ceil(Math.max(...vals) + 1);
  const x = (k: number) => L + (n === 1 ? 0.5 : k / (n - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * H;
  const poly = (a: "tminP10" | "tmaxP10", b: "tminP90" | "tmaxP90") => clim.bands.map((d) => `${x(d.k)},${y(d[b]!)}`).join(" ") + " " + [...clim.bands].reverse().map((d) => `${x(d.k)},${y(d[a]!)}`).join(" ");
  const line = (key: "tminP50" | "tmaxP50") => clim.bands.map((d, i) => `${i ? "L" : "M"}${x(d.k)} ${y(d[key]!)}`).join(" ");
  const lastK = clim.bands[clim.bands.length - 1].k;
  return (
    <div className="tbl-scroll" tabIndex={0} ref={box}>
      <svg width={W} height={T + H + 34} role="img" aria-label="Typical daily highest and lowest temperatures for these dates across the record years.">
        <text x={L} y={14} className="ax strong">Typical temperatures (°C), {clim.years.length} years</text>
        {[lo, Math.round((lo + hi) / 2), hi].map((v) => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--border)" /><text x={L - 6} y={y(v) + 4} textAnchor="end" className="ax">{v}</text></g>)}
        {lo <= 0 && hi >= 0 && <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="var(--water-ink)" strokeDasharray="4 3" />}
        <polygon points={poly("tmaxP10", "tmaxP90")} fill="oklch(88% 0.06 50 / 0.8)" />
        <polygon points={poly("tminP10", "tminP90")} fill="oklch(88% 0.04 250 / 0.9)" />
        <path d={line("tmaxP50")} fill="none" stroke="var(--accent-ink)" strokeWidth={2} />
        <path d={line("tminP50")} fill="none" stroke="var(--water-ink)" strokeWidth={2} />
        <text x={x(lastK) - 4} y={y(clim.bands[clim.bands.length - 1].tmaxP50!) - 8} textAnchor="end" className="ax strong" fill="var(--accent-ink)">daytime highs</text>
        <text x={x(lastK) - 4} y={y(clim.bands[clim.bands.length - 1].tminP50!) + 18} textAnchor="end" className="ax strong" fill="var(--water-ink)">night lows</text>
        {axisDates(start, n, W - L - R).map(({ k, d }) => <text key={k} x={x(k)} y={T + H + 22} textAnchor="middle" className="ax">{fmtDate(d)}</text>)}
      </svg>
      <p className="chart-foot">Shaded: the range that 8 of 10 years fell in on each date. Lines: the median of each date across the years, not one real year; a median line is smoother than any single year.</p>
    </div>
  );
}
