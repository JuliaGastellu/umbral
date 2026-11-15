/**
 * The canonical export of the plan shown on screen (JSON and Markdown).
 *
 * Everything primary is derived from the selected candidate and the production
 * system: the selected candidate's own calendar evaluation, the management
 * period of the system, and the same cold-night question the Plan view shows.
 * The three annual reference strategies are kept only for annual plans, in a
 * separately labelled section, and never as the plan's result.
 */
import { SOURCES, cropById } from "./catalog";
import { STATE_LABEL } from "./calendar";
import { exposureByYear, exposureSentence, fmtT, summarize, conditionFor, yearsInRange, type DailySeries } from "./climate";
import { fmtDate, toDay, type ISODate } from "./dates";
import { seriesYears, stationLine, type ClimateSettings, type StationSummary } from "./exposure";
import { buildExport, hlsExport, type ExportDoc, type HlsInput } from "./export";
import { managementPeriod, type ManagementPeriod } from "./period";
import { beforeSowing, waterFact } from "./planText";
import { CONFIDENCE_LABEL, STATUS_LABEL, candidateScenario, goalFitText, goalLabel, type Candidate, type Suggestion } from "./recommend";
import { describeTurns, evaluate, overviewOf, type Evaluation, type Scenario } from "./scenario";

export const PLAN_EXPORT_SCHEMA = "umbral.plan/2";

export interface PlanExportInput {
  s: Scenario;
  ev: Evaluation;
  sug: Suggestion;
  active: Candidate | null;
  series: DailySeries | null;
  cfg: ClimateSettings;
  station: StationSummary | null;
  fieldLabel: string;
  hls: HlsInput | null;
  /** Annual plans only: the comparison of two free dates for the selected candidate. */
  comparison?: { plan: Record<string, unknown>; other: Record<string, unknown> } | null;
  weather?: Record<string, unknown> | null;
  notes?: { date: ISODate; text: string }[];
  incomplete?: boolean;
  generated?: string;
}

type Assumption = ExportDoc["assumptions"][number];

export interface PlanExport {
  app: "Umbral";
  schema: typeof PLAN_EXPORT_SCHEMA;
  label: string;
  generated: string;
  inputState: string;
  system: { id: Scenario["system"]; label: string; mainCropStays: boolean };
  field: string;
  plan: {
    goal: { id: Scenario["goal"]; label: string };
    crops: Record<string, string>;
    managementPeriod: { start: ISODate; end: ISODate; days: number; basis: string };
  };
  selectedCandidate: Record<string, unknown> | null;
  /** Annual plans only: the selected candidate's own calendar evaluation. */
  annualCalendar: Record<string, unknown> | null;
  coldNightQuestion: Record<string, unknown> | null;
  suggestion: { headline: string; why: string; decidingFactor: string | null; confirmFirst: string; baseline: { calendar: string; text: string }; candidates: { id: string; name: string; status: string; statusLabel: string; goalMatch: string; calendar: string }[]; rules: string[] };
  dateComparison: { applicable: true; plan: Record<string, unknown>; other: Record<string, unknown> } | { applicable: false; reason: string };
  referenceComparators: { note: string; strategies: ExportDoc["results"] } | null;
  assumptions: Assumption[];
  hls: ExportDoc["hls"];
  weather: Record<string, unknown> | null;
  /** Raw inputs as saved, so the plan reopens unchanged; the fields listed in notApplicable play no part in this system's result. */
  inputs: { scenario: Scenario; notApplicable: string[] };
  observations: { date: ISODate; text: string }[];
  sources: { id: string; title: string; url?: string; status: string }[];
}

const SYSTEM_LABEL = (s: Scenario): string =>
  s.system === "annual" ? "Annual rotation" : s.system === "orchard" ? "Permanent orchard" : s.beds.plants === "removed" ? "Beds, plants removed (annual rotation)" : "Beds, plants kept";

