import { STRATEGIES, cropById, familyAlert, type CoverVariant, type StrategyDef } from "./catalog";
import { evaluateStrategy, scheduleOf, windowOf, type CalendarInputs, type StrategyCalendar, type StrategyId, type StrategyInputs, type WaterInputs } from "./calendar";
import { reportedConditions, type Condition, type PlotContext, EMPTY_CONTEXT } from "./context";
import { addDays, fmtDate, maxDate, toDay, type ISODate } from "./dates";
import { sensitivity, type Change } from "./sensitivity";
import type { TurnSchedule } from "./turns";

export type Access = "me" | "someone-else" | "can-agree";
export type Priority = "keep-date" | "explore-cover" | "avoid-operations";

export interface CoverSettings {
  variantId: string;
  sowing: ISODate;
  terminationDays: number;
  targetDurationDays: number | null;
}

export interface WhatIf {
  releaseDelay: number;
  tractorDelay: number;
  loseLastTurn: boolean;
  earlierTransplant: number;
}

export interface Scenario {
  name: string;
  previousCropId: string;
  nextCropId: string;
  release: ISODate;
  nextCrop: ISODate;
  preparationDays: number;
  access: Access;
  water: WaterInputs;
  priority: Priority;
  covers: Record<"B" | "C", CoverSettings>;
  whatIf: WhatIf;
  context: PlotContext;
}

export const NO_WHATIF: WhatIf = { releaseDelay: 0, tractorDelay: 0, loseLastTurn: false, earlierTransplant: 0 };

/** Illustrative scenario: Alto Valle composite plot. Dates are scenario assumptions. */
export function defaultScenario(): Scenario {
  const release = "2027-03-15";
  return {
    name: "Alto Valle composite plot",
    previousCropId: "tomato",
    nextCropId: "tomato",
    release,
    nextCrop: "2027-10-15",
    preparationDays: 14,
    access: "me",
    water: {
      closure: "2027-04-29",
      lastTurn: null,
      frequencyDays: null,
      referenceTurn: null,
      waterAfterClosure: "no",
      minTurnsAfterSowing: 1,
    },
    priority: "explore-cover",
    covers: {
      B: { variantId: "rye", sowing: release, terminationDays: 28, targetDurationDays: null },
      C: { variantId: "vetch", sowing: release, terminationDays: 21, targetDurationDays: null },
    },
    whatIf: { ...NO_WHATIF },
    context: { ...EMPTY_CONTEXT },
  };
}

/**
 * Example shown when the app opens. Chosen after computing: from 10 Apr the
 * cold-night counts split (33 of 45 years at 0 °C, D = 30), and the last turn is
 * stated so the overview shows numbers. All values are example inputs.
 */
export function demoScenario(): Scenario {
  const s = defaultScenario();
  s.previousCropId = "squash";
  s.release = "2027-04-10";
  s.covers.B.sowing = "2027-04-10";
  s.covers.C.sowing = "2027-04-10";
  s.water.lastTurn = "2027-04-25";
  s.water.frequencyDays = 10;
  return s;
}

export function variantOf(def: StrategyDef, id: string): CoverVariant | undefined {
  return def.variants.find((v) => v.id === id) ?? def.variants[0];
}

export interface Effective {
  cal: CalendarInputs;
  strategies: Record<StrategyId, StrategyInputs>;
}

