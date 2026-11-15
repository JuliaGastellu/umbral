/**
 * Experimental service species: researched candidates with no local experience
 * found. Statements come from the cited pages (SARE pages read 15 Nov 2026) or,
 * where a page could not be opened, from the 15 Nov research brief, labelled.
 *
 * Climate rules use only thresholds the source states (with its unit), applied
 * to NASA POWER daily minima for the candidate's own dates. Where the source
 * gives no threshold, the climate dimension says "no sourced threshold".
 */
import { exposureByYear, summarize, yearsInRange, type DailySeries } from "./climate";
import { seriesYears } from "./exposure";
import { diffDays, fmtDate, type ISODate } from "./dates";
import type { Goal } from "./scenario";

export type SpeciesId = "rye" | "oat" | "vetch" | "vetch-oat" | "pea" | "faba" | "radish" | "buckwheat" | "clover";
export type Match = "supports" | "partial" | "against" | "unassessed";

export interface Reason {
  text: string;
  sourceId: string | null;
  where: string;
}

export interface SpeciesInfo {
  id: SpeciesId;
  families: string[];
  habit: "annual" | "perennial";
  /** Management contexts where the source describes its use. */
  contexts: ("annual-gap" | "orchard-interrow" | "bed-paths")[];
  season: string;
  water: string;
  termination: string;
  residue: string;
  experimental: boolean;
  goals: Partial<Record<Exclude<Goal, "not-sure">, { match: Match; reasons: Reason[] }>>;
  /** What could rule it out. */
  limits: Reason[];
  /** Nutrient mechanism, kept separate from fixation. */
  nutrient: "fixes N from the air (legume)" | "takes up existing soil N" | "takes up existing nutrients; may recycle P, does not create it" | "fixes N (legume part of a mixture)";
}

const US = "US guidance";
const BRIEF = "research brief (page not re-opened)";

export const EXPERIMENTAL: Record<"pea" | "faba" | "radish" | "buckwheat" | "clover", SpeciesInfo> = {
  pea: {
    id: "pea", families: ["Fabaceae"], habit: "annual", contexts: ["annual-gap", "orchard-interrow"], experimental: true,
    season: "Cool season; winter hardiness depends on the variety.", water: "Prefers well-drained soils (SARE).", termination: "Ended before the next crop; no local interval found.", residue: "Succulent stems break down easily (SARE).",
    nutrient: "fixes N from the air (legume)",
    goals: {
      "next-crop-n": { match: "supports", reasons: [{ text: "A legume whose residue breaks down easily and is a quick source of available nitrogen.", sourceId: "SARE_PEA", where: US }] },
      "soil-cover": { match: "partial", reasons: [{ text: "Shallow roots make it susceptible to heaving; cover depends on winter survival.", sourceId: "SARE_PEA", where: US }] },
    },
    limits: [
      { text: "Disease risk rises if peas are grown on the same land in close rotation.", sourceId: "SARE_PEA", where: US },
      { text: "Inoculate if peas have not been grown in the field for several years.", sourceId: "SARE_PEA", where: US },
    ],
  },
  faba: {
    id: "faba", families: ["Fabaceae"], habit: "annual", contexts: ["annual-gap", "orchard-interrow"], experimental: true,
    season: "Cool season.", water: "Needs enough water and drainage; salinity tolerance not checked here.", termination: "Ended before the next crop; no local interval found.", residue: "Green manure or mixture component.",
    nutrient: "fixes N from the air (legume)",
    goals: { "next-crop-n": { match: "supports", reasons: [{ text: "A cool-season legume used as green manure or in mixtures.", sourceId: "SAREP_BELLBEAN", where: BRIEF }] } },
    limits: [{ text: "In citrus, bell bean / vetch / oat mixtures may not supply all the nitrogen the trees need and can predispose them to frost.", sourceId: "SAREP_BELLBEAN", where: BRIEF }],
  },
  radish: {
    id: "radish", families: ["Brassicaceae"], habit: "annual", contexts: ["annual-gap", "orchard-interrow"], experimental: true,
    season: "Late summer or early autumn sowing; winter-kills in hard cold (SARE).", water: "Not checked here.", termination: "Often winter-kills; residue releases N early in spring.", residue: "Retained residue releases nitrogen early (SARE).",
    nutrient: "takes up existing soil N",
    goals: {
      "next-crop-n": { match: "partial", reasons: [{ text: "Captures nitrogen already in the soil, from deep in the profile; it does not fix nitrogen from the air. Its residue releases N early in spring, so an early nitrogen-demanding crop should follow.", sourceId: "SARE_BRASSICA", where: US }] },
      "soil-cover": { match: "partial", reasons: [{ text: "Fast autumn growth; taproots can open channels that increase infiltration; not a cure for every compaction.", sourceId: "SARE_BRASSICA", where: US }] },
    },
    limits: [
      { text: "Do not grow in rotation with other brassica crops: shared diseases.", sourceId: "SARE_BRASSICA", where: US },
      { text: "Do not expect it to eliminate pest problems; biofumigation effects are inconsistent.", sourceId: "SARE_BRASSICA", where: US },
    ],
  },
  buckwheat: {
    id: "buckwheat", families: ["Polygonaceae"], habit: "annual", contexts: ["annual-gap", "orchard-interrow"], experimental: true,
    season: "Summer cover; not frost tolerant; 70 to 90 days to maturity (SARE).", water: "Not particularly drought tolerant (SARE).", termination: "End within 7 to 10 days after flowering begins, before seeds harden (SARE).", residue: "Retained.",
    nutrient: "takes up existing nutrients; may recycle P, does not create it",
    goals: {
      weeds: { match: "supports", reasons: [{ text: "Strong weed suppression, mainly by shading and competition.", sourceId: "SARE_BUCKWHEAT", where: US }] },
      "soil-cover": { match: "partial", reasons: [{ text: "Establishes quickly, but only in a frost-free window.", sourceId: "SARE_BUCKWHEAT", where: US }] },
    },
    limits: [{ text: "Can become a weed if it sets seed.", sourceId: "SARE_BUCKWHEAT", where: US }],
  },
  clover: {
    id: "clover", families: ["Fabaceae"], habit: "perennial", contexts: ["orchard-interrow", "bed-paths"], experimental: true,
    season: "Perennial: stays year after year; does not end by itself.", water: "Uses more water than annual winter covers (brief).", termination: "Mowing; it does not self-terminate.", residue: "Permanent cover.",
    nutrient: "fixes N from the air (legume)",
    goals: {
      "next-crop-n": { match: "partial", reasons: [{ text: "A persistent legume cover for an interrow; how much nitrogen reaches the trees is not known.", sourceId: "SAREP_CLOVER", where: BRIEF }] },
      "soil-cover": { match: "supports", reasons: [{ text: "Persistent legume cover, reported to tolerate salinity and waterlogging.", sourceId: "SAREP_CLOVER", where: BRIEF }] },
    },
    limits: [{ text: "Competes with the trees for water; needs mowing and a water supply in the interrow.", sourceId: "SAREP_CLOVER", where: BRIEF }],
  },
};