/** The cold-night question shown in the Plan view, with its per-year rows. */
export function coldNightQuestion(series: DailySeries | null, window: [ISODate, ISODate] | null, cfg: ClimateSettings, station: StationSummary | null, basis: string): Record<string, unknown> | null {
  if (!series || !window || toDay(window[1]) <= toDay(window[0])) return null;
  const { first, last } = seriesYears(series);
  const rows = exposureByYear(series, { start: window[0], end: window[1], t: cfg.t, years: yearsInRange(first, last) });
  const sum = summarize(rows, cfg.d);
  return {
    source: "NASA POWER daily T2M_MIN, General Roca cell: regional reanalysis (MERRA-2 / GEOS-IT, about 55 km), not a plot measurement",
    basis, from: window[0], to: window[1], thresholdC: cfg.t, daysNeeded: cfg.d,
    yearsMet: sum.met, yearsNotMet: sum.notMet, notEvaluable: sum.notEvaluable, yearsEvaluated: sum.total,
    sentence: exposureSentence(sum, cfg.d, cfg.t, window[0], window[1]),
    perYear: rows.map((r) => ({ year: r.year, firstEvent: r.outcome === "event" ? "event" : r.outcome === "none" ? "no event in the window" : "insufficient data", days: r.outcome === "event" ? r.days : undefined, date: r.outcome === "event" ? r.date : undefined, tminC: r.outcome === "event" ? r.tmin : undefined, condition: conditionFor(r, cfg.d) })),
    regionalCheck: stationLine(station, cfg.t),
    note: "A past frequency of a weather condition, not a forecast or a probability of crop success. The threshold is your choice, not a species injury limit.",
  };
}

/** The window the cold-night question uses: the selected cover's sowing to the next crop, or the cover window of a standing crop. */
export function coldWindowFor(s: Scenario, ev: Evaluation, period: ManagementPeriod, active: Candidate | null): [ISODate, ISODate] | null {
  if (period.permanent) return [period.start, s.orchard.window[1]];
  return active?.calendar.sowing ? [active.calendar.sowing, ev.effective.cal.nextCrop] : null;
}

