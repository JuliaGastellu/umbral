import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { addDays, diffDays, fromDay, isValidISO, mapToYear, onYear, toDay } from "./dates";
import { buildSchedule, turnsAfter } from "./turns";
import { evaluateStrategy, type CalendarInputs, type StrategyInputs } from "./calendar";
import { atOrBelow, conditionFor, eventQuantiles, exposureByYear, exposureSentence, firstEvent, summarize, type DailySeries } from "./climate";
import { firstChange, sensitivity } from "./sensitivity";
import { familyAlert, CROPS } from "./catalog";
import { reportedConditions, salinityText, EMPTY_CONTEXT } from "./context";
import { defaultScenario, evaluate, effectiveInputs } from "./scenario";
import { buildExport, exportMarkdown } from "./export";

// ---------- helpers ----------
function series(start: string, tmin: (number | null)[]): DailySeries {
  return { startDate: start, tmin };
}

const baseCal = (over: Partial<CalendarInputs> = {}): CalendarInputs => ({
  release: "2027-03-15",
  nextCrop: "2027-10-15",
  preparationDays: 14,
  loseLastTurn: false,
  water: { closure: "2027-04-29", lastTurn: null, frequencyDays: null, referenceTurn: null, waterAfterClosure: "no", minTurnsAfterSowing: 1 },
  ...over,
});
const cover = (over: Partial<StrategyInputs> = {}): StrategyInputs => ({ id: "B", sowing: "2027-03-15", terminationDays: 28, targetDurationDays: null, ...over });

// Simple reference implementation of the first-event search.
function refFirst(vals: (number | null)[], i0: number, i1: number, t: number): number | "none" | "insufficient" {
  for (let i = i0; i <= i1; i++) {
    if (i >= vals.length) return "insufficient";
    const v = vals[i];
    if (v === null) return "insufficient";
    if (v <= t) return i - i0;
  }
  return "none";
}

