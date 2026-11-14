import { addDays, diffDays, isValidISO, onYear, parts, toDay, type ISODate } from "./dates";
import { evaluate, overviewOf, type Evaluation, type Overview, type Scenario } from "./scenario";

/**
 * Two-date comparison. The proposed date replaces the date the field is free;
 * cover sowings move by the same number of days, so any gap the user set
 * between "field free" and "sowing" is kept. Everything else is unchanged.
 * Values are recomputed with the engine, never copied from a demo.
 */
export function withReleaseDate(s: Scenario, date: ISODate): Scenario {
  if (!isValidISO(date)) return s;
  const delta = diffDays(s.release, date);
  return {
    ...s,
    release: date,
    covers: {
      B: { ...s.covers.B, sowing: addDays(s.covers.B.sowing, delta) },
      C: { ...s.covers.C, sowing: addDays(s.covers.C.sowing, delta) },
    },
  };
}

export interface DateSide {
  date: ISODate;
  scenario: Scenario;
  ev: Evaluation;
  B: Overview;
  C: Overview;
}

export function sideFor(s: Scenario, date: ISODate): DateSide {
  const scenario = withReleaseDate(s, date);
  const ev = evaluate(scenario);
  return { date, scenario, ev, B: overviewOf(ev.strategies[1]), C: overviewOf(ev.strategies[2]) };
}

export function compareDates(s: Scenario, proposed: ISODate): { plan: DateSide; proposed: DateSide } {
  return { plan: sideFor(s, s.release), proposed: sideFor(s, proposed) };
}

export interface DatedObservation {
  id: string;
  date: ISODate;
  quality: string;
}

export interface NearestResult<T> {
  obs: T;
  /** Place-in-season offset: observation month/day minus target month/day, in days. */
  offsetDays: number;
  /** The target month/day placed on the observation year. */
  targetOnSeason: ISODate;
}

/**
 * "Follow my selected date": place the plan's month and day on the reference
 * season year and return the nearest clear observation within maxDays.
 * Returns null when none is that close. The caller must show the real
 * acquisition date and the offset; 2024 imagery is never an observation of
 * the plan year.
 */
export function nearestClearObservation<T extends DatedObservation>(obs: T[], planDate: ISODate, seasonYear: number, maxDays = 20): NearestResult<T> | null {
  const p = parts(planDate);
  const target = onYear(p.m, p.d, seasonYear);
  let best: NearestResult<T> | null = null;
  for (const o of obs) {
    if (o.quality !== "clear") continue;
    const off = toDay(o.date) - toDay(target);
    if (Math.abs(off) > maxDays) continue;
    if (!best || Math.abs(off) < Math.abs(best.offsetDays) || (Math.abs(off) === Math.abs(best.offsetDays) && off < best.offsetDays)) {
      best = { obs: o, offsetDays: off, targetOnSeason: target };
    }
  }
  return best;
}

/** Previous / next clear observation from the current one (chronological). */
export function stepClear<T extends DatedObservation>(obs: T[], currentId: string | null, dir: 1 | -1): T | null {
  const clear = obs.filter((o) => o.quality === "clear").sort((a, b) => toDay(a.date) - toDay(b.date));
  if (!clear.length) return null;
  const cur = obs.find((o) => o.id === currentId);
  if (!cur) return dir === 1 ? clear[0] : clear[clear.length - 1];
  const t = toDay(cur.date);
  if (dir === 1) return clear.find((o) => toDay(o.date) > t) ?? null;
  return [...clear].reverse().find((o) => toDay(o.date) < t) ?? null;
}
