import { diffDays, fmtDate, mapToYear, parts, toDay, addDays, type ISODate } from "./dates";

/**
 * Historical climate exposure from a daily Tmin series (NASA POWER regional
 * reanalysis).
 *
 * One comparison everywhere: an event is a day with Tmin ≤ T ("at or below").
 *
 * Two separate outputs per year:
 *  1. First-event search (descriptive), from the start date to a fixed search end:
 *     - event: days from the start to the first event (start day = day 0);
 *     - none: no event on or before the search end (censored: the event, if any,
 *       comes later; no date is invented);
 *     - insufficient: a missing value or the end of the data occurs before any event.
 *       `cleanDays` records how many consecutive days were observed without an event.
 *  2. The question "were there at least D days before the first day at or below T?",
 *     i.e. first-event day k ≥ D:
 *     - met: an event with k ≥ D, or at least D days observed without an event
 *       (a censored year can still demonstrate the condition);
 *     - not-met: an event with k < D;
 *     - not-evaluable: fewer than D days observed and no event (short search window,
 *       missing data or end of data).
 * Climate never changes the calendar status.
 */

export interface DailySeries {
  startDate: ISODate;
  tmin: (number | null)[];
  tmean?: (number | null)[];
}

export type YearOutcome =
  | { year: number; outcome: "event"; days: number; date: ISODate; tmin: number; start: ISODate; end: ISODate }
  | { year: number; outcome: "none"; observedDays: number; start: ISODate; end: ISODate }
  | { year: number; outcome: "insufficient"; cleanDays: number; start: ISODate; end: ISODate; reason: string };

export type Condition = "met" | "not-met" | "not-evaluable";

export const atOrBelow = (v: number, t: number): boolean => v <= t;

export function valueAt(series: DailySeries, which: "tmin" | "tmean", date: ISODate): number | null | undefined {
  const arr = series[which];
  if (!arr) return undefined;
  const i = diffDays(series.startDate, date);
  if (i < 0 || i >= arr.length) return undefined;
  return arr[i];
}

/** First-event search over [start, end] (inclusive). Throws if end < start: that is an input error, not a data gap. */
export function firstEvent(series: DailySeries, start: ISODate, end: ISODate, t: number, year = parts(start).y): YearOutcome {
  const n = diffDays(start, end);
  if (n < 0) throw new RangeError("Search end is before the start.");
  const i0 = diffDays(series.startDate, start);
  const arr = series.tmin;
  for (let k = 0; k <= n; k++) {
    const i = i0 + k;
    if (i < 0 || i >= arr.length) return { year, outcome: "insufficient", cleanDays: k, start, end, reason: `No data from ${addDays(start, k)}.` };
    const v = arr[i];
    if (v === null) return { year, outcome: "insufficient", cleanDays: k, start, end, reason: `Missing value on ${addDays(start, k)} before any event.` };
    if (atOrBelow(v, t)) return { year, outcome: "event", days: k, date: addDays(start, k), tmin: v, start, end };
  }
  return { year, outcome: "none", observedDays: n + 1, start, end };
}

/** Answer to "at least D days before the first day at or below T?" for one year. */
export function conditionFor(r: YearOutcome, d: number): Condition {
  if (r.outcome === "event") return r.days >= d ? "met" : "not-met";
  const observed = r.outcome === "none" ? r.observedDays : r.cleanDays;
  return observed >= d ? "met" : "not-evaluable";
}

export interface ExposureQuery {
  start: ISODate;
  end: ISODate;
  t: number;
  years: number[];
}

export function exposureByYear(series: DailySeries, q: ExposureQuery): YearOutcome[] {
  const anchor = parts(q.start).y;
  return q.years.map((y) => firstEvent(series, mapToYear(q.start, anchor, y), mapToYear(q.end, anchor, y), q.t, y));
}

export interface ExposureSummary {
  total: number;
  met: number;
  notMet: number;
  notEvaluable: number;
  /** of which: follow-up shorter than D (search end too close) */
  notEvaluableShortWindow: number;
  /** of which: missing data or end of data */
  notEvaluableData: number;
  events: number;
  none: number;
  insufficient: number;
  firstYear: number;
  lastYear: number;
}

export function summarize(rows: YearOutcome[], d: number): ExposureSummary {
  const cond = rows.map((r) => conditionFor(r, d));
  const ne = rows.filter((_, i) => cond[i] === "not-evaluable");
  return {
    total: rows.length,
    met: cond.filter((c) => c === "met").length,
    notMet: cond.filter((c) => c === "not-met").length,
    notEvaluable: ne.length,
    notEvaluableShortWindow: ne.filter((r) => r.outcome === "none").length,
    notEvaluableData: ne.filter((r) => r.outcome === "insufficient").length,
    events: rows.filter((r) => r.outcome === "event").length,
    none: rows.filter((r) => r.outcome === "none").length,
    insufficient: rows.filter((r) => r.outcome === "insufficient").length,
    firstYear: Math.min(...rows.map((r) => r.year)),
    lastYear: Math.max(...rows.map((r) => r.year)),
  };
}

export function fmtT(t: number): string {
  return t < 0 ? `−${Math.abs(t)}` : `${t}`;
}

/** The summary sentence, one form for screen and export. */
export function exposureSentence(s: ExposureSummary, d: number, t: number, start: ISODate, end: ISODate): string {
  const reasons: string[] = [];
  if (s.notEvaluableShortWindow) reasons.push(`${s.notEvaluableShortWindow} because the search ends less than ${d} days after the start`);
  if (s.notEvaluableData) reasons.push(`${s.notEvaluableData} because of missing data`);
  const ne = s.notEvaluable ? ` ${s.notEvaluable} could not be evaluated (${reasons.join("; ")}).` : "";
  return `Of ${s.total} years (${s.firstYear}–${s.lastYear}), the first day with a minimum at or below ${fmtT(t)} °C came at least ${d} days after ${fmtDate(start)} in ${s.met} years and sooner in ${s.notMet}.${ne} Search until ${fmtDate(end)}.`;
}

/**
 * Quantiles of days-to-first-event, treating "none" as later than the search
 * end. Insufficient years are excluded. Nearest rank; null = after the search end.
 */
export function eventQuantiles(rows: YearOutcome[], qs: number[]): (number | null)[] {
  const vals = rows
    .filter((r) => r.outcome !== "insufficient")
    .map((r) => (r.outcome === "event" ? r.days : Infinity))
    .sort((a, b) => a - b);
  if (!vals.length) return qs.map(() => null);
  return qs.map((q) => {
    const idx = Math.min(vals.length - 1, Math.max(0, Math.ceil(q * vals.length) - 1));
    const v = vals[idx];
    return Number.isFinite(v) ? v : null;
  });
}

export function growingDegreeDays(series: DailySeries, start: ISODate, end: ISODate, base: number): number | null {
  let sum = 0;
  for (let d = toDay(start); d <= toDay(end); d++) {
    const v = valueAt(series, "tmean", addDays(start, d - toDay(start)));
    if (v === undefined || v === null) return null;
    sum += Math.max(0, v - base);
  }
  return Math.round(sum);
}

export function yearsInRange(firstYear: number, lastYear: number): number[] {
  const out: number[] = [];
  for (let y = firstYear; y <= lastYear; y++) out.push(y);
  return out;
}
