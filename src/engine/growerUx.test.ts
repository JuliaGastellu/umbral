import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { suggest, type Candidate, type Goal } from "./recommend";
import { demoScenario, evaluate, switchSystem, type Scenario } from "./scenario";
import { climateReading, DEFAULT_CLIMATE } from "./exposure";
import { buildPlanExport, planMarkdown } from "./planExport";
import { beforeSowing, defaultPlanName, isExampleDates, waterFact } from "./planText";
import { CROPS, cropById } from "./catalog";
import { loadStore, saveCopy, saveCopyBeforeOpen, type KV } from "./planStore";
import { summarize } from "../ui/ResultSummary";

const power = JSON.parse(readFileSync("public/data/power_daily.json", "utf8"));
const series = { startDate: power.startDate, tmin: power.tmin, tmean: power.tmean };
const cfg = { ...DEFAULT_CLIMATE, t: 0, d: 30 };
function run(s: Scenario, goal: Goal = s.goal) {
  const ev = evaluate(s);
  const by = { A: climateReading(ev, series, { ...cfg, strategy: "A" }), B: climateReading(ev, series, { ...cfg, strategy: "B" }), C: climateReading(ev, series, { ...cfg, strategy: "C" }) };
  const sug = suggest({ ...s, goal }, goal, by, ev, series);
  return { ev, sug, all: [...sug.main, ...sug.others, ...sug.experimental] };
}
const beds = (drip: "yes" | "no" | "unknown", plants: "retained" | "unknown" = "retained", area: "paths" | "none" | "unknown" = "paths"): Scenario => ({ ...demoScenario(), system: "beds", previousCropId: "strawberry", beds: { plants, mulch: "plastic", drip, area } });
const almond = (): Scenario => {
  const s = demoScenario();
  return { ...s, system: "orchard", previousCropId: "almond", goal: "next-crop-n", orchard: { ...s.orchard, age: "established", area: "interrow", waterReach: "no" }, context: { ...s.context, waterlogging: { kind: "yes", sector: "", duration: "" }, salinity: { kind: "reported" } } };
};

describe("F1: drip on the beds is not water reaching the paths", () => {
  for (const drip of ["yes", "no", "unknown"] as const) {
    it(`kept beds, paths, drip ${drip}: the input is shown as drip; path water stays not confirmed (screen, JSON, Markdown)`, () => {
      const s = beds(drip);
      const w = waterFact(s);
      expect(w.headline).toBe(`Drip on the beds: ${drip === "unknown" ? "Not sure" : drip === "yes" ? "Yes" : "No"}.`);
      expect(w.detail).toMatch(/Water reaching the paths: not confirmed/);
      expect(`${w.headline} ${w.detail}`).not.toMatch(/reaching the (paths|cover area): (yes|no)\b/i);
      const r = run(s);
      const doc = buildPlanExport({ s, ev: r.ev, sug: r.sug, active: r.sug.main[0] ?? r.all[0], series, cfg, station: null, fieldLabel: "x", hls: null });
      expect(doc.plan.crops.dripOnBeds).toBe(drip);
      expect(doc.plan.crops.waterReachingCoverArea).toMatch(/not confirmed/);
      const md = planMarkdown(doc);
      expect(md).toMatch(/- Drip on the beds: (yes|no|not sure)/);
      expect(md).toMatch(/- Water for a cover there: Water reaching the paths: not confirmed/);
    });
  }
  it("no free area or an unstated area keeps the uncertainty instead of inventing an answer", () => {
    expect(waterFact(beds("yes", "retained", "none")).detail).toMatch(/not assessed/);
    expect(waterFact(beds("yes", "retained", "unknown")).detail).toMatch(/not stated.*not confirmed/);
  });
  it("orchard wording keeps using water reaching the area; annual has no such statement", () => {
    expect(waterFact(almond()).headline).toBe("Irrigation water reaching the interrow: No.");
    expect(waterFact(demoScenario()).headline).toBe("");
  });
});

