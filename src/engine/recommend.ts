/**
 * Cover suggestion: documented, testable rules. No composite score, no success
 * probability, no money. Each candidate keeps separate dimensions:
 *   purpose match · calendar and canal water · climate evidence ·
 *   soil and management · productive use · uncertainty and next step.
 *
 * Species facts below quote the SARE "Managing Cover Crops Profitably" pages
 * (US guidance, re-read 14 Nov 2026). They describe mechanisms and US
 * experience; no amount (N, biomass, yield) is transferred to the Alto Valle.
 */
import { STRATEGIES, cropById } from "./catalog";
import { EXPERIMENTAL, speciesClimate, frostFreeYears, type ClimateTest, type SpeciesId } from "./species";
import type { DailySeries } from "./climate";
import { STATE_LABEL, type CalendarState } from "./calendar";
import { fmtT } from "./climate";
import { diffDays, fmtDate } from "./dates";
import type { ClimateReading } from "./exposure";
import { actionText } from "../ui/plain";
import { evaluate, overviewOf, type Evaluation, type Scenario, type StrategyReading } from "./scenario";
import { reportedConditions } from "./context";

import type { Goal } from "./scenario";
export type { Goal };

export const GOAL_LABEL: Record<Goal, string> = {
  "next-crop-n": "Prepare the next crop (potential nitrogen)",
  "soil-cover": "Keep the soil covered",
  weeds: "Hold back weeds",
  "productive-use": "A possible productive use",
  "not-sure": "Not sure yet",
};

/** Goal wording for the plan: a crop that stays in place is not a "next crop". */
export function goalLabel(goal: Goal, permanent: boolean): string {
  return permanent && goal === "next-crop-n" ? "Support the standing crop (potential nitrogen)" : GOAL_LABEL[goal];
}

export type Match = "supports" | "partial" | "against" | "unassessed";
export const MATCH_LABEL: Record<Match, string> = { supports: "matches the goal", partial: "partly matches", against: "works against the goal", unassessed: "not assessed" };

export interface Reason {
  text: string;
  /** Source id in SOURCES, or null for an app rule. */
  sourceId: string | null;
  /** Where the evidence comes from, shown with the reason. */
  where: string;
}

type CoverId = SpeciesId;
type Established = "rye" | "oat" | "vetch" | "vetch-oat";
const US = "US guidance";

/** What each cover does for each goal. Only claims the cited page supports. */
const FACTS: Record<Established, Record<Exclude<Goal, "not-sure">, { match: Match; reasons: Reason[] }>> = {
  rye: {
    "next-crop-n": {
      match: "against",
      reasons: [
        { text: "Takes up nitrogen left in the soil, but does not add nitrogen from the air.", sourceId: "SARE_RYE", where: US },
        { text: "Its residue holds nitrogen back as it breaks down, more so the older the rye is when ended.", sourceId: "SARE_RYE", where: US },
      ],
    },
    "soil-cover": { match: "supports", reasons: [{ text: "The hardiest of the cereals and easy to establish; it can be sown later than other covers.", sourceId: "SARE_RYE", where: US }] },
    weeds: { match: "supports", reasons: [{ text: "Holds back many weeds, partly through natural compounds; the effect usually fades after about 30 days.", sourceId: "SARE_RYE", where: US }] },
    "productive-use": {
      match: "partial",
      reasons: [{ text: "Can be cut for hay or bale silage at boot stage. Cutting it removes the residue and the nutrients it holds, so the soil effects above no longer apply in full.", sourceId: "SARE_RYE", where: US }],
    },
  },
  oat: {
    "next-crop-n": { match: "against", reasons: [{ text: "Takes up excess nitrogen when sown early enough, but does not add nitrogen from the air.", sourceId: "SARE_OATS", where: US }] },
    "soil-cover": { match: "partial", reasons: [{ text: "Quick to germinate, but hard winter cold can kill it, ending the cover early.", sourceId: "SARE_OATS", where: US }] },
    weeds: { match: "supports", reasons: [{ text: "A strong smother crop that helps reduce autumn weeds.", sourceId: "SARE_OATS", where: US }] },
    "productive-use": {
      match: "partial",
      reasons: [{ text: "More palatable to livestock than rye and easily overgrazed. Grazing removes part of the cover, so less is left for the soil.", sourceId: "SARE_OATS", where: US }],
    },
  },
  vetch: {
    "next-crop-n": {
      match: "supports",
      reasons: [
        { text: "A legume: takes nitrogen from the air; part of it can become available to the following crop as the residue breaks down, not all at once.", sourceId: "SARE_VETCH", where: US },
        { text: "Grows slowly in autumn: sow 30 to 45 days before a killing frost.", sourceId: "SARE_VETCH", where: US },
      ],
    },
    "soil-cover": { match: "partial", reasons: [{ text: "Grows slowly in autumn, so the ground stays partly bare at first; roots keep growing over winter.", sourceId: "SARE_VETCH", where: US }] },
    weeds: {
      match: "partial",
      reasons: [
        { text: "Smothers spring weeds mostly by shading; the effect fades three to four weeks after it is ended.", sourceId: "SARE_VETCH", where: US },
        { text: "10 to 20 percent of its seed can stay dormant in the soil and come up later as a weed.", sourceId: "SARE_VETCH", where: US },
      ],
    },
    "productive-use": { match: "against", reasons: [{ text: "Only fair grazing: livestock do not relish it.", sourceId: "SARE_VETCH", where: US }] },
  },
  "vetch-oat": {
    "next-crop-n": {
      match: "supports",
      reasons: [
        { text: "The vetch adds nitrogen from the air; how much depends on the share of vetch in the mix and how it is managed.", sourceId: "SARE_VETCH", where: US },
        { text: "Oat is a good nurse crop for a slow legume and can help it through winter.", sourceId: "SARE_OATS", where: US },
      ],
    },
    "soil-cover": { match: "supports", reasons: [{ text: "The oat germinates quickly and covers the ground while the vetch establishes.", sourceId: "SARE_OATS", where: US }] },
    weeds: { match: "supports", reasons: [{ text: "Grain and vetch together give greater control of winter annual weeds and longer-lasting residue.", sourceId: "SARE_VETCH", where: US }] },
    "productive-use": { match: "unassessed", reasons: [{ text: "No source used here covers harvesting or grazing this mixture.", sourceId: null, where: "app rule" }] },
  },
};

