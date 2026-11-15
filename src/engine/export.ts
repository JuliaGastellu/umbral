import { SOURCES, STRATEGIES, cropById } from "./catalog";
import { STATE_LABEL } from "./calendar";
import type { DailySeries } from "./climate";
import { fmtT } from "./climate";
import { fmtDate, type ISODate } from "./dates";
import type { ExportedObservation, HlsSelection } from "./hlsSelect";
import { climateReading, stationLine, type ClimateSettings, type StationSummary } from "./exposure";
import { describeTurns, hasWhatIf, overviewOf, type Evaluation, type Scenario } from "./scenario";

export interface SelectedImage extends ExportedObservation {
  followPlanDate: boolean;
  planDate: ISODate | null;
  offsetDays: number | null;
  note: string;
}

export interface HlsExport {
  label: string;
  rule: string;
  planInterval: [ISODate, ISODate];
  historicalInterval: [ISODate, ISODate];
  seasonYear: number;
  scope: string;
  observations: ExportedObservation[];
  clusterForComparison: ExportedObservation[] | null;
  selectedImage: SelectedImage | null;
}

export interface ExportDoc {
  app: string;
  label: string;
  generated: string;
  scenario: Scenario;
  effectiveDates: { release: ISODate; soilReady: ISODate; nextCrop: ISODate; windowDays: number; crossesNewYear: boolean };
  applies: boolean;
  notApplicableText?: string;
  assumptions: { item: string; value: string; status: "observed" | "calculated" | "assumed"; source: string }[];
  results: {
    id: string;
    name: string;
    variant?: string;
    state: string;
    stateLabel: string;
    message: string;
    marginDays: number | null;
    planMarginDays: number | null;
    availableDaysUntilTermination: number | null;
    daysUntilLastIrrigationOpportunity: number | null;
    lastIrrigationOpportunity: { date: ISODate | null; status: string | null };
    irrigationOpportunitiesAfterSowing: { value: string; status: string | null; unit: "turns" };
    turnShortfall: number | null;
    binding: string[];
    covers: string[];
    notCovered: string[];
    availableDays: number | null;
    terminationDeadline: ISODate | null;
    turnsThatFit: string;
    reportedConditions: string[];
    whatWouldChange: string[];
    nextStep: string;
  }[];
  climate: {
    source: string;
    start: ISODate;
    searchEnd: ISODate;
    t: number;
    rule: string;
    question: string;
    d: number;
    error: string | null;
    sentence: string;
    counts: { total: number; met: number; notMet: number; notEvaluable: number; notEvaluableShortWindow: number; notEvaluableData: number };
    perYear: { year: number; firstEvent: string; days?: number; date?: ISODate; tminC?: number; condition: string }[];
    regionalCheck: { line: string; detail: StationSummary | null };
  };
  hls: HlsExport | null;
  comparison?: { plan: Record<string, unknown>; other: Record<string, unknown> };
  weather?: Record<string, unknown>;
  parcelScope?: string;
  suggestion?: unknown;
  activeCandidate?: Record<string, unknown> | null;
  inputState?: string;
  coldNightQuestion?: Record<string, unknown> | null;
  observations?: { date: ISODate; text: string }[];
  sources: { id: string; title: string; url?: string; status: string }[];
}

export type HlsInput = { label: string; selection: HlsSelection; selectedImage?: SelectedImage | null };

/** The HLS block shared by every export: real acquisition dates, the selected scope, and the cluster kept apart. */
export function hlsExport(hls: HlsInput): HlsExport {
  return {
    label: hls.label,
    rule: hls.selection.interval.rule,
    planInterval: hls.selection.interval.plan,
    historicalInterval: hls.selection.interval.historical,
    seasonYear: hls.selection.interval.seasonYear,
    scope: hls.selection.scope,
    observations: hls.selection.observations,
    clusterForComparison: hls.selection.clusterForComparison,
    selectedImage: hls.selectedImage ?? null,
  };
}

