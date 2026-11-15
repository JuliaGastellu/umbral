/**
 * One selection of historical HLS evidence, shared by the screen and the exports.
 *
 * Rule: the plan interval (e.g. 10 Apr–1 Oct 2027) is placed on the reference
 * season by day and month, keeping its length: start = plan start's month/day
 * in the season year (29 Feb → 28 Feb), end = start + (plan length − 1) days.
 * A plan crossing 31 December therefore continues into the next calendar year
 * of the season. Observations keep their real acquisition dates; they are
 * never relabelled as observations of the plan year.
 */
import { addDays, diffDays, isValidISO, onYear, parts, toDay, type ISODate } from "./dates";

export interface ParcelReading {
  label: string;
  pixels: number;
  cleanPixels: number;
  cleanFraction: number;
  quality: string;
  ndviMedian: number | null;
}

export interface HlsObs {
  id: string;
  date: ISODate;
  sensor: string;
  quality: string;
  pixels: number;
  cleanPixels: number;
  cleanFraction: number;
  ndviMedian: number | null;
  ndviP25?: number | null;
  ndviP75?: number | null;
  parcels: ParcelReading[];
}

export interface HistoricalInterval {
  plan: [ISODate, ISODate];
  historical: [ISODate, ISODate];
  seasonYear: number;
  rule: string;
}

export function historicalInterval(plan: [ISODate, ISODate], seasonYear: number): HistoricalInterval | null {
  if (!isValidISO(plan[0]) || !isValidISO(plan[1]) || toDay(plan[1]) < toDay(plan[0])) return null;
  const p = parts(plan[0]);
  const start = onYear(p.m, p.d, seasonYear);
  const end = addDays(start, diffDays(plan[0], plan[1]));
  return {
    plan,
    historical: [start, end],
    seasonYear,
    rule: "Plan interval placed on the reference season by day and month, same length; real acquisition dates are kept.",
  };
}

export function inHistorical(o: { date: ISODate }, h: HistoricalInterval): boolean {
  const t = toDay(o.date);
  return t >= toDay(h.historical[0]) && t <= toDay(h.historical[1]);
}

export type Scope = { kind: "cluster" } | { kind: "parcel"; index: number };

export function scopeName(s: Scope): string {
  return s.kind === "cluster" ? "cluster of four example parcels" : `example parcel P${s.index + 1}`;
}

/** One observation seen through the selected scope (the cluster, or one parcel's own pixels). */
export function scopeObservation<T extends HlsObs>(o: T, scope: Scope): T {
  if (scope.kind === "cluster") return o;
  const p = o.parcels[scope.index];
  if (!p) return o;
  return { ...o, ndviMedian: p.ndviMedian, ndviP25: null, ndviP75: null, cleanPixels: p.cleanPixels, pixels: p.pixels, cleanFraction: p.cleanFraction, quality: p.quality };
}

export interface ExportedObservation {
  acquisitionDate: ISODate;
  sensor: string;
  quality: string;
  cleanPixels: number;
  totalPixels: number;
  ndviMedian: number | null;
  scope: string;
}

export function toExported(o: HlsObs, scope: Scope): ExportedObservation {
  const s = scopeObservation(o, scope);
  return { acquisitionDate: s.date, sensor: s.sensor, quality: s.quality, cleanPixels: s.cleanPixels, totalPixels: s.pixels, ndviMedian: s.ndviMedian, scope: scopeName(scope) };
}

export interface HlsSelection {
  interval: HistoricalInterval;
  scope: string;
  observations: ExportedObservation[];
  /** Cluster values for the same dates, labelled separately, only when a parcel is selected. */
  clusterForComparison: ExportedObservation[] | null;
}

/** The single selection used by the evidence highlight, summaries and exports. */
export function selectHls(obs: HlsObs[], plan: [ISODate, ISODate], seasonYear: number, scope: Scope): HlsSelection | null {
  const interval = historicalInterval(plan, seasonYear);
  if (!interval) return null;
  const inside = obs.filter((o) => inHistorical(o, interval));
  return {
    interval,
    scope: scopeName(scope),
    observations: inside.map((o) => toExported(o, scope)),
    clusterForComparison: scope.kind === "parcel" ? inside.map((o) => toExported(o, { kind: "cluster" })) : null,
  };
}

function median(v: number[]): number | null {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Display rule: medians closer than this are described as "about the same". */
export const SMALL_CHANGE = 0.05;

/**
 * Plain description of observed change, clear dates only. The wording is derived
 * from the values; no cause (crop, harvest) is inferred.
 */
export function seasonSummary(obs: { date: string; quality: string; ndviMedian: number | null }[]): string | null {
  const clear = obs.filter((o) => o.quality === "clear" && o.ndviMedian !== null);
  const pick = (months: number[]) => median(clear.filter((o) => months.includes(+o.date.slice(5, 7))).map((o) => o.ndviMedian!));
  const per = [
    { name: "February–April", v: pick([2, 3, 4]) },
    { name: "June–August", v: pick([6, 7, 8]) },
    { name: "October–November", v: pick([10, 11]) },
  ].filter((x): x is { name: string; v: number } => x.v !== null);
  if (per.length < 2) return null;
  const values = `Typical greenness on clear dates: ${per.map((x) => `${x.name} ${x.v.toFixed(2)}`).join(", ")}.`;
  const hi = per.reduce((a, b) => (b.v > a.v ? b : a));
  const lo = per.reduce((a, b) => (b.v < a.v ? b : a));
  if (hi.v - lo.v < SMALL_CHANGE) {
    const low = hi.v < 0.2 ? " All are low (little or no green cover)." : "";
    return `${values} About the same through the year (differences under ${SMALL_CHANGE}).${low}`;
  }
  // Seasons within the small-change margin of the extreme are named together.
  const names = (xs: { name: string }[]) => (xs.length === 1 ? xs[0].name : `${xs.slice(0, -1).map((x) => x.name).join(", ")} and ${xs[xs.length - 1].name} (about the same)`);
  const highs = per.filter((x) => hi.v - x.v < SMALL_CHANGE);
  const lows = per.filter((x) => x.v - lo.v < SMALL_CHANGE);
  return `${values} Highest in ${names(highs)}, lowest in ${names(lows)}.`;
}

