import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { defaultScenario, evaluate, type Scenario } from "./scenario";
import { buildExport, exportMarkdown } from "./export";
import { climateReading } from "./exposure";
import { diffDays } from "./dates";

const doc = JSON.parse(readFileSync("public/data/power_daily.json", "utf8"));
const series = { startDate: doc.startDate, tmin: doc.tmin, tmean: doc.tmean };
const cfg = { t: -2, d: 30, strategy: "C" as const, searchEnd: null };

function check(s: Scenario) {
  const ev = evaluate(s);
  const ex = buildExport(s, ev, series, cfg, null);
  const cr = climateReading(ev, series, cfg);
  // export == screen
  expect(ex.results.map((r) => [r.state, r.marginDays])).toEqual(ev.strategies.map((r) => [r.calendar.state, r.calendar.margin]));
  expect(ex.climate.sentence).toBe(cr.sentence);
  expect(exportMarkdown(ex)).toContain(cr.sentence);
  expect(ex.effectiveDates.windowDays).toBe(ev.window.days);
  return ev;
}

describe("six consistency scenarios", () => {
  it("margin 0", () => {
    const s = defaultScenario();
    s.water.lastTurn = "2027-04-12";
    s.covers.C.sowing = "2027-04-12";
    const ev = check(s);
    expect(ev.strategies[2].calendar).toMatchObject({ state: "fits", margin: 0 });
  });
  it("release after closure", () => {
    const s = defaultScenario();
    s.release = "2027-05-05";
    s.covers.B.sowing = s.covers.C.sowing = "2027-05-05";
    const ev = check(s);
    expect(ev.strategies[1].calendar.state).toBe("no-fit-even-with-data");
    expect(ev.strategies[0].calendar.state).toBe("fits");
  });
  it("unknown last turn", () => {
    const ev = check(defaultScenario());
    expect(ev.strategies[1].calendar.state).toBe("needs-data");
    expect(ev.strategies[1].nextStep).toContain("on or after 15 Mar");
  });
  it("unknown turn phase", () => {
    const s = defaultScenario();
    s.water.frequencyDays = 10;
    const ev = check(s);
    expect(ev.schedule.kind).toBe("phase-unknown");
    const t = ev.strategies[1].calendar.turns!;
    expect(t.status).toBe("range");
    expect([t.min, t.max]).toEqual([0, 5]);
    expect(ev.strategies[1].nextStep).toMatch(/one dated turn/);
  });
  it("next crop before the end of the window", () => {
    const s = defaultScenario();
    s.nextCrop = "2027-03-20";
    const ev = check(s);
    expect(ev.strategies[0].calendar.state).toBe("no-fit");
    expect(ev.strategies[1].calendar.state).toBe("no-fit");
    s.nextCrop = "2027-03-10";
    const ev2 = evaluate(s);
    expect(ev2.strategies.every((r) => r.calendar.state === "invalid")).toBe(true);
    expect(ev2.strategies[0].calendar.message).toMatch(/following year/);
  });
  it("window crossing the new year", () => {
    const s = defaultScenario();
    s.release = "2027-11-25";
    s.covers.B.sowing = s.covers.C.sowing = "2027-11-25";
    s.nextCrop = "2028-03-15";
    s.water.closure = "2028-04-29";
    s.water.lastTurn = "2028-02-20";
    const ev = check(s);
    expect(ev.window.crossesNewYear).toBe(true);
    expect(ev.window.days).toBe(diffDays("2027-11-25", "2028-03-01"));
    expect(ev.strategies[1].calendar.state).toBe("fits");
    const cr = climateReading(ev, series, { ...cfg, t: 0 });
    // search spans two calendar years; the last historical year runs past the data
    expect(cr.rows.at(-1)!.outcome).toBe("insufficient");
  });
});