/** Next-crop links. Each is a relationship the cited page states; none is local evidence. */
function nextCropReasons(cover: CoverId, nextCropId: string): Reason[] {
  const out: Reason[] = [];
  const legume = cover === "vetch" || cover === "vetch-oat";
  if (legume && nextCropId === "tomato") out.push({ text: "Suits transplanted early-summer crops such as tomato, giving nitrogen and a mulch that keeps soil off the plants.", sourceId: "SARE_VETCH", where: US });
  if (legume && nextCropId === "maize") {
    out.push({ text: "Can partly replace nitrogen fertiliser for maize; no amount is estimated here.", sourceId: "SARE_VETCH", where: US });
    out.push({ text: "Regional irrigated trial: maize after hairy vetch had more soil nitrogen at sowing and yielded more than after fallow; ending the vetch later gave more biomass and nitrogen.", sourceId: "VANZOLINI", where: "Hilario Ascasubi, irrigated, 2006–2008" });
  }
  if (cover === "rye" && nextCropId === "onion") out.push({ text: "After ending rye, wait three to four weeks before sowing small-seeded crops such as onion.", sourceId: "SARE_RYE", where: US });
  if ((cover === "oat" || cover === "vetch-oat") && nextCropId === "onion") out.push({ text: "Wait two to three weeks after ending oats before sowing a following crop.", sourceId: "SARE_OATS", where: US });
  return out;
}

/** A regional study record: what was done, where, and why it does not transfer automatically. */
export interface Evidence {
  sourceId: string;
  site: string;
  system: string;
  found: string;
  limits: string;
}

const REGIONAL: { ids: CoverId[]; next?: string[]; goals?: Goal[]; crops?: string[]; ev: Evidence }[] = [
  {
    ids: ["vetch", "vetch-oat"],
    ev: { sourceId: "E17", site: "Cipolletti, Alto Valle", system: "Hairy vetch (Ascasubi INTA) sown 10 Apr 2024 between almond rows, drip irrigated; cut at flowering (late Oct) and at seed set (late Dec)", found: "Vetch established from an April sowing in the Alto Valle; the nitrogen it held depended strongly on when it was cut.", limits: "Orchard, not a vegetable plot ended in September; its figures are not transferred to your field." },
  },
  {
    ids: ["vetch", "vetch-oat"],
    next: ["maize"],
    ev: { sourceId: "VANZOLINI", site: "INTA Hilario Ascasubi, Buenos Aires", system: "Irrigated; hairy vetch killed on different dates, oat and fallow, followed by maize; two field seasons 2006–2008", found: "After vetch, more soil nitrogen at maize sowing and higher maize yield than after fallow; a later kill gave more vetch biomass and nitrogen.", limits: "Another irrigated valley; abstract read, full methods not reviewed; figures not transferred." },
  },
  {
    ids: ["vetch", "vetch-oat"],
    next: ["maize"],
    ev: { sourceId: "AAPRESID", site: "Chacra VINPA, North Patagonian irrigated valleys", system: "Hairy vetch as maize predecessor in a five-year rotation, with and without urea", found: "High maize yields after vetch without fertiliser were reported; maize after vetch was also hit harder by a late frost in December 2023.", limits: "Institutional communication; protocol and data not obtained; results not assigned to General Roca." },
  },
  {
    ids: ["oat", "vetch-oat"],
    goals: ["productive-use"],
    ev: { sourceId: "SUAREZ", site: "EEA INTA Valle Inferior del Río Negro", system: "Oat with vetch versus oat fertilised with urea, grown for grazing", found: "Similar dry matter in both treatments.", limits: "Forage grown to be grazed, not a cover left in the field; no following crop measured; abstract only." },
  },
];

export function regionalEvidence(id: CoverId, nextCropId: string, goal: Goal): Evidence[] {
  return REGIONAL.filter((r) => r.ids.includes(id) && (!r.next || r.next.includes(nextCropId)) && (!r.goals || r.goals.includes(goal))).map((r) => r.ev);
}

export type Confidence = "local-system" | "regional-similar" | "regional-other" | "external" | "experimental";
export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  "local-system": "Local study in this system",
  "regional-similar": "Regional study, similar system",
  "regional-other": "Regional study, other system",
  external: "Guidance from other countries",
  experimental: "Experimental: no local experience found",
};

function confidenceFor(id: CoverId, system: Scenario["system"], cropId: string, nextCropId: string): Confidence {
  if (id in EXPERIMENTAL) return "experimental";
  const legume = id === "vetch" || id === "vetch-oat";
  if (legume && system === "orchard" && cropId === "almond") return "local-system";
  if (legume && system === "annual" && nextCropId === "maize") return "regional-similar";
  if (legume) return "regional-other";
  return "external";
}

export type Status = "suggested" | "provisional" | "experimental" | "partial-match" | "not-on-these-dates" | "not-for-this-goal" | "not-for-this-system";
export const STATUS_LABEL: Record<Status, string> = {
  suggested: "Worth exploring",
  provisional: "Conditional: check first",
  experimental: "Experimental candidate",
  "not-on-these-dates": "Not on these dates",
  "partial-match": "Dates fit; partial match for this goal",
  "not-for-this-goal": "Dates fit; does not serve this goal",
  "not-for-this-system": "Not for this system",
};

/** Statuses a person can select and plan with. Only a date or system conflict excludes a candidate; a weaker goal match does not. */
export const EXPLORABLE: ReadonlySet<Status> = new Set<Status>(["suggested", "provisional", "experimental", "partial-match", "not-for-this-goal"]);

