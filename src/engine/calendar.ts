import { addDays, diffDays, fmtDate, isValidISO, toDay, type ISODate } from "./dates";
import { buildSchedule, lastOpportunity, latestSowingForTurns, turnsAfter, type LastOpportunity, type TurnCount, type TurnSchedule } from "./turns";

/**
 * Calendar compatibility.
 *
 * Window = release → soil ready (next-crop date − preparation). Each cover
 * must also be terminated a termination interval before soil ready.
 * "Fits" means only that the stated temporal constraints are met. It never
 * implies establishment, growth, water sufficiency or any agronomic outcome.
 *
 * Units are kept apart: `margin` is always days; `turnDeficit` is always a
 * number of irrigation turns. They are never combined.
 */

export type StrategyId = "A" | "B" | "C";
export type CalendarState = "fits" | "needs-data" | "no-fit-even-with-data" | "no-fit" | "invalid";

export interface WaterInputs {
  closure: ISODate;
  lastTurn: ISODate | null;
  frequencyDays: number | null;
  referenceTurn: ISODate | null;
  /** Another water source after canal closure. "unknown" is never read as "no". */
  waterAfterClosure: "yes" | "no" | "unknown";
  /** Scenario assumption: turns needed after sowing (editable, no local source). */
  minTurnsAfterSowing: number;
}

export interface StrategyInputs {
  id: StrategyId;
  sowing: ISODate | null;
  terminationDays: number;
  targetDurationDays: number | null;
}

export interface CalendarInputs {
  release: ISODate;
  nextCrop: ISODate;
  preparationDays: number;
  water: WaterInputs;
  loseLastTurn: boolean;
}

export type ConstraintId = "termination" | "irrigation" | "window";

export interface ConstraintResult {
  id: ConstraintId;
  label: string;
  state: "ok" | "fail" | "unknown";
  /** Slack in days (negative = shortfall in days). Only for time-based results. */
  margin?: number;
  /** Shortfall in irrigation turns. Never mixed with days. */
  turnDeficit?: number;
  bestCase?: "ok" | "fail";
  /** Plain-language condition for "Needs data". */
  threshold?: string;
  /** What is missing, for "Needs data". */
  missing?: string;
  limitDate?: ISODate;
  detail: string;
}

export interface StrategyCalendar {
  id: StrategyId;
  state: CalendarState;
  /** Smallest margin in days among known time-based constraints. */
  margin: number | null;
  binding: ConstraintResult[];
  constraints: ConstraintResult[];
  covers: string[];
  notCovered: string[];
  /** Sowing → termination deadline (cover strategies), days. */
  availableDays: number | null;
  terminationDeadline: ISODate | null;
  turns: TurnCount | null;
  lastOpportunity: LastOpportunity | null;
  message: string;
  invalidReasons: string[];
}

export interface WindowResult {
  start: ISODate;
  soilReady: ISODate;
  days: number;
  crossesNewYear: boolean;
}

export function windowOf(c: CalendarInputs): WindowResult {
  const soilReady = addDays(c.nextCrop, -c.preparationDays);
  return { start: c.release, soilReady, days: diffDays(c.release, soilReady), crossesNewYear: soilReady.slice(0, 4) !== c.release.slice(0, 4) };
}

export function scheduleOf(c: CalendarInputs): TurnSchedule {
  return buildSchedule({
    lastTurn: c.water.lastTurn,
    frequencyDays: c.water.frequencyDays,
    referenceTurn: c.water.referenceTurn,
    closure: c.water.closure,
    from: c.release,
    loseLastTurn: c.loseLastTurn,
  });
}

