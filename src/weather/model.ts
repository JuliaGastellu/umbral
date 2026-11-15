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
  /** Unit per variable as normalized, e.g. "daily.temperature_2m_min": "°C (converted from °F)". */
  units: Record<string, string>;
  current: { time: string; intervalS: number | null; temp: Num; humidityPct: Num; rainMm: Num; code: Num; windKmh: Num; gustKmh: Num } | null;
  daily: DailyWeather[];
  hourly: HourlyWeather[];
  firstDate: ISODate | null;
  lastDate: ISODate | null;
}

const num = (v: unknown): Num => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Target unit per kind of variable, and the conversions accepted from the provider. */
type Kind = "temp" | "rain" | "wind" | "pct" | "code";
const KIND: Record<string, Kind> = {
  temperature_2m: "temp", temperature_2m_max: "temp", temperature_2m_min: "temp",
  precipitation: "rain", precipitation_sum: "rain",
  wind_speed_10m: "wind", wind_gusts_10m: "wind", wind_speed_10m_max: "wind", wind_gusts_10m_max: "wind",
  relative_humidity_2m: "pct", precipitation_probability: "pct", precipitation_probability_max: "pct",
  weather_code: "code",
};
const TARGET: Record<Kind, string> = { temp: "°C", rain: "mm", wind: "km/h", pct: "%", code: "wmo code" };
const CONVERT: Record<Kind, Record<string, ((v: number) => number) | null>> = {
  temp: { "°C": null, "°F": (v) => ((v - 32) * 5) / 9 },
  rain: { mm: null, inch: (v) => v * 25.4 },
  wind: { "km/h": null, "m/s": (v) => v * 3.6, mph: (v) => v * 1.609344, kn: (v) => v * 1.852 },
  pct: { "%": null },
  code: { "wmo code": null },
};

/**
 * Column reader for one block (current, hourly or daily) after checking each
 * variable's unit: values are converted to the target unit explicitly, or the
 * response is rejected. Only the weather code may come without a unit.
 */
function reader(block: Record<string, unknown> | undefined, units: Record<string, unknown> | undefined, section: string, log: Record<string, string>) {
  const conv: Record<string, (v: number) => number> = {};
  for (const k of Object.keys(block ?? {})) {
    const kind = KIND[k];
    if (!kind) continue;
    const u = typeof units?.[k] === "string" ? (units[k] as string) : kind === "code" ? "wmo code" : null;
    if (u === null) throw new Error(`Forecast has no unit for ${section}.${k}.`);
    if (!(u in CONVERT[kind])) throw new Error(`Forecast unit for ${section}.${k} is ${u}; expected ${TARGET[kind]}.`);
    const f = CONVERT[kind][u];
    if (f) conv[k] = f;
    log[`${section}.${k}`] = f ? `${TARGET[kind]} (converted from ${u})` : TARGET[kind];
  }
  return (k: string, i?: number): Num => {
    const raw = i === undefined ? block?.[k] : (block?.[k] as unknown[] | undefined)?.[i];
    const v = num(raw);
    if (v === null) return null;
    const f = conv[k];
    return f ? Math.round(f(v) * 10) / 10 : v;
  };
}

function checkColumns(block: Record<string, unknown>, section: string) {
  const n = (block.time as unknown[]).length;
  for (const [k, v] of Object.entries(block)) {
    if (k === "time") continue;
    if (!Array.isArray(v) || v.length !== n) throw new Error(`Forecast ${section}.${k} does not match its dates.`);
  }
}

