import { describe, expect, it } from "vitest";
import { addNote, fingerprint, loadStore, PLANS_KEY, saveCopy, saveStore, updatePlan, upsertPlan, type KV } from "./planStore";
import { demoScenario } from "./scenario";
import { DEFAULT_CLIMATE } from "./exposure";

function mem(init: Record<string, string> = {}): KV & { data: Record<string, string> } {
  const data = { ...init };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
}
const defaults = { climate: DEFAULT_CLIMATE, base: demoScenario() };

describe("saved plans", () => {
  it("saves and restores the complete plan: scenario, field, climate settings and evidence choices", () => {
    const kv = mem();
    const s = { ...demoScenario(), goal: "weeds" as const, release: "2027-03-25" };
    const state = { scenario: s, field: 1 as const, climate: { ...DEFAULT_CLIMATE, t: -2, d: 21 }, evidence: { imageId: "img-1", followPlan: true, historyPeriod: ["2026-01-05", "2026-02-05"] as [string, string] }, activeCandidate: "oat", inputState: "complete" as const };
    const { store, plan } = upsertPlan(loadStore(kv, defaults), "North plot 2027", state, "2026-11-14T20:00:00Z");
    saveStore(kv, addNote(store, plan.id, { date: "2027-04-12", text: "Vetch sown" }));
    const back = loadStore(kv, defaults).plans[0];
    expect(back.scenario.goal).toBe("weeds");
    expect(back.scenario.release).toBe("2027-03-25");
    expect(back.field).toBe(1);
    expect(back.climate).toMatchObject({ t: -2, d: 21 });
    expect(back.evidence).toEqual(state.evidence);
    expect(back.activeCandidate).toBe("oat");
    expect(back.notes).toEqual([{ date: "2027-04-12", text: "Vetch sown" }]);
  });

  it("migrates version-1 saves and global notes without losing them", () => {
    const v1 = [{ name: "Old plan", savedAt: "2026-11-01T00:00:00Z", scenario: { ...demoScenario(), release: "2027-03-15" } }];
    const kv = mem({ "umbral:saved:v1": JSON.stringify(v1), "umbral:observations:v1": JSON.stringify([{ date: "2026-10-01", text: "Canal turn received" }]) });
    const st = loadStore(kv, defaults);
    expect(st.plans).toHaveLength(1);
    expect(st.plans[0]).toMatchObject({ version: 2, name: "Old plan", field: null });
    expect(st.plans[0].scenario.release).toBe("2027-03-15");
    expect(st.plans[0].scenario.goal).toBeDefined(); // new fields filled from defaults
    expect(st.unassignedNotes).toEqual([{ date: "2026-10-01", text: "Canal turn received" }]);
    expect(kv.data[PLANS_KEY]).toBeTruthy();
    expect(kv.data["umbral:saved:v1"]).toBeTruthy(); // originals are left in place
  });

  it("re-saving under the same name keeps that plan's notes", () => {
    const kv = mem();
    const st0 = loadStore(kv, defaults);
    const state = { scenario: demoScenario(), field: "cluster" as const, climate: DEFAULT_CLIMATE, evidence: { imageId: null, followPlan: false, historyPeriod: null }, activeCandidate: null, inputState: "complete" as const };
    const a = upsertPlan(st0, "A", state);
    const withNote = addNote(a.store, a.plan.id, { date: "2027-05-01", text: "x" });
    const b = upsertPlan(withNote, "A", { ...state, field: 2 });
    expect(b.store.plans).toHaveLength(1);
    expect(b.plan.notes).toHaveLength(1);
    expect(b.plan.field).toBe(2);
  });

  it("broken storage does not throw", () => {
    const kv: KV = { getItem: () => "{not json", setItem: () => { throw new Error("full"); } };
    expect(loadStore(kv, defaults)).toMatchObject({ plans: [], unassignedNotes: [] });
    expect(saveStore(kv, { plans: [], unassignedNotes: [] })).toBe(false);
  });

  it("update keeps the plan and its notes; save a copy starts without notes; changes are detectable", () => {
    const kv = mem();
    const base = { scenario: demoScenario(), field: 1 as const, climate: DEFAULT_CLIMATE, evidence: { imageId: null, followPlan: false, historyPeriod: null }, activeCandidate: "vetch", inputState: "complete" as const };
    const a = upsertPlan(loadStore(kv, defaults), "P2 plan", base);
    const withNote = addNote(a.store, a.plan.id, { date: "2027-04-12", text: "Vetch sown" });
    const changed = { ...base, field: 2 as const };
    expect(fingerprint(changed)).not.toBe(fingerprint(base));
    const copy = saveCopy(withNote, "P2 plan", changed);
    expect(copy.plan.name).toBe("P2 plan (2)");
    expect(copy.plan.notes).toEqual([]);
    expect(copy.store.plans.find((p) => p.id === a.plan.id)!.field).toBe(1);
    const up = updatePlan(withNote, a.plan.id, changed);
    expect(up.plan.field).toBe(2);
    expect(up.plan.notes).toHaveLength(1);
  });

  it("unreadable stored entries are kept aside, readable ones load, new fields get defaults", () => {
    const sc: Record<string, unknown> = { ...demoScenario() };
    delete sc.system; delete sc.orchard;
    const good = { version: 2, id: "x", name: "Good", savedAt: "2026-11-14T00:00:00Z", scenario: sc, field: 0, notes: [] };
    const kv = mem({ [PLANS_KEY]: JSON.stringify({ plans: [good, { name: 3 }, "junk"], unassignedNotes: [] }) });
    const st = loadStore(kv, defaults);
    expect(st.plans.map((p) => p.name)).toEqual(["Good"]);
    expect(st.plans[0].scenario.system).toBe("annual");
    expect(st.plans[0].scenario.orchard.waterReach).toBe("unknown");
    expect(st.plans[0].activeCandidate).toBeNull();
    expect(st.unreadable).toHaveLength(2);
  });
});
