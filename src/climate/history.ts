/**
 * NASA POWER history views. Regional reanalysis at the General Roca point
 * (about 55 km cell); not station observations and not a forecast.
 *
 * Comparable-calendar rule: a period is defined by its start month/day and its
 * length in days (end − start + 1). For each year the start is placed with
 * onYear (29 Feb → 28 Feb in non-leap years) and the same number of
 * consecutive days follows. Every year therefore has the same length; a period
 * that includes 29 Feb in a leap plan year ends one calendar day later in
 * non-leap years.
 */
import { addDays, diffDays, isValidISO, onYear, parts, type ISODate } from "../engine/dates";

export interface PowerSeries {
  startDate: ISODate;
  tmin: (number | null)[];
  tmax: (number | null)[];
  tmean: (number | null)[];
  precip: (number | null)[];
}

export interface DayRecord {
  date: ISODate;
  tmin: number | null;
  tmax: number | null;
  tmean: number | null;
  rain: number | null;
}

export function lastDate(s: PowerSeries): ISODate {
  return addDays(s.startDate, s.tmin.length - 1);
}

export function dayAt(s: PowerSeries, d: ISODate): DayRecord | null {
  const i = diffDays(s.startDate, d);
  if (i < 0 || i >= s.tmin.length) return null;
  return { date: d, tmin: s.tmin[i], tmax: s.tmax[i], tmean: s.tmean[i], rain: s.precip[i] };
}

export interface PeriodDays {
  year: number;
  start: ISODate;
  end: ISODate;
  days: (DayRecord | null)[]; // null = outside the record
}

/** Period of `length` days starting on the plan start's month/day in `year`. */
export function periodInYear(s: PowerSeries, planStart: ISODate, length: number, year: number): PeriodDays {
  const p = parts(planStart);
  const start = onYear(p.m, p.d, year);
  const days: (DayRecord | null)[] = [];
  for (let k = 0; k < length; k++) days.push(dayAt(s, addDays(start, k)));
  return { year, start, end: addDays(start, length - 1), days };
}

export interface Extreme {
  value: number;
  date: ISODate;
}

export interface PeriodStats {
  rainTotal: number | null; // null when any day is missing
  rainDaysMissing: number;
  rainiestDay: Extreme | null;
  lowestMin: Extreme | null;
  highestMax: Extreme | null;
  missingDays: number; // days with no record at all or any missing value
  complete: boolean;
}

export function periodStats(p: PeriodDays): PeriodStats {
  let rain = 0;
  let rainMissing = 0;
  let missing = 0;
  let rainiest: Extreme | null = null;
  let lo: Extreme | null = null;
  let hi: Extreme | null = null;
  for (const d of p.days) {
    if (!d) {
      missing++;
      rainMissing++;
      continue;
    }
    if (d.rain === null) rainMissing++;
    else {
      rain += d.rain;
      if (!rainiest || d.rain > rainiest.value) rainiest = { value: d.rain, date: d.date };
    }
    if (d.tmin === null || d.tmax === null || d.rain === null) missing++;
    if (d.tmin !== null && (!lo || d.tmin < lo.value)) lo = { value: d.tmin, date: d.date };
    if (d.tmax !== null && (!hi || d.tmax > hi.value)) hi = { value: d.tmax, date: d.date };
  }
  return {
    rainTotal: rainMissing ? null : Math.round(rain * 10) / 10,
    rainDaysMissing: rainMissing,
    rainiestDay: rainiest,
    lowestMin: lo,
    highestMax: hi,
    missingDays: missing,
    complete: missing === 0,
  };
}

export function quantile(sorted: number[], q: number): number | null {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const a = Math.floor(pos);
  const b = Math.ceil(pos);
  return Math.round((sorted[a] + (sorted[b] - sorted[a]) * (pos - a)) * 10) / 10;
}

export interface Climatology {
  years: number[]; // years with complete data for the whole period
  excluded: number[]; // years skipped for missing data or outside the record
  length: number;
  /** Per day k: P10, P50, P90 of tmin and tmax across complete years. */
  bands: { k: number; tminP10: number | null; tminP50: number | null; tminP90: number | null; tmaxP10: number | null; tmaxP50: number | null; tmaxP90: number | null }[];
  rainTotal: { p10: number | null; p50: number | null; p90: number | null; min: Extreme & { year: number } | null; max: Extreme & { year: number } | null };
  lowestMin: { p10: number | null; p50: number | null; p90: number | null; coldest: (Extreme & { year: number }) | null };
  perYear: { year: number; stats: PeriodStats }[];
}