/** Normalize an Open-Meteo response. Dates are taken from the provider's local strings, never re-parsed in the browser's time zone. */
export function normalizeOpenMeteo(raw: unknown, place: Place, retrievedAt: string): Forecast {
  const r = raw as Record<string, any>;
  if (!r || typeof r !== "object" || !r.daily || !Array.isArray(r.daily.time)) throw new Error("Unexpected forecast response.");
  if (r.timezone && r.timezone !== TIMEZONE) throw new Error(`Forecast returned in time zone ${r.timezone}, expected ${TIMEZONE}.`);
  // The provider snaps to its grid; a point far from the request is a different place.
  const la = num(r.latitude);
  const lo = num(r.longitude);
  if (la !== null && lo !== null && (Math.abs(la - place.lat) > 0.25 || Math.abs(lo - place.lon) > 0.25)) throw new Error("Forecast returned for a different location.");
  const d = r.daily as Record<string, unknown[]>;
  checkColumns(d, "daily");
  const h = (r.hourly ?? { time: [] }) as Record<string, unknown[]>;
  if (!Array.isArray(h.time)) throw new Error("Unexpected hourly forecast.");
  checkColumns(h, "hourly");
  const units: Record<string, string> = {};
  const dc = reader(d, r.daily_units, "daily", units);
  const hc = reader(h, r.hourly_units, "hourly", units);
  const c = r.current as Record<string, unknown> | undefined;
  const cc = reader(c, r.current_units, "current", units);
  const daily: DailyWeather[] = (d.time as string[]).map((t, i) => ({
    date: String(t).slice(0, 10),
    code: dc("weather_code", i),
    tmax: dc("temperature_2m_max", i),
    tmin: dc("temperature_2m_min", i),
    rainMm: dc("precipitation_sum", i),
    rainProbMaxPct: dc("precipitation_probability_max", i),
    windMaxKmh: dc("wind_speed_10m_max", i),
    gustMaxKmh: dc("wind_gusts_10m_max", i),
  }));
  const hourly: HourlyWeather[] = (h.time as string[]).map((t, i) => ({
    time: t,
    date: t.slice(0, 10),
    hour: Number(t.slice(11, 13)),
    temp: hc("temperature_2m", i),
    rainMm: hc("precipitation", i),
    rainProbPct: hc("precipitation_probability", i),
    humidityPct: hc("relative_humidity_2m", i),
    code: hc("weather_code", i),
    windKmh: hc("wind_speed_10m", i),
    gustKmh: hc("wind_gusts_10m", i),
  }));
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
      ? { time: c.time, intervalS: num(c.interval), temp: cc("temperature_2m"), humidityPct: cc("relative_humidity_2m"), rainMm: cc("precipitation"), code: cc("weather_code"), windKmh: cc("wind_speed_10m"), gustKmh: cc("wind_gusts_10m") }
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
  /** Dates for which the live NASA POWER request returned complete values (null if not requested, loading or failed). */
  liveDays: ISODate[] | null;
}

/**
 * Split a consultation period by the source that actually covers each day.
 * Forecast only from today to the last returned forecast date; past days use
 * NASA POWER (bundled record, then the live query); nothing is filled in.
 */
export function segmentPeriod(start: ISODate, end: ISODate, c: CoverageInput): Segment[] {
  if (!isValidISO(start) || !isValidISO(end) || toDay(end) < toDay(start)) return [];
  const live = new Set(c.liveDays ?? []);
  const kindOf = (d: ISODate): SegmentKind => {
    const t = toDay(d);
    if (t >= toDay(c.today)) {
      if (c.forecastFirst && c.forecastLast && t >= toDay(c.forecastFirst) && t <= toDay(c.forecastLast)) return "forecast";
      return "none-future";
    }
    if (t >= toDay(c.bundledFirst) && t <= toDay(c.bundledLast)) return "nasa-bundled";
    if (t > toDay(c.bundledLast) && live.has(d)) return "nasa-live";
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

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/**
 * Plain facts for the forecast days of a requested period. `expected` is how
 * many requested days could have a forecast (today onward). Absence ("no day",
 * "no rain") is stated only when every expected day has a value; sums over
 * incomplete days are called partial. Threshold wording only.
 */
export function forecastFacts(days: DailyWeather[], expected = days.length): string[] {
  const out: string[] = [];
  if (days.length < expected) out.push(`The forecast covers ${days.length} of the ${plural(expected, "requested day")}${days.length ? ` (to ${fmtDate(days[days.length - 1].date)})` : ""}.`);
  const withMin = days.filter((d) => d.tmin !== null);
  const minAll = withMin.length === expected;
  if (!withMin.length) out.push("No forecast minimum temperature is available for these days.");
  else {
    if (!minAll) out.push(`Minimum temperature available for ${withMin.length} of ${plural(expected, "day")}.`);
    const lo = withMin.reduce((a, b) => (b.tmin! < a.tmin! ? b : a));
    out.push(`Lowest forecast minimum${minAll ? "" : " among those days"}: ${lo.tmin} °C on ${fmtDate(lo.date)}.`);
    const frost = withMin.filter((d) => d.tmin! <= 0);
    if (frost.length) out.push(`${plural(frost.length, "day")} with a forecast minimum at or below 0 °C.`);
    else out.push(minAll ? "No day with a forecast minimum at or below 0 °C." : `None of the ${plural(withMin.length, "day")} with a value has a minimum at or below 0 °C; the other ${expected - withMin.length} cannot be checked.`);
  }
  const withRain = days.filter((d) => d.rainMm !== null);
  const rainAll = withRain.length === expected;
  if (!withRain.length) out.push("No rain amount is available for these days.");
  else {
    const hi = withRain.reduce((a, b) => (b.rainMm! > a.rainMm! ? b : a));
    const sum = Math.round(withRain.reduce((s, d) => s + d.rainMm!, 0) * 10) / 10;
    const total = rainAll ? `${sum} mm in total` : `${sum} mm over the ${plural(withRain.length, "day")} with a value (partial sum: ${expected - withRain.length} without a value)`;
    if (hi.rainMm! > 0) out.push(`Most rain expected: ${hi.rainMm} mm on ${fmtDate(hi.date)}; ${total}.`);
    else out.push(rainAll ? "No rain expected in these days." : `No rain expected on the ${plural(withRain.length, "day")} with a value; the other ${expected - withRain.length} cannot be checked.`);
  }
  return out;
}
