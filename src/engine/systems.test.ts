import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { candidateScenario, suggest, type Goal } from "./recommend";
import { demoScenario, evaluate, type Scenario } from "./scenario";
import { climateReading, DEFAULT_CLIMATE } from "./exposure";
import { compareDates } from "./compare";
import { cropById, CROPS } from "./catalog";
import { speciesClimate } from "./species";

const power = JSON.parse(readFileSync("public/data/power_daily.json", "utf8"));
const series = { startDate: power.startDate, tmin: power.tmin, tmean: power.tmean };
function run(s: Scenario, goal: Goal = s.goal, withSeries = true) {
  const ev = evaluate(s);
  const by = { A: climateReading(ev, series, { ...DEFAULT_CLIMATE, strategy: "A" }), B: climateReading(ev, series, { ...DEFAULT_CLIMATE, strategy: "B" }), C: climateReading(ev, series, { ...DEFAULT_CLIMATE, strategy: "C" }) };
  return suggest(s, goal, by, ev, withSeries ? series : null);
}
const all = (r: ReturnType<typeof run>) => [...r.main, ...r.others, ...r.experimental];
const orchard = (cropId: string, patch: Partial<Scenario["orchard"]> = {}): Scenario => ({ ...demoScenario(), system: "orchard", previousCropId: cropId, orchard: { ...demoScenario().orchard, ...patch } });

describe("catalogue", () => {
  it("never falls back to tomato for an unknown or other crop, and keeps its name", () => {
    expect(cropById("other:Asparagus").name).toBe("Asparagus");
    expect(cropById("other:Asparagus").families).toEqual(["unknown"]);
    expect(cropById("not-a-crop").name).not.toMatch(/Tomato/);
  });
  it("lists the requested commercial crops with systems; pecan and walnut are distinct; citrus evergreen", () => {
    for (const id of ["apple", "pear", "peach", "nectarine", "plum", "cherry", "apricot", "almond", "pecan", "walnut", "strawberry", "orange", "mandarin", "lemon", "grapefruit"]) expect(CROPS.some((c) => c.id === id)).toBe(true);
    expect(cropById("pecan").species).not.toBe(cropById("walnut").species);
    expect(cropById("orange").leaf).toBe("evergreen");
    expect(cropById("apple").system).toBe("orchard");
    expect(cropById("strawberry").system).toBe("beds");
    expect(cropById("lemon").presence).toMatch(/no Alto Valle source verified/);
  });
});

describe("production systems", () => {
  it("orchard: harvest never frees the plot; the cover serves the standing crop", () => {
    const r = run(orchard("apple"));
    expect(r.serviceTo).toMatch(/standing apple/);
    expect(r.baseline.calendar).toBe("The trees stay");
    for (const c of all(r)) expect(c.calendar.label).not.toMatch(/field free/i);
    expect(JSON.stringify(r)).not.toMatch(/until soil preparation/);
  });
  it("orchard: unknown water reach, young trees and the tree row are blocking reviews", () => {
    const r = run(orchard("pear", { waterReach: "unknown", age: "young", area: "tree-row" }));
    const texts = all(r).flatMap((c) => c.checks.filter((k) => k.blocking).map((k) => k.text)).join(" ");
    expect(texts).toMatch(/drip on the tree row does not water it/);
    expect(texts).toMatch(/Young trees/);
    expect(texts).toMatch(/tree row a cover competes directly/);
    expect(r.main.every((c) => c.status !== "suggested")).toBe(true);
  });
  it("almond with vetch counts as a local study in this system; apple does not", () => {
    const almond = run(orchard("almond", { waterReach: "yes", age: "established" }), "next-crop-n");
    const apple = run(orchard("apple", { waterReach: "yes", age: "established" }), "next-crop-n");
    expect(almond.main.find((c) => c.id === "vetch")!.confidence).toBe("local-system");
    expect(apple.main.find((c) => c.id === "vetch")!.confidence).toBe("regional-other");
  });
  it("citrus: evergreen note, and the bell bean citrus caution for legume mixes", () => {
    const r = run(orchard("lemon"), "next-crop-n");
    const notes = all(r).flatMap((c) => c.checks.map((k) => k.text)).join(" ");
    expect(notes).toMatch(/Evergreen crop: no winter dormancy is assumed/);
    expect(notes).toMatch(/may not supply all the nitrogen the trees need/);
  });
  it("strawberry beds kept: occupied; only a stated area is evaluated; removed: annual rotation", () => {
    const kept: Scenario = { ...demoScenario(), system: "beds", previousCropId: "strawberry", beds: { plants: "retained", mulch: "plastic", drip: "yes", area: "unknown" } };
    const r = run(kept);
    expect(r.baseline.calendar).toBe("Beds stay occupied");
    expect(all(r).every((c) => c.checks.some((k) => k.kind === "system" && k.blocking))).toBe(true);
    const removed = run({ ...kept, beds: { ...kept.beds, plants: "removed" } });
    expect(removed.baseline.calendar).toMatch(/days until soil preparation/);
  });
});

