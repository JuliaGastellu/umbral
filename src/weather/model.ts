/**
 * Weather consultation core: provider adapter (Open-Meteo), normalized types,
 * period coverage and request ordering. Pure functions, unit-tested.
 *
 * Provider: Open-Meteo Forecast API, free non-commercial tier, CC BY 4.0,
 * no key, called directly from the browser (CORS allowed). Values are model
 * estimates ("current" = 15-minute model data), not station observations,
 * not NASA data and not official SMN warnings.
 */
import { addDays, diffDays, fmtDate, isValidISO, toDay, type ISODate } from "../engine/dates";

export const TIMEZONE = "America/Argentina/Buenos_Aires";
export const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";

const CURRENT = ["temperature_2m", "relative_humidity_2m", "precipitation", "weather_code", "wind_speed_10m", "wind_gusts_10m"];
const HOURLY = ["temperature_2m", "precipitation", "precipitation_probability", "relative_humidity_2m", "weather_code", "wind_speed_10m", "wind_gusts_10m"];
const DAILY = ["weather_code", "temperature_2m_max", "temperature_2m_min", "precipitation_sum", "precipitation_probability_max", "wind_speed_10m_max", "wind_gusts_10m_max"];

export interface Place {
  name: string;
  lat: number;
  lon: number;
}

export function openMeteoUrl(p: Place, forecastDays = 16): string {
  const q = new URLSearchParams({
    latitude: p.lat.toFixed(4),
    longitude: p.lon.toFixed(4),
    timezone: TIMEZONE,
    forecast_days: String(forecastDays),
    wind_speed_unit: "kmh",
    current: CURRENT.join(","),
    hourly: HOURLY.join(","),
    daily: DAILY.join(","),
  });
  return `${OPEN_METEO_URL}?${q.toString()}`;
}

export type Num = number | null;

export interface DailyWeather {
  date: ISODate; // local date (America/Argentina/Buenos_Aires)
  code: Num;
  tmax: Num;
  tmin: Num;
  rainMm: Num;
  rainProbMaxPct: Num;
  windMaxKmh: Num;
  gustMaxKmh: Num;
}

export interface HourlyWeather {
  time: string; // local "YYYY-MM-DDTHH:MM"
  date: ISODate;
  hour: number;
  temp: Num;
  rainMm: Num;
  rainProbPct: Num;
  humidityPct: Num;
  code: Num;
  windKmh: Num;
  gustKmh: Num;
}

export interface Forecast {
  provider: "Open-Meteo";
  model: string; // as requested; the API does not report which models were blended
  place: Place;
  gridLat: number;
  gridLon: number;
  elevationM: number | null;
  timezone: string;
  utcOffsetSeconds: number;
  retrievedAt: string; // ISO, client clock
  units: Record<string, string>;
  current: { time: string; intervalS: number | null; temp: Num; humidityPct: Num; rainMm: Num; code: Num; windKmh: Num; gustKmh: Num } | null;
  daily: DailyWeather[];
  hourly: HourlyWeather[];
  firstDate: ISODate | null;
  lastDate: ISODate | null;
}

const num = (v: unknown): Num => (typeof v === "number" && Number.isFinite(v) ? v : null);
const col = (o: Record<string, unknown[]> | undefined, k: string, i: number): Num => num(o?.[k]?.[i]);

/** Normalize an Open-Meteo response. Dates are taken from the provider's local strings, never re-parsed in the browser's time zone. */
export function normalizeOpenMeteo(raw: unknown, place: Place, retrievedAt: string): Forecast {
  const r = raw as Record<string, any>;
  if (!r || typeof r !== "object" || !r.daily || !Array.isArray(r.daily.time)) throw new Error("Unexpected forecast response.");
  if (r.timezone && r.timezone !== TIMEZONE) throw new Error(`Forecast returned in time zone ${r.timezone}, expected ${TIMEZONE}.`);
  const d = r.daily as Record<string, unknown[]>;
  const h = (r.hourly ?? {}) as Record<string, unknown[]>;
  const daily: DailyWeather[] = (d.time as string[]).map((t, i) => ({
    date: t.slice(0, 10),
    code: col(d, "weather_code", i),
    tmax: col(d, "temperature_2m_max", i),
    tmin: col(d, "temperature_2m_min", i),
    rainMm: col(d, "precipitation_sum", i),
    rainProbMaxPct: col(d, "precipitation_probability_max", i),
    windMaxKmh: col(d, "wind_speed_10m_max", i),
    gustMaxKmh: col(d, "wind_gusts_10m_max", i),
  }));
  const hourly: HourlyWeather[] = ((h.time as string[]) ?? []).map((t, i) => ({
    time: t,
    date: t.slice(0, 10),
    hour: Number(t.slice(11, 13)),
    temp: col(h, "temperature_2m", i),
    rainMm: col(h, "precipitation", i),
    rainProbPct: col(h, "precipitation_probability", i),
    humidityPct: col(h, "relative_humidity_2m", i),
    code: col(h, "weather_code", i),
    windKmh: col(h, "wind_speed_10m", i),
    gustKmh: col(h, "wind_gusts_10m", i),
  }));
  const c = r.current as Record<string, unknown> | undefined;
  const units = { ...(r.daily_units ?? {}), ...(r.hourly_units ?? {}), ...(r.current_units ?? {}) } as Record<string, string>;
  const valid = daily.filter((x) => isValidISO(x.date));
  return {
    provider: "Open-Meteo",
    model: "best_match (Open-Meteo default blend of national and global models)",
    place,
    gridLat: num(r.latitude) ?? place.lat,
    gridLon: num(r.longitude) ?? place.lon,
    elevationM: num(r.elevation),
    timezone: r.timezone ?? TIMEZONE,
    utcOffsetSeconds: num(r.utc_offset_seconds) ?? -10800,
    retrievedAt,
    units,
    current: c && typeof c.time === "string"
      ? { time: c.time, intervalS: num(c.interval), temp: num(c.temperature_2m), humidityPct: num(c.relative_humidity_2m), rainMm: num(c.precipitation), code: num(c.weather_code), windKmh: num(c.wind_speed_10m), gustKmh: num(c.wind_gusts_10m) }
      : null,
    daily: valid,
    hourly,
    firstDate: valid.length ? valid[0].date : null,
    lastDate: valid.length ? valid[valid.length - 1].date : null,
  };
}