export interface ClimateTest {
  /** Plain statement with counts, or null when no sourced threshold exists. */
  text: string;
  /** Present only when the source gives a threshold and the dates can be evaluated. */
  met: number | null;
  total: number | null;
  /** "rules out" only when most past years fail a sourced condition; otherwise a review note. */
  effect: "none" | "review" | "rules out";
  threshold: string;
}

const YEARS = (series: DailySeries) => {
  const { first, last } = seriesYears(series);
  return yearsInRange(first, last);
};

/** Years in which, from `start`, there were at least `d` days before the first night at or below `t` °C (NASA POWER). */
export function frostFreeYears(series: DailySeries, start: ISODate, end: ISODate, t: number, d: number) {
  const rows = exposureByYear(series, { start, end, t, years: YEARS(series) });
  return summarize(rows, d);
}

/**
 * Species-specific climate test for one sowing date. Recomputed whenever the
 * dates change; a missing series gives "not assessed", never a pass.
 */
export function speciesClimate(id: SpeciesId, sowing: ISODate | null, end: ISODate | null, series: DailySeries | null): ClimateTest {
  const none = (text: string): ClimateTest => ({ text, met: null, total: null, effect: "none", threshold: "no sourced threshold" });
  const tested = id === "radish" || id === "buckwheat" || id === "pea";
  if (tested && (!series || !sowing || !end)) return { ...none("Past weather for this species' sourced threshold could not be read for these dates."), effect: "review" };
  if (!series || !sowing || !end) return none(id === "vetch" || id === "vetch-oat" ? "SARE advises sowing vetch 30 to 45 days before a killing frost; no killing temperature is given, so no test is applied." : id === "oat" ? "Hard winter cold can kill oats (SARE); no killing temperature is given, so no test is applied." : "No sourced cold threshold for this species.");
  const span = diffDays(sowing, end);
  if (id === "radish") {
    const s = frostFreeYears(series, sowing, end, -2.2, 28);
    const ok = s.total - s.notEvaluable;
    return { met: s.met, total: ok, threshold: "28 days before the first night at or below −2.2 °C (28 °F), SARE timing", effect: ok && s.met * 2 < ok ? "review" : "none",
      text: `Sown ${fmtDate(sowing)}: in ${s.met} of ${ok} past years there were 4+ weeks before the first night at or below −2.2 °C (SARE asks for about four weeks before the average first 28 °F freeze).` };
  }
  if (id === "buckwheat") {
    const d = Math.min(70, span);
    const s = frostFreeYears(series, sowing, end, 0, d);
    const ok = s.total - s.notEvaluable;
    return { met: s.met, total: ok, threshold: `no night at or below 0 °C during the first ${d} days (buckwheat is not frost tolerant; 70 to 90 days to maturity, SARE)`, effect: ok && s.met * 2 < ok ? "rules out" : s.met < ok ? "review" : "none",
      text: `Sown ${fmtDate(sowing)}: in ${s.met} of ${ok} past years there was no night at or below 0 °C in the first ${d} days. Buckwheat is not frost tolerant (SARE).` };
  }
  if (id === "pea") {
    const s = frostFreeYears(series, sowing, end, -12.2, Math.max(1, span));
    const ok = s.total - s.notEvaluable;
    return { met: s.met, total: ok, threshold: "nights at or below −12.2 °C (10 °F), where SARE reports only minor injury for winter peas; varieties differ", effect: s.met < ok ? "review" : "none",
      text: `In ${ok - s.met} of ${ok} past years a night reached −12.2 °C or less between ${fmtDate(sowing)} and ${fmtDate(end)} (SARE: winter peas withstand about −12 °C with minor injury; varieties differ).` };
  }
  if (id === "vetch" || id === "vetch-oat") return none("SARE advises sowing vetch 30 to 45 days before a killing frost; no killing temperature is given, so no test is applied.");
  if (id === "oat") return none("Hard winter cold can kill oats (SARE); no killing temperature is given, so no test is applied.");
  if (id === "faba" || id === "clover") return none("No sourced cold threshold read for this species.");
  return none("No sourced cold threshold for this species.");
}