/** Plain statement of how a candidate relates to the goal, separate from its calendar and its evidence. */
export function goalFitText(c: { status: Status; purpose: { match: Match } }): string | null {
  if (c.status === "partial-match") return "Serves this goal only in part in the guidance used; another candidate has a stronger documented match.";
  if (c.status === "not-for-this-goal") return c.purpose.match === "against" ? "Works against this goal in the guidance used; selectable to compare, not suggested." : "The guidance used does not assess this goal for this species; selectable to compare, not suggested.";
  return null;
}

/** Something to confirm. Blocking checks keep a candidate conditional; they never change the calendar. */
export interface Check {
  kind: "access" | "soil" | "calendar" | "climate" | "species" | "water" | "system";
  text: string;
  blocking: boolean;
}

/** Where a dimension's statement comes from, at what scale, and what it does in the reasoning. */
export interface Provenance {
  kind: "your input" | "calculation from your dates" | "reanalysis (NASA POWER)" | "published guidance" | "regional study" | "research brief" | "app rule";
  source: string;
  scope: string;
  dates?: string;
  quality?: string;
  role: string;
  missing?: string;
}

export interface Dimension {
  key: "benefit" | "calendar" | "climate" | "water-soil" | "evidence";
  label: string;
  text: string;
  state: "ok" | "check" | "blocks" | "unknown";
  provenance: Provenance;
}

/** One link of the nitrogen chain and how far evidence reaches. */
export interface NStep {
  step: string;
  status: "supported by your inputs" | "unknown" | "not applicable" | "not modelled";
  basis: string;
}

export interface Candidate {
  id: CoverId;
  name: string;
  strategy: "B" | "C";
  status: Status;
  families: string[];
  habit: "annual" | "perennial";
  purpose: { match: Match; reasons: Reason[] };
  calendar: { state: CalendarState; label: string; availableDays: number | null; turns: string; endBy: string | null; binding: string[]; sowing: string | null };
  termination: { days: number; provenance: "your setting" | "species default"; source: string };
  climate: string | null;
  climateAssessed: boolean;
  speciesClimate: ClimateTest;
  soil: string[];
  checks: Check[];
  evidence: Evidence[];
  confidence: Confidence;
  dimensions: Dimension[];
  nChain: NStep[] | null;
  nutrient: string;
  /** One benefit and one material trade-off for the compact card. */
  benefit: string;
  tradeoff: string;
  /** The species' own documented limit, used when a check is shared by every option. */
  limit: string;
  productiveUse: { kind: "service cover" | "possible harvested use" | "not supported" | "not assessed"; text: string };
  nextStep: string;
}

export interface Suggestion {
  goal: Goal;
  system: Scenario["system"];
  kind: "one" | "tie" | "none";
  headline: string;
  why: string;
  decidingFactor: string | null;
  main: Candidate[];
  others: Candidate[];
  /** Researched candidates with no local experience; shown apart, never mixed into the main answer. */
  experimental: Candidate[];
  baseline: { calendar: string; text: string };
  sharedChecks: Check[];
  confirmFirst: string;
  climateAssessed: boolean;
  /** What the cover would serve: the next crop, or the standing crop. */
  serviceTo: string;
  rules: string[];
}

const ORDER: Match[] = ["supports", "partial", "unassessed", "against"];
const VIABLE: CalendarState[] = ["fits", "needs-data"];
const ESTABLISHED: { id: Established; strategy: "B" | "C" }[] = [
  { id: "rye", strategy: "B" },
  { id: "oat", strategy: "B" },
  { id: "vetch", strategy: "C" },
  { id: "vetch-oat", strategy: "C" },
];
const EXP_IDS: { id: keyof typeof EXPERIMENTAL; strategy: "B" | "C" }[] = [
  { id: "pea", strategy: "C" },
  { id: "faba", strategy: "C" },
  { id: "radish", strategy: "B" },
  { id: "buckwheat", strategy: "B" },
  { id: "clover", strategy: "C" },
];
export const strategyOf = (id: string): "B" | "C" => ([...ESTABLISHED, ...EXP_IDS].find((x) => x.id === id)?.strategy ?? "C");

/**
 * Evaluates one variant. If the person changed the termination interval of the
 * group's current variant, that setting is kept for the other variants of the
 * same group and labelled "your setting"; otherwise each variant uses its
 * species default from the catalog. Nothing is reset silently.
 */
export function readingFor(s: Scenario, strategy: "B" | "C", variantId: string): { r: StrategyReading; termination: Candidate["termination"] } {
  const { scenario, termination } = candidateScenario(s, variantId, strategy);
  return { r: evaluate(scenario).strategies.find((x) => x.def.id === strategy)!, termination };
}

/**
 * The scenario that a selected candidate is evaluated with: its own variant and
 * effective termination interval. Calendar, date comparison, applied changes,
 * exports and saved plans all use this one function.
 */
export function candidateScenario(s: Scenario, variantId: string, strategy: "B" | "C" = strategyOf(variantId)): { scenario: Scenario; strategy: "B" | "C"; termination: Candidate["termination"] } {
  const def = STRATEGIES.find((d) => d.id === strategy)!;
  const cur = def.variants.find((x) => x.id === s.covers[strategy].variantId) ?? def.variants[0];
  const v = def.variants.find((x) => x.id === variantId) ?? cur;
  const override = s.covers[strategy].terminationDays !== cur.terminationDays;
  const days = override ? s.covers[strategy].terminationDays : v.terminationDays;
  const termination: Candidate["termination"] = override
    ? { days, provenance: "your setting", source: `Your setting for ${def.name.toLowerCase()}s` }
    : { days, provenance: "species default", source: v.terminationSource };
  return { scenario: { ...s, covers: { ...s.covers, [strategy]: { ...s.covers[strategy], variantId: v.id, terminationDays: days } } }, strategy, termination };
}

function climateLine(c: ClimateReading | null): string | null {
  if (!c || c.error || c.summary.notEvaluable === c.summary.total) return null;
  return `From sowing on ${fmtDate(c.start)}: in ${c.summary.met} of ${c.summary.total} past years there were ${c.d}+ days before the first night at or below ${fmtT(c.t)} °C (NASA POWER, regional; reads optimistic against the nearest station).`;
}