describe("experimental species and nutrient mechanisms", () => {
  it("researched species stay Experimental candidate and are listed apart", () => {
    const r = run(demoScenario(), "next-crop-n");
    expect(r.main.some((c) => ["pea", "faba", "radish", "buckwheat", "clover"].includes(c.id))).toBe(false);
    const pea = r.experimental.find((c) => c.id === "pea")!;
    expect(["experimental", "not-on-these-dates"]).toContain(pea.status);
    expect(pea.confidence).toBe("experimental");
  });
  it("strawberry clover is perennial: not for an annual gap", () => {
    expect(run(demoScenario()).experimental.find((c) => c.id === "clover")!.status).toBe("not-for-this-system");
  });
  it("radish captures existing N and is not a fixer; buckwheat may recycle P but does not create it", () => {
    const r = run(demoScenario(), "next-crop-n");
    const radish = r.experimental.find((c) => c.id === "radish")!;
    expect(radish.nutrient).toBe("takes up existing soil N");
    expect(radish.nChain![1].step).toMatch(/does not fix it/);
    expect(r.experimental.find((c) => c.id === "buckwheat")!.nutrient).toMatch(/does not create it/);
    expect(r.main.find((c) => c.id === "vetch")!.nChain!.map((x) => x.status).slice(3)).toEqual(["not modelled", "not modelled"]);
  });
  it("buckwheat is ruled out for a cold window by a sourced frost condition computed from NASA POWER", () => {
    const b = run(demoScenario()).experimental.find((c) => c.id === "buckwheat")!;
    expect(b.status).toBe("not-on-these-dates");
    expect(b.speciesClimate.effect).toBe("rules out");
    expect(b.dimensions.find((d) => d.key === "climate")!.provenance.kind).toBe("reanalysis (NASA POWER)");
  });
  it("changing the sowing date recalculates the NASA-based species test", () => {
    const a = speciesClimate("radish", "2027-03-01", "2027-09-10", series);
    const b = speciesClimate("radish", "2027-05-20", "2027-09-10", series);
    expect(a.met).not.toBe(b.met);
    expect(speciesClimate("radish", "2027-03-01", "2027-09-10", null).effect).toBe("review");
  });
  it("no forecast is fabricated and coarse signals are never labelled as plot measurements", () => {
    const r = run(demoScenario(), "next-crop-n");
    const prov = all(r).flatMap((c) => c.dimensions.map((d) => d.provenance));
    expect(JSON.stringify(prov)).not.toMatch(/forecast/i);
    for (const p of prov.filter((x) => x.kind === "reanalysis (NASA POWER)")) expect(p.scope).toMatch(/Regional grid/);
    expect(prov.some((p) => p.kind === "your input" && /not measured here/.test(p.missing ?? ""))).toBe(true);
  });
});

describe("active candidate", () => {
  it("the candidate scenario carries the selected variant and its own interval into the date comparison", () => {
    const s = demoScenario();
    const oat = candidateScenario(s, "oat");
    expect(oat.strategy).toBe("B");
    expect(oat.scenario.covers.B.variantId).toBe("oat");
    expect(oat.scenario.covers.B.terminationDays).toBe(21);
    const rye = candidateScenario(s, "rye");
    const cOat = compareDates(oat.scenario, "2027-03-25");
    const cRye = compareDates(rye.scenario, "2027-03-25");
    expect(cOat.plan.B.availableDays).not.toBe(cRye.plan.B.availableDays);
    expect(cOat.plan.B.availableDays).toBe(153);
  });

  it("orchard and kept-bed wording never calls the standing crop a following crop", () => {
    const r = run(orchard("apple", { waterReach: "yes", age: "established" }), "next-crop-n");
    const text = JSON.stringify([...r.main, ...r.others, ...r.experimental].map((c) => [c.benefit, c.purpose.reasons]));
    expect(text).not.toMatch(/following (cash )?crop|the next crop/);
    expect(text).toMatch(/standing apple/);
    expect(text).toMatch(/competition for water and nitrogen is the main risk/);
    expect(`${r.headline} ${r.why}`).not.toMatch(/next crop/);
    expect(run(demoScenario(), "next-crop-n").headline).toMatch(/prepare the next crop/);
  });
});