/** Today's local date in Argentina (fixed UTC−3, no daylight saving). */
export function todayInArgentina(now = new Date()): ISODate {
  const shifted = new Date(now.getTime() - 3 * 3600 * 1000);
  return shifted.toISOString().slice(0, 10);
}

export type SegmentKind = "forecast" | "nasa-bundled" | "nasa-live" | "none-future" | "none-past";

export interface Segment {
  from: ISODate;
  to: ISODate;
  kind: SegmentKind;
}

export interface CoverageInput {
  today: ISODate;
  forecastFirst: ISODate | null;
  forecastLast: ISODate | null;
  bundledFirst: ISODate;
  bundledLast: ISODate;
  /** Last date the live NASA POWER request returned (null if not requested or failed). */
  liveLast: ISODate | null;
}

/**
 * Split a consultation period by the source that actually covers each day.
 * Forecast only from today to the last returned forecast date; past days use
 * NASA POWER (bundled record, then the live query); nothing is filled in.
 */
export function segmentPeriod(start: ISODate, end: ISODate, c: CoverageInput): Segment[] {
  if (!isValidISO(start) || !isValidISO(end) || toDay(end) < toDay(start)) return [];
  const kindOf = (d: ISODate): SegmentKind => {
    const t = toDay(d);
    if (t >= toDay(c.today)) {
      if (c.forecastFirst && c.forecastLast && t >= toDay(c.forecastFirst) && t <= toDay(c.forecastLast)) return "forecast";
      return "none-future";
    }
    if (t >= toDay(c.bundledFirst) && t <= toDay(c.bundledLast)) return "nasa-bundled";
    if (c.liveLast && t > toDay(c.bundledLast) && t <= toDay(c.liveLast)) return "nasa-live";
    return "none-past";
  };
  const out: Segment[] = [];
  for (let k = 0; k <= diffDays(start, end); k++) {
    const d = addDays(start, k);
    const kind = kindOf(d);
    const last = out[out.length - 1];
    if (last && last.kind === kind) last.to = d;
    else out.push({ from: d, to: d, kind });
  }
  return out;
}

/** Request ordering: only the most recent request may update the view. */
export function createLatest() {
  let seq = 0;
  return {
    next(): number {
      seq += 1;
      return seq;
    },
    isLatest(id: number): boolean {
      return id === seq;
    },
  };
}

/** WMO weather code → short plain description (Open-Meteo table). */
export function weatherWord(code: Num): string {
  if (code === null) return "no description";
  if (code === 0) return "clear sky";
  if (code === 1) return "mainly clear";
  if (code === 2) return "partly cloudy";
  if (code === 3) return "overcast";
  if (code === 45 || code === 48) return "fog";
  if (code >= 51 && code <= 57) return "drizzle";
  if (code >= 61 && code <= 67) return "rain";
  if (code >= 71 && code <= 77) return "snow";
  if (code >= 80 && code <= 82) return "rain showers";
  if (code === 85 || code === 86) return "snow showers";
  if (code >= 95) return "thunderstorm";
  return `weather code ${code}`;
}

/** Plain facts for a set of forecast days. Threshold wording only; no damage or irrigation claims. */
export function forecastFacts(days: DailyWeather[]): string[] {
  const out: string[] = [];
  const withMin = days.filter((d) => d.tmin !== null);
  if (withMin.length) {
    const lo = withMin.reduce((a, b) => (b.tmin! < a.tmin! ? b : a));
    out.push(`Lowest forecast minimum: ${lo.tmin} °C on ${fmtDate(lo.date)}.`);
    const frost = withMin.filter((d) => d.tmin! <= 0);
    out.push(frost.length ? `${frost.length} day${frost.length === 1 ? "" : "s"} with a forecast minimum at or below 0 °C.` : "No day with a forecast minimum at or below 0 °C.");
  }
  const withRain = days.filter((d) => d.rainMm !== null);
  if (withRain.length) {
    const hi = withRain.reduce((a, b) => (b.rainMm! > a.rainMm! ? b : a));
    const total = Math.round(withRain.reduce((s, d) => s + d.rainMm!, 0) * 10) / 10;
    out.push(hi.rainMm! > 0 ? `Most rain expected: ${hi.rainMm} mm on ${fmtDate(hi.date)}; ${total} mm in total.` : "No rain expected in these days.");
  }
  return out;
}