function productive(id: CoverId, goal: Goal): Candidate["productiveUse"] {
  if (id in EXPERIMENTAL) return { kind: "not assessed", text: "Not assessed for this species." };
  const f = FACTS[id as Established]["productive-use"];
  if (f.match === "against") return { kind: "not supported", text: f.reasons[0].text };
  if (f.match === "unassessed") return { kind: "not assessed", text: f.reasons[0].text };
  if (goal === "productive-use") return { kind: "possible harvested use", text: `${f.reasons[0].text} Whether it pays is not calculated.` };
  return { kind: "service cover", text: "Treated as a service cover: everything grown stays in the field." };
}

function goalFacts(id: CoverId, goal: Goal): { match: Match; reasons: Reason[] } {
  if (goal === "not-sure") return { match: "unassessed", reasons: [] };
  if (id in EXPERIMENTAL) return EXPERIMENTAL[id as keyof typeof EXPERIMENTAL].goals[goal] ?? { match: "unassessed", reasons: [] };
  return FACTS[id as Established][goal];
}

function infoOf(id: CoverId): { families: string[]; habit: "annual" | "perennial"; nutrient: string; limits: Reason[] } {
  if (id in EXPERIMENTAL) {
    const e = EXPERIMENTAL[id as keyof typeof EXPERIMENTAL];
    return { families: e.families, habit: e.habit, nutrient: e.nutrient, limits: e.limits };
  }
  const legume = id === "vetch" || id === "vetch-oat";
  return {
    families: id === "vetch-oat" ? ["Fabaceae", "Poaceae"] : legume ? ["Fabaceae"] : ["Poaceae"],
    habit: "annual",
    nutrient: id === "vetch-oat" ? "fixes N (legume part of a mixture)" : legume ? "fixes N from the air (legume)" : "takes up existing soil N",
    limits: id === "vetch" ? [{ text: "10 to 20 percent of its seed can stay dormant and come up later as a weed.", sourceId: "SARE_VETCH", where: US }] : id === "rye" ? [{ text: "Its residue holds nitrogen back while it breaks down.", sourceId: "SARE_RYE", where: US }] : id === "oat" ? [{ text: "Hard winter cold can kill it, ending the cover early.", sourceId: "SARE_OATS", where: US }] : id === "vetch-oat" ? [{ text: "The vetch in the mix: 10 to 20 percent of its seed can stay dormant and come up later as a weed.", sourceId: "SARE_VETCH", where: US }] : [],
  };
}

/** Checks that apply to every option. */
export function sharedChecksFor(s: Scenario): Check[] {
  if (s.access === "someone-else") return [{ kind: "access", blocking: true, text: "Someone else decides about this plot in winter: this is a scenario to share with them, not a plan you can act on alone." }];
  if (s.access === "can-agree") return [{ kind: "access", blocking: true, text: "Agree the winter use with whoever controls the plot before buying seed." }];
  return [];
}

const SOIL_REVIEW = new Set(["waterlogging", "salinity"]);
/** Reported waterlogging or salinity: a blocking review in every system. No tolerance threshold is applied. */
function soilChecks(conds: { id: string; review: boolean; text: string }[]): Check[] {
  return conds.filter((c) => SOIL_REVIEW.has(c.id) && c.review).map((c) => ({ kind: "soil" as const, blocking: true, text: `Review first: ${c.text} Umbral has no tolerance data for these covers; check with an adviser or INTA.` }));
}
const POWER_PROV = (dates: string, role: string): Provenance => ({
  kind: "reanalysis (NASA POWER)", source: "NASA POWER daily T2M_MIN, v2.10.3", scope: "Regional grid (about 55 km) at the General Roca reference point; one value for every example field",
  dates, quality: "Station check: first cold nights about 18 days later than at Neuquén Aero (0 °C), so counts read optimistic", role,
});

function nChainFor(id: CoverId, ctx: { calendarOk: boolean; climateOk: boolean; water: "known" | "unknown" | "none"; retained: boolean; successor: string }): NStep[] | null {
  const info = infoOf(id);
  if (!/N/.test(info.nutrient)) return null;
  const fixer = /fixes N/.test(info.nutrient);
  return [
    { step: "Can establish on these dates", status: ctx.calendarOk && ctx.climateOk ? "supported by your inputs" : "unknown", basis: ctx.calendarOk ? (ctx.climateOk ? "Calendar fits; past cold nights read for these dates." : "Calendar fits; past weather not fully assessed.") : "Calendar does not fit." },
    { step: fixer ? "Grows and nodulates with the water available" : "Grows and takes up nitrogen already in the soil (does not fix it)", status: ctx.water === "known" ? "unknown" : ctx.water === "none" ? "unknown" : "unknown", basis: `${ctx.water === "known" ? "Water timing entered" : ctx.water === "none" ? "No water reaches this area in your inputs" : "Water reaching the cover not known"}; nodulation, inoculation and growth are not measured or modelled.` },
    { step: "Biomass retained at termination", status: ctx.retained ? "supported by your inputs" : "not applicable", basis: ctx.retained ? "Service cover: everything grown stays in the field." : "Harvested or grazed: part of the nitrogen leaves the field." },
    { step: "Residue breaks down and releases nitrogen", status: "not modelled", basis: "Release timing depends on residue, temperature and soil; no model (such as CC-NCALC or PCSE) was run." },
    { step: `Release overlaps uptake by ${ctx.successor}`, status: "not modelled", basis: `Uptake timing of ${ctx.successor} is not modelled. No nitrogen amount or fertiliser credit is computed.` },
  ];
}

interface Ctx {
  s: Scenario;
  goal: Goal;
  climateBy: Record<"A" | "B" | "C", ClimateReading | null>;
  series: DailySeries | null;
  shared: Check[];
}