export function validateInputs(c: CalendarInputs, s?: StrategyInputs): string[] {
  const r: string[] = [];
  if (!isValidISO(c.release)) r.push("The release date is not a valid calendar date.");
  if (!isValidISO(c.nextCrop)) r.push("The next-crop date is not a valid calendar date.");
  if (!isValidISO(c.water.closure)) r.push("The canal closure date is not a valid calendar date.");
  if (c.water.lastTurn !== null && !isValidISO(c.water.lastTurn)) r.push("The last turn date is not a valid calendar date.");
  if (c.water.referenceTurn !== null && !isValidISO(c.water.referenceTurn)) r.push("The reference turn date is not a valid calendar date.");
  if (r.length) return r;
  if (toDay(c.nextCrop) <= toDay(c.release)) r.push(`The next crop (${fmtDate(c.nextCrop, true)}) is on or before the release (${fmtDate(c.release, true)}). Move the next crop later; it may be in the following year.`);
  if (c.preparationDays < 0) r.push("Preparation time cannot be negative.");
  if (c.water.frequencyDays !== null && c.water.frequencyDays <= 0) r.push("Turn frequency must be at least 1 day.");
  if (c.water.lastTurn && toDay(c.water.lastTurn) > toDay(c.water.closure)) r.push(`The last turn (${fmtDate(c.water.lastTurn)}) is after canal closure (${fmtDate(c.water.closure)}).`);
  if (s && s.sowing) {
    if (!isValidISO(s.sowing)) r.push("The sowing date is not a valid calendar date.");
    else if (toDay(s.sowing) < toDay(c.release)) r.push(`Sowing (${fmtDate(s.sowing)}) is before the plot is released (${fmtDate(c.release)}).`);
  }
  if (s && s.terminationDays < 0) r.push("The termination interval cannot be negative.");
  if (s && s.targetDurationDays !== null && s.targetDurationDays < 0) r.push("The target duration cannot be negative.");
  return r;
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** Canal turns only. Alternative water is handled by the caller. */
function canalConstraint(c: CalendarInputs, sched: TurnSchedule, sowing: ISODate, turns: TurnCount, label: string): ConstraintResult {
  const m = c.water.minTurnsAfterSowing;
  const sd = toDay(sowing);
  if (sched.kind === "exact") {
    const after = turns.dates ?? [];
    const latest = latestSowingForTurns(sched, m);
    if (sched.endIsKnown) {
      if (latest === null) {
        return { id: "irrigation", label, state: "fail", turnDeficit: m - after.length, limitDate: sched.end, detail: `${plural(after.length, "turn")} after sowing; ${m} required. The stated turns end on ${fmtDate(sched.end)}.` };
      }
      const margin = diffDays(sowing, latest);
      return {
        id: "irrigation", label, state: margin >= 0 ? "ok" : "fail", margin, limitDate: latest,
        turnDeficit: margin >= 0 ? undefined : m - after.length,
        detail: margin >= 0 ? `${plural(after.length, "turn")} after sowing. Sowing up to ${fmtDate(latest)} keeps ${m}.` : `Sowing is ${-margin} d after ${fmtDate(latest)}, the last date that still gets ${plural(m, "turn")}.`,
      };
    }
    // Nominal: the phase is known, but nobody stated until when service continues.
    if (after.length < m) {
      return { id: "irrigation", label, state: "unknown", bestCase: "fail", turnDeficit: m - after.length, limitDate: c.water.closure, detail: `Even if every nominal turn up to canal closure happens, only ${plural(after.length, "turn")} fall after sowing; ${m} required.` };
    }
    const needed = after[m - 1];
    return {
      id: "irrigation", label, state: "unknown", bestCase: "ok", limitDate: needed,
      threshold: `if irrigation continues until at least ${fmtDate(needed)}`,
      missing: "the last useful turn",
      detail: `${plural(after.length, "nominal turn")} after sowing, up to canal closure. None is confirmed: the last useful turn is not stated.`,
    };
  }
  if (sched.kind === "phase-unknown") {
    const hi = turns.max ?? 0;
    if (hi < m) return { id: "irrigation", label, state: "unknown", bestCase: "fail", turnDeficit: m - hi, detail: `Even in the best case, at most ${plural(hi, "turn")} fit between sowing and canal closure; ${m} required.` };
    return {
      id: "irrigation", label, state: "unknown", bestCase: "ok",
      threshold: `if at least ${plural(m, "turn")} fall between ${fmtDate(sowing)} and the last useful turn`,
      missing: "one dated turn and the last useful turn",
      detail: `Turn dates unknown: 0 to ${hi} turns up to canal closure.`,
    };
  }
  if (sched.kind === "last-only") {
    if (m === 1) {
      const margin = diffDays(sowing, sched.lastTurn);
      return { id: "irrigation", label, state: margin >= 0 ? "ok" : "fail", margin, limitDate: sched.lastTurn, turnDeficit: margin >= 0 ? undefined : 1, detail: margin >= 0 ? `The stated last turn (${fmtDate(sched.lastTurn)}) is ${margin} d after sowing.` : `The stated last turn (${fmtDate(sched.lastTurn)}) is ${-margin} d before sowing.` };
    }
    if (sd > toDay(sched.lastTurn)) return { id: "irrigation", label, state: "fail", margin: diffDays(sowing, sched.lastTurn), turnDeficit: m, limitDate: sched.lastTurn, detail: "Sowing is after the stated last turn." };
    return { id: "irrigation", label, state: "unknown", bestCase: "ok", threshold: `if the turn frequency leaves ${plural(m, "turn")} between ${fmtDate(sowing)} and ${fmtDate(sched.lastTurn)}`, missing: "the turn frequency", detail: "Turn frequency unknown." };
  }
  // Nothing known: canal closure is the latest possible turn.
  if (sd > toDay(c.water.closure)) {
    return { id: "irrigation", label, state: "unknown", bestCase: "fail", turnDeficit: m, limitDate: c.water.closure, detail: `Sowing is after canal closure (${fmtDate(c.water.closure)}): no canal turn can follow.` };
  }
  if (m === 1) {
    return { id: "irrigation", label, state: "unknown", bestCase: "ok", limitDate: sowing, threshold: `if the last turn is on or after ${fmtDate(sowing)}`, missing: "the last useful turn", detail: `Last turn unknown; canal closure (${fmtDate(c.water.closure)}) is the latest possible date.` };
  }
  return { id: "irrigation", label, state: "unknown", bestCase: "ok", threshold: `if ${plural(m, "turn")} fall between ${fmtDate(sowing)} and the last turn`, missing: "the last useful turn and the turn frequency", detail: "Last turn and frequency unknown." };
}

function irrigationConstraint(c: CalendarInputs, sched: TurnSchedule, sowing: ISODate, turns: TurnCount): ConstraintResult {
  const m = c.water.minTurnsAfterSowing;
  const label = m === 1 ? "At least 1 irrigation turn after sowing" : `At least ${m} irrigation turns after sowing`;
  if (m <= 0) return { id: "irrigation", label, state: "ok", detail: "No turns required (scenario setting)." };
  if (c.water.waterAfterClosure === "yes") {
    return { id: "irrigation", label, state: "ok", detail: "Another water source after canal closure is stated. Umbral does not check its quantity or quality." };
  }
  const canal = canalConstraint(c, sched, sowing, turns, label);
  if (c.water.waterAfterClosure === "unknown" && (canal.state === "fail" || canal.bestCase === "fail")) {
    // Canal turns alone do not meet the requirement, but another source is unknown, not absent.
    return {
      id: "irrigation", label, state: "unknown", bestCase: "ok", turnDeficit: canal.turnDeficit, limitDate: canal.limitDate,
      threshold: "if water is available after canal closure from another source",
      missing: "whether there is water after canal closure",
      detail: `${canal.detail} Water after closure from another source: not stated.`,
    };
  }
  return canal;
}

export function evaluateStrategy(c: CalendarInputs, s: StrategyInputs): StrategyCalendar {
  const invalid = validateInputs(c, s);
  if (invalid.length) {
    return { id: s.id, state: "invalid", margin: null, binding: [], constraints: [], covers: [], notCovered: [], availableDays: null, terminationDeadline: null, turns: null, lastOpportunity: null, message: invalid[0], invalidReasons: invalid };
  }
  const win = windowOf(c);
  const constraints: ConstraintResult[] = [];
  const covers: string[] = [];
  const notCovered: string[] = [];
  let turns: TurnCount | null = null;
  let last: LastOpportunity | null = null;
  let availableDays: number | null = null;
  let deadline: ISODate | null = null;

  if (s.sowing === null) {
    const margin = win.days;
    constraints.push({
      id: "window", label: "Plot released before soil preparation starts", state: margin >= 0 ? "ok" : "fail", margin, limitDate: win.soilReady,
      detail: margin >= 0 ? `Preparation can start on ${fmtDate(win.soilReady)}.` : `Preparation would have to start ${-margin} d before release.`,
    });
    covers.push("release before the start of preparation for the next crop");
  } else {
    deadline = addDays(win.soilReady, -s.terminationDays);
    availableDays = diffDays(s.sowing, deadline);
    const need = s.targetDurationDays ?? 0;
    const margin = availableDays - need;
    constraints.push({
      id: "termination",
      label: s.targetDurationDays === null ? "Termination deadline after sowing" : `${s.targetDurationDays} d of cover before the termination deadline`,
      state: margin >= 0 ? "ok" : "fail", margin, limitDate: deadline,
      detail: `Terminate by ${fmtDate(deadline)} (${s.terminationDays} d before the soil must be ready): ${availableDays} d after sowing.`,
    });
    covers.push("sowing on or after release", `termination by ${fmtDate(deadline)}`);
    if (s.targetDurationDays === null) notCovered.push("cover duration (no target set)");
    const sched = scheduleOf(c);
    turns = turnsAfter(sched, s.sowing, c.loseLastTurn && sched.kind === "phase-unknown");
    last = lastOpportunity(sched, s.sowing, c.water.closure);
    const irr = irrigationConstraint(c, sched, s.sowing, turns);
    constraints.push(irr);
    covers.push(irr.label.toLowerCase());
    notCovered.push("whether the water is enough", "establishment, growth or biomass");
  }

  const known = constraints.filter((k) => k.state !== "unknown");
  const unknown = constraints.filter((k) => k.state === "unknown");
  const failing = known.filter((k) => k.state === "fail");
  let state: CalendarState;
  if (failing.length) state = "no-fit";
  else if (unknown.some((k) => k.bestCase === "fail")) state = "no-fit-even-with-data";
  else if (unknown.length) state = "needs-data";
  else state = "fits";

  const timeKnown = known.filter((k) => k.margin !== undefined);
  const margin = timeKnown.length ? Math.min(...timeKnown.map((k) => k.margin as number)) : null;
  let binding: ConstraintResult[];
  if (state === "no-fit") {
    const timed = failing.filter((k) => k.margin !== undefined);
    const minM = timed.length ? Math.min(...timed.map((k) => k.margin as number)) : null;
    binding = failing.filter((k) => k.margin === undefined || k.margin === minM);
  } else if (state === "no-fit-even-with-data") binding = unknown.filter((k) => k.bestCase === "fail");
  else if (state === "needs-data") binding = unknown;
  else binding = timeKnown.filter((k) => k.margin === margin);

  return { id: s.id, state, margin, binding, constraints, covers, notCovered, availableDays, terminationDeadline: deadline, turns, lastOpportunity: last, message: describe(state, binding, margin), invalidReasons: [] };
}

export function shortfallText(b: ConstraintResult): string {
  const parts: string[] = [];
  if (b.margin !== undefined && b.margin < 0) parts.push(`${-b.margin} d late`);
  if (b.turnDeficit !== undefined && b.turnDeficit > 0) parts.push(`${b.turnDeficit} turn${b.turnDeficit === 1 ? "" : "s"} short`);
  return parts.join(", ");
}

function describe(state: CalendarState, binding: ConstraintResult[], margin: number | null): string {
  const b = binding[0];
  switch (state) {
    case "fits":
      return `Fits the stated dates with ${margin} d to spare${b ? ` (${b.label.toLowerCase()})` : ""}.`;
    case "needs-data":
      return `Needs data: fits ${b?.threshold ?? "once the missing input is known"}.`;
    case "no-fit-even-with-data":
      return `Doesn't fit even with data: ${b?.detail ?? ""}`;
    case "no-fit":
      return `Doesn't fit: ${b?.label.toLowerCase()} (${b ? shortfallText(b) : ""}).`;
    default:
      return "";
  }
}

export const STATE_LABEL: Record<CalendarState, string> = {
  fits: "Fits",
  "needs-data": "Needs data",
  "no-fit-even-with-data": "Doesn't fit even with data",
  "no-fit": "Doesn't fit",
  invalid: "Check inputs",
};
