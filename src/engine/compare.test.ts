import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { compareDates, nearestClearObservation, stepClear, withReleaseDate } from "./compare";
import { defaultScenario, demoScenario } from "./scenario";
import { climateReading } from "./exposure";

const doc = JSON.parse(readFileSync("public/data/power_daily.json", "utf8"));
const series = { startDate: doc.startDate, tmin: doc.tmin, tmean: doc.tmean };

describe("two-date comparison (recomputed, not hard-coded)", () => {
  it("last turn 25 Apr every 10 days: 25 Mar vs 10 Apr gives 31 vs 15 days to the last turn and 4 vs 2 turns", () => {
    const s = demoScenario(); // field free 10 Apr
    const { plan, proposed } = compareDates(s, "2027-03-25");
    expect([plan.B.daysToLastTurn, plan.B.turns]).toEqual([15, "2"]);
    expect([proposed.B.daysToLastTurn, proposed.B.turns]).toEqual([31, "4"]);
    // calendar interval differs per cover because of its termination assumption (28 d vs 21 d)
    expect([plan.B.availableDays, plan.C.availableDays]).toEqual([146, 153]);
    expect([proposed.B.availableDays, proposed.C.availableDays]).toEqual([162, 169]);
    // the turn dates stay the same: moving the date never re-anchors the schedule
    expect(plan.B.turns).toBe("2");
    expect(proposed.ev.strategies[1].calendar.turns?.dates).toEqual(["2027-03-26", "2027-04-05", "2027-04-15", "2027-04-25"]);
    expect(plan.ev.strategies[1].calendar.turns?.dates).toEqual(["2027-04-15", "2027-04-25"]);
  });
  it("cold-night counts for both dates use the same threshold, D and search end", () => {
    const s = demoScenario();
    const { plan, proposed } = compareDates(s, "2027-03-25");
    const cfg = { t: 0, d: 30, strategy: "B" as const, searchEnd: null };
    expect(climateReading(plan.ev, series, cfg).summary.met).toBe(33);
    expect(climateReading(proposed.ev, series, cfg).summary.met).toBe(41);
  });
  it("keeps the user's gap between field free and sowing", () => {
    const s = defaultScenario();
    s.covers.C.sowing = "2027-03-20"; // 5 days after release
    const moved = withReleaseDate(s, "2027-04-01");
    expect(moved.release).toBe("2027-04-01");
    expect(moved.covers.C.sowing).toBe("2027-04-06");
    expect(moved.covers.B.sowing).toBe("2027-04-01");
  });
  it("an invalid proposed date leaves the scenario unchanged", () => {
    const s = defaultScenario();
    expect(withReleaseDate(s, "2027-02-30")).toBe(s);
  });
});

describe("historical image date", () => {
  const obs = [
    { id: "a", date: "2024-04-06", quality: "clear" },
    { id: "b", date: "2024-04-12", quality: "obscured" },
    { id: "c", date: "2024-04-16", quality: "clear" },
    { id: "d", date: "2024-06-15", quality: "clear" },
  ];
  it("follows the plan's month and day on the 2024 season and reports the offset", () => {
    const r = nearestClearObservation(obs, "2027-04-10", 2024)!;
    expect(r.obs.id).toBe("a"); // 4 days before; the cloudy 12 Apr is skipped
    expect(r.offsetDays).toBe(-4);
    expect(r.targetOnSeason).toBe("2024-04-10");
  });
  it("returns null when no clear image is close enough", () => {
    expect(nearestClearObservation(obs, "2027-05-15", 2024, 20)).toBeNull();
  });
  it("29 Feb plans map to 28 Feb on non-leap seasons", () => {
    const r = nearestClearObservation([{ id: "x", date: "2023-03-01", quality: "clear" }], "2028-02-29", 2023, 5)!;
    expect(r.targetOnSeason).toBe("2023-02-28");
    expect(r.offsetDays).toBe(1);
  });
  it("previous and next skip cloudy dates and stop at the ends", () => {
    expect(stepClear(obs, "a", 1)?.id).toBe("c");
    expect(stepClear(obs, "c", -1)?.id).toBe("a");
    expect(stepClear(obs, "d", 1)).toBeNull();
    expect(stepClear(obs, "b", 1)?.id).toBe("c");
  });
});
