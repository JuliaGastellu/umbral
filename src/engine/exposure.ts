import type { StrategyId } from "./calendar";
import { conditionFor, eventQuantiles, exposureByYear, exposureSentence, growingDegreeDays, summarize, yearsInRange, type Condition, type DailySeries, type ExposureSummary, type YearOutcome } from "./climate";
import { addDays, fmtDate, mapToYear, parts, toDay, type ISODate } from "./dates";
import type { Evaluation } from "./scenario";

export interface ClimateSettings {
  t: number;
  d: number;
  strategy: StrategyId; // whose sowing starts the search (A: release)
  searchEnd: ISODate | null; // null: next-crop date
}

export const DEFAULT_CLIMATE: ClimateSettings = { t: 0, d: 30, strategy: "C", searchEnd: null };

export interface ClimateReading {
  start: ISODate;
  end: ISODate;
  t: number;
  d: number;
  /** Set when the dates cannot be evaluated (search end before start). */
  error: string | null;
  rows: YearOutcome[];
  conditions: Condition[];
  summary: ExposureSummary;
  sentence: string;
  /** Days from start: P10, P50, P90 of first-event timing (null = after the search end). */
  quantiles: (number | null)[];
  gddMedian: number | null;
  gddBase: number;
}

export function seriesYears(series: DailySeries): { first: number; last: number } {
  return { first: parts(series.startDate).y, last: parts(addDays(series.startDate, series.tmin.length - 1)).y };
}

export function startFor(ev: Evaluation, strategy: StrategyId): ISODate {
  return ev.effective.strategies[strategy].sowing ?? ev.effective.cal.release;
}

const EMPTY_SUMMARY: ExposureSummary = { total: 0, met: 0, notMet: 0, notEvaluable: 0, notEvaluableShortWindow: 0, notEvaluableData: 0, events: 0, none: 0, insufficient: 0, firstYear: 0, lastYear: 0 };

export function climateReading(ev: Evaluation, series: DailySeries, cfg: ClimateSettings, gddBase = 0): ClimateReading {
  const start = startFor(ev, cfg.strategy);
  const end = cfg.searchEnd ?? ev.effective.cal.nextCrop;
  if (toDay(end) < toDay(start)) {
    const error = `The search end (${fmtDate(end, true)}) is before the start (${fmtDate(start, true)}). Choose a later search end.`;
    return { start, end, t: cfg.t, d: cfg.d, error, rows: [], conditions: [], summary: EMPTY_SUMMARY, sentence: error, quantiles: [null, null, null], gddMedian: null, gddBase };
  }
  const { first, last } = seriesYears(series);
  const rows = exposureByYear(series, { start, end, t: cfg.t, years: yearsInRange(first, last) });
  const summary = summarize(rows, cfg.d);
  const anchor = parts(start).y;
  const gdds = rows
    .filter((r) => r.outcome !== "insufficient")
    .map((r) => growingDegreeDays(series, mapToYear(start, anchor, r.year), mapToYear(end, anchor, r.year), gddBase))
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);
  return {
    start, end, t: cfg.t, d: cfg.d, error: null, rows,
    conditions: rows.map((r) => conditionFor(r, cfg.d)),
    summary,
    sentence: exposureSentence(summary, cfg.d, cfg.t, start, end),
    quantiles: eventQuantiles(rows, [0.1, 0.5, 0.9]),
    gddMedian: gdds.length ? gdds[Math.floor(gdds.length / 2)] : null,
    gddBase,
  };
}

/** Short regional-check line carried by every climate reading (screen and export). */
export interface StationSummary {
  station: string;
  period: string;
  biasC: number;
  rmseC: number;
  firstEventMedianLagDays: Record<string, number | null>;
  matchingDays: Record<string, { station: number; both: number }>;
  caveats: string[];
}

export function stationLine(st: StationSummary | null, t: number): string {
  if (!st) return "Regional check pending: POWER has not been compared with a local station here.";
  const lag = st.firstEventMedianLagDays[String(t)];
  return `Regional check: at ${st.station} (${st.period}), POWER's first night at or below this threshold came a median of ${lag ?? "—"} days later than the station's, and its minima were ${st.biasC > 0 ? "+" : ""}${st.biasC} °C warmer on average. Read these counts as likely too favourable; no correction is applied.`;
}