/** Builds one candidate for the annual rotation (or beds whose plants are removed). */
function annualCandidate(c: Ctx, id: CoverId, strategy: "B" | "C"): Candidate {
  const { s, goal } = c;
  const { r, termination } = readingFor(s, strategy, id);
  const ov = overviewOf(r);
  const f = goalFacts(id, goal);
  const reasons = [...f.reasons, ...(id in EXPERIMENTAL ? [] : goal === "next-crop-n" || goal === "not-sure" ? nextCropReasons(id as Established, s.nextCropId) : nextCropReasons(id as Established, s.nextCropId).filter((x) => /wait/i.test(x.text)))];
  const info = infoOf(id);
  const noTime = r.calendar.availableDays !== null && r.calendar.availableDays <= 0;
  const calOk = VIABLE.includes(r.calendar.state) && !noTime;
  const cold = c.climateBy[strategy];
  const climate = climateLine(cold);
  const sc = speciesClimate(id, r.inputs.sowing ?? null, r.calendar.terminationDeadline ?? null, c.series);
  const checks: Check[] = [];
  checks.push(...soilChecks(r.conditions));
  if (r.calendar.state === "needs-data") checks.push({ kind: "calendar", blocking: true, text: actionText(r, s) });
  if (!climate) checks.push({ kind: "climate", blocking: true, text: "Past cold nights for these dates could not be read (NASA POWER not loaded or the dates cannot be evaluated). Review them before sowing." });
  if (sc.effect === "review") checks.push({ kind: "species", blocking: true, text: sc.text });
  else if (sc.text && sc.effect === "none") checks.push({ kind: "species", blocking: false, text: sc.text });
  const nextFam = cropById(s.nextCropId).families;
  if (info.families.some((fam) => nextFam.includes(fam) && fam !== "unknown")) checks.push({ kind: "species", blocking: true, text: `Same family as the next crop (${info.families.filter((x) => nextFam.includes(x)).join(", ")}): check shared pests and diseases first.` });
  const perennial = info.habit === "perennial";
  const blocked = [...c.shared, ...checks].some((k) => k.blocking);
  let status: Status;
  if (perennial) status = "not-for-this-system";
  else if (!calOk || sc.effect === "rules out") status = "not-on-these-dates";
  else if (id in EXPERIMENTAL) status = "experimental";
  else status = r.calendar.state === "fits" && f.match === "supports" && !blocked ? "suggested" : "provisional";
  const water: "known" | "unknown" = s.water.lastTurn ? "known" : "unknown";
  const name = r.variant?.name ?? id;
  return finish({
    id, name, strategy, status, families: info.families, habit: info.habit, purpose: { match: f.match, reasons },
    calendar: { state: r.calendar.state, label: perennial ? "Perennial: does not end by itself before the next crop" : noTime ? "No time for a living cover (0 days)" : sc.effect === "rules out" ? "Frost in most past years on these dates" : STATE_LABEL[r.calendar.state], availableDays: r.calendar.availableDays, turns: ov.turns, endBy: r.calendar.terminationDeadline, binding: (r.calendar.binding ?? []).map((x) => x.label), sowing: r.inputs.sowing ?? null },
    termination, climate, climateAssessed: !!climate, speciesClimate: sc, soil: r.conditions.map((x) => x.text), checks,
    evidence: id in EXPERIMENTAL ? [] : regionalEvidence(id, s.nextCropId, goal), confidence: confidenceFor(id, s.system, s.previousCropId, s.nextCropId),
    dimensions: [], nChain: nChainFor(id, { calendarOk: calOk, climateOk: !!climate, water, retained: goal !== "productive-use", successor: `the next crop (${cropById(s.nextCropId).name.toLowerCase()}, ${fmtDate(s.nextCrop)})` }),
    nutrient: info.nutrient, benefit: "", tradeoff: "", limit: "", productiveUse: productive(id, goal), nextStep: actionText(r, s),
  }, info.limits, { calendarProv: `Field free ${fmtDate(s.release)}, sowing ${r.inputs.sowing ? fmtDate(r.inputs.sowing) : "—"}, next crop ${fmtDate(s.nextCrop)} minus ${s.preparationDays} days of preparation, ended ${termination.days} days before (${termination.provenance}); last canal turn ${s.water.lastTurn ? fmtDate(s.water.lastTurn) : "unknown"}, closure ${fmtDate(s.water.closure)}`, waterText: `${ov.turns} canal turn(s) after sowing; turns are chances to water, not a measure of enough water.`, coldDates: cold && !cold.error ? `${fmtDate(cold.start)} to ${fmtDate(cold.end)}, 1981–2025` : "not read" });
}