/** Apply what-if controls. Sowing keeps the user's date unless release moves past it. */
export function effectiveInputs(s: Scenario, w: WhatIf = s.whatIf): Effective {
  const release = addDays(s.release, w.releaseDelay);
  const nextCrop = addDays(s.nextCrop, -w.earlierTransplant);
  const cal: CalendarInputs = { release, nextCrop, preparationDays: s.preparationDays, water: s.water, loseLastTurn: w.loseLastTurn };
  const sow = (d: ISODate) => {
    // A sowing typed before the original release is kept (and flagged as invalid input).
    const base = toDay(d) < toDay(s.release) ? d : maxDate(d, release);
    return addDays(base, w.tractorDelay);
  };
  return {
    cal,
    strategies: {
      A: { id: "A", sowing: null, terminationDays: 0, targetDurationDays: null },
      B: { id: "B", sowing: sow(s.covers.B.sowing), terminationDays: s.covers.B.terminationDays, targetDurationDays: s.covers.B.targetDurationDays },
      C: { id: "C", sowing: sow(s.covers.C.sowing), terminationDays: s.covers.C.terminationDays, targetDurationDays: s.covers.C.targetDurationDays },
    },
  };
}

export function hasWhatIf(w: WhatIf): boolean {
  return w.releaseDelay !== 0 || w.tractorDelay !== 0 || w.loseLastTurn || w.earlierTransplant !== 0;
}

export interface StrategyReading {
  def: StrategyDef;
  variant?: CoverVariant;
  inputs: StrategyInputs;
  calendar: StrategyCalendar;
  plan: StrategyCalendar; // without what-if controls
  conditions: Condition[];
  changes: Change[];
  nextStep: string;
  explanation: { key: string; text: string; highlight: boolean }[];
}

export interface Evaluation {
  applies: boolean;
  notApplicableText?: string;
  effective: Effective;
  window: ReturnType<typeof windowOf>;
  schedule: TurnSchedule;
  strategies: StrategyReading[];
  familyAlert: string | null;
}

export function evaluate(s: Scenario): Evaluation {
  const eff = effectiveInputs(s);
  const plan = effectiveInputs(s, NO_WHATIF);
  const applies = s.access !== "someone-else";
  const readings: StrategyReading[] = STRATEGIES.map((def) => {
    const inputs = eff.strategies[def.id];
    const calendar = evaluateStrategy(eff.cal, inputs);
    const planCal = evaluateStrategy(plan.cal, plan.strategies[def.id]);
    const isCover = def.id !== "A";
    const conditions = reportedConditions(s.context, s.previousCropId, s.nextCropId, isCover);
    const changes = calendar.state === "invalid" ? [] : sensitivity(eff.cal, inputs);
    const variant = isCover ? variantOf(def, s.covers[def.id as "B" | "C"].variantId) : undefined;
    const reading: StrategyReading = { def, variant, inputs, calendar, plan: planCal, conditions, changes, nextStep: "", explanation: [] };
    reading.nextStep = nextStep(s, reading);
    reading.explanation = explain(s, reading);
    return reading;
  });
  return {
    applies,
    notApplicableText: applies ? undefined : "Umbral does not apply: the decision belongs to whoever controls the plot in winter.",
    effective: eff,
    window: windowOf(eff.cal),
    schedule: scheduleOf(eff.cal),
    strategies: readings,
    familyAlert: familyAlert(s.previousCropId, s.nextCropId),
  };
}