/** Annual reference strategies (A/B/C) of the base scenario. Used as labelled comparators by the plan export, and by engine tests. */
export function buildExport(s: Scenario, ev: Evaluation, series: DailySeries, cfg: ClimateSettings, hls: HlsInput | null, station: StationSummary | null = null): ExportDoc {
  const cr = climateReading(ev, series, cfg);
  const w = ev.window;
  const assumptions: ExportDoc["assumptions"] = [
    { item: "Release date", value: fmtDate(ev.effective.cal.release, true), status: "assumed", source: "Scenario input" },
    { item: "Next crop", value: `${cropById(s.nextCropId).name}, ${fmtDate(ev.effective.cal.nextCrop, true)}`, status: "assumed", source: "Scenario assumption; mean last frost 6 Oct (E19) is context, not a guarantee" },
    { item: "Preparation before the next crop", value: `${s.preparationDays} d`, status: "assumed", source: "Scenario assumption without a source" },
    { item: "Canal closure (planning season)", value: fmtDate(s.water.closure, true), status: "assumed", source: "Scenario input placed from the 2024 record; not a confirmed date for this season" },
    { item: "Canal closure record", value: "29 Apr 2024", status: "observed", source: "DPA, first cut at Dique Ballester in the 2024 season (E15)" },
    { item: "Last irrigation turn", value: s.water.lastTurn ? fmtDate(s.water.lastTurn, true) : "unknown", status: "assumed", source: "Illustrative scenario input" },
    { item: "Water after canal closure", value: s.water.waterAfterClosure, status: "assumed", source: "Illustrative scenario input; unknown is not read as no" },
    { item: "Turn frequency", value: s.water.frequencyDays ? `${s.water.frequencyDays} d` : "unknown", status: "assumed", source: "Grower input" },
    { item: "Turns required after sowing", value: `${s.water.minTurnsAfterSowing}`, status: "assumed", source: "Scenario assumption without a local source" },
  ];
  for (const id of ["B", "C"] as const) {
    const def = STRATEGIES.find((d) => d.id === id)!;
    const v = def.variants.find((x) => x.id === s.covers[id].variantId) ?? def.variants[0];
    assumptions.push({ item: `${id} termination interval (${v.name})`, value: `${s.covers[id].terminationDays} d`, status: "assumed", source: v.terminationSource });
    assumptions.push({ item: `${id} target cover duration`, value: s.covers[id].targetDurationDays === null ? "not set" : `${s.covers[id].targetDurationDays} d`, status: "assumed", source: "Grower input" });
  }
  assumptions.push({ item: "Frost threshold T", value: `${fmtT(cfg.t)} °C`, status: "assumed", source: "Meteorological reference, not a damage limit" });
  return {
    app: "Umbral",
    label: "Illustrative scenario: Alto Valle composite plot",
    generated: new Date().toISOString(),
    scenario: s,
    effectiveDates: { release: ev.effective.cal.release, soilReady: w.soilReady, nextCrop: ev.effective.cal.nextCrop, windowDays: w.days, crossesNewYear: w.crossesNewYear },
    applies: ev.applies,
    notApplicableText: ev.notApplicableText,
    assumptions,
    results: ev.strategies.map((r) => ({
      id: r.def.id,
      name: r.def.name,
      variant: r.variant?.name,
      state: r.calendar.state,
      stateLabel: STATE_LABEL[r.calendar.state],
      message: r.calendar.message,
      marginDays: r.calendar.margin,
      planMarginDays: hasWhatIf(s.whatIf) ? r.plan.margin : r.calendar.margin,
      ...(() => {
        const o = overviewOf(r);
        const deficits = r.calendar.binding.map((b) => b.turnDeficit).filter((v): v is number => v !== undefined && v > 0);
        return {
          availableDaysUntilTermination: o.availableDays,
          daysUntilLastIrrigationOpportunity: o.daysToLastTurn,
          lastIrrigationOpportunity: { date: o.lastTurnDate, status: o.lastTurnStatus },
          irrigationOpportunitiesAfterSowing: { value: o.turns, status: o.turnsStatus, unit: "turns" as const },
          turnShortfall: deficits.length ? Math.max(...deficits) : null,
        };
      })(),
      binding: r.calendar.binding.map((b) => b.label),
      covers: r.calendar.covers,
      notCovered: r.calendar.notCovered,
      availableDays: r.calendar.availableDays,
      terminationDeadline: r.calendar.terminationDeadline,
      turnsThatFit: describeTurns(r),
      reportedConditions: r.conditions.map((c) => c.text),
      whatWouldChange: r.changes.slice(0, 5).map((c) => c.text),
      nextStep: r.nextStep,
    })),
    climate: {
      source: "NASA POWER daily T2M_MIN, General Roca cell: regional reanalysis (MERRA-2 / GEOS-IT, about 55 km), not a plot measurement",
      start: cr.start,
      searchEnd: cr.end,
      t: cr.t,
      rule: "An event is a day with Tmin at or below T (Tmin ≤ T).",
      question: `Were there at least ${cr.d} days from the start to the first day with Tmin ≤ T? met: yes (an event on day ${cr.d} or later, or at least ${cr.d} days observed with no event); not met: an event before day ${cr.d}; not evaluable: fewer than ${cr.d} days observed and no event.`,
      d: cr.d,
      error: cr.error,
      sentence: cr.sentence,
      counts: { total: cr.summary.total, met: cr.summary.met, notMet: cr.summary.notMet, notEvaluable: cr.summary.notEvaluable, notEvaluableShortWindow: cr.summary.notEvaluableShortWindow, notEvaluableData: cr.summary.notEvaluableData },
      perYear: cr.rows.map((r, i) =>
        r.outcome === "event"
          ? { year: r.year, firstEvent: "event", days: r.days, date: r.date, tminC: r.tmin, condition: cr.conditions[i] }
          : { year: r.year, firstEvent: r.outcome === "none" ? "no event before the search end" : "insufficient data", condition: cr.conditions[i] },
      ),
      regionalCheck: { line: stationLine(station, cr.t), detail: station },
    },
    hls: hls ? hlsExport(hls) : null,
    sources: Object.values(SOURCES).map((x) => ({ id: x.id, title: x.title, url: x.url, status: x.status })),
  };
}