describe("F2: every blocking condition of the active candidate is visible", () => {
  it("almond, no water, waterlogging and salinity: three checks, first is the next check, no duplicates; dates unchanged", () => {
    const r = run(almond());
    const vetch = r.all.find((c) => c.id === "vetch")!;
    const b = beforeSowing(vetch, r.sug);
    const texts = b.all.map((k) => k.text).join(" | ");
    expect(texts).toMatch(/No irrigation water reaches this area/);
    expect(texts).toMatch(/Waterlogging reported/);
    expect(texts).toMatch(/Salinity: reported/);
    expect(b.all).toHaveLength(3);
    expect(b.next).toBe(b.all[0].text);
    expect(b.also).toHaveLength(2);
    expect(new Set(b.all.map((k) => k.text)).size).toBe(b.all.length);
    const plain = run({ ...almond(), context: demoScenario().context });
    expect(vetch.calendar).toEqual(plain.all.find((c) => c.id === "vetch")!.calendar);
  });
  it("the list follows the active candidate, adds shared checks once and keeps distinct issues of the same kind", () => {
    const s = { ...almond(), access: "can-agree" as const };
    const r = run(s);
    for (const id of ["vetch", "oat", "pea"]) {
      const c = r.all.find((x) => x.id === id)!;
      const b = beforeSowing(c, r.sug);
      expect(b.all.filter((k) => k.kind === "access")).toHaveLength(1);
      expect(b.all.filter((k) => k.kind === "soil")).toHaveLength(2);
      for (const k of c.checks.filter((x) => x.blocking)) expect(b.all.some((y) => y.text === k.text)).toBe(true);
    }
    const dup: Candidate = { ...r.all[0], checks: [...r.all[0].checks, ...r.all[0].checks] };
    expect(beforeSowing(dup, r.sug).all).toHaveLength(beforeSowing(r.all[0], r.sug).all.length);
  });
  it("the export carries the same list; Markdown shows the next check and 'Also before sowing (2)'", () => {
    const s = almond();
    const r = run(s);
    const active = r.all.find((c) => c.id === "vetch")!;
    const doc = buildPlanExport({ s, ev: r.ev, sug: r.sug, active, series, cfg, station: null, fieldLabel: "x", hls: null });
    expect((doc.selectedCandidate as any).beforeSowing.map((k: any) => k.text)).toEqual(beforeSowing(active, r.sug).all.map((k) => k.text));
    const md = planMarkdown(doc);
    expect(md).toContain(`- Next check: ${beforeSowing(active, r.sug).next}`);
    expect(md).toContain("- Also before sowing (2):");
  });
  it("with nothing blocking, the next step is the candidate's own and nothing is listed below it", () => {
    const s = { ...demoScenario(), system: "orchard" as const, previousCropId: "almond", orchard: { ...demoScenario().orchard, age: "established" as const, waterReach: "yes" as const } };
    const r = run(s, "next-crop-n");
    const b = beforeSowing(r.sug.main[0], r.sug);
    expect(b.all).toHaveLength(0);
    expect(b.also).toHaveLength(0);
    expect(b.next).toBe(r.sug.main[0].nextStep);
  });
});

describe("F3 / S2: the compact result summary", () => {
  it("names the candidate, status and number of checks; incomplete input says it is the last valid result", () => {
    const r = run(almond());
    const v = r.all.find((c) => c.id === "vetch")!;
    const st = summarize(v, r.sug, beforeSowing(v, r.sug), true);
    expect(st).toMatchObject({ title: "Hairy vetch", status: "Conditional: check first", checks: "3 checks before sowing", tone: "cond" });
    expect(st.note).toMatch(/last valid result/);
  });
  it("no fit is a warning, and an exploratory selection is not reported as 'no candidate'", () => {
    const late = run({ ...demoScenario(), release: "2027-06-20" });
    const none = summarize(null, late.sug, { all: [] }, false);
    expect(none.tone).toBe("warn");
    expect(none.status).toBe("No option fits these inputs");
    const empty = { ...late.sug, main: [] };
    const pea = run(demoScenario()).all.find((c) => c.id === "pea")!;
    const exploring = summarize(pea, empty, { all: [] }, false);
    expect(exploring.tone).toBe("warn");
    expect(exploring.title).toBe("Winter field pea");
    expect(exploring.status).toMatch(/^No main option fits · exploring/);
  });
});