export function buildPlanExport(x: PlanExportInput): PlanExport {
  const { s, ev, sug, active, cfg, station } = x;
  const period = managementPeriod(s, ev);
  const permanent = period.permanent;
  const crop = cropById(s.previousCropId);

  const crops: Record<string, string> = permanent
    ? s.system === "orchard"
      ? { standingCrop: crop.name, coverArea: s.orchard.area, waterReachesCoverArea: s.orchard.waterReach, treeAge: s.orchard.age, mowing: s.orchard.mowing }
      : { standingCrop: crop.name, plants: s.beds.plants, coverArea: s.beds.area, dripOnBeds: s.beds.drip, waterReachingCoverArea: waterFact(s).detail, mulch: s.beds.mulch }
    : { cropJustHarvested: crop.name, nextCrop: cropById(s.nextCropId).name, nextCropDate: ev.effective.cal.nextCrop, fieldFree: ev.effective.cal.release, soilReady: ev.window.soilReady };

  let selectedCandidate: PlanExport["selectedCandidate"] = null;
  let annualCalendar: PlanExport["annualCalendar"] = null;
  if (active) {
    selectedCandidate = {
      id: active.id, name: active.name, status: active.status, statusLabel: STATUS_LABEL[active.status],
      group: active.strategy, goalMatch: active.purpose.match, goalFit: goalFitText(active), evidenceLevel: CONFIDENCE_LABEL[active.confidence],
      calendar: { label: active.calendar.label, sowing: active.calendar.sowing, endBy: active.calendar.endBy, availableDays: active.calendar.availableDays, canalTurnsAfterSowing: permanent ? null : active.calendar.turns },
      termination: active.termination,
      benefit: active.benefit, tradeoff: active.tradeoff,
      checks: active.checks, reportedSoilConditions: active.soil,
      // The same review list the result shows: this candidate's blocking checks plus the shared ones, first one = next check.
      beforeSowing: beforeSowing(active, sug).all.map((k) => ({ kind: k.kind, text: k.text })),
      dimensions: active.dimensions, nutrientProcess: active.nChain, nutrient: active.nutrient,
      productiveUse: active.productiveUse, nextStep: active.nextStep,
    };
    if (!permanent) {
      // The selected candidate's own evaluation: the same variant and termination interval as on screen.
      const cs = candidateScenario(s, active.id, active.strategy);
      const cev = evaluate(cs.scenario);
      const r = cev.strategies.find((y) => y.def.id === cs.strategy)!;
      const o = overviewOf(r);
      annualCalendar = {
        cover: r.variant?.name ?? active.name, group: cs.strategy,
        fieldFree: cev.effective.cal.release, sowing: r.inputs.sowing ?? null, soilReady: cev.window.soilReady, nextCrop: cev.effective.cal.nextCrop,
        state: r.calendar.state, stateLabel: STATE_LABEL[r.calendar.state], message: r.calendar.message,
        availableDaysUntilTermination: r.calendar.availableDays, terminationDeadline: r.calendar.terminationDeadline, terminationDays: cs.termination.days,
        marginDays: r.calendar.margin, binding: r.calendar.binding.map((b) => b.label),
        lastIrrigationOpportunity: { date: o.lastTurnDate, status: o.lastTurnStatus }, daysUntilLastIrrigationOpportunity: o.daysToLastTurn,
        irrigationOpportunitiesAfterSowing: { value: o.turns, status: o.turnsStatus, unit: "turns" }, turnsThatFit: describeTurns(r),
        whatWouldChange: r.changes.slice(0, 5).map((c) => c.text),
      };
    }
  }

  const cw = coldWindowFor(s, ev, period, active);
  const cold = coldNightQuestion(x.series, cw, cfg, station, permanent ? "Over the cover window you entered" : active ? `From the ${active.name.toLowerCase()} sowing to the next crop` : "No candidate selected");

  const all = [...sug.main, ...sug.others, ...sug.experimental];
  const suggestion: PlanExport["suggestion"] = {
    headline: sug.headline, why: sug.why, decidingFactor: sug.decidingFactor, confirmFirst: sug.confirmFirst, baseline: sug.baseline,
    candidates: all.map((c) => ({ id: c.id, name: c.name, status: c.status, statusLabel: STATUS_LABEL[c.status], goalMatch: c.purpose.match, calendar: c.calendar.label })),
    rules: sug.rules,
  };

  const ref = permanent ? null : buildExport(s, ev, x.series ?? { startDate: "1981-01-01", tmin: [] }, cfg, null, station);
  const assumptions: Assumption[] = permanent
    ? [
        { item: "Main crop (stays in place)", value: crop.name, status: "assumed", source: "Your input" },
        { item: "Cover window", value: `${fmtDate(period.start, true)} to ${fmtDate(s.orchard.window[1], true)}`, status: "assumed", source: "Your input" },
        ...(s.system === "orchard"
          ? [
              { item: "Cover area", value: s.orchard.area, status: "assumed" as const, source: "Your input" },
              { item: "Irrigation reaches the cover area", value: s.orchard.waterReach, status: "assumed" as const, source: "Your input; unknown is not read as yes" },
              { item: "Tree age", value: s.orchard.age, status: "assumed" as const, source: "Your input" },
            ]
          : [
              { item: "Free area while the plants are kept", value: s.beds.area, status: "assumed" as const, source: "Your input" },
              { item: "Drip on the beds", value: s.beds.drip, status: "assumed" as const, source: "Your input; drip on the beds does not water the paths" },
            ]),
        { item: "End of the cover", value: "Mown or ended at the end of the window", status: "assumed", source: "Your setting" },
        { item: "Frost threshold T", value: `${fmtT(cfg.t)} °C`, status: "assumed", source: "Meteorological reference, not a damage limit" },
      ]
    : [
        ...ref!.assumptions.filter((a) => !/^[BC] (termination interval|target cover duration)/.test(a.item)),
        ...(active ? [{ item: `Termination interval (${active.name})`, value: `${active.termination.days} d`, status: "assumed" as const, source: `${active.termination.provenance}: ${active.termination.source}` }] : []),
      ];

  return {
    app: "Umbral",
    schema: PLAN_EXPORT_SCHEMA,
    label: "Illustrative scenario: Alto Valle composite plot",
    generated: x.generated ?? new Date().toISOString(),
    inputState: x.incomplete ? "incomplete: the result is the last valid calculation" : "complete",
    system: { id: s.system, label: SYSTEM_LABEL(s), mainCropStays: permanent },
    field: x.fieldLabel,
    plan: { goal: { id: s.goal, label: goalLabel(s.goal, permanent) }, crops, managementPeriod: { start: period.start, end: period.end, days: period.days, basis: period.basis } },
    selectedCandidate,
    annualCalendar,
    coldNightQuestion: cold,
    suggestion,
    dateComparison: !permanent && x.comparison ? { applicable: true, ...x.comparison } : { applicable: false, reason: permanent ? "The main crop stays in place: there is no field-free date to move." : "No candidate selected." },
    referenceComparators: ref
      ? { note: "Reference only, not the selected plan: the three annual strategies of the base scenario, each with its group's current cover (bare or residue, a grass, a legume). Use them to compare; the selected candidate's result is in selectedCandidate and annualCalendar.", strategies: ref.results }
      : null,
    assumptions,
    hls: x.hls ? hlsExport(x.hls) : null,
    weather: x.weather ?? null,
    inputs: { scenario: s, notApplicable: permanent ? ["release", "nextCropId", "nextCrop", "preparationDays", "covers", "water", "whatIf"] : ["orchard", "beds"] },
    observations: x.notes ?? [],
    sources: Object.values(SOURCES).map((y) => ({ id: y.id, title: y.title, url: y.url, status: y.status })),
  };
}

