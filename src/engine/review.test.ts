/**
 * Regression tests for the issues reproduced in the independent review of 14 Nov 2026.
 * Each test states the expected meaning and unit.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { defaultScenario, describeTurns, evaluate, overviewOf, type Scenario } from "./scenario";
import { buildExport, exportMarkdown } from "./export";
import { climateReading, type StationSummary } from "./exposure";

const doc = JSON.parse(readFileSync("public/data/power_daily.json", "utf8"));
const series = { startDate: doc.startDate, tmin: doc.tmin, tmean: doc.tmean };
const station: StationSummary = JSON.parse(readFileSync("public/data/station_check.json", "utf8")).summary;
const B = (s: Scenario) => evaluate(s).strategies[1];

describe("review issue 2: unknown alternative water is not 'no'", () => {
  const base = () => {
    const s = defaultScenario();
    s.covers.B.sowing = "2027-05-05"; // after canal closure (29 Apr)
    return s;
  };
  it("with water after closure = no, no canal turn can follow: doesn't fit even with data", () => {
    const s = base();
    s.water.waterAfterClosure = "no";
    expect(B(s).calendar.state).toBe("no-fit-even-with-data");
  });
  it("with water after closure = unknown, the result needs that data", () => {
    const s = base();
    s.water.waterAfterClosure = "unknown";
    const r = B(s);
    expect(r.calendar.state).toBe("needs-data");
    expect(r.calendar.binding[0].missing).toBe("whether there is water after canal closure");
    expect(r.nextStep).toMatch(/water after canal closure/);
    expect(r.calendar.notCovered).toContain("whether the water is enough");
  });
});

describe("review issue 3: nominal future turns are not confirmed turns", () => {
  const s = defaultScenario();
  s.water.lastTurn = null;
  s.water.referenceTurn = "2027-03-15";
  s.water.frequencyDays = 10;
  s.covers.B.sowing = "2027-04-20";
  it("a turn on 24 Apr is nominal: the result depends on service continuing", () => {
    const r = B(s);
    expect(r.calendar.state).toBe("needs-data");
    expect(r.calendar.turns?.status).toBe("nominal");
    expect(r.calendar.turns?.dates).toEqual(["2027-04-24"]);
    expect(r.calendar.binding[0].threshold).toBe("if irrigation continues until at least 24 Apr");
    expect(describeTurns(r)).toBe("up to 1 (nominal)");
    expect(overviewOf(r).lastTurnStatus).toBe("nominal");
  });
  it("with the last turn stated, the same date is confirmed and fits", () => {
    const s2 = structuredClone(s);
    s2.water.lastTurn = "2027-04-24";
    const r = B(s2);
    expect(r.calendar.state).toBe("fits");
    expect(r.calendar.turns?.status).toBe("confirmed");
    expect(r.calendar.margin).toBe(4); // days: sowing 20 Apr → last turn 24 Apr
  });
});

describe("review issue 4: a shortfall in turns is never reported in days", () => {
  const s = defaultScenario();
  s.water.lastTurn = "2027-04-15";
  s.water.frequencyDays = 10;
  s.water.minTurnsAfterSowing = 6;
  s.covers.B.sowing = "2027-04-10";
  it("reports 5 turns short, not −5 days", () => {
    const r = B(s);
    expect(r.calendar.state).toBe("no-fit");
    const irr = r.calendar.constraints.find((c) => c.id === "irrigation")!;
    expect(irr.turnDeficit).toBe(5);
    expect(irr.margin).toBeUndefined();
    expect(r.calendar.message).toContain("5 turns short");
    expect(r.calendar.message).not.toMatch(/5 d\b/);
    // the overall margin stays a time quantity from the termination constraint
    expect(r.calendar.margin).toBe(r.calendar.availableDays);
  });
  it("the export keeps the unit", () => {
    const ex = buildExport(s, evaluate(s), series, { t: 0, d: 30, strategy: "B", searchEnd: null }, null, station);
    expect(ex.results[1].turnShortfall).toBe(5);
    expect(ex.results[1].irrigationOpportunitiesAfterSowing.unit).toBe("turns");
  });
});

describe("review issue 5: censored and short climate follow-up", () => {
  it("search until 20 Mar from 15 Mar with D = 30: all years not evaluable, none counted as failures", () => {
    const s = defaultScenario();
    const cr = climateReading(evaluate(s), series, { t: -2, d: 30, strategy: "A", searchEnd: "2027-03-20" });
    expect(cr.summary).toMatchObject({ total: 45, met: 0, notMet: 0, notEvaluable: 45, notEvaluableShortWindow: 45 });
    expect(cr.sentence).toMatch(/45 could not be evaluated/);
  });
  it("a search end before the start is an input error", () => {
    const s = defaultScenario();
    const cr = climateReading(evaluate(s), series, { t: -2, d: 30, strategy: "A", searchEnd: "2027-03-01" });
    expect(cr.error).toMatch(/before the start/);
    expect(cr.summary.total).toBe(0);
  });
  it("reproduces the independent counts: T 0 °C, D 30, until 15 Oct: 43/45 from 15 Mar, 33/45 from 10 Apr", () => {
    const s = defaultScenario();
    const a = climateReading(evaluate(s), series, { t: 0, d: 30, strategy: "A", searchEnd: null });
    expect([a.summary.met, a.summary.notMet, a.summary.notEvaluable]).toEqual([43, 2, 0]);
    s.release = "2027-04-10";
    const b = climateReading(evaluate(s), series, { t: 0, d: 30, strategy: "A", searchEnd: null });
    expect([b.summary.met, b.summary.notMet, b.summary.notEvaluable]).toEqual([33, 12, 0]);
  });
});

describe("review issue 6: the regional check travels with every climate output", () => {
  it("JSON and Markdown carry the station result and its limits", () => {
    const s = defaultScenario();
    const ex = buildExport(s, evaluate(s), series, { t: -2, d: 30, strategy: "C", searchEnd: null }, null, station);
    expect(ex.climate.regionalCheck.detail?.firstEventMedianLagDays["-2"]).toBe(24);
    expect(ex.climate.regionalCheck.line).toMatch(/median of 24 days later/);
    expect(ex.climate.regionalCheck.line).toMatch(/no correction is applied/);
    expect(ex.climate.source).toMatch(/regional reanalysis/);
    expect(exportMarkdown(ex)).toContain(ex.climate.regionalCheck.line);
  });
});

describe("review issue 7: the planning-season closure is an assumption", () => {
  it("export marks the placed closure as assumed and keeps the 2024 record separately", () => {
    const s = defaultScenario();
    const ex = buildExport(s, evaluate(s), series, { t: -2, d: 30, strategy: "C", searchEnd: null }, null, station);
    expect(ex.assumptions.find((a) => a.item === "Canal closure (planning season)")?.status).toBe("assumed");
    expect(ex.assumptions.find((a) => a.item === "Canal closure record")).toMatchObject({ value: "29 Apr 2024", status: "observed" });
  });
});

describe("demo: three distinct quantities", () => {
  const s = defaultScenario();
  s.water.lastTurn = "2027-04-15";
  s.water.frequencyDays = 10;
  it("15 Mar: 31 days to the last turn and 4 turns; 10 Apr: 5 days and 1 turn; the cover interval is a different, longer quantity", () => {
    const a = overviewOf(B(s));
    expect([a.daysToLastTurn, a.turns, a.lastTurnStatus]).toEqual([31, "4", "stated"]);
    expect(a.availableDays).toBe(172);
    const s2 = structuredClone(s);
    s2.whatIf.releaseDelay = 26;
    const b = overviewOf(B(s2));
    expect([b.daysToLastTurn, b.turns]).toEqual([5, "1"]);
    expect(b.availableDays).toBe(146);
  });
});