// ---------- dates ----------
describe("dates", () => {
  it("round-trips day numbers and validates dates", () => {
    expect(fromDay(toDay("2024-02-29"))).toBe("2024-02-29");
    expect(isValidISO("2025-02-29")).toBe(false);
    expect(isValidISO("2024-02-29")).toBe(true);
    expect(isValidISO("2027-13-01")).toBe(false);
  });
  it("counts real calendar days across the new year", () => {
    expect(diffDays("2026-12-20", "2027-01-10")).toBe(21);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("maps 29 Feb to 28 Feb in years without it", () => {
    expect(onYear(2, 29, 2023)).toBe("2023-02-28");
    expect(onYear(2, 29, 2024)).toBe("2024-02-29");
    expect(mapToYear("2028-02-29", 2028, 1999)).toBe("1999-02-28");
  });
  it("keeps the year offset when mapping a window that crosses the new year", () => {
    expect(mapToYear("2028-01-10", 2027, 1990)).toBe("1991-01-10");
  });
});

// ---------- first-event search ----------
describe("first-event search", () => {
  // cold days on day 10 and day 30
  const vals = Array.from({ length: 60 }, (_, i) => (i === 10 || i === 30 ? -3 : 5));
  const s = series("2001-01-01", vals);
  it("returns known results without assuming monotonicity", () => {
    const a = firstEvent(s, addDays("2001-01-01", 9), "2001-02-28", -2);
    const b = firstEvent(s, addDays("2001-01-01", 11), "2001-02-28", -2);
    expect(a.outcome === "event" && a.days).toBe(1);
    expect(b.outcome === "event" && b.days).toBe(19);
  });
  it("counts the start day itself as day 0", () => {
    const r = firstEvent(s, addDays("2001-01-01", 10), "2001-02-28", -2);
    expect(r.outcome === "event" && r.days).toBe(0);
  });
  it("matches a simple reference implementation", () => {
    const rnd = (k: number) => Math.sin(k * 12.9898) * 43758.5453 % 1;
    const v = Array.from({ length: 400 }, (_, i) => (Math.abs(rnd(i)) < 0.02 ? null : Math.round(rnd(i + 7) * 120) / 10));
    const ss = series("2010-01-01", v);
    for (const t of [0, -2, -4]) {
      for (let start = 0; start < 300; start += 7) {
        for (const len of [0, 5, 40, 120]) {
          const r = firstEvent(ss, addDays("2010-01-01", start), addDays("2010-01-01", start + len), t);
          const ref = refFirst(v, start, start + len, t);
          if (typeof ref === "number") expect(r.outcome === "event" && r.days).toBe(ref);
          else expect(r.outcome).toBe(ref);
        }
      }
    }
  });
  it("uses Tmin ≤ T (at or below), including equality", () => {
    expect(atOrBelow(-2, -2)).toBe(true);
    expect(atOrBelow(-1.99, -2)).toBe(false);
    const r = firstEvent(series("2001-01-01", [1, -2, -5]), "2001-01-01", "2001-01-03", -2);
    expect(r.outcome === "event" && r.days).toBe(1);
  });
});

// ---------- outcomes and denominators ----------
describe("three outcomes", () => {
  // three years of 365 days starting 2001-01-01
  const days = diffDays("2001-01-01", "2004-01-01");
  const v: (number | null)[] = Array.from({ length: days }, () => 5);
  const idx = (iso: string) => diffDays("2001-01-01", iso);
  v[idx("2001-04-20")] = -3; // event year
  v[idx("2002-04-01")] = null; // insufficient year (missing before any event)
  // 2003: no event
  const s = series("2001-01-01", v);
  const rows = exposureByYear(s, { start: "2027-03-15", end: "2027-10-15", t: -2, years: [2001, 2002, 2003, 2004] });
  it("assigns one outcome per year, including data beyond the series", () => {
    expect(rows.map((r) => r.outcome)).toEqual(["event", "insufficient", "none", "insufficient"]);
  });
  it("classifies the D-day question as met / not met / not evaluable", () => {
    // 2001: event on day 36; 2002: missing on day 17, no event before; 2003: no event in 215 days; 2004: outside the data
    expect(rows.map((r) => conditionFor(r, 30))).toEqual(["met", "not-evaluable", "met", "not-evaluable"]);
    expect(rows.map((r) => conditionFor(r, 40))).toEqual(["not-met", "not-evaluable", "met", "not-evaluable"]);
    // 17 clean days before the gap are enough to demonstrate D = 10
    expect(conditionFor(rows[1], 10)).toBe("met");
    const sum = summarize(rows, 30);
    expect(sum).toMatchObject({ total: 4, met: 2, notMet: 0, notEvaluable: 2, notEvaluableData: 2, notEvaluableShortWindow: 0, events: 1, none: 1, insufficient: 2 });
  });
  it("a search window shorter than D cannot establish the condition", () => {
    const short = exposureByYear(s, { start: "2027-03-15", end: "2027-03-20", t: -2, years: [2001, 2003] });
    expect(short.map((r) => r.outcome)).toEqual(["none", "none"]);
    const sum = summarize(short, 30);
    expect(sum).toMatchObject({ met: 0, notMet: 0, notEvaluable: 2, notEvaluableShortWindow: 2 });
    // the same window can establish a short D
    expect(summarize(short, 6).met).toBe(2);
  });
  it("a search end before the start is an input error, not missing data", () => {
    expect(() => firstEvent(s, "2001-05-01", "2001-04-01", -2)).toThrow(RangeError);
  });
  it("writes one sentence form with explicit counts", () => {
    const txt = exposureSentence(summarize(rows, 30), 30, -2, "2027-03-15", "2027-10-15");
    expect(txt).toBe("Of 4 years (2001–2004), the first day with a minimum at or below −2 °C came at least 30 days after 15 Mar in 2 years and sooner in 0. 2 could not be evaluated (2 because of missing data). Search until 15 Oct.");
    expect(txt).not.toMatch(/probab|success|would have|recommend|safe/i);
  });
  it("treats 'none' as later than the end in quantiles", () => {
    expect(eventQuantiles(rows, [0.5, 1])).toEqual([36, null]);
  });
});

// ---------- turns ----------
describe("irrigation turns", () => {
  const sched = buildSchedule({ lastTurn: "2027-04-25", frequencyDays: 10, referenceTurn: null, closure: "2027-04-29", from: "2027-03-01" });
  it("anchors on the last turn and never on sowing", () => {
    expect(sched.kind).toBe("exact");
    if (sched.kind === "exact") expect(sched.dates).toEqual(["2027-03-06", "2027-03-16", "2027-03-26", "2027-04-05", "2027-04-15", "2027-04-25"]);
    const a = turnsAfter(sched, "2027-03-17");
    const b = turnsAfter(sched, "2027-03-20");
    expect(a.dates).toEqual(b.dates); // same dates, not re-anchored
  });
  it("is monotone (non-increasing) as sowing moves later", () => {
    let prev = Infinity;
    for (let k = 0; k < 70; k++) {
      const n = turnsAfter(sched, addDays("2027-03-01", k)).min;
      expect(n).toBeLessThanOrEqual(prev);
      prev = n;
    }
  });
  it("gives a range when the frequency has no reference date", () => {
    const s2 = buildSchedule({ lastTurn: null, frequencyDays: 10, referenceTurn: null, closure: "2027-04-29", from: "2027-03-01" });
    expect(s2.kind).toBe("phase-unknown");
    const c = turnsAfter(s2, "2027-04-01");
    // 29 days inclusive (1 Apr..29 Apr): 2 or 3 turns depending on phase
    // 2 or 3 turns depending on the phase if service continues to closure; 0 if it stops earlier
    expect([c.min, c.max]).toEqual([0, 3]);
    expect(c.status).toBe("range");
  });
  it("drops the last turn in the 'lose last turn' case", () => {
    const s3 = buildSchedule({ lastTurn: "2027-04-25", frequencyDays: 10, referenceTurn: null, closure: "2027-04-29", from: "2027-03-01", loseLastTurn: true });
    if (s3.kind === "exact") expect(s3.dates.at(-1)).toBe("2027-04-15");
  });
});

// ---------- calendar ----------
describe("calendar compatibility", () => {
  const known = (last: string) => baseCal({ water: { ...baseCal().water, lastTurn: last } });
  it("fits with margin from the binding constraint", () => {
    const r = evaluateStrategy(known("2027-04-12"), cover({ sowing: "2027-04-02" }));
    expect(r.state).toBe("fits");
    expect(r.margin).toBe(10); // irrigation binds: last turn 12 Apr
    expect(r.binding[0].id).toBe("irrigation");
  });
  it("handles margin 0 (tie at the edge) as fits", () => {
    const r = evaluateStrategy(known("2027-04-12"), cover({ sowing: "2027-04-12" }));
    expect(r.state).toBe("fits");
    expect(r.margin).toBe(0);
    const r2 = evaluateStrategy(known("2027-04-12"), cover({ sowing: "2027-04-13" }));
    expect(r2.state).toBe("no-fit");
  });
  it("gives 'Needs data' with the threshold when the last turn is unknown", () => {
    const r = evaluateStrategy(baseCal(), cover({ sowing: "2027-04-12" }));
    expect(r.state).toBe("needs-data");
    expect(r.binding[0].threshold).toBe("if the last turn is on or after 12 Apr");
    expect(r.message).toContain("12 Apr");
  });
  it("gives 'Doesn't fit even with data' when even the best case fails", () => {
    const r = evaluateStrategy(baseCal(), cover({ sowing: "2027-05-05" }));
    expect(r.state).toBe("no-fit-even-with-data");
  });
  it("shows the available interval and names the missing duration requirement", () => {
    const r = evaluateStrategy(known("2027-04-25"), cover({ sowing: "2027-03-15" }));
    expect(r.availableDays).toBe(diffDays("2027-03-15", "2027-09-03"));
    expect(r.notCovered.join(" ")).toMatch(/no target set/);
    const r2 = evaluateStrategy(known("2027-04-25"), cover({ sowing: "2027-03-15", targetDurationDays: 200 }));
    expect(r2.state).toBe("no-fit");
    expect(r2.binding[0].id).toBe("termination");
  });
  it("explains invalid inputs without throwing", () => {
    expect(evaluateStrategy(baseCal(), cover({ sowing: "2027-03-01" })).state).toBe("invalid");
    expect(evaluateStrategy(baseCal({ nextCrop: "2027-03-01" }), cover()).state).toBe("invalid");
    expect(evaluateStrategy(baseCal({ release: "2027-02-30" }), cover()).state).toBe("invalid");
  });
  it("accepts a window that crosses 31 December, with the successor in the following year", () => {
    const c = baseCal({ release: "2027-11-20", nextCrop: "2028-03-01", water: { ...baseCal().water, closure: "2028-04-29", lastTurn: "2028-01-10" } });
    const r = evaluateStrategy(c, cover({ sowing: "2027-12-01", terminationDays: 21 }));
    expect(r.state).toBe("fits");
    expect(r.terminationDeadline).toBe("2028-01-26"); // 2028 is a leap year: 1 Mar − 14 d = 16 Feb; − 21 d = 26 Jan
    expect(r.availableDays).toBe(56);
  });
  it("current practice fits whenever the window is non-negative", () => {
    expect(evaluateStrategy(baseCal(), { id: "A", sowing: null, terminationDays: 0, targetDurationDays: null }).state).toBe("fits");
    const tight = baseCal({ nextCrop: "2027-03-20" });
    expect(evaluateStrategy(tight, { id: "A", sowing: null, terminationDays: 0, targetDurationDays: null }).state).toBe("no-fit");
  });
  it("release after closure: no gravity turn can follow", () => {
    const c = baseCal({ release: "2027-05-10" });
    const r = evaluateStrategy(c, cover({ sowing: "2027-05-10" }));
    expect(r.state).toBe("no-fit-even-with-data");
  });
});

// ---------- separation ----------
describe("separation of readings", () => {
  it("plot context never changes the calendar arithmetic", () => {
    const s = defaultScenario();
    const a = evaluate(s);
    s.context = {
      texture: "clay",
      waterlogging: { kind: "yes", sector: "north end", duration: "2 weeks" },
      salinity: { kind: "measured", value: 4.1, unit: "dS/m", method: "saturated-paste ECe", date: "2026-05-01", depth: "0–30 cm" },
      lastCrops: [{ cropId: "tomato", approxDate: "2026" }, { cropId: "tomato", approxDate: "2025" }, { cropId: "squash", approxDate: "2024" }],
      healthProblemRecorded: "unknown",
    };
    const b = evaluate(s);
    for (let i = 0; i < 3; i++) {
      expect(b.strategies[i].calendar).toEqual(a.strategies[i].calendar);
    }
    expect(b.strategies[1].conditions.length).toBeGreaterThan(a.strategies[1].conditions.length);
  });
  it("climate inputs are not part of the calendar evaluation", () => {
    // evaluate() takes no climate argument: the calendar state is a pure function of scenario dates.
    const s = defaultScenario();
    expect(evaluate(s).strategies.map((x) => x.calendar.state)).toEqual(evaluate(structuredClone(s)).strategies.map((x) => x.calendar.state));
    expect(evaluate.length).toBe(1);
  });
});

// ---------- sensitivity ----------
describe("sensitivity", () => {
  const c = baseCal({ water: { ...baseCal().water, lastTurn: "2027-04-12" } });
  const s = cover({ sowing: "2027-04-02" });
  it("matches analytic margins (brute force scan vs margin + 1)", () => {
    const r = evaluateStrategy(c, s);
    expect(firstChange(c, s, "sowing", 1)?.delta).toBe(r.margin! + 1);
    const term = r.constraints.find((k) => k.id === "termination")!;
    expect(firstChange(c, s, "termination", 1, 400)?.delta).toBe(term.margin! + 1);
    expect(firstChange(c, s, "lastTurn", -1)?.delta).toBe(-(r.margin! + 1));
  });
  it("brute force over every one-day shift agrees with the reported first change", () => {
    for (const p of ["sowing", "nextCrop", "lastTurn"] as const) {
      const ch = firstChange(c, s, p, -1, 200);
      const base = evaluateStrategy(c, s).state;
      // brute force: find first k by direct evaluation
      let k = 1;
      for (; k <= 200; k++) {
        const cc = p === "nextCrop" ? { ...c, nextCrop: addDays(c.nextCrop, -k) } : p === "lastTurn" ? { ...c, water: { ...c.water, lastTurn: addDays(c.water.lastTurn!, -k) } } : c;
        const ss = p === "sowing" ? { ...s, sowing: addDays(s.sowing!, -k) } : s;
        if (evaluateStrategy(cc, ss).state !== base) break;
      }
      expect(ch?.delta ?? -(201)).toBe(-k);
    }
  });
  it("lists only changes that alter the state", () => {
    const list = sensitivity(c, s);
    expect(list.length).toBeGreaterThan(0);
    for (const x of list) expect(x.to).not.toBe(evaluateStrategy(c, s).state);
  });
});

// ---------- POWER data ----------
describe("POWER bundled data", () => {
  const doc = JSON.parse(readFileSync("public/data/power_daily.json", "utf8"));
  const s: DailySeries = { startDate: doc.startDate, tmin: doc.tmin };
  it("has the fill value removed (no -999 left)", () => {
    expect(doc.meta.fillValue).toBe(-999);
    expect(doc.tmin.some((v: number | null) => v !== null && v <= -999)).toBe(false);
  });
  it("matches a hand-calculated year (2024, from 15 Mar, T = 0 °C)", () => {
    // Hand check of the raw values: 3 May 0.02 °C (above 0), 13 May −0.04 °C (first at or below 0).
    const r = firstEvent(s, "2024-03-15", "2024-10-15", 0);
    expect(r).toMatchObject({ outcome: "event", date: "2024-05-13", days: 59, tmin: -0.04 });
  });
  it("treats an injected fill value as missing → insufficient", () => {
    const tmin = [...doc.tmin];
    tmin[diffDays(doc.startDate, "2024-04-01")] = null;
    const r = firstEvent({ startDate: doc.startDate, tmin }, "2024-03-15", "2024-10-15", 0);
    expect(r.outcome).toBe("insufficient");
  });
});

// ---------- context ----------
describe("plot context", () => {
  it("family alert appears if and only if families match", () => {
    for (const p of CROPS) for (const n of CROPS) {
      expect(familyAlert(p.id, n.id) !== null).toBe(p.family === n.family);
    }
  });
  it("salinity is never converted and never classified", () => {
    const t = salinityText({ kind: "measured", value: 2.5, unit: "dS/m", method: "EC1:5", date: null, depth: "0–20 cm" });
    expect(t).toContain("2.5 dS/m, EC1:5");
    expect(t).not.toMatch(/ECe|low|moderate|high|risk|saline soil|class/i);
    expect(salinityText({ kind: "reported" })).toBe("Salinity: reported, not measured.");
  });
  it("unknown is a valid answer and produces no conditions", () => {
    expect(reportedConditions(EMPTY_CONTEXT, "squash", "tomato", true)).toEqual([]);
  });
});

// ---------- scenario and export ----------
describe("scenario and export", () => {
  it("what-if controls change the effective dates only", () => {
    const s = defaultScenario();
    s.whatIf = { releaseDelay: 10, tractorDelay: 5, loseLastTurn: false, earlierTransplant: 7 };
    const e = effectiveInputs(s);
    expect(e.cal.release).toBe("2027-03-25");
    expect(e.cal.nextCrop).toBe("2027-10-08");
    expect(e.strategies.B.sowing).toBe("2027-03-30");
  });
  it("export carries the same results and the same climate sentence as the screen", () => {
    const s = defaultScenario();
    const doc = JSON.parse(readFileSync("public/data/power_daily.json", "utf8"));
    const ex = buildExport(s, evaluate(s), { startDate: doc.startDate, tmin: doc.tmin, tmean: doc.tmean }, { t: -2, d: 30, strategy: "C", searchEnd: null }, null);
    expect(ex.results.map((r) => r.state)).toEqual(evaluate(s).strategies.map((r) => r.calendar.state));
    expect(ex.climate.sentence).toMatch(/at or below −2 °C/);
    const md = exportMarkdown(ex);
    expect(md).toContain(ex.climate.sentence);
    expect(md).toContain("Illustrative scenario");
  });
});