/** The single most useful piece of information to resolve. */
export function nextStep(s: Scenario, r: StrategyReading): string {
  const c = r.calendar;
  if (s.access === "someone-else") return "Share this summary with whoever controls the plot from April to September.";
  if (s.access === "can-agree") return "Agree winter access (April to September) with whoever controls the plot.";
  if (c.state === "invalid") return `Fix the input: ${c.invalidReasons[0]}`;
  if (c.state === "needs-data") {
    const b = c.binding[0];
    if (b?.id === "irrigation") {
      const who = b.missing === "whether there is water after canal closure" ? "Find out whether there is water after canal closure (well, storage or another source)" : `Ask the irrigation consortium for ${b.missing ?? "the missing turn data"}`;
      return `${who}: ${r.def.id} fits ${b.threshold}.`;
    }
    return `Resolve: ${b?.label ?? "missing input"}.`;
  }
  if (c.state === "no-fit" || c.state === "no-fit-even-with-data") {
    const fix = r.changes.find((x) => x.to === "fits" || x.to === "needs-data");
    if (fix) return `Smallest change that would help: ${fix.text}.`;
    return `No single date shift within 120 d makes ${r.def.id} fit: ${c.binding[0]?.label.toLowerCase() ?? "check the inputs"}.`;
  }
  const review = r.conditions.find((k) => k.review);
  if (review?.id === "waterlogging") return "Check whether the sector stays waterlogged and for how long before choosing a sowing date.";
  if (review?.id === "salinity") return s.context.salinity.kind === "reported" ? "Get a salinity analysis that records the method, date and depth." : "Review the salinity measurement with whoever took it; Umbral does not classify it.";
  if (review?.id === "family" && (s.context.healthProblemRecorded === "unknown")) return "Record which plant health problems the previous crops had.";
  if (r.def.id !== "A" && r.inputs.targetDurationDays === null) return `Set the cover duration you need before termination: ${c.availableDays} d are available now.`;
  if (r.def.id === "A") return "Record what covers the soil in winter: residue, bare soil or volunteer plants.";
  return `Confirm the ${r.variant?.name.toLowerCase()} termination interval before ${cropById(s.nextCropId).name.toLowerCase()} with a local adviser.`;
}

/** Orders the explanation by the grower's priority. No score is produced. */
export function explain(s: Scenario, r: StrategyReading): StrategyReading["explanation"] {
  const c = r.calendar;
  const term = c.constraints.find((k) => k.id === "termination" || k.id === "window");
  const items = {
    date: { key: "date", text: term ? `${term.label}: ${term.detail}` : "", highlight: s.priority === "keep-date" },
    cover: {
      key: "cover",
      text: r.def.id === "A" ? "No sown cover: the soil keeps residue, stays bare or grows volunteer plants." : `${c.availableDays ?? "—"} d from sowing to the termination deadline.`,
      highlight: s.priority === "explore-cover",
    },
    ops: {
      key: "ops",
      text: r.def.operations.length ? `Extra field operations: ${r.def.operations.join(" and ")} (${r.def.operations.length}).` : "No extra field operations.",
      highlight: s.priority === "avoid-operations",
    },
  };
  const order = s.priority === "keep-date" ? ["date", "cover", "ops"] : s.priority === "explore-cover" ? ["cover", "date", "ops"] : ["ops", "date", "cover"];
  return order.map((k) => items[k as keyof typeof items]).filter((x) => x.text);
}

export function describeTurns(r: StrategyReading): string {
  const t = r.calendar.turns;
  if (!t) return "—";
  switch (t.status) {
    case "confirmed":
      return `${t.min}`;
    case "nominal":
      return `up to ${t.max} (nominal)`;
    case "range":
      return `0–${t.max}`;
    case "at-least":
      return t.max === 0 ? "0" : `at least ${t.min}`;
    default:
      return "unknown";
  }
}

export interface Overview {
  sowing: ISODate | null;
  /** Sowing → termination deadline, days. */
  availableDays: number | null;
  terminationDeadline: ISODate | null;
  /** Sowing → last irrigation opportunity, days, with its status. */
  daysToLastTurn: number | null;
  lastTurnDate: ISODate | null;
  lastTurnStatus: "stated" | "nominal" | "upper-bound" | "unknown" | null;
  /** Irrigation opportunities after sowing: a count or range, never days. */
  turns: string;
  turnsStatus: string | null;
}

export function overviewOf(r: StrategyReading): Overview {
  const c = r.calendar;
  const lo = c.lastOpportunity;
  return {
    sowing: r.inputs.sowing,
    availableDays: c.availableDays,
    terminationDeadline: c.terminationDeadline,
    daysToLastTurn: lo?.days ?? null,
    lastTurnDate: lo?.date ?? null,
    lastTurnStatus: lo?.status ?? null,
    turns: describeTurns(r),
    turnsStatus: c.turns?.status ?? null,
  };
}

export { fmtDate };