/** Same calendar dates across all record years. Only complete years enter the ranges; others are listed. */
export function climatology(s: PowerSeries, planStart: ISODate, planEnd: ISODate, firstYear: number, lastYear: number): Climatology | null {
  if (!isValidISO(planStart) || !isValidISO(planEnd)) return null;
  const length = diffDays(planStart, planEnd) + 1;
  if (length < 1 || length > 366) return null;
  const perYear: { year: number; stats: PeriodStats; p: PeriodDays }[] = [];
  for (let y = firstYear; y <= lastYear; y++) {
    const p = periodInYear(s, planStart, length, y);
    perYear.push({ year: y, stats: periodStats(p), p });
  }
  const ok = perYear.filter((x) => x.stats.complete);
  const bands = [];
  for (let k = 0; k < length; k++) {
    const mins = ok.map((x) => x.p.days[k]!.tmin!).sort((a, b) => a - b);
    const maxs = ok.map((x) => x.p.days[k]!.tmax!).sort((a, b) => a - b);
    bands.push({ k, tminP10: quantile(mins, 0.1), tminP50: quantile(mins, 0.5), tminP90: quantile(mins, 0.9), tmaxP10: quantile(maxs, 0.1), tmaxP50: quantile(maxs, 0.5), tmaxP90: quantile(maxs, 0.9) });
  }
  const rains = ok.map((x) => ({ v: x.stats.rainTotal!, year: x.year, date: x.p.start }));
  const rs = rains.map((r) => r.v).sort((a, b) => a - b);
  const lows = ok.filter((x) => x.stats.lowestMin).map((x) => ({ v: x.stats.lowestMin!.value, date: x.stats.lowestMin!.date, year: x.year }));
  const ls = lows.map((l) => l.v).sort((a, b) => a - b);
  const minRain = rains.length ? rains.reduce((a, b) => (b.v < a.v ? b : a)) : null;
  const maxRain = rains.length ? rains.reduce((a, b) => (b.v > a.v ? b : a)) : null;
  const coldest = lows.length ? lows.reduce((a, b) => (b.v < a.v ? b : a)) : null;
  return {
    years: ok.map((x) => x.year),
    excluded: perYear.filter((x) => !x.stats.complete).map((x) => x.year),
    length,
    bands,
    rainTotal: {
      p10: quantile(rs, 0.1), p50: quantile(rs, 0.5), p90: quantile(rs, 0.9),
      min: minRain ? { value: minRain.v, date: minRain.date, year: minRain.year } : null,
      max: maxRain ? { value: maxRain.v, date: maxRain.date, year: maxRain.year } : null,
    },
    lowestMin: { p10: quantile(ls, 0.1), p50: quantile(ls, 0.5), p90: quantile(ls, 0.9), coldest: coldest ? { value: coldest.v, date: coldest.date, year: coldest.year } : null },
    perYear: perYear.map((x) => ({ year: x.year, stats: x.stats })),
  };
}

/* ---------------- live NASA POWER for dates after the bundled record ---------------- */

export const POWER_POINT = { lat: -39.03, lon: -67.58 };

export function powerLiveUrl(start: ISODate, end: ISODate): string {
  const q = new URLSearchParams({
    parameters: "T2M,T2M_MIN,T2M_MAX,PRECTOTCORR",
    community: "AG",
    longitude: String(POWER_POINT.lon),
    latitude: String(POWER_POINT.lat),
    start: start.replaceAll("-", ""),
    end: end.replaceAll("-", ""),
    format: "JSON",
  });
  return `https://power.larc.nasa.gov/api/temporal/daily/point?${q.toString()}`;
}

/** Validate a POWER response: point, units, fill value → missing. Returns null-filled days for dates not returned. */
export function parsePowerLive(raw: unknown, start: ISODate, end: ISODate): { series: PowerSeries; version: string | null; lastValid: ISODate | null } {
  const r = raw as Record<string, any>;
  const coords = r?.geometry?.coordinates;
  if (!Array.isArray(coords) || Math.abs(coords[0] - POWER_POINT.lon) > 0.01 || Math.abs(coords[1] - POWER_POINT.lat) > 0.01) throw new Error("NASA POWER returned a different location.");
  const units = r.parameters ?? {};
  for (const k of ["T2M", "T2M_MIN", "T2M_MAX"]) if (units[k]?.units !== "C") throw new Error(`Unexpected unit for ${k}.`);
  if (units.PRECTOTCORR?.units !== "mm/day") throw new Error("Unexpected rain unit.");
  const fill = Number(r.header?.fill_value ?? -999);
  const p = r.properties?.parameter ?? {};
  const n = diffDays(start, end) + 1;
  const get = (k: string, d: ISODate): number | null => {
    const v = p[k]?.[d.replaceAll("-", "")];
    return typeof v === "number" && v !== fill ? v : null;
  };
  const s: PowerSeries = { startDate: start, tmin: [], tmax: [], tmean: [], precip: [] };
  let lastValid: ISODate | null = null;
  for (let k = 0; k < n; k++) {
    const d = addDays(start, k);
    const row = [get("T2M_MIN", d), get("T2M_MAX", d), get("T2M", d), get("PRECTOTCORR", d)];
    s.tmin.push(row[0]);
    s.tmax.push(row[1]);
    s.tmean.push(row[2]);
    s.precip.push(row[3]);
    if (row.every((v) => v !== null)) lastValid = d;
  }
  return { series: s, version: r.header?.api?.version ?? null, lastValid };
}
