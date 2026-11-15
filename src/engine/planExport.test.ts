import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { EXPLORABLE, suggest, type Candidate, type Goal } from "./recommend";
import { demoScenario, evaluate, type Scenario } from "./scenario";
import { climateReading, DEFAULT_CLIMATE } from "./exposure";
import { buildPlanExport, planMarkdown, type PlanExport } from "./planExport";
import { managementPeriod } from "./period";
import { PROV_CHIP } from "../ui/Possibilities";

const power = JSON.parse(readFileSync("public/data/power_daily.json", "utf8"));
const series = { startDate: power.startDate, tmin: power.tmin, tmean: power.tmean };
const cfg = { ...DEFAULT_CLIMATE, t: 0, d: 30 };

function plan(s: Scenario, goal: Goal = s.goal, pick?: string) {
  const ev = evaluate(s);
  const by = { A: climateReading(ev, series, { ...cfg, strategy: "A" }), B: climateReading(ev, series, { ...cfg, strategy: "B" }), C: climateReading(ev, series, { ...cfg, strategy: "C" }) };
  const sug = suggest({ ...s, goal }, goal, by, ev, series);
  const all = [...sug.main, ...sug.others, ...sug.experimental];
  const active: Candidate | null = pick ? all.find((c) => c.id === pick)! : sug.main[0] ?? null;
  // The App passes the selected candidate's two-date comparison; any object stands in for it here.
  const comparison = active ? { plan: { cover: active.name, fieldFree: s.release }, other: { cover: active.name, fieldFree: "2027-03-25" } } : null;
  const doc = buildPlanExport({ s: { ...s, goal }, ev, sug, active, series, cfg, station: null, fieldLabel: "Example P2", hls: null, comparison, generated: "2026-11-15T00:00:00Z" });
  return { ev, sug, all, active, doc, md: planMarkdown(doc) };
}
const almond = (patch: Partial<Scenario["context"]> = {}): Scenario => {
  const s = demoScenario();
  return { ...s, system: "orchard", previousCropId: "almond", goal: "next-crop-n", orchard: { ...s.orchard, waterReach: "yes", age: "established", area: "interrow", window: ["2027-04-01", "2027-09-15"] }, context: { ...s.context, ...patch } };
};
const SOIL = { salinity: { kind: "reported" as const }, waterlogging: { kind: "yes" as const, sector: "", duration: "" } };

describe("audit P1: reported soil conditions apply in every system", () => {
  it("almond, established, irrigated interrow, N goal: salinity and waterlogging make vetch conditional; dates unchanged; carried to the export", () => {
    const clean = plan(almond());
    const soil = plan(almond(SOIL));
    const v0 = clean.all.find((c) => c.id === "vetch")!;
    const v1 = soil.all.find((c) => c.id === "vetch")!;
    expect(v0.status).toBe("suggested");
    expect(v1.status).toBe("provisional");
    expect(v1.calendar).toEqual(v0.calendar); // no change to calendar arithmetic
    const soilChecks = v1.checks.filter((k) => k.kind === "soil");
    expect(soilChecks.map((k) => k.text).join(" ")).toMatch(/Waterlogging reported.*no tolerance data/);
    expect(soilChecks.map((k) => k.text).join(" ")).toMatch(/Salinity: reported, not measured/);
    expect(v1.dimensions.find((d) => d.key === "water-soil")!.state).toBe("check");
    expect(soil.sug.confirmFirst).toMatch(/Review first/);
    const sel = soil.doc.selectedCandidate as Record<string, any>;
    expect(sel.reportedSoilConditions).toEqual(expect.arrayContaining([expect.stringMatching(/Waterlogging/), expect.stringMatching(/Salinity/)]));
    expect(sel.checks.some((k: any) => k.kind === "soil" && k.blocking)).toBe(true);
    expect(soil.md).toMatch(/Reported soil conditions: .*Waterlogging reported/);
  });
  it("beds with plants kept do not skip reported soil conditions", () => {
    const s = demoScenario();
    const beds: Scenario = { ...s, system: "beds", previousCropId: "strawberry", beds: { plants: "retained", mulch: "plastic", drip: "yes", area: "paths" }, context: { ...s.context, ...SOIL } };
    const r = plan(beds);
    for (const c of r.all.filter((x) => EXPLORABLE.has(x.status))) expect(c.checks.some((k) => k.kind === "soil" && k.blocking)).toBe(true);
  });
});