/** Adds the compact benefit/trade-off and the five provenance-bearing dimensions. */
function finish(c: Candidate, limits: Reason[], p: { calendarProv: string; waterText: string; coldDates: string }): Candidate {
  const firstBlock = c.checks.find((k) => k.blocking);
  c.benefit = c.purpose.reasons[0]?.text ?? "Not assessed for this goal.";
  c.limit = limits[0]?.text ?? "";
  c.tradeoff = firstBlock?.text ?? limits.find((l) => l.text !== c.benefit)?.text ?? c.checks.find((k) => !k.blocking)?.text ?? "No specific trade-off was assessed in the guidance used.";
  const src = c.purpose.reasons[0];
  const srcKind: Provenance["kind"] = !src ? "app rule" : src.where.startsWith("research brief") ? "research brief" : src.sourceId && ["E17", "VANZOLINI", "AAPRESID", "SUAREZ"].includes(src.sourceId) ? "regional study" : "published guidance";
  const soilWater = c.checks.filter((k) => k.kind === "soil" || k.kind === "water" || k.kind === "system");
  c.dimensions = [
    { key: "benefit", label: "Benefit", text: c.benefit, state: c.purpose.match === "supports" ? "ok" : c.purpose.match === "against" ? "blocks" : "check", provenance: { kind: srcKind, source: src?.sourceId ?? "app rule", scope: src?.where ?? "—", role: "Why it may serve the goal; not proof it grows here.", missing: c.purpose.match === "unassessed" ? "No source used here covers this goal for this species." : undefined } },
    { key: "calendar", label: "Calendar", text: c.calendar.availableDays !== null && c.calendar.availableDays > 0 ? `${c.calendar.label}: ${c.calendar.availableDays} days${c.calendar.endBy ? `, end by ${fmtDate(c.calendar.endBy)}` : ""}` : c.calendar.label, state: c.status === "not-on-these-dates" || c.status === "not-for-this-system" ? "blocks" : c.calendar.state === "fits" ? "ok" : "check", provenance: { kind: "calculation from your dates", source: "Umbral calendar engine", scope: "This plan", dates: p.calendarProv, role: "Can rule a cover out; calendar days are not growth or biomass." } },
    { key: "climate", label: "Past weather", text: c.speciesClimate.met !== null ? c.speciesClimate.text : c.climate ?? "Not read for these dates.", state: !c.climateAssessed ? "unknown" : c.speciesClimate.effect === "rules out" ? "blocks" : c.speciesClimate.effect === "review" ? "check" : "ok", provenance: POWER_PROV(p.coldDates, c.speciesClimate.met !== null ? `Tests the sourced threshold: ${c.speciesClimate.threshold}.` : "Context; no sourced species threshold, so it does not rank covers.") },
    { key: "water-soil", label: "Water and soil", text: soilWater[0]?.text ?? p.waterText, state: soilWater.some((k) => k.blocking) ? "check" : "unknown", provenance: { kind: "your input", source: "Your entries (canal, soil, plot)", scope: "This plot", role: "Reported conditions make a candidate conditional; regional maps are not used as plot measurements.", missing: "Water amounts, soil analysis and drainage are not measured here unless you enter them." } },
    { key: "evidence", label: "Evidence", text: CONFIDENCE_LABEL[c.confidence], state: c.confidence === "experimental" ? "check" : "ok", provenance: { kind: c.evidence.length ? "regional study" : srcKind, source: c.evidence.map((e) => e.sourceId).join(", ") || src?.sourceId || "—", scope: c.evidence[0]?.site ?? src?.where ?? "—", role: "How close the evidence is to this system; no local result is claimed." } },
  ];
  return c;
}

/** Rewrites successor wording for a crop that stays in place: nothing "follows" a standing tree or kept bed. */
export function standingWording(r: Reason, crop: string): Reason {
  const text = r.text
    .replace(/part of it can become available to the following crop as the residue breaks down, not all at once\./, `part of it may reach the standing ${crop} as the residue breaks down, only if its roots reach that area and the timing overlaps; competition for water and nitrogen is the main risk.`)
    .replace(/the following (cash )?crop/g, `the standing ${crop}`)
    .replace(/the next crop/g, `the standing ${crop}`);
  return { ...r, text };
}

/** Orchard interrow / tree row, or kept beds: the main crop stays; only the stated area and window are evaluated. */
function permanentCandidate(c: Ctx, id: CoverId, strategy: "B" | "C"): Candidate {
  const { s, goal } = c;
  const crop = cropById(s.previousCropId);
  const beds = s.system === "beds";
  const [w0, w1] = s.orchard.window;
  const days = diffDays(w0, w1);
  const f = goalFacts(id, goal);
  const info = infoOf(id);
  const checks: Check[] = [];
  const area = beds ? s.beds.area : s.orchard.area;
  if (beds && area !== "paths") checks.push({ kind: "system", blocking: true, text: area === "none" ? "No free area is stated while the plants are kept." : "State where a cover could grow while the plants are kept (for example the paths between beds)." });
  if (!beds && area === "tree-row") checks.push({ kind: "system", blocking: true, text: "On the tree row a cover competes directly with tree roots; review with an adviser before sowing there." });
  const reach = beds ? s.beds.drip : s.orchard.waterReach;
  if (beds) checks.push({ kind: "water", blocking: true, text: "Drip on the beds does not water the paths: confirm how a cover there would get water." });
  else if (reach === "unknown") checks.push({ kind: "water", blocking: true, text: "Confirm that irrigation water reaches the interrow; drip on the tree row does not water it." });
  else if (reach === "no") checks.push({ kind: "water", blocking: true, text: "No irrigation water reaches this area in your inputs: a cover would depend on rain, which is not assessed." });
  if (!beds && s.orchard.age !== "established") checks.push({ kind: "system", blocking: true, text: `${s.orchard.age === "young" ? "Young trees" : "Trees of unknown age"}: young trees are most sensitive to competition for water and nitrogen; review before sowing near them.` });
  if (!beds) checks.push({ kind: "system", blocking: false, text: "A tall cover in the interrow around flowering can add late-frost risk for the trees; mow it low before sensitive stages (stages and dates not modelled)." });
  if (info.habit === "perennial" && s.orchard.mowing !== "yes") checks.push({ kind: "system", blocking: true, text: "A perennial cover needs regular mowing and its own water; confirm both." });
  if (crop.leaf === "evergreen") checks.push({ kind: "system", blocking: false, text: "Evergreen crop: no winter dormancy is assumed; competition can continue through winter." });
  // Reported soil conditions apply here too; the family rule is about a successor crop and does not apply.
  const conds = reportedConditions(s.context, s.previousCropId, s.previousCropId, true).filter((x) => x.id !== "family");
  checks.push(...soilChecks(conds));
  if (crop.group === "Citrus" && (id === "faba" || id === "vetch" || id === "vetch-oat")) checks.push({ kind: "species", blocking: false, text: EXPERIMENTAL.faba.limits[0].text });
  const sc = speciesClimate(id, w0, w1, c.series);
  let climate: string | null = null;
  let climateAssessed = false;
  if (c.series) {
    const fy = frostFreeYears(c.series, w0, w1, 0, Math.min(30, Math.max(1, days)));
    const ok = fy.total - fy.notEvaluable;
    if (ok) {
      climate = `From ${fmtDate(w0)}: in ${fy.met} of ${ok} past years there were ${Math.min(30, days)}+ days before the first night at or below 0 °C (NASA POWER, regional; reads optimistic).`;
      climateAssessed = true;
    }
  }
  if (!climateAssessed) checks.push({ kind: "climate", blocking: true, text: "Past cold nights for this window could not be read; review them before sowing." });
  if (sc.effect === "review") checks.push({ kind: "species", blocking: true, text: sc.text });
  const blocked = [...c.shared, ...checks].some((k) => k.blocking);
  const noTime = days <= 0;
  let status: Status;
  if (noTime || sc.effect === "rules out") status = "not-on-these-dates";
  else if (id in EXPERIMENTAL) status = "experimental";
  else status = f.match === "supports" && !blocked && confidenceFor(id, s.system, s.previousCropId, s.nextCropId) === "local-system" ? "suggested" : "provisional";
  const def = STRATEGIES.find((d) => d.id === strategy)!;
  const v = def.variants.find((x) => x.id === id)!;
  const ev = id in EXPERIMENTAL ? [] : REGIONAL.filter((r) => r.ids.includes(id) && !r.next && (!r.goals || r.goals.includes(goal))).map((r) => r.ev);
  return finish({
    id, name: v.name, strategy, status, families: info.families, habit: info.habit, purpose: { match: f.match, reasons: f.reasons.map((x) => standingWording(x, crop.name.toLowerCase())) },
    calendar: { state: noTime ? "invalid" : "fits", label: noTime ? "No management window" : `Management window ${fmtDate(w0)} to ${fmtDate(w1)}`, availableDays: Math.max(0, days), turns: "—", endBy: w1, binding: [], sowing: w0 },
    termination: { days: 0, provenance: "your setting", source: "Mown or ended at the end of the window you entered" },
    climate, climateAssessed, speciesClimate: sc, soil: conds.map((x) => x.text), checks, evidence: ev, confidence: confidenceFor(id, s.system, s.previousCropId, s.nextCropId),
    dimensions: [], nChain: nChainFor(id, { calendarOk: !noTime, climateOk: climateAssessed, water: reach === "yes" ? "known" : reach === "no" ? "none" : "unknown", retained: goal !== "productive-use", successor: `the standing ${crop.name.toLowerCase()}` }),
    nutrient: info.nutrient, benefit: "", tradeoff: "", limit: "", productiveUse: productive(id, goal),
    nextStep: checks.find((k) => k.blocking)?.text ?? "Agree the window and mowing with whoever manages the orchard.",
  }, info.limits, { calendarProv: `Window you entered: ${fmtDate(w0)} to ${fmtDate(w1)}`, waterText: beds ? "Water for the paths not stated." : `Water reaching the ${s.orchard.area === "interrow" ? "interrow" : "tree row"}: ${s.orchard.waterReach}.`, coldDates: `${fmtDate(w0)} to ${fmtDate(w1)}, 1981–2025` });
}