export function exportMarkdown(x: ExportDoc, logoDataUri?: string): string {
  const L: string[] = [];
  if (logoDataUri) L.push(`![Umbral logo, AI-generated](${logoDataUri})`, "", "*Logo: AI-generated image (see docs/AI_DISCLOSURE.md).*", "");
  L.push(`# Umbral: ${x.label}`, "", `Generated ${x.generated.slice(0, 10)}. Umbral compares calendars and historical climate exposure. It does not predict agronomic success.`, "");
  if (!x.applies) L.push(`**${x.notApplicableText}**`, "");
  const e = x.effectiveDates;
  L.push("## Window", "", `Release ${fmtDate(e.release, true)} → soil ready ${fmtDate(e.soilReady, true)} (${e.windowDays} d${e.crossesNewYear ? ", crosses the new year" : ""}). Next crop ${fmtDate(e.nextCrop, true)}.`, "");
  L.push("## Strategies", "");
  for (const r of x.results) {
    L.push(`### ${r.id}. ${r.name}${r.variant ? ` (${r.variant})` : ""}`, "");
    L.push(`- Calendar compatibility: **${r.stateLabel}**. ${r.message}`);
    L.push(`- Days available until the termination deadline: ${r.availableDaysUntilTermination ?? "—"}`);
    L.push(`- Days until the last irrigation opportunity: ${r.daysUntilLastIrrigationOpportunity ?? "—"} (${r.lastIrrigationOpportunity.status ?? "—"}${r.lastIrrigationOpportunity.date ? `, ${fmtDate(r.lastIrrigationOpportunity.date, true)}` : ""})`);
    L.push(`- Irrigation opportunities after sowing (turns): ${r.irrigationOpportunitiesAfterSowing.value}${r.turnShortfall ? `; ${r.turnShortfall} turn(s) short` : ""}`);
    L.push(`- Smallest margin among known time constraints: ${r.marginDays === null ? "—" : `${r.marginDays} d`}${r.planMarginDays !== r.marginDays ? ` (plan: ${r.planMarginDays ?? "—"} d)` : ""}`);
    L.push(`- Binding constraint: ${r.binding.join("; ") || "—"}`);
    L.push(`- "Fits" covers: ${r.covers.join("; ")}. Not covered: ${r.notCovered.join("; ") || "—"}.`);
    L.push(`- Reported plot conditions: ${r.reportedConditions.join(" ") || "none reported"}`);
    L.push(`- What would change this: ${r.whatWouldChange.join("; ") || "no single shift within 120 d"}`);
    L.push(`- Next step: ${r.nextStep}`, "");
  }
  L.push("## Historical climate exposure", "", x.climate.sentence, "", x.climate.regionalCheck.line, "", `Source: ${x.climate.source}. ${x.climate.rule} ${x.climate.question} Search from ${fmtDate(x.climate.start)} to ${fmtDate(x.climate.searchEnd)}. A historical frequency of a weather condition, not a probability of success or a forecast.`, "");
  L.push("| Year | First event | Days to first event | Tmin (°C) | At least D days? |", "|---|---|---|---|---|");
  for (const r of x.climate.perYear) L.push(`| ${r.year} | ${r.firstEvent} | ${r.days ?? "—"} | ${r.tminC ?? "—"} | ${r.condition} |`);
  L.push("");
  if (x.comparison) {
    L.push("## Two dates compared", "", "| | Plan | Other date |", "|---|---|---|");
    for (const k of Object.keys(x.comparison.plan)) L.push(`| ${k} | ${String(x.comparison.plan[k] ?? "—")} | ${String(x.comparison.other[k] ?? "—")} |`);
    L.push("");
  }
  if (x.weather) {
    const w = x.weather as Record<string, any>;
    L.push("## Weather consultation", "", `Scope: ${x.parcelScope ?? "example parcels"}; weather values are one area value for all four parcels.`, "");
    if (w.forecast) L.push(`- Forecast: ${w.forecast.provider}; model ${w.forecast.model}; grid point ${w.forecast.grid}; retrieved ${w.forecast.retrievedAt} (${w.forecast.status}); dates available ${w.forecast.available ? w.forecast.available.join(" to ") : "none"}. Weather-model values, not NASA data and not official warnings.`);
    else L.push("- Forecast: not available at export time.");
    L.push(`- History: ${w.history.source}; requested ${w.history.requested.join(" to ")}; bundled record ${w.history.bundled.join(" to ")}${w.history.live ? `; live NASA POWER query last valid date ${w.history.live.lastValid ?? "none"}` : ""}.`);
    L.push(`- Coverage of the requested period: ${(w.segments ?? []).map((s: any) => `${s.from}–${s.to} ${s.kind}`).join("; ") || "none"}.`, "");
  }
  if (x.hls?.selectedImage) {
    const im = x.hls.selectedImage;
    L.push("## Historical image shown", "", `Image taken on ${im.acquisitionDate} (${im.sensor}, ${im.quality}); ${im.scope}: NDVI median ${im.ndviMedian ?? "—"}, ${im.cleanPixels} of ${im.totalPixels} pixels clear. ${im.note}${im.followPlanDate ? ` Chosen as the nearest clear ${x.hls.seasonYear} image to the plan date ${im.planDate} (offset ${im.offsetDays ?? "none found"} days).` : ""}`, "");
  }
  if (x.hls) {
    const h = x.hls;
    L.push(
      "## Satellite observations (HLS)",
      "",
      `${h.label}. Plan period ${fmtDate(h.planInterval[0], true)} to ${fmtDate(h.planInterval[1], true)}; matching historical period ${fmtDate(h.historicalInterval[0], true)} to ${fmtDate(h.historicalInterval[1], true)}. ${h.rule} Scope: ${h.scope}. ${h.observations.length} observation(s).`,
      "",
    );
    if (h.observations.length) {
      L.push("| Acquisition date | Sensor | Quality | Clear pixels | NDVI median |", "|---|---|---|---|---|");
      for (const o of h.observations) L.push(`| ${o.acquisitionDate} | ${o.sensor} | ${o.quality} | ${o.cleanPixels} of ${o.totalPixels} | ${o.ndviMedian ?? "—"} |`);
      L.push("");
    }
    if (h.clusterForComparison?.length) {
      L.push(`Cluster of four example parcels, same dates, for comparison only (not the selected scope):`, "", "| Acquisition date | Quality | Clear pixels | NDVI median |", "|---|---|---|---|");
      for (const o of h.clusterForComparison) L.push(`| ${o.acquisitionDate} | ${o.quality} | ${o.cleanPixels} of ${o.totalPixels} | ${o.ndviMedian ?? "—"} |`);
      L.push("");
    }
  }
  if (x.inputState && x.inputState !== "complete") L.push(`**Input state: ${x.inputState}.**`, "");
  if (x.activeCandidate) {
    const a = x.activeCandidate as Record<string, any>;
    L.push("## Candidate used for the calendar and comparison", "", `${a.name} (${a.status}); sowing ${a.sowing ?? "—"}, end by ${a.endBy ?? "—"}; termination ${a.terminationDays} days (${a.terminationProvenance}: ${a.terminationSource}).`, "");
    for (const d of a.dimensions ?? []) L.push(`- ${d.label}: ${d.text} [${d.provenance.kind}; ${d.provenance.source}; ${d.provenance.scope}${d.provenance.dates ? `; ${d.provenance.dates}` : ""}. Role: ${d.provenance.role}${d.provenance.missing ? ` Missing: ${d.provenance.missing}` : ""}]`);
    L.push("");
  }
  if (x.suggestion) {
    const sg = x.suggestion as import("./recommend").Suggestion;
    L.push("## Suggestion", "", `Goal: ${sg.goal}. **${sg.headline}.** ${sg.why}`, "");
    if (sg.decidingFactor) L.push(`What decides between them: ${sg.decidingFactor}`, "");
    for (const c of sg.main) {
      L.push(`### ${c.name} (${c.status})`, "");
      for (const r of c.purpose.reasons) L.push(`- ${r.text} (${r.sourceId ?? r.where}${r.sourceId ? `, ${r.where}` : ""})`);
      L.push(`- Dates and canal water: ${c.calendar.label}; ${c.calendar.availableDays ?? "—"} days from sowing; canal turns after sowing: ${c.calendar.turns}.`);
      if (c.climate) L.push(`- Past cold nights: ${c.climate}`);
      L.push(`- Productive use: ${c.productiveUse.kind}. ${c.productiveUse.text}`, `- Next step: ${c.nextStep}`, "");
    }
    L.push(`Confirm first: ${sg.confirmFirst}`, "", "Rules: " + sg.rules.join(" "), "");
  }
  if (x.observations?.length) {
    L.push("## Field notes", "");
    for (const o of x.observations) L.push(`- ${o.date}: ${o.text}`);
    L.push("");
  }
  L.push("## Inputs and assumptions", "", "| Item | Value | Status | Source |", "|---|---|---|---|");
  for (const a of x.assumptions) L.push(`| ${a.item} | ${a.value} | ${a.status} | ${a.source} |`);
  L.push("", "## Sources", "");
  for (const s of x.sources) L.push(`- ${s.title}${s.url ? ` <${s.url}>` : ""}. ${s.status}`);
  return L.join("\n");
}
