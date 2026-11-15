/**
 * Plain-English, system-aware statements about a plan that several views and
 * the exports share: the water fact, the review list before sowing, plan names
 * and summaries, and whether the dates are still the example dates.
 */
import { STRATEGIES, cropById } from "./catalog";
import { demoScenario, type Scenario } from "./scenario";
import type { Candidate, Check, Suggestion } from "./recommend";

const YNU: Record<string, string> = { yes: "Yes", no: "No", unknown: "Not sure" };

/** True when the main crop stays in place (orchard, or beds whose plants are kept or not yet known). */
export function standing(s: Scenario): boolean {
  return s.system === "orchard" || (s.system === "beds" && s.beds.plants !== "removed");
}

/** Beds whose plants may or may not stay: the calculation is conditional on them staying. */
export function plantsUnconfirmed(s: Scenario): boolean {
  return s.system === "beds" && s.beds.plants === "unknown";
}

/** "The almond stays." / "If the strawberry plants stay (not confirmed), …" */
export function standingPhrase(s: Scenario): { stays: string; ifStays: string } {
  const crop = cropById(s.previousCropId).name.toLowerCase();
  if (plantsUnconfirmed(s)) return { stays: `If the ${crop} plants stay (not confirmed)`, ifStays: `If the ${crop} plants stay, ` };
  return { stays: s.system === "beds" ? `The ${crop} plants stay` : `The ${crop} stays`, ifStays: "" };
}

/**
 * The water statement for the cover area, from the input that actually answers it.
 * Beds: drip on the beds is a different question from water reaching the paths; that
 * second answer is never derived from the drip input.
 */
export function waterFact(s: Scenario): { headline: string; detail: string } {
  if (s.system === "orchard") {
    const area = s.orchard.area === "interrow" ? "interrow" : "tree row";
    return {
      headline: `Irrigation water reaching the ${area}: ${YNU[s.orchard.waterReach]}.`,
      detail: s.orchard.waterReach === "unknown" ? "Not confirmed. Drip on the tree row usually does not water the interrow." : "Your answer; no water amount is measured here.",
    };
  }
  if (s.system === "beds" && s.beds.plants !== "removed") {
    const drip = `Drip on the beds: ${YNU[s.beds.drip]}.`;
    if (s.beds.area === "paths") return { headline: drip, detail: "Water reaching the paths: not confirmed. Drip on the beds does not by itself confirm water for a cover in the paths." };
    if (s.beds.area === "none") return { headline: drip, detail: "No free area is stated for a cover while the plants are kept, so water for a cover is not assessed." };
    return { headline: drip, detail: "Free area for a cover: not stated. Water reaching it: not confirmed; drip on the beds does not by itself confirm it." };
  }
  return { headline: "", detail: "" };
}

// The same priority the engine uses for its next check.
const KIND_ORDER: Check["kind"][] = ["access", "system", "soil", "water", "calendar", "climate", "species"];

/**
 * Everything to settle before sowing the active candidate: its blocking checks plus the
 * shared ones, in a stable order, without duplicates (same kind and same text). The first
 * is the next check; the rest are shown at once below it. With nothing blocking, the next
 * step is the candidate's own next step.
 */
export function beforeSowing(active: Candidate | null, sug: Pick<Suggestion, "sharedChecks" | "confirmFirst">): { next: string; also: Check[]; all: Check[] } {
  if (!active) return { next: sug.confirmFirst, also: [], all: [] };
  const seen = new Set<string>();
  const all: Check[] = [];
  for (const k of [...sug.sharedChecks, ...active.checks]) {
    if (!k.blocking) continue;
    const key = `${k.kind}\u0000${k.text.trim()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    all.push(k);
  }
  all.sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  return { next: all[0]?.text ?? active.nextStep, also: all.slice(1), all };
}

/** Name of a candidate id from the catalogue, for saved-plan lists. */
export function candidateName(id: string | null | undefined): string | null {
  if (!id) return null;
  for (const d of STRATEGIES) for (const v of d.variants) if (v.id === id) return v.name;
  return null;
}

function evidenceLabel(field: number | "cluster" | null): string {
  return field === null ? "no example chosen" : field === "cluster" ? "evidence: all four examples" : `evidence: example P${field + 1}`;
}

/** What the plan is about, in a few words, by system. */
export function scenarioLabel(s: Scenario): string {
  const crop = cropById(s.previousCropId).name;
  if (s.system === "orchard") return `${crop} ${s.orchard.area === "interrow" ? "interrow" : "tree row"}`;
  if (s.system === "beds" && s.beds.plants !== "removed") return `${crop} beds${s.beds.area === "paths" ? ", paths" : ""}${s.beds.plants === "unknown" ? " (plants: not sure)" : ""}`;
  return `${crop} → ${cropById(s.nextCropId).name}`;
}

export function planYear(s: Scenario): string {
  return (standing(s) ? s.orchard.window[0] : s.release).slice(0, 4);
}

/** Default name for a new plan: scenario, year and where the satellite evidence comes from. */
export function defaultPlanName(s: Scenario, field: number | "cluster" | null): string {
  return `${scenarioLabel(s)} · ${planYear(s)} · ${evidenceLabel(field)}`;
}

/** True while the dates are still the prefilled example dates (any edit makes them yours). */
export function isExampleDates(s: Scenario): boolean {
  const d = demoScenario();
  if (standing(s)) return s.orchard.window[0] === d.orchard.window[0] && s.orchard.window[1] === d.orchard.window[1];
  return s.release === d.release && s.nextCrop === d.nextCrop && s.water.lastTurn === d.water.lastTurn && s.water.closure === d.water.closure && s.water.frequencyDays === d.water.frequencyDays;
}