describe("audit P1: one canonical export of the plan on screen", () => {
  it("oat chosen with the weeds goal: every primary date and duration is oat's; reference strategies are separate and labelled", () => {
    const r = plan(demoScenario(), "weeds", "oat");
    const d: PlanExport = r.doc;
    const sel = d.selectedCandidate as Record<string, any>;
    const cal = d.annualCalendar as Record<string, any>;
    expect(sel.id).toBe("oat");
    expect(cal.cover).toBe("Oat");
    expect(cal.availableDaysUntilTermination).toBe(sel.calendar.availableDays);
    expect(cal.terminationDeadline).toBe(sel.calendar.endBy);
    expect(cal.sowing).toBe(sel.calendar.sowing);
    expect(cal.terminationDays).toBe(sel.termination.days);
    const cold = d.coldNightQuestion as Record<string, any>;
    expect(cold.from).toBe(sel.calendar.sowing);
    expect(cold.basis).toMatch(/oat sowing/);
    // The old annual structure is gone from the top level.
    expect(d).not.toHaveProperty("results");
    expect(d).not.toHaveProperty("effectiveDates");
    expect(d).not.toHaveProperty("climate");
    // Comparators are explicit and are not the plan.
    expect(d.referenceComparators!.note).toMatch(/Reference only, not the selected plan/);
    expect(d.referenceComparators!.strategies.map((x) => x.id)).toEqual(["A", "B", "C"]);
    expect(d.dateComparison.applicable).toBe(true);
    // Markdown: the selected candidate comes first and the comparators come last, labelled.
    const iSel = r.md.indexOf("## Selected candidate");
    const iRef = r.md.indexOf("## Reference comparators (not the selected plan)");
    expect(iSel).toBeGreaterThan(-1);
    expect(iRef).toBeGreaterThan(iSel);
    expect(r.md.slice(iSel, iRef)).toMatch(/\*\*Oat\*\*/);
    expect(r.md.slice(iSel, iRef)).not.toMatch(/Cereal rye:/);
    expect(r.md).toContain(`${cal.availableDaysUntilTermination} days`);
  });

  it("orchard window 1 Apr–15 Sep with a different annual release kept in the inputs: period, history, cold nights and Markdown use the orchard window", () => {
    const s = almond();
    expect(s.release).not.toBe("2027-04-01");
    const r = plan(s);
    const d = r.doc;
    expect(d.system).toEqual({ id: "orchard", label: "Permanent orchard", mainCropStays: true });
    expect(d.plan.managementPeriod.start).toBe("2027-04-01");
    expect(d.plan.managementPeriod.end).toBe("2027-09-15");
    expect((d.coldNightQuestion as any).from).toBe("2027-04-01");
    expect(d.annualCalendar).toBeNull();
    expect(d.referenceComparators).toBeNull();
    expect(d.dateComparison).toEqual({ applicable: false, reason: expect.stringMatching(/no field-free date/) });
    expect(Object.keys(d.plan.crops)).toEqual(["standingCrop", "coverArea", "waterReachesCoverArea", "treeAge", "mowing"]);
    expect(d.inputs.notApplicable).toEqual(expect.arrayContaining(["release", "nextCrop", "preparationDays", "covers"]));
    expect(d.assumptions.map((a) => a.item).join(" ")).not.toMatch(/Release|Next crop|Preparation|termination interval/i);
    expect(r.md).not.toMatch(/Field free|field free|Release date|soil ready|Next crop|next crop|nextCrop|Reference comparators|Another free date|Strateg/);
    expect(r.md).toMatch(/Management period: 1 Apr 2027 to 15 Sep 2027/);
    const per = managementPeriod(s, r.ev);
    expect(per.history[0]).toBe("2027-04-01");
    expect(per.historyLabel).not.toMatch(/field is free/);
    expect(per.historyLabel).toMatch(/cover window you entered/);
  });
});

describe("audit P2: goal match is separate from viability", () => {
  it("a viable partial match stays selectable; date and system conflicts stay excluded", () => {
    const r = plan(demoScenario(), "soil-cover");
    const oat = r.all.find((c) => c.id === "oat")!;
    expect(oat.purpose.match).toBe("partial");
    expect(oat.status).toBe("partial-match");
    expect(EXPLORABLE.has(oat.status)).toBe(true);
    expect(r.all.find((c) => c.id === "clover")!.status).toBe("not-for-this-system");
    expect(EXPLORABLE.has("not-for-this-system")).toBe(false);
    const late = plan({ ...demoScenario(), release: "2027-06-20" }, "soil-cover");
    expect(late.all.filter((c) => c.id !== "clover").every((c) => c.status === "not-on-these-dates")).toBe(true);
    expect(EXPLORABLE.has("not-on-these-dates")).toBe(false);
    // The selected partial match exports its own result with its goal limit.
    const sel = plan(demoScenario(), "soil-cover", "oat").doc.selectedCandidate as Record<string, any>;
    expect(sel.goalFit).toMatch(/only in part/);
  });
});

describe("audit P2: evidence labels keep their real strength", () => {
  it("a research summary is not shown as a published study; guidance is not a trial", () => {
    expect(PROV_CHIP["research brief"][0]).toBe("Research summary · original not rechecked");
    expect(PROV_CHIP["published guidance"][0]).toBe("Published guidance");
    expect(PROV_CHIP["regional study"][0]).toBe("Regional study");
    expect(Object.values(PROV_CHIP).map((x) => x[0])).not.toContain("Published study");
  });
});