describe("F4: example labels and plan names", () => {
  it("names say scenario, year and evidence for every system and selection", () => {
    const annual = { ...demoScenario(), previousCropId: "maize", nextCropId: "onion" };
    expect(defaultPlanName(annual, 1)).toBe("Maize → Onion · 2027 · evidence: example P2");
    expect(defaultPlanName(annual, "cluster")).toBe("Maize → Onion · 2027 · evidence: all four examples");
    expect(defaultPlanName(annual, null)).toBe("Maize → Onion · 2027 · no example chosen");
    expect(defaultPlanName({ ...almond() }, 1)).toBe("Almond interrow · 2027 · evidence: example P2");
    expect(defaultPlanName(beds("yes"), 0)).toBe("Strawberry beds, paths · 2027 · evidence: example P1");
    expect(defaultPlanName(beds("yes", "unknown"), 0)).toBe("Strawberry beds, paths (plants: not sure) · 2027 · evidence: example P1");
    expect(defaultPlanName({ ...beds("yes"), beds: { ...beds("yes").beds, plants: "removed" }, nextCropId: "onion" }, 0)).toBe("Strawberry → Onion · 2027 · evidence: example P1");
  });
  it("prefilled dates are marked as examples until the person edits one", () => {
    expect(isExampleDates(demoScenario())).toBe(true);
    expect(isExampleDates({ ...demoScenario(), release: "2027-04-12" })).toBe(false);
    expect(isExampleDates({ ...demoScenario(), water: { ...demoScenario().water, lastTurn: null } })).toBe(false);
    expect(isExampleDates(almond())).toBe(true);
    expect(isExampleDates({ ...almond(), orchard: { ...almond().orchard, window: ["2027-04-05", "2027-09-15"] } })).toBe(false);
  });
  it("custom plan names are kept as typed", () => {
    const st = loadStore(mem(), { climate: DEFAULT_CLIMATE, base: demoScenario() });
    const { plan } = saveCopy(st, "North block, my plan", { scenario: demoScenario(), field: 1, climate: DEFAULT_CLIMATE, evidence: { imageId: null, followPlan: false, historyPeriod: null }, activeCandidate: "oat", inputState: "complete" });
    expect(plan.name).toBe("North block, my plan");
  });
});

function mem(fail = false): KV & { data: Record<string, string> } {
  const data: Record<string, string> = {};
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => { if (fail) throw new Error("quota"); data[k] = v; } };
}
const fits = (id: string, sys: Scenario["system"]) => cropById(id).system === sys;
const firstFor = (sys: Scenario["system"], avoid: string) => (CROPS.find((c) => c.system === sys && c.id !== avoid) ?? CROPS.find((c) => c.system === sys)!).id;

describe("S1: switching production system keeps each system's crop", () => {
  it("Maize → Onion survives annual → orchard → annual; the orchard crop survives too; dates and goal untouched", () => {
    const a = { ...demoScenario(), previousCropId: "maize", nextCropId: "onion", goal: "weeds" as const };
    const o = switchSystem(a, "orchard", firstFor, fits);
    expect(o.previousCropId).not.toBe("maize");
    const o2 = { ...o, previousCropId: "almond" };
    const back = switchSystem(o2, "annual", firstFor, fits);
    expect(back.previousCropId).toBe("maize");
    expect(back.nextCropId).toBe("onion");
    expect(back.release).toBe(a.release);
    expect(back.goal).toBe("weeds");
    expect(switchSystem(back, "orchard", firstFor, fits).previousCropId).toBe("almond");
  });
  it("a reopened plan uses its own remembered crops, not another plan's", () => {
    const planB = { ...demoScenario(), previousCropId: "squash", nextCropId: "tomato" }; // saved before the memory existed
    expect(planB.cropsBySystem).toBeUndefined();
    const back = switchSystem(switchSystem(planB, "orchard", firstFor, fits), "annual", firstFor, fits);
    expect(back.previousCropId).toBe("squash");
  });
});