/** Builds the suggestion. Pure; changing the goal never changes dates, water or weather inputs. */
export function suggest(s: Scenario, goal: Goal, climateBy: Record<"A" | "B" | "C", ClimateReading | null>, ev: Evaluation = evaluate(s), series: DailySeries | null = null): Suggestion {
  const shared = sharedChecksFor(s);
  const ctx: Ctx = { s, goal, climateBy, series, shared };
  const permanent = s.system === "orchard" || (s.system === "beds" && s.beds.plants !== "removed");
  const crop = cropById(s.previousCropId);
  const make = permanent ? permanentCandidate : annualCandidate;
  const cands = ESTABLISHED.map(({ id, strategy }) => make(ctx, id, strategy));
  // A blocking check shared by every option is shown once (as the next check), not repeated as each card's trade-off.
  const allCands = () => [...cands, ...experimental];
  const experimental = EXP_IDS.filter(({ id }) => !permanent || EXPERIMENTAL[id].contexts.some((x) => x !== "annual-gap")).map(({ id, strategy }) => make(ctx, id, strategy));
  const commonBlock = cands.length ? cands[0].checks.filter((k) => k.blocking && cands.every((c) => c.checks.some((x) => x.blocking && x.text === k.text))).map((k) => k.text) : [];
  for (const c of allCands()) {
    if (commonBlock.includes(c.tradeoff)) c.tradeoff = c.checks.find((k) => k.blocking && !commonBlock.includes(k.text))?.text ?? (c.limit || "Shared check below applies.");
  }
  const unconfirmed = s.system === "beds" && s.beds.plants === "unknown";
  const serviceTo = permanent ? `the standing ${crop.name.toLowerCase()} (${s.system === "beds" ? (unconfirmed ? "if the plants stay in the beds; not confirmed" : "plants kept in the beds") : "the trees stay"})` : `the next crop (${cropById(s.nextCropId).name.toLowerCase()})`;
  const baseline = permanent
    ? { calendar: s.system === "beds" ? (unconfirmed ? "Beds stay occupied if the plants are kept" : "Beds stay occupied") : "The trees stay", text: s.system === "beds" ? "Keep the beds and paths as they are; Umbral does not assess their soil effect." : "Keep the interrow as it is (spontaneous vegetation, mown or bare); its effect on the trees is not assessed here." }
    : { calendar: `${ev.window.days} days until soil preparation`, text: "Residue, volunteer plants or bare soil stay as they are; no cover to sow or end. What that does for the soil depends on what is on the field; Umbral does not assess it." };
  const rules = [
    "A cover whose dates do not fit, or that would have zero days, is never suggested; the reason stays visible.",
    "Orchards and kept beds: the main crop stays; only the area and window you state are evaluated, and harvest never frees the plot.",
    "With a goal, covers are grouped by how well the cited guidance matches it; there is no score.",
    "Missing inputs, unread past weather, reported soil problems, water that may not reach the cover, and plot access make a candidate conditional; they never change the dates.",
    "NASA POWER tests a species only where the source gives a threshold with its unit; otherwise past weather is context and does not rank covers. Satellite images show what was on the parcels; they do not choose a species.",
    "Researched species with no local experience stay \"Experimental candidate\" and are listed apart.",
    "No nitrogen amount, yield or financial figure is computed.",
  ];
  const climateAssessed = cands.some((x) => x.climateAssessed);
  const first = (list: Candidate[]): string => {
    const all = [...shared, ...list.flatMap((x) => x.checks)];
    for (const k of ["access", "system", "soil", "water", "calendar", "climate", "species"] as Check["kind"][]) {
      const hit = all.find((x) => x.kind === k && x.blocking);
      if (hit) return hit.text;
    }
    return list[0]?.nextStep ?? "";
  };
  const common = { system: s.system, baseline, sharedChecks: shared, climateAssessed, rules, experimental, serviceTo };

  const viable = cands.filter((x) => x.status !== "not-on-these-dates" && x.status !== "not-for-this-system");
  if (!viable.length) {
    const blocked = cands[0];
    const zero = cands.every((x) => x.calendar.availableDays !== null && x.calendar.availableDays <= 0);
    return {
      ...common, goal, kind: "none",
      headline: permanent ? "No cover fits this window" : "No winter cover fits these dates",
      why: zero ? (permanent ? "The management window you entered has no days." : "There are no days between sowing and the date each cover must be ended. Leaving the field as it is fits.") : `Every cover fails the calendar check (${blocked.calendar.label.toLowerCase()}).`,
      decidingFactor: null, main: [], others: cands, confirmFirst: blocked.nextStep,
    };
  }

  if (goal === "not-sure") {
    const grass = viable.find((x) => x.strategy === "B");
    const legume = viable.find((x) => x.strategy === "C");
    const main = [grass, legume].filter((x): x is Candidate => !!x).map((x) => ({ ...x, status: (x.status === "suggested" ? "provisional" : x.status) as Status }));
    return {
      ...common, goal, kind: main.length === 2 ? "tie" : "one",
      headline: main.length === 2 ? `A grass or a legume: ${main[0].name.toLowerCase()} or ${main[1].name.toLowerCase()}` : `${main[0].name} fits your dates`,
      why: "Without a goal, Umbral does not pick between a grass and a legume: they do different jobs.",
      decidingFactor: main.length === 2 ? `What you want most for ${serviceTo}: nitrogen points to the legume; quick ground cover and fewer weeds point to the grass. Choose a goal.` : null,
      main, others: cands.filter((x) => !main.some((m) => m.id === x.id)), confirmFirst: first(main),
    };
  }

  const best = ORDER.find((m) => viable.some((x) => x.purpose.match === m))!;
  const top = viable.filter((x) => x.purpose.match === best);
  // Viable candidates outside the best match stay selectable: a partial match is a weaker documented service, not an incompatibility.
  const others = cands.filter((x) => !top.includes(x)).map((x) => (x.status === "not-on-these-dates" || x.status === "not-for-this-system" ? x : { ...x, status: (x.purpose.match === "partial" ? "partial-match" : "not-for-this-goal") as Status }));
  const g = goalLabel(goal, permanent).toLowerCase();
  if (best === "against" || best === "unassessed") {
    return {
      ...common, goal, kind: "none",
      headline: `No cover that fits matches "${g}"`,
      why: best === "against" ? "The covers that fit work against this goal in the cited guidance." : "The guidance used here does not assess this goal for the covers that fit.",
      decidingFactor: null, main: [], others: cands, confirmFirst: first(viable),
    };
  }
  const provisional = best === "partial" || goal === "productive-use";
  const main = top.map((x) => (provisional && x.status === "suggested" ? { ...x, status: "provisional" as Status } : x));
  const goalWhy: Record<Exclude<Goal, "not-sure">, string> = {
    "next-crop-n": permanent ? "Only a legume adds nitrogen from the air; how much reaches the standing crop is not known." : "Only a legume adds nitrogen from the air; grasses take up what is left in the soil and can hold it back.",
    "soil-cover": "Quick establishment and winter hardiness keep the ground covered.",
    weeds: "Covers that establish fast and shade or suppress weeds match this goal.",
    "productive-use": "A harvested or grazed use is possible in US guidance; removing the growth reduces what is left for the soil, and whether it pays is not calculated.",
  };
  return {
    ...common,
    goal,
    kind: top.length > 1 ? "tie" : "one",
    headline: `${listNames(top.map((x) => x.name))} for "${g}"`,
    why: goalWhy[goal],
    decidingFactor: top.length > 1 ? (permanent ? decide(top.map((x) => x.id), goal).replace(/the next crop/g, `the standing ${crop.name.toLowerCase()}`) : decide(top.map((x) => x.id), goal)) : null,
    main,
    others,
    confirmFirst: first(main),
  };
}