/** Plain-English labels for the Markdown only; the JSON keeps its keys. */
const MD_LABEL: Record<string, string> = {
  cropJustHarvested: "Crop just harvested", nextCrop: "Next main crop", nextCropDate: "Next crop planting", fieldFree: "Field free", soilReady: "Soil ready for the next crop",
  standingCrop: "Main crop (stays in place)", coverArea: "Where the cover would grow", waterReachesCoverArea: "Irrigation water reaching that area", treeAge: "Tree age", mowing: "Regular mowing",
  plants: "Plants after harvest", dripOnBeds: "Drip on the beds", waterReachingCoverArea: "Water for a cover there", mulch: "Mulch on the beds",
};
const MD_VALUE: Record<string, string> = { unknown: "not sure", yes: "yes", no: "no", "tree-row": "tree row", interrow: "interrow", retained: "kept", removed: "removed", paths: "paths", none: "none" };

/** Markdown with the same content and order of importance as the JSON. */
export function planMarkdown(x: PlanExport, logoDataUri?: string): string {
  const L: string[] = [];
  const v = (u: unknown) => (u === null || u === undefined || u === "" ? "—" : String(u));
  if (logoDataUri) L.push(`![Umbral logo, AI-generated](${logoDataUri})`, "", "*Logo: AI-generated image (see docs/AI_DISCLOSURE.md).*", "");
  L.push(`# Umbral plan: ${x.system.label}`, "", `${x.label}. Generated ${x.generated.slice(0, 10)} from the plan as it was on screen, including any unsaved changes. Umbral checks dates, water, past weather and published evidence; it does not predict how a crop will grow and computes no money, yield or nitrogen amount.`, "");
  if (x.inputState !== "complete") L.push(`**Input state: ${x.inputState}.**`, "");
  const p = x.plan;
  L.push("## Plan", "", `- Field: ${x.field}`, `- System: ${x.system.label}${x.system.mainCropStays ? " (the main crop stays in place)" : ""}`);
  for (const [k, val] of Object.entries(p.crops)) L.push(`- ${MD_LABEL[k] ?? k}: ${/^\d{4}-\d\d-\d\d$/.test(val) ? fmtDate(val, true) : MD_VALUE[val] ?? val}`);
  L.push(`- Goal: ${p.goal.label}`, `- Management period: ${fmtDate(p.managementPeriod.start, true)} to ${fmtDate(p.managementPeriod.end, true)} (${p.managementPeriod.days} days). ${p.managementPeriod.basis}`, "");

  const c = x.selectedCandidate as Record<string, any> | null;
  L.push("## Selected candidate", "");
  if (!c) L.push("No candidate selected.", "");
  else {
    L.push(`**${c.name}**: ${c.statusLabel}. Evidence: ${c.evidenceLevel}.${c.goalFit ? ` ${c.goalFit}` : ""}`, "");
    L.push(`- Benefit: ${c.benefit}`, `- Trade-off: ${c.tradeoff}`);
    L.push(`- Calendar: ${c.calendar.label}; sowing ${v(c.calendar.sowing && fmtDate(c.calendar.sowing, true))}; end by ${v(c.calendar.endBy && fmtDate(c.calendar.endBy, true))}; ${v(c.calendar.availableDays)} days${c.calendar.canalTurnsAfterSowing !== null ? `; canal turns after sowing: ${c.calendar.canalTurnsAfterSowing}` : ""}.`);
    L.push(`- Ending: ${c.termination.days ? `${c.termination.days} days before the soil must be ready (${c.termination.provenance}: ${c.termination.source})` : c.termination.source}.`);
    L.push(`- Reported soil conditions: ${c.reportedSoilConditions.length ? c.reportedSoilConditions.join(" ") : "none reported"}`);
    const review = c.beforeSowing as { kind: string; text: string }[];
    if (review.length) {
      L.push(`- Next check: ${review[0].text}`);
      if (review.length > 1) {
        L.push(`- Also before sowing (${review.length - 1}):`);
        for (const k of review.slice(1)) L.push(`  - ${k.text}`);
      }
    } else L.push(`- Next step: ${c.nextStep}`);
    for (const k of c.checks.filter((y: { blocking: boolean }) => !y.blocking)) L.push(`- Note: ${k.text}`);
    L.push("", "Why, dimension by dimension:", "");
    for (const d of c.dimensions) L.push(`- ${d.label}: ${d.text} [${d.provenance.kind}; ${d.provenance.source}; ${d.provenance.scope}${d.provenance.dates ? `; ${d.provenance.dates}` : ""}. Role: ${d.provenance.role}${d.provenance.missing ? ` Missing: ${d.provenance.missing}` : ""}]`);
    if (c.nutrientProcess) {
      L.push("", `Nutrient process (${c.nutrient}; process, not a quantity):`, "");
      for (const n of c.nutrientProcess) L.push(`- ${n.step}: ${n.status}. ${n.basis}`);
    }
    L.push("");
  }
  if (x.annualCalendar) {
    const a = x.annualCalendar as Record<string, any>;
    L.push("## Calendar of the selected candidate", "", `${a.cover}: field free ${fmtDate(a.fieldFree, true)}, sowing ${v(a.sowing && fmtDate(a.sowing, true))}, end by ${v(a.terminationDeadline && fmtDate(a.terminationDeadline, true))} (${a.terminationDays} days before soil ready ${fmtDate(a.soilReady, true)}), next crop ${fmtDate(a.nextCrop, true)}.`, "");
    L.push(`- Calendar check: **${a.stateLabel}**. ${a.message}`, `- Days until the cover must end: ${v(a.availableDaysUntilTermination)}`, `- Last irrigation opportunity: ${v(a.lastIrrigationOpportunity.date && fmtDate(a.lastIrrigationOpportunity.date, true))} (${v(a.lastIrrigationOpportunity.status)}); canal turns after sowing: ${a.irrigationOpportunitiesAfterSowing.value}`, `- Binding constraint: ${a.binding.join("; ") || "—"}`, `- What would change this: ${a.whatWouldChange.join("; ") || "no single shift within 120 d"}`, "");
  }
  const q = x.coldNightQuestion as Record<string, any> | null;
  L.push("## Past cold nights (NASA POWER)", "");
  if (!q) L.push("Not read for this plan (no window, or POWER not loaded).", "");
  else {
    L.push(`${q.basis}: ${fmtDate(q.from, true)} to ${fmtDate(q.to, true)}, threshold ≤ ${fmtT(q.thresholdC)} °C, ${q.daysNeeded} days needed.`, "", q.sentence, "", q.regionalCheck, "", `${q.note} Source: ${q.source}.`, "");
    L.push("| Year | First night ≤ T | Days | Tmin (°C) | At least D days? |", "|---|---|---|---|---|");
    for (const r of q.perYear) L.push(`| ${r.year} | ${r.firstEvent} | ${v(r.days)} | ${v(r.tminC)} | ${r.condition} |`);
    L.push("");
  }
  const sg = x.suggestion;
  L.push("## All candidates evaluated", "", `**${sg.headline}.** ${sg.why}${sg.decidingFactor ? ` What decides between them: ${sg.decidingFactor}` : ""}`, "", `Confirm first: ${sg.confirmFirst}`, "", `Baseline (${sg.baseline.calendar}): ${sg.baseline.text}`, "");
  L.push("| Candidate | Status | Goal match | Calendar |", "|---|---|---|---|");
  for (const k of sg.candidates) L.push(`| ${k.name} | ${k.statusLabel} | ${k.goalMatch} | ${k.calendar} |`);
  L.push("", "Rules: " + sg.rules.join(" "), "");
  if (x.dateComparison.applicable) {
    L.push("## Another free date compared (selected candidate)", "", "| | Plan | Other date |", "|---|---|---|");
    for (const k of Object.keys(x.dateComparison.plan)) L.push(`| ${k} | ${v(x.dateComparison.plan[k])} | ${v(x.dateComparison.other[k])} |`);
    L.push("");
  }
  if (x.hls) {
    const h = x.hls;
    L.push("## Satellite observations (NASA HLS)", "", `${h.label}. Plan period ${fmtDate(h.planInterval[0], true)} to ${fmtDate(h.planInterval[1], true)}; matching historical period ${fmtDate(h.historicalInterval[0], true)} to ${fmtDate(h.historicalInterval[1], true)}. ${h.rule} Scope: ${h.scope}. ${h.observations.length} observation(s).`, "");
    if (h.selectedImage) {
      const im = h.selectedImage;
      L.push(`Image shown: ${im.acquisitionDate} (${im.sensor}, ${im.quality}); ${im.scope}: NDVI median ${v(im.ndviMedian)}, ${im.cleanPixels} of ${im.totalPixels} pixels clear. ${im.note}`, "");
    }
    if (h.observations.length) {
      L.push("| Acquisition date | Sensor | Quality | Clear pixels | NDVI median |", "|---|---|---|---|---|");
      for (const o of h.observations) L.push(`| ${o.acquisitionDate} | ${o.sensor} | ${o.quality} | ${o.cleanPixels} of ${o.totalPixels} | ${v(o.ndviMedian)} |`);
      L.push("");
    }
    if (h.clusterForComparison?.length) {
      L.push("Cluster of four example parcels, same dates, for comparison only (not the selected scope):", "", "| Acquisition date | Quality | Clear pixels | NDVI median |", "|---|---|---|---|");
      for (const o of h.clusterForComparison) L.push(`| ${o.acquisitionDate} | ${o.quality} | ${o.cleanPixels} of ${o.totalPixels} | ${v(o.ndviMedian)} |`);
      L.push("");
    }
  }
  if (x.weather) {
    const w = x.weather as Record<string, any>;
    L.push("## Weather consultation", "", "Weather values are one area value for all four parcels. Forecast (Open-Meteo) and NASA history (POWER) are separate sources.", "");
    if (w.forecast) L.push(`- Forecast: ${w.forecast.provider}; model ${w.forecast.model}; retrieved ${w.forecast.retrievedAt} (${w.forecast.status}).`);
    if (w.history) L.push(`- History: ${w.history.source}; requested ${w.history.requested.join(" to ")}.`);
    L.push("");
  }
  if (x.observations.length) {
    L.push("## Field notes", "");
    for (const o of x.observations) L.push(`- ${o.date}: ${o.text}`);
    L.push("");
  }
  L.push("## Inputs and assumptions", "", "| Item | Value | Status | Source |", "|---|---|---|---|");
  for (const a of x.assumptions) L.push(`| ${a.item} | ${a.value} | ${a.status} | ${a.source} |`);
  L.push("");
  if (x.referenceComparators) {
    L.push("## Reference comparators (not the selected plan)", "", x.referenceComparators.note, "", "| Strategy | Cover | Calendar | Days until it must end |", "|---|---|---|---|");
    for (const r of x.referenceComparators.strategies) L.push(`| ${r.id}. ${r.name} | ${v(r.variant)} | ${r.stateLabel} | ${v(r.availableDaysUntilTermination)} |`);
    L.push("");
  }
  L.push("## Sources", "");
  for (const y of x.sources) L.push(`- ${y.title}${y.url ? ` <${y.url}>` : ""}. ${y.status}`);
  return L.join("\n");
}
