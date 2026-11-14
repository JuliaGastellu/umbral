import { addDays, diffDays, fromDay, toDay, type ISODate } from "./dates";

/**
 * Irrigation turn schedule.
 *
 * A schedule is a reference turn date plus a frequency. It never moves with
 * the sowing date. Two different things are kept apart:
 *  - the phase (which dates turns fall on), fixed by a known turn date;
 *  - the end of service (the last useful turn), known only when the last turn
 *    is stated. Without it, turns after the stated ones are *nominal*: they
 *    follow the frequency up to canal closure, but nobody confirmed them.
 * A frequency without any known turn date does not fix exact dates: counts
 * are a range over all possible phases.
 */
export interface TurnInputs {
  lastTurn: ISODate | null;
  frequencyDays: number | null;
  referenceTurn: ISODate | null;
  closure: ISODate;
  from: ISODate;
  loseLastTurn?: boolean;
}

export type TurnSchedule =
  | { kind: "exact"; dates: ISODate[]; end: ISODate; endIsKnown: boolean }
  | { kind: "phase-unknown"; frequencyDays: number; end: ISODate; endIsKnown: boolean }
  | { kind: "last-only"; lastTurn: ISODate }
  | { kind: "unknown"; closure: ISODate };

function seasonEnd(t: TurnInputs): { end: ISODate; known: boolean } {
  if (t.lastTurn) {
    const end = toDay(t.lastTurn) <= toDay(t.closure) ? t.lastTurn : t.closure;
    return { end, known: true };
  }
  return { end: t.closure, known: false };
}

export function buildSchedule(t: TurnInputs): TurnSchedule {
  const freq = t.frequencyDays && t.frequencyDays > 0 ? Math.round(t.frequencyDays) : null;
  const { end, known } = seasonEnd(t);
  const anchor = t.lastTurn ?? t.referenceTurn;
  if (freq && anchor) {
    const a = toDay(anchor);
    const lo = toDay(t.from);
    const hi = toDay(end);
    const dates: ISODate[] = [];
    let k = Math.ceil((lo - a) / freq);
    for (let d = a + k * freq; d <= hi; k++, d = a + k * freq) dates.push(fromDay(d));
    if (t.loseLastTurn && dates.length) dates.pop();
    return { kind: "exact", dates, end: dates.length ? dates[dates.length - 1] : end, endIsKnown: known };
  }
  if (freq) return { kind: "phase-unknown", frequencyDays: freq, end, endIsKnown: known };
  if (t.lastTurn) {
    if (t.loseLastTurn) return { kind: "unknown", closure: t.closure };
    return { kind: "last-only", lastTurn: end };
  }
  return { kind: "unknown", closure: t.closure };
}

function countPhase(lo: number, hi: number, f: number, phase: number): number {
  if (hi < lo) return 0;
  const first = lo + ((((phase - lo) % f) + f) % f);
  return first > hi ? 0 : Math.floor((hi - first) / f) + 1;
}

/**
 * - confirmed: exact dates and the last turn is stated in the scenario;
 * - nominal: exact dates from frequency + a known turn, service end not stated (upper bound: closure);
 * - range: frequency known, phase unknown;
 * - at-least: only the last turn is known;
 * - unknown: no turn information.
 */
export type TurnStatus = "confirmed" | "nominal" | "range" | "at-least" | "unknown";

export interface TurnCount {
  min: number;
  max: number | null;
  status: TurnStatus;
  dates?: ISODate[];
  note: string;
}

/** Scheduled turns between sowing (inclusive) and the end of irrigation (inclusive). A count, never days. */
export function turnsAfter(s: TurnSchedule, sowing: ISODate, loseLastTurn = false): TurnCount {
  const sd = toDay(sowing);
  switch (s.kind) {
    case "exact": {
      const dates = s.dates.filter((d) => toDay(d) >= sd);
      return s.endIsKnown
        ? { min: dates.length, max: dates.length, status: "confirmed", dates, note: "Turn dates from the stated last turn and frequency." }
        : { min: 0, max: dates.length, status: "nominal", dates, note: `Nominal dates from a known turn and the frequency, up to canal closure; the last turn is not stated.` };
    }
    case "phase-unknown": {
      let mn = Infinity;
      let mx = -Infinity;
      for (let p = 0; p < s.frequencyDays; p++) {
        let c = countPhase(sd, toDay(s.end), s.frequencyDays, p);
        if (loseLastTurn) c = Math.max(0, c - 1);
        mn = Math.min(mn, c);
        mx = Math.max(mx, c);
      }
      return { min: s.endIsKnown ? mn : 0, max: mx, status: "range", note: "Frequency known, turn dates unknown: range over all possible dates, up to canal closure." };
    }
    case "last-only": {
      const inside = sd <= toDay(s.lastTurn);
      return { min: inside ? 1 : 0, max: inside ? null : 0, status: "at-least", note: inside ? "Only the last turn is known: at least that one." : "Sowing is after the last known turn." };
    }
    case "unknown":
      return { min: 0, max: null, status: "unknown", note: "Turn dates unknown." };
  }
}

/** Latest sowing date that still receives at least `m` scheduled turns (exact schedules only). */
export function latestSowingForTurns(s: TurnSchedule, m: number): ISODate | null {
  if (s.kind !== "exact") return null;
  if (m <= 0) return s.end;
  if (s.dates.length < m) return null;
  return s.dates[s.dates.length - m];
}

export interface LastOpportunity {
  date: ISODate | null;
  /** Days from sowing to that date (negative: it is before sowing). */
  days: number | null;
  status: "stated" | "nominal" | "upper-bound" | "unknown";
  text: string;
}

/** The last irrigation opportunity after sowing, with its status. */
export function lastOpportunity(s: TurnSchedule, sowing: ISODate, closure: ISODate): LastOpportunity {
  if (s.kind === "exact") {
    if (s.endIsKnown) {
      return { date: s.end, days: diffDays(sowing, s.end), status: "stated", text: `Last turn ${s.end} (stated in the scenario)` };
    }
    const last = s.dates.length ? s.dates[s.dates.length - 1] : null;
    return { date: last, days: last ? diffDays(sowing, last) : null, status: "nominal", text: "Last nominal turn before canal closure (not confirmed)" };
  }
  if (s.kind === "last-only") return { date: s.lastTurn, days: diffDays(sowing, s.lastTurn), status: "stated", text: "Last turn stated in the scenario" };
  if (s.kind === "phase-unknown" && s.endIsKnown) return { date: s.end, days: diffDays(sowing, s.end), status: "stated", text: "Last turn stated in the scenario" };
  return { date: closure, days: diffDays(sowing, closure), status: "upper-bound", text: "Last turn unknown; canal closure is the latest possible date" };
}

export function turnDatesBetween(s: TurnSchedule, from: ISODate, to: ISODate): ISODate[] {
  if (s.kind !== "exact") return [];
  return s.dates.filter((d) => toDay(d) >= toDay(from) && toDay(d) <= toDay(to));
}

export { addDays };
