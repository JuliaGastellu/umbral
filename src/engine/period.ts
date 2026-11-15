/**
 * The management period of a plan, derived once from the production system.
 * Annual rotation (and beds whose plants are removed): from the date the field
 * is free to the date the soil must be ready. Orchard, or beds with plants kept:
 * the cover window the person entered; there is no field-free date when the
 * main crop stays.
 */
import { cropById } from "./catalog";
import { addDays, diffDays, fmtDate, toDay, type ISODate } from "./dates";
import type { Evaluation, Scenario } from "./scenario";

export interface ManagementPeriod {
  permanent: boolean;
  start: ISODate;
  end: ISODate;
  days: number;
  /** What the period is, in words. */
  basis: string;
  /** The default period for NASA history (at most one year). */
  history: [ISODate, ISODate];
  /** How the history view describes "following the plan". */
  historyLabel: string;
}

export function isPermanent(s: Scenario): boolean {
  return s.system === "orchard" || (s.system === "beds" && s.beds.plants !== "removed");
}

export function managementPeriod(s: Scenario, ev: Evaluation): ManagementPeriod {
  if (isPermanent(s)) {
    const [start, rawEnd] = s.orchard.window;
    const end = toDay(rawEnd) > toDay(start) ? rawEnd : addDays(start, 1);
    const crop = cropById(s.previousCropId).name.toLowerCase();
    const unsure = s.system === "beds" && s.beds.plants === "unknown";
    const stays = unsure ? `if the ${crop} plants stay (not confirmed)` : `the ${crop} stays`;
    const histEnd = diffDays(start, end) > 365 ? addDays(start, 365) : end;
    return {
      permanent: true, start, end, days: diffDays(start, rawEnd),
      basis: `The cover window you entered; ${stays}, so there is no field-free date.`,
      history: [start, histEnd],
      historyLabel: `over the cover window you entered, ${fmtDate(start, true)} to ${fmtDate(histEnd, true)} (${stays}; there is no field-free date)`,
    };
  }
  const start = ev.effective.cal.release;
  const end = toDay(ev.window.soilReady) > toDay(start) ? ev.window.soilReady : addDays(start, 1);
  return {
    permanent: false, start, end, days: ev.window.days,
    basis: "From the date the field is free to the date the soil must be ready for the next crop.",
    history: [start, addDays(start, 30)],
    historyLabel: `from the date the field is free, ${fmtDate(start, true)}, for 31 days`,
  };
}
