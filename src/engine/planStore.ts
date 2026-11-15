/**
 * Saved plans: a versioned envelope with everything needed to reopen a plan as
 * it was (scenario, chosen field, climate settings, evidence choices) plus the
 * field notes that belong to it. Stored only in this browser.
 *
 * Version 1 (earlier builds) saved `{ name, savedAt, scenario }[]` under
 * "umbral:saved:v1" and notes globally under "umbral:observations:v1". Those
 * are migrated, never dropped: plans get "field: not recorded", global notes go
 * to an "Unassigned notes" list.
 */
import type { ClimateSettings } from "./exposure";
import type { ISODate } from "./dates";
import type { Scenario } from "./scenario";

export const PLANS_KEY = "umbral:plans:v2";
const V1_PLANS = "umbral:saved:v1";
const V1_NOTES = "umbral:observations:v1";

export interface Note {
  date: ISODate;
  text: string;
}

export interface PlanState {
  scenario: Scenario;
  /** Selected example (0-3), "cluster" for the four together, or null when not recorded (migrated v1 plans). */
  field: number | "cluster" | null;
  climate: ClimateSettings;
  /** Evidence choices at save time; satellite and weather values are evidence with their own dates, not live facts. */
  evidence: { imageId: string | null; followPlan: boolean; historyPeriod: [ISODate, ISODate] | null };
  /** The candidate whose calendar and comparison were shown (null: the first suggested). */
  activeCandidate: string | null;
  /** "incomplete" when a date field was being edited and the result shown was the last valid calculation. */
  inputState: "complete" | "incomplete";
}

export interface SavedPlan extends PlanState {
  version: 2;
  id: string;
  name: string;
  savedAt: string;
  notes: Note[];
}

export interface Store {
  plans: SavedPlan[];
  unassignedNotes: Note[];
  /** Stored entries that could not be read; kept as they were, never dropped. */
  unreadable?: unknown[];
}

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const isDate = (x: unknown) => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x);

/** Minimal schema check of a stored plan; anything else is kept aside as unreadable. */
export function readablePlan(x: unknown): boolean {
  if (!isObj(x) || typeof x.name !== "string" || !isObj(x.scenario)) return false;
  const s = x.scenario;
  return isDate(s.release) && isDate(s.nextCrop) && typeof s.previousCropId === "string" && typeof s.nextCropId === "string" && isObj(s.water);
}

function normalize(p: Record<string, unknown>, defaults: { climate: ClimateSettings; base: Scenario }): SavedPlan {
  const ev = isObj(p.evidence) ? p.evidence : {};
  const sc = p.scenario as Partial<Scenario>;
  return {
    version: 2,
    id: typeof p.id === "string" ? p.id : newId(),
    name: p.name as string,
    savedAt: typeof p.savedAt === "string" ? p.savedAt : new Date(0).toISOString(),
    scenario: { ...defaults.base, ...sc, system: sc.system ?? defaults.base.system, orchard: { ...defaults.base.orchard, ...(sc.orchard ?? {}) }, beds: { ...defaults.base.beds, ...(sc.beds ?? {}) } } as Scenario,
    field: p.field === "cluster" || typeof p.field === "number" ? (p.field as number | "cluster") : null,
    climate: isObj(p.climate) ? ({ ...defaults.climate, ...p.climate } as ClimateSettings) : defaults.climate,
    evidence: { imageId: typeof ev.imageId === "string" ? ev.imageId : null, followPlan: ev.followPlan === true, historyPeriod: Array.isArray(ev.historyPeriod) ? (ev.historyPeriod as [ISODate, ISODate]) : null },
    activeCandidate: typeof p.activeCandidate === "string" ? p.activeCandidate : null,
    inputState: p.inputState === "incomplete" ? "incomplete" : "complete",
    notes: Array.isArray(p.notes) ? (p.notes as Note[]).filter((n) => isObj(n) && isDate(n.date) && typeof n.text === "string") : [],
  };
}

export interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

