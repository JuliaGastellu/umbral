/**
 * Plain-language wording for growers. Technical terms stay in the
 * "How this was built" drawer and in Sources.
 */
import { shortfallText } from "../engine/calendar";
import { cropById } from "../engine/catalog";
import { fmtDate } from "../engine/dates";
import type { Scenario, StrategyReading } from "../engine/scenario";

/** One sentence naming what limits the option. */
export function limitText(r: StrategyReading): string {
  const c = r.calendar;
  const b = c.binding[0];
  if (c.state === "invalid") return c.message;
  if (r.def.id === "A") return "Nothing to decide on the calendar.";
  if (!b) return "No date limits this option.";
  if (c.state === "needs-data") {
    if (b.missing === "whether there is water after canal closure") return "Canal water ends before this cover gets its turns, and it is not known if there is other water.";
    if (b.missing === "the last useful turn" && b.threshold?.startsWith("if irrigation continues")) return `It depends on whether the canal still gives water ${b.threshold.replace("if irrigation continues until at least ", "until ")}.`;
    if (b.missing === "the last useful turn") return `It depends on the last canal turn: it must come ${b.threshold?.replace("if the last turn is ", "") ?? "after sowing"}.`;
    return `It depends on ${b.missing ?? "a missing date"}.`;
  }
  if (c.state === "no-fit-even-with-data") return b.id === "irrigation" ? "No canal turn is left after sowing." : b.detail;
  if (c.state === "no-fit") return b.id === "irrigation" ? `Irrigation: ${shortfallText(b)}.` : `The cover would have to end before it is sown (${shortfallText(b)}).`;
  if (b.id === "irrigation") return `Irrigation is the tightest limit: sowing can move ${c.margin} more days and still get its turn${(c.turns?.min ?? 0) === 1 ? "" : "s"}.`;
  return `The end date is the tightest limit: ${c.margin} days to spare.`;
}

/** One concrete action a grower can take, tied to the limiting condition. */
export function actionText(r: StrategyReading, s: Scenario): string {
  const c = r.calendar;
  const b = c.binding[0];
  if (s.access === "someone-else") return "Share this page with whoever decides about the plot in winter.";
  if (s.access === "can-agree") return "Agree with the owner who decides about the plot from April to September.";
  if (c.state === "invalid") return "Correct the dates in steps 1 and 2.";
  if (r.def.id === "A") return "No calendar decision needed.";
  const n = c.turns?.min ?? 0;
  const need = s.water.minTurnsAfterSowing;
  if (c.state === "needs-data" && b?.id === "irrigation") {
    if (b.missing === "whether there is water after canal closure") return "Check whether you have water after the canal closes (well, pond or other source); canal turns alone are not enough for this sowing date.";
    if (b.missing === "one dated turn and the last useful turn") return "Ask your irrigation consortium for the date of one turn and of the last turn; without them the turns after sowing cannot be counted.";
    if (b.missing === "the turn frequency") return "Ask your irrigation consortium how many days pass between turns.";
    return `Ask your irrigation consortium for the date of the last canal turn; the cover needs it on or after ${b.limitDate ? fmtDate(b.limitDate) : "the sowing date"}.`;
  }
  if (c.state === "no-fit" || c.state === "no-fit-even-with-data") {
    const fix = r.changes.find((x) => x.to === "fits" || x.to === "needs-data");
    if (fix?.param === "sowing" || fix?.param === "release") return `Sow ${Math.abs(fix.delta)} days ${fix.delta < 0 ? "earlier" : "later"}, or find water after the canal closes.`;
    return "Try an earlier sowing date or a later next crop.";
  }
  if (b?.id === "irrigation" && c.margin !== null) {
    const last = c.lastOpportunity?.date ? ` (${fmtDate(c.lastOpportunity.date)})` : "";
    const lose = need <= 1 ? "leaves the seed without canal water" : `leaves fewer than ${need} turns`;
    return `Confirm the last canal turn${last} with your irrigation consortium; with ${n} turn${n === 1 ? "" : "s"} after sowing, a delay of more than ${c.margin} days ${lose}.`;
  }
  const crop = cropById(s.nextCropId).name.toLowerCase().replace(" (processing)", "");
  return `Check with a local adviser that ending the ${r.variant?.name.toLowerCase()} by ${c.terminationDeadline ? fmtDate(c.terminationDeadline) : "the deadline"} leaves the soil ready for the ${crop}; that ${r.inputs.terminationDays}-day gap is not a local value.`;
}

/** One line showing what the grower's priority changes in the reading. */
export function priorityLine(s: Scenario, rs: StrategyReading[], focus: "B" | "C"): string {
  const crop = cropById(s.nextCropId).name.toLowerCase().replace(" (processing)", "");
  const f = rs.find((x) => x.def.id === focus)!;
  const other = rs.find((x) => x.def.id === (focus === "B" ? "C" : "B"))!;
  if (s.priority === "keep-date") return `Your priority, keep the ${crop} date: the ${f.variant?.name.toLowerCase()} must be ended by ${f.calendar.terminationDeadline ? fmtDate(f.calendar.terminationDeadline) : "—"} so the ${crop} goes in on ${fmtDate(s.nextCrop)} without moving.`;
  if (s.priority === "avoid-operations") return "Your priority, fewer field operations: a cover adds two jobs (sowing it and ending it); leaving the field as now adds none.";
  const a = f.calendar.availableDays ?? 0;
  const b = other.calendar.availableDays ?? 0;
  return `Your priority, soil cover: the ${f.variant?.name.toLowerCase()} gives ${a} calendar days of cover and the ${other.variant?.name.toLowerCase()} ${b}; the difference comes from the assumed gap before the ${crop}, not from how well each grows.`;
}

export type GreenStep = 0 | 1 | 2 | 3;
export const GREEN_STEPS: { min: number; label: string; color: string }[] = [
  { min: -Infinity, label: "little or no green", color: "#b9a27a" },
  { min: 0.2, label: "some green", color: "#d9d38f" },
  { min: 0.4, label: "green", color: "#6fae55" },
  { min: 0.6, label: "very green", color: "#1f6b34" },
];
export const NO_VALUE_LABEL = "no valid image (clouds, shadow, snow, water or missing data)";
export const NO_VALUE_COLOR = "#c9c9c9";

/** Display classes for greenness (NDVI). A presentation rule, not a crop diagnosis. */
export function greenStep(v: number | null): GreenStep | null {
  if (v === null) return null;
  let k: GreenStep = 0;
  GREEN_STEPS.forEach((g, i) => {
    if (v >= g.min) k = i as GreenStep;
  });
  return k;
}

export function satelliteName(sensor: string): string {
  return sensor === "L30" ? "Landsat (NASA/USGS)" : "Sentinel-2 (European Space Agency)";
}

export function cloudText(clear: number, total: number): string {
  if (total === 0) return "no pixels";
  if (clear === total) return "no clouds over it";
  if (clear === 0) return "fully hidden by clouds";
  const share = clear / total;
  if (share < 0.2) return `mostly hidden by clouds (${clear} of ${total} spots visible)`;
  return `clouds hid part of it (${clear} of ${total} spots visible)`;
}

export const LAST_TURN_STATUS: Record<string, string> = {
  stated: "date given in this example",
  nominal: "from the turn schedule, not confirmed",
  "upper-bound": "not known: the canal closes on this date at the latest",
  unknown: "not known",
};

export function fmtShort(d: string): string {
  return fmtDate(d);
}
