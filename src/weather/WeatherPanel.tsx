import { useEffect, useMemo, useState } from "react";
import { addDays, diffDays, fmtDate, isValidISO, parts, toDay, type ISODate } from "../engine/dates";
import { exposureByYear, fmtT, summarize, type DailySeries } from "../engine/climate";
import type { StationSummary } from "../engine/exposure";
import { climatology, lastDate, periodInYear, periodStats, type PowerSeries } from "../climate/history";
import { forecastFacts, segmentPeriod, todayInArgentina, weatherWord, type DailyWeather, type HourlyWeather, type Place, type Segment } from "./model";
import { useForecast, useLivePower } from "./useWeather";
import { WeatherIcon } from "./WeatherIcon";

type Tab = "now" | "forecast" | "history";

interface Props {
  place: Place;
  series: PowerSeries | null;
  station: StationSummary | null;
  period: [ISODate, ISODate];
  setPeriod: (p: [ISODate, ISODate]) => void;
  planWindow: [ISODate, ISODate];
  cold: { t: number; d: number };
  onReport?: (r: WeatherReport) => void;
  /** "nasa": NASA climate history only (main view). "forecast": Now and Forecast (Open-Meteo). */
  variant: "nasa" | "forecast";
  /** Short frost summary for the selected free date (NASA variant). */
  frost?: string[];
}

export interface WeatherReport {
  forecast: { provider: string; model: string; retrievedAt: string | null; status: string; grid: string | null; available: [ISODate, ISODate] | null; units: Record<string, string> } | null;
  history: { source: string; requested: [ISODate, ISODate]; bundled: [ISODate, ISODate]; live: { lastValid: ISODate | null; retrievedAt: string | null; version: string | null } | null };
  segments: Segment[];
}

const KIND_TEXT: Record<Segment["kind"], string> = {
  forecast: "forecast (Open-Meteo)",
  "nasa-bundled": "NASA POWER record (bundled)",
  "nasa-live": "NASA POWER record (fetched now)",
  "none-future": "no daily forecast available",
  "none-past": "no data available yet",
};

const fmtTime = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString("en-GB", { timeZone: "America/Argentina/Buenos_Aires", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};
const f1 = (v: number | null | undefined) => (v === null || v === undefined ? "—" : (Math.round(v * 10) / 10).toString());
const dow = (d: ISODate) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(`${d}T12:00:00Z`).getUTCDay()];