function parse<T>(kv: KV, k: string): T | null {
  try {
    const v = kv.getItem(k);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}

const newId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Reads the store, migrating version-1 data when no version-2 store exists yet. */
export function loadStore(kv: KV, defaults: { climate: ClimateSettings; base: Scenario }): Store {
  const v2 = parse<{ plans?: unknown[]; unassignedNotes?: Note[]; unreadable?: unknown[] }>(kv, PLANS_KEY);
  if (v2 && Array.isArray(v2.plans)) {
    const ok = v2.plans.filter(readablePlan) as Record<string, unknown>[];
    const bad = v2.plans.filter((p) => !readablePlan(p));
    return { plans: ok.map((p) => normalize(p, defaults)), unassignedNotes: Array.isArray(v2.unassignedNotes) ? v2.unassignedNotes : [], unreadable: [...(v2.unreadable ?? []), ...bad] };
  }
  const oldRaw = parse<unknown[]>(kv, V1_PLANS) ?? [];
  const old = (Array.isArray(oldRaw) ? oldRaw : []).filter(readablePlan) as { name: string; savedAt: string; scenario: Scenario }[];
  const oldNotes = parse<Note[]>(kv, V1_NOTES) ?? [];
  const store: Store = {
    plans: old.map((p) => ({
      version: 2,
      id: newId(),
      name: p.name,
      savedAt: p.savedAt,
      scenario: { ...defaults.base, ...p.scenario, orchard: defaults.base.orchard, beds: defaults.base.beds, system: p.scenario.system ?? defaults.base.system },
      field: null,
      climate: defaults.climate,
      evidence: { imageId: null, followPlan: false, historyPeriod: null },
      activeCandidate: null,
      inputState: "complete" as const,
      notes: [],
    })),
    unassignedNotes: oldNotes,
    unreadable: (Array.isArray(oldRaw) ? oldRaw : []).filter((p) => !readablePlan(p)),
  };
  if (old.length || oldNotes.length) saveStore(kv, store);
  return store;
}

export function saveStore(kv: KV, st: Store): boolean {
  try {
    kv.setItem(PLANS_KEY, JSON.stringify(st));
    return true;
  } catch {
    return false;
  }
}

/** Adds or replaces (by name) a plan; notes already attached to a plan of that name are kept. */
export function upsertPlan(st: Store, name: string, state: PlanState, now = new Date().toISOString()): { store: Store; plan: SavedPlan } {
  const prev = st.plans.find((p) => p.name === name);
  const plan: SavedPlan = { version: 2, id: prev?.id ?? newId(), name, savedAt: now, ...state, notes: prev?.notes ?? [] };
  return { store: { ...st, plans: [plan, ...st.plans.filter((p) => p.name !== name)] }, plan };
}

/** Replace the open plan's contents, keeping its id, name and notes. An explicit action, never automatic. */
export function updatePlan(st: Store, id: string, state: PlanState, now = new Date().toISOString()): { store: Store; plan: SavedPlan } {
  const prev = st.plans.find((p) => p.id === id);
  if (!prev) throw new Error("Plan not found");
  const plan: SavedPlan = { ...prev, ...state, version: 2, savedAt: now };
  return { store: { ...st, plans: st.plans.map((p) => (p.id === id ? plan : p)) }, plan };
}

/** Save as a new plan; notes of the plan it came from are not copied. */
export function saveCopy(st: Store, name: string, state: PlanState, now = new Date().toISOString()): { store: Store; plan: SavedPlan } {
  let n = name;
  for (let k = 2; st.plans.some((p) => p.name === n); k++) n = `${name} (${k})`;
  const plan: SavedPlan = { version: 2, id: newId(), name: n, savedAt: now, ...state, notes: [] };
  return { store: { ...st, plans: [plan, ...st.plans] }, plan };
}

/** Comparable fingerprint of what a plan holds, for the "unsaved changes" indicator. */
export function fingerprint(state: Pick<PlanState, "scenario" | "field" | "climate" | "evidence" | "activeCandidate">): string {
  return JSON.stringify({ s: state.scenario, f: state.field, c: state.climate, e: state.evidence, a: state.activeCandidate });
}

export function addNote(st: Store, planId: string | null, note: Note): Store {
  if (!planId) return { ...st, unassignedNotes: [...st.unassignedNotes, note].sort((a, b) => a.date.localeCompare(b.date)) };
  return { ...st, plans: st.plans.map((p) => (p.id === planId ? { ...p, notes: [...p.notes, note].sort((a, b) => a.date.localeCompare(b.date)) } : p)) };
}

export function fieldLabel(f: SavedPlan["field"]): string {
  return f === null ? "field not recorded" : f === "cluster" ? "all four examples" : `Example P${f + 1}`;
}

/**
 * "Save a copy, then open": the copy must really be stored before another plan replaces
 * the one on screen. On a storage failure nothing changes and the caller does not open.
 */
export function saveCopyBeforeOpen(kv: KV, st: Store, name: string, state: PlanState): { ok: true; store: Store; plan: SavedPlan } | { ok: false } {
  const { store, plan } = saveCopy(st, name, state);
  return saveStore(kv, store) ? { ok: true, store, plan } : { ok: false };
}
