import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { suggest, type Goal } from "./recommend";
import { demoScenario, evaluate, type Scenario } from "./scenario";
import { climateReading, DEFAULT_CLIMATE } from "./exposure";

const power = JSON.parse(readFileSync("public/data/power_daily.json", "utf8"));
const series = { startDate: power.startDate, tmin: power.tmin, tmean: power.tmean };
function run(s: Scenario, goal: Goal) {
  const ev = evaluate(s);
  const by = { A: climateReading(ev, series, { ...DEFAULT_CLIMATE, strategy: "A" }), B: climateReading(ev, series, { ...DEFAULT_CLIMATE, strategy: "B" }), C: climateReading(ev, series, { ...DEFAULT_CLIMATE, strategy: "C" }) };
  return suggest(s, goal, by, ev, series);
}
const json = (x: unknown) => JSON.stringify(x);

describe("cover suggestion", () => {
  it("nitrogen goal points to the legume covers and explains why grasses do not", () => {
    const r = run(demoScenario(), "next-crop-n");
    expect(r.main.map((c) => c.id).sort()).toEqual(["vetch", "vetch-oat"]);
    expect(r.kind).toBe("tie");
    expect(r.decidingFactor).toMatch(/How early you can sow/);
    expect(r.why).toMatch(/Only a legume adds nitrogen/);
    expect(r.others.find((c) => c.id === "rye")!.purpose.match).toBe("against");
  });

  it("changing the goal changes the reasoning, not the dates or water", () => {
    const s = demoScenario();
    const n = run(s, "next-crop-n");
    const w = run(s, "weeds");
    expect(w.main.map((c) => c.id)).toContain("rye");
    expect(w.main.map((c) => c.id)).not.toContain("vetch");
    expect(w.headline).toBe('Cereal rye, oat or hairy vetch + oat for "hold back weeds"');
    expect(w.decidingFactor).toMatch(/Two questions/);
    const cal = (x: typeof n) => [...x.main, ...x.others].map((c) => [c.id, c.calendar.state, c.calendar.availableDays, c.calendar.turns]).sort();
    expect(cal(w)).toEqual(cal(n));
  });

  it("the next crop changes the explanation", () => {
    const s = demoScenario();
    const tomato = run(s, "next-crop-n");
    const maize = run({ ...s, nextCropId: "maize" }, "next-crop-n");
    expect(json(tomato.main)).toMatch(/transplanted early-summer crops such as tomato/);
    expect(json(maize.main)).toMatch(/partly replace nitrogen fertiliser for maize/);
    expect(json(maize.main)).not.toMatch(/tomato/);
  });

  it("a cover that fails the calendar is never suggested", () => {
    const s = demoScenario();
    const late: Scenario = { ...s, release: "2027-05-10", covers: { B: { ...s.covers.B, sowing: "2027-05-10" }, C: { ...s.covers.C, sowing: "2027-05-10" } } };
    const r = run(late, "next-crop-n");
    expect(r.kind).toBe("none");
    expect(r.main).toHaveLength(0);
    expect(r.headline).toMatch(/No winter cover fits/);
    expect(r.others.every((c) => c.status === "not-on-these-dates")).toBe(true);
  });

  it("an unknown last canal turn makes the suggestion provisional, not hidden", () => {
    const s = demoScenario();
    const r = run({ ...s, water: { ...s.water, lastTurn: null, frequencyDays: null } }, "next-crop-n");
    expect(r.main.length).toBeGreaterThan(0);
    expect(r.main.every((c) => c.status === "provisional")).toBe(true);
    expect(r.main[0].calendar.state).toBe("needs-data");
  });

  it("not sure: shows a grass and a legume and asks for the goal instead of picking", () => {
    const r = run(demoScenario(), "not-sure");
    expect(r.kind).toBe("tie");
    expect(r.main.map((c) => c.strategy).sort()).toEqual(["B", "C"]);
    expect(r.main.every((c) => c.status !== "suggested")).toBe(true);
    expect(r.decidingFactor).toMatch(/Choose a goal/);
  });

  it("productive use is qualitative, provisional and accounts for removal", () => {
    const r = run(demoScenario(), "productive-use");
    expect(r.main.map((c) => c.id).sort()).toEqual(["oat", "rye"]);
    expect(r.main.every((c) => c.status === "provisional")).toBe(true);
    expect(json(r.main)).toMatch(/removes/);
    expect(r.others.find((c) => c.id === "vetch")!.productiveUse.kind).toBe("not supported");
  });

  it("never states money, nitrogen amounts or yields", () => {
    for (const g of ["next-crop-n", "soil-cover", "weeds", "productive-use", "not-sure"] as Goal[]) {
      const t = json(run(demoScenario(), g));
      expect(t).not.toMatch(/\$|\bARS\b|\bUSD\b|profit|\bROI\b|saving|\bkg\b|t\/ha|\blb\b/i);
    }
  });

  it("a killing-frost rule is not invented from the 0 °C count", () => {
    const r = run(demoScenario(), "next-crop-n");
    const k = r.main[0].checks.find((c) => c.kind === "species")!;
    expect(k.text).toMatch(/no killing temperature is given, so no test is applied/);
    expect(k.blocking).toBe(false);
  });

  it("every species reason names a source or says it is an app rule", () => {
    const r = run(demoScenario(), "weeds");
    for (const c of [...r.main, ...r.others]) for (const x of c.purpose.reasons) expect(x.sourceId !== null || x.where === "app rule").toBe(true);
  });

  it("never suggests a living cover with zero days available", () => {
    const s = demoScenario();
    const z: Scenario = { ...s, release: "2027-09-10", nextCrop: "2027-10-15", preparationDays: 14,
      covers: { B: { ...s.covers.B, sowing: "2027-09-10", terminationDays: 21 }, C: { ...s.covers.C, sowing: "2027-09-10", terminationDays: 21 } },
      water: { ...s.water, closure: "2027-10-01", lastTurn: "2027-09-20" } };
    const r = run(z, "next-crop-n");
    expect(r.main).toHaveLength(0);
    for (const c of r.others) {
      expect(c.calendar.availableDays).toBe(0);
      expect(c.status).toBe("not-on-these-dates");
    }
    expect(r.why).toMatch(/no days/);
  });

  it("unread past weather keeps the goal match but makes the candidates conditional", () => {
    const r = suggest(demoScenario(), "next-crop-n", { A: null, B: null, C: null });
    expect(r.main.map((c) => c.id).sort()).toEqual(["vetch", "vetch-oat"]);
    expect(r.main.every((c) => c.purpose.match === "supports")).toBe(true);
    expect(r.main.every((c) => c.status === "provisional" && !c.climateAssessed)).toBe(true);
    expect(r.climateAssessed).toBe(false);
    expect(r.confirmFirst).toMatch(/Past cold nights/);
  });

  it("reported waterlogging triggers a prior review without changing the dates", () => {
    const s = demoScenario();
    const wet: Scenario = { ...s, context: { ...s.context, waterlogging: { kind: "yes", sector: "the whole plot", duration: "all winter" } } };
    const a = run(s, "next-crop-n");
    const b = run(wet, "next-crop-n");
    expect(b.main.every((c) => c.status === "provisional")).toBe(true);
    expect(b.confirmFirst).toMatch(/^Review first: Waterlogging reported in the whole plot/);
    expect(b.main.map((c) => c.calendar.availableDays)).toEqual(a.main.map((c) => c.calendar.availableDays));
  });

  it("plot access: someone else or agreement pending makes every option conditional", () => {
    const s = demoScenario();
    for (const access of ["someone-else", "can-agree"] as const) {
      const r = run({ ...s, access }, "next-crop-n");
      expect(r.sharedChecks[0].kind).toBe("access");
      expect(r.main.length).toBeGreaterThan(0);
      expect(r.main.every((c) => c.status === "provisional")).toBe(true);
      expect(r.confirmFirst).toBe(r.sharedChecks[0].text);
    }
    expect(run(s, "next-crop-n").sharedChecks).toHaveLength(0);
  });

  it("keeps a user's termination setting for the other variant of the group and labels its origin", () => {
    const s = demoScenario();
    const def = run(s, "next-crop-n").main.find((c) => c.id === "vetch-oat")!;
    expect(def.termination).toMatchObject({ days: 21, provenance: "species default" });
    const edited: Scenario = { ...s, covers: { ...s.covers, C: { ...s.covers.C, terminationDays: 35 } } };
    const r = run(edited, "next-crop-n");
    for (const c of r.main) expect(c.termination).toMatchObject({ days: 35, provenance: "your setting" });
  });

  it("the baseline is not described as bare soil with no effects", () => {
    const r = run(demoScenario(), "next-crop-n");
    expect(r.baseline.text).toMatch(/Residue, volunteer plants or bare soil/);
    expect(r.baseline.text).not.toMatch(/none of the cover effects/);
  });

  it("regional studies follow the next crop and carry their limits, never an amount", () => {
    const s = demoScenario();
    const tomato = run(s, "next-crop-n").main[0];
    const maize = run({ ...s, nextCropId: "maize" }, "next-crop-n").main[0];
    expect(tomato.evidence.map((e) => e.sourceId)).toEqual(["E17"]);
    expect(maize.evidence.map((e) => e.sourceId)).toEqual(["E17", "VANZOLINI", "AAPRESID"]);
    for (const e of maize.evidence) expect(e.limits.length).toBeGreaterThan(10);
    expect(JSON.stringify(maize.evidence)).not.toMatch(/kg|t\/ha|Mg/);
  });
});