function listNames(n: string[]): string {
  const x = n.map((s, i) => (i === 0 ? s : s.charAt(0).toLowerCase() + s.slice(1)));
  return x.length <= 2 ? x.join(" or ") : `${x.slice(0, -1).join(", ")} or ${x[x.length - 1]}`;
}

/** What decides between equally matched covers. Fixed, sourced wording. */
export function decide(ids: CoverId[], goal: Goal): string {
  const has = (x: CoverId) => ids.includes(x);
  if (has("rye") && has("oat") && has("vetch-oat")) return "Two questions: whether the next crop needs nitrogen (only the mix adds some, through the vetch; rye residue holds nitrogen back for a while) and how cold your winter gets (rye is the hardiest cereal; hard cold can kill oats) (SARE).";
  if (has("vetch") && has("vetch-oat")) return "How early you can sow: vetch alone grows slowly in autumn; the oat in the mix covers the ground quickly and can help the vetch through winter (SARE).";
  if (has("rye") && has("vetch-oat")) return goal === "weeds" ? "Whether the next crop needs nitrogen: the mix adds some through the vetch; rye residue holds nitrogen back for a while (SARE)." : "Whether the next crop needs nitrogen: the vetch in the mix adds some; rye holds nitrogen back as it breaks down (SARE).";
  if (has("rye") && has("oat")) return "How cold your winter gets: rye is the hardiest cereal; hard cold can kill oats early (SARE).";
  return "Your own experience with each species on this plot.";
}