describe("S5: save a copy before opening another plan", () => {
  const state = { scenario: demoScenario(), field: 1 as const, climate: DEFAULT_CLIMATE, evidence: { imageId: null, followPlan: false, historyPeriod: null }, activeCandidate: "vetch", inputState: "complete" as const };
  it("stores the copy, then reports success", () => {
    const kv = mem();
    const st = loadStore(kv, { climate: DEFAULT_CLIMATE, base: demoScenario() });
    const r = saveCopyBeforeOpen(kv, st, "Work in progress", state);
    expect(r.ok).toBe(true);
    if (r.ok) expect(loadStore(kv, { climate: DEFAULT_CLIMATE, base: demoScenario() }).plans.map((p) => p.name)).toEqual(["Work in progress"]);
  });
  it("a storage failure reports failure and changes nothing, so the caller does not open", () => {
    const kv = mem(true);
    const st = loadStore(kv, { climate: DEFAULT_CLIMATE, base: demoScenario() });
    const r = saveCopyBeforeOpen(kv, st, "Work in progress", state);
    expect(r.ok).toBe(false);
    expect(st.plans).toHaveLength(0);
  });
});

describe("S3 / S7 / S14: system-aware wording and readable exports", () => {
  it("a standing crop is never called the next crop in the deciding factor", () => {
    for (const goal of ["weeds", "soil-cover", "next-crop-n"] as Goal[]) {
      const r = run({ ...almond(), context: demoScenario().context, orchard: { ...almond().orchard, waterReach: "yes" } }, goal);
      expect(`${r.sug.headline} ${r.sug.why} ${r.sug.decidingFactor ?? ""}`).not.toMatch(/next crop/);
    }
  });
  it("the mixture's trade-off is a sourced limitation, not its benefit restated", () => {
    for (const goal of ["next-crop-n", "weeds", "soil-cover"] as Goal[]) {
      const mix = run(demoScenario(), goal).all.find((c) => c.id === "vetch-oat")!;
      expect(mix.tradeoff).not.toBe(mix.benefit);
      expect(mix.tradeoff).not.toMatch(/depends on its share of vetch/);
    }
  });
  it("Markdown uses plain labels while JSON keeps its keys", () => {
    const s = { ...demoScenario(), previousCropId: "maize", nextCropId: "onion" };
    const r = run(s);
    const doc = buildPlanExport({ s, ev: r.ev, sug: r.sug, active: r.sug.main[0], series, cfg, station: null, fieldLabel: "x", hls: null });
    expect(Object.keys(doc.plan.crops)).toEqual(["cropJustHarvested", "nextCrop", "nextCropDate", "fieldFree", "soilReady"]);
    const md = planMarkdown(doc);
    expect(md).toMatch(/- Crop just harvested: Maize/);
    expect(md).toMatch(/- Next crop planting: 15 Oct 2027/);
    expect(md).not.toMatch(/cropJustHarvested|nextCropDate/);
    expect(md).toMatch(/including any unsaved changes/);
  });
});

describe("F3: typing a date never turns a partial year into a plan date", () => {
  it("the years a browser produces while typing 2027 are not accepted; real plan years are", async () => {
    const { isPlanDate } = await import("./dates");
    for (const partial of ["0002-06-20", "0020-06-20", "0202-06-20"]) expect(isPlanDate(partial)).toBe(false);
    expect(isPlanDate("2027-06-20")).toBe(true);
    expect(isPlanDate("2027-02-30")).toBe(false);
  });
});