export function WeatherPanel({ place, series, station, period, setPeriod, planWindow, cold, onReport, variant, frost }: Props) {
  const [tabState, setTab] = useState<Tab>("now");
  const tab: Tab = variant === "nasa" ? "history" : tabState === "history" ? "now" : tabState;
  const fc = useForecast(place, variant === "forecast");
  const today = todayInArgentina();
  const forecast = fc.forecast;
  const bundledFirst = series?.startDate ?? "1981-01-01";
  const bundledLast = series ? lastDate(series) : "2025-12-31";
  // live NASA only for past dates after the bundled record
  const liveRange: [ISODate, ISODate] | null = useMemo(() => {
    const a = toDay(period[0]) > toDay(bundledLast) ? period[0] : addDays(bundledLast, 1);
    const b = toDay(period[1]) < toDay(today) ? period[1] : addDays(today, -1);
    return toDay(a) <= toDay(b) && toDay(period[1]) > toDay(bundledLast) ? [a, b] : null;
  }, [period, bundledLast, today]);
  const live = useLivePower(liveRange);
  const segments = segmentPeriod(period[0], period[1], { today, forecastFirst: forecast?.firstDate ?? null, forecastLast: forecast?.lastDate ?? null, bundledFirst, bundledLast, liveLast: live.lastValid });

  const report: WeatherReport = {
    forecast: forecast ? { provider: "Open-Meteo (open-meteo.com), CC BY 4.0", model: forecast.model, retrievedAt: forecast.retrievedAt, status: fc.status, grid: `${forecast.gridLat.toFixed(3)}, ${forecast.gridLon.toFixed(3)}`, available: forecast.firstDate && forecast.lastDate ? [forecast.firstDate, forecast.lastDate] : null, units: forecast.units } : null,
    history: { source: "NASA POWER daily, regional reanalysis (MERRA-2 / GEOS-IT, about 55 km), General Roca reference point", requested: period, bundled: [bundledFirst, bundledLast], live: liveRange ? { lastValid: live.lastValid, retrievedAt: live.retrievedAt, version: live.version } : null },
    segments,
  };
  const reportKey = JSON.stringify(report);
  useEffect(() => onReport?.(JSON.parse(reportKey)), [reportKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className={`card wx ${variant}`} aria-labelledby={`wx-h-${variant}`} id={variant === "nasa" ? "nasa-climate" : "weather"}>
      <div className="wx-head">
        <div>
          <h2 id={`wx-h-${variant}`}>{variant === "nasa" ? "NASA climate history, General Roca area" : "Weather now and forecast (Open-Meteo, not NASA)"}</h2>
          <p className="wx-loc">{variant === "nasa" ? "NASA POWER daily record 1981–2025 near the example parcels; one regional value for all four parcels." : "Near the example parcels, −39.05, −67.60. Useful for this week, not for a plan months ahead."}</p>
        </div>
        {variant === "forecast" && (
          <div className="tabs wx-tabs" role="tablist" aria-label="Weather views">
            {(["now", "forecast"] as Tab[]).map((t) => (
              <button key={t} role="tab" type="button" aria-selected={tab === t} onClick={() => setTab(t)}>{t === "now" ? "Now" : "Forecast"}</button>
            ))}
          </div>
        )}
      </div>
      {variant === "nasa" && frost && frost.length > 0 && (
        <div className="frost-sum">
          {frost.map((f, i) => <p key={i} className={i === 0 ? "frost-main" : "caveat-line"}>{f}</p>)}
        </div>
      )}

      {tab !== "now" && <PeriodBar period={period} setPeriod={setPeriod} today={today} planWindow={planWindow} segments={segments} nasa={variant === "nasa"} />}

      <div className="wx-body">
        {tab === "now" && <NowView state={fc} today={today} />}
        {tab === "forecast" && <ForecastView state={fc} period={period} onHistory={() => document.getElementById("nasa-climate")?.scrollIntoView({ block: "start" })} />}
        {tab === "history" && <HistoryView series={series} live={live.series} liveStatus={live.status} liveError={live.error} period={period} today={today} station={station} cold={cold} bundledLast={bundledLast} />}
      </div>
      <p className="wx-attrib">
        {tab === "history"
          ? "NASA POWER · regional reanalysis · bundled record 1981–2025 at the General Roca reference point. A historical record, not a forecast; rain is an estimate, not canal water or soil moisture."
          : <>Forecast: <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a> (CC BY 4.0, free non-commercial use), weather models. Not NASA data, not an official SMN warning.</>}
      </p>
    </section>
  );
}

function PeriodBar({ period, setPeriod, today, planWindow, segments, nasa }: { period: [ISODate, ISODate]; setPeriod: (p: [ISODate, ISODate]) => void; today: ISODate; planWindow: [ISODate, ISODate]; segments: Segment[]; nasa: boolean }) {
  const text = (k: Segment["kind"]) => (nasa && (k === "none-future" || k === "forecast") ? "not yet happened: shown through the same calendar dates in past years" : KIND_TEXT[k]);
  return (
    <div className="wx-period">
      <div className="wx-period-row">
        <label>From <input className="input date" type="date" value={period[0]} onChange={(e) => isValidISO(e.target.value) && setPeriod([e.target.value, toDay(e.target.value) > toDay(period[1]) ? e.target.value : period[1]])} /></label>
        <label>to <input className="input date" type="date" value={period[1]} onChange={(e) => isValidISO(e.target.value) && toDay(e.target.value) >= toDay(period[0]) && setPeriod([period[0], e.target.value])} /></label>
        {!nasa && <button type="button" className="btn small" onClick={() => setPeriod([today, addDays(today, 6)])}>Next 7 days</button>}
        {!nasa && <button type="button" className="btn small" onClick={() => setPeriod([today, addDays(today, 15)])}>Next 16 days</button>}
        <button type="button" className="btn small" onClick={() => setPeriod(planWindow)}>My plan's first month ({fmtDate(planWindow[0])}–{fmtDate(planWindow[1])})</button>
      </div>
      <p className="wx-coverage" aria-live="polite">
        {segments.length === 0 ? "Choose an end date after the start date." : segments.map((s, i) => (
          <span key={i} className={nasa && (s.kind === "none-future" || s.kind === "forecast") ? "" : `seg-${s.kind}`}>{fmtDate(s.from, true)}{s.to !== s.from ? `–${fmtDate(s.to, true)}` : ""}: {text(s.kind)}{i < segments.length - 1 ? "; " : ""}</span>
        ))}
      </p>
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

function ForecastView({ state, period, onHistory }: { state: ReturnType<typeof useForecast>; period: [ISODate, ISODate]; onHistory: () => void }) {
  const [day, setDay] = useState<ISODate | null>(null);
  if (state.status === "loading") return <div className="skel" style={{ height: 160 }} aria-label="Loading forecast" />;
  if (state.status === "error") return <p className="banner" role="status">The forecast service could not be reached ({state.error}). Try again later; the NASA climate history still works.</p>;
  const f = state.forecast;
  const days = f.daily.filter((d) => toDay(d.date) >= toDay(period[0]) && toDay(d.date) <= toDay(period[1]));
  const sel = days.find((d) => d.date === day) ?? days[0];
  if (!days.length) {
    return (
      <div className="wx-empty">
        <p className="answer-line">No daily forecast is available for {fmtDate(period[0], true)}–{fmtDate(period[1], true)}. The forecast reaches {f.lastDate ? fmtDate(f.lastDate, true) : "—"}.</p>
        <button type="button" className="btn" onClick={onHistory}>See NASA history for the same calendar dates</button>
      </div>
    );
  }
  return (
    <div>
      {state.status === "stale" && <p className="banner" role="status">Last saved forecast, retrieved {fmtTime(f.retrievedAt)}; it could not be refreshed. Days before today are no longer a forecast.</p>}
      <ul className="wx-facts-list">{forecastFacts(days).map((x) => <li key={x}>{x}</li>)}</ul>
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
  const W = 470, L = 40, R = 40, T = 26, H1 = 130, G = 30, H2 = 70;
  if (!hours.length) return <p className="note">No hourly values for this day.</p>;
  const temps = hours.map((h) => h.temp).filter((v): v is number => v !== null);
  const lo = Math.floor(Math.min(...temps) - 1), hi = Math.ceil(Math.max(...temps) + 1);
  const rains = hours.map((h) => h.rainMm ?? 0);
  const rmax = Math.max(1, Math.ceil(Math.max(...rains)));
  const x = (hr: number) => L + (hr / 23) * (W - L - R);
  const yT = (v: number) => T + (1 - (v - lo) / (hi - lo)) * H1;
  const yR0 = T + H1 + G + H2;
  const hR = (v: number) => (v / rmax) * H2;
  const path = hours.filter((h) => h.temp !== null).map((h, i) => `${i ? "L" : "M"}${x(h.hour).toFixed(1)} ${yT(h.temp!).toFixed(1)}`).join(" ");
  return (
    <div className="tbl-scroll">
      <h3 className="sub-q">{dow(day.date)} {fmtDate(day.date, true)}, hour by hour</h3>
      <svg width={W} height={yR0 + 30} role="img" aria-label={`Hourly forecast for ${fmtDate(day.date, true)}: temperature from ${Math.min(...temps)} to ${Math.max(...temps)} °C; ${rains.reduce((a, b) => a + b, 0).toFixed(1)} mm of rain in total.`}>
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
        {hours.map((h) => <rect key={h.time} x={x(h.hour) - 7} y={yR0 - hR(h.rainMm ?? 0)} width={14} height={hR(h.rainMm ?? 0)} fill="var(--water)"><title>{h.time.slice(11, 16)}: {h.rainMm ?? "—"} mm, chance {h.rainProbPct ?? "—"} %, humidity {h.humidityPct ?? "—"} %, wind {h.windKmh ?? "—"} km/h</title></rect>)}
        {[0, 6, 12, 18].map((hr) => <text key={hr} x={x(hr)} y={yR0 + 18} textAnchor="middle" className="ax">{String(hr).padStart(2, "0")}:00</text>)}
      </svg>
    </div>
  );
}

/* ---------------- NASA climate history ---------------- */

function HistoryView({ series, live, liveStatus, liveError, period, today, station, cold, bundledLast }: { series: PowerSeries | null; live: PowerSeries | null; liveStatus: string; liveError: string | null; period: [ISODate, ISODate]; today: ISODate; station: StationSummary | null; cold: { t: number; d: number }; bundledLast: ISODate }) {
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
  const actualLive = !actualInBundled && toDay(period[0]) > toDay(bundledLast) && toDay(period[1]) < toDay(today) && live;
  const yearDays = actualInBundled
    ? periodInYear(series, period[0], length, periodYear)
    : actualLive
      ? periodInYear(live!, period[0], length, periodYear)
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
            For {fmtDate(period[0])}–{fmtDate(period[1])} in {clim.years.length} years ({clim.years[0]}–{clim.years[clim.years.length - 1]}): total rain was usually {clim.rainTotal.p10}–{clim.rainTotal.p90} mm (middle value {clim.rainTotal.p50} mm); the lowest night was usually {f1(clim.lowestMin.p10)} to {f1(clim.lowestMin.p90)} °C; coldest {f1(clim.lowestMin.coldest?.value)} °C on {clim.lowestMin.coldest ? fmtDate(clim.lowestMin.coldest.date, true) : "—"}.
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
            <div className="yrows-wrap" tabIndex={0} role="region" aria-label="Every year, scrollable table">
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

function axisDates(start: ISODate, n: number): { k: number; d: ISODate }[] {
  const out: { k: number; d: ISODate }[] = [];
  const step = n > 120 ? 30 : n > 45 ? 14 : n > 14 ? 7 : 2;
  for (let k = 0; k < n; k += step) out.push({ k, d: addDays(start, k) });
  return out;
}

function YearChart({ days, start }: { days: ({ tmin: number | null; tmax: number | null; tmean: number | null; rain: number | null; date: ISODate } | null)[]; start: ISODate }) {
  const n = days.length;
  const W = Math.max(470, Math.min(900, 60 + n * 12)), L = 40, R = 16, T = 26, H1 = 150, G = 34, H2 = 70;
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
    <div className="tbl-scroll">
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
        {axisDates(start, n).map(({ k, d }) => <text key={k} x={x(k)} y={yR0 + 18} textAnchor="middle" className="ax">{fmtDate(d)}</text>)}
      </svg>
    </div>
  );
}

function BandChart({ clim, start }: { clim: NonNullable<ReturnType<typeof climatology>>; start: ISODate }) {
  const n = clim.length;
  const W = Math.max(470, Math.min(900, 60 + n * 12)), L = 40, R = 16, T = 26, H = 170;
  const vals = clim.bands.flatMap((b) => [b.tminP10, b.tmaxP90]).filter((v): v is number => v !== null);
  if (!vals.length) return null;
  const lo = Math.floor(Math.min(...vals) - 1), hi = Math.ceil(Math.max(...vals) + 1);
  const x = (k: number) => L + (n === 1 ? 0.5 : k / (n - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * H;
  const poly = (a: "tminP10" | "tmaxP10", b: "tminP90" | "tmaxP90") => clim.bands.map((d) => `${x(d.k)},${y(d[b]!)}`).join(" ") + " " + [...clim.bands].reverse().map((d) => `${x(d.k)},${y(d[a]!)}`).join(" ");
  const line = (key: "tminP50" | "tmaxP50") => clim.bands.map((d, i) => `${i ? "L" : "M"}${x(d.k)} ${y(d[key]!)}`).join(" ");
  const lastK = clim.bands[clim.bands.length - 1].k;
  return (
    <div className="tbl-scroll">
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
        {axisDates(start, n).map(({ k, d }) => <text key={k} x={x(k)} y={T + H + 22} textAnchor="middle" className="ax">{fmtDate(d)}</text>)}
      </svg>
      <p className="chart-foot">Shaded: the range that 8 of 10 years fell in on each date. Line: the middle year.</p>
    </div>
  );
}
