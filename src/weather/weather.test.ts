import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createLatest, forecastFacts, normalizeOpenMeteo, openMeteoUrl, segmentPeriod, todayInArgentina, type CoverageInput } from "./model";
import { climatology, parsePowerLive, periodInYear, periodStats, powerLiveUrl, type PowerSeries } from "../climate/history";

const place = { name: "General Roca area", lat: -39.053, lon: -67.6 };

// Test input shaped like the Open-Meteo response checked on 14 Nov 2026 (not live data).
const sample = {
  latitude: -39.05097, longitude: -67.65433, elevation: 234, timezone: "America/Argentina/Buenos_Aires", utc_offset_seconds: -10800,
  current_units: { temperature_2m: "°C", wind_speed_10m: "km/h" },
  current: { time: "2026-11-14T15:30", interval: 900, temperature_2m: 29, relative_humidity_2m: 18, precipitation: 0, weather_code: 1, wind_speed_10m: 14.5, wind_gusts_10m: 35.6 },
  daily_units: { temperature_2m_max: "°C", precipitation_sum: "mm", precipitation_probability_max: "%" },
  daily: {
    time: ["2026-11-14", "2026-11-15", "2026-11-16"],
    weather_code: [1, 61, 3], temperature_2m_max: [30.1, 22.4, 18], temperature_2m_min: [9.2, 11, -0.4],
    precipitation_sum: [0, 4.2, null], precipitation_probability_max: [5, 70, null], wind_speed_10m_max: [20, 30, 12], wind_gusts_10m_max: [40, 55, 20],
  },
  hourly_units: { temperature_2m: "°C", precipitation: "mm" },
  hourly: { time: ["2026-11-14T00:00", "2026-11-14T01:00"], temperature_2m: [12, 11.5], precipitation: [0, 0], precipitation_probability: [3, 4], relative_humidity_2m: [40, 42], weather_code: [0, 0], wind_speed_10m: [5, 6], wind_gusts_10m: [9, 10] },
};

describe("Open-Meteo adapter", () => {
  it("requests local dates in America/Argentina/Buenos_Aires with km/h wind", () => {
    const u = openMeteoUrl(place);
    expect(u).toContain("timezone=America%2FArgentina%2FBuenos_Aires");
    expect(u).toContain("wind_speed_unit=kmh");
    expect(u).toContain("forecast_days=16");
  });
  it("normalizes days, hours, units and keeps missing values missing", () => {
    const f = normalizeOpenMeteo(sample, place, "2026-11-14T18:31:00Z");
    expect(f.firstDate).toBe("2026-11-14");
    expect(f.lastDate).toBe("2026-11-16");
    expect(f.daily[2]).toMatchObject({ tmin: -0.4, rainMm: null, rainProbMaxPct: null });
    expect(f.hourly[1]).toMatchObject({ date: "2026-11-14", hour: 1, temp: 11.5 });
    expect(f.current).toMatchObject({ time: "2026-11-14T15:30", intervalS: 900, temp: 29, gustKmh: 35.6 });
    expect(f.units.precipitation_probability_max).toBe("%");
    expect(f.gridLon).toBeCloseTo(-67.654, 3);
  });
  it("rejects a response in another time zone", () => {
    expect(() => normalizeOpenMeteo({ ...sample, timezone: "GMT" }, place, "x")).toThrow(/time zone/);
  });
  it("states facts without damage claims; rain amount and probability stay separate", () => {
    const f = normalizeOpenMeteo(sample, place, "x");
    const facts = forecastFacts(f.daily);
    expect(facts).toContain("Lowest forecast minimum: -0.4 °C on 16 Nov.");
    expect(facts).toContain("1 day with a forecast minimum at or below 0 °C.");
    expect(facts.join(" ")).toMatch(/Most rain expected: 4.2 mm on 15 Nov; 4.2 mm in total/);
    expect(facts.join(" ")).not.toMatch(/damage|frost risk|safe|irrigat/i);
  });
  it("uses Argentina's local date at the UTC day boundary", () => {
    expect(todayInArgentina(new Date("2026-11-15T02:30:00Z"))).toBe("2026-11-14");
    expect(todayInArgentina(new Date("2026-11-15T03:00:00Z"))).toBe("2026-11-15");
  });
});

describe("consultation period coverage", () => {
  const c: CoverageInput = { today: "2026-11-14", forecastFirst: "2026-11-14", forecastLast: "2026-11-29", bundledFirst: "1981-01-01", bundledLast: "2025-12-31", liveLast: null };
  it("upcoming days inside the horizon are forecast; beyond it there is none", () => {
    expect(segmentPeriod("2026-11-20", "2026-12-05", c)).toEqual([
      { from: "2026-11-20", to: "2026-11-29", kind: "forecast" },
      { from: "2026-11-30", to: "2026-12-05", kind: "none-future" },
    ]);
  });
  it("a distant 2027 period has no forecast at all", () => {
    expect(segmentPeriod("2027-03-25", "2027-04-25", c)).toEqual([{ from: "2027-03-25", to: "2027-04-25", kind: "none-future" }]);
  });
  it("past days use the bundled NASA record, then the live query, and gaps stay gaps", () => {
    expect(segmentPeriod("2025-12-30", "2026-01-02", c)).toEqual([
      { from: "2025-12-30", to: "2025-12-31", kind: "nasa-bundled" },
      { from: "2026-01-01", to: "2026-01-02", kind: "none-past" },
    ]);
    expect(segmentPeriod("2025-12-30", "2026-01-02", { ...c, liveLast: "2026-01-01" })).toEqual([
      { from: "2025-12-30", to: "2025-12-31", kind: "nasa-bundled" },
      { from: "2026-01-01", to: "2026-01-01", kind: "nasa-live" },
      { from: "2026-01-02", to: "2026-01-02", kind: "none-past" },
    ]);
  });
  it("a period crossing today splits into past and forecast", () => {
    const s = segmentPeriod("2026-11-12", "2026-11-15", { ...c, liveLast: "2026-11-08" });
    expect(s.map((x) => x.kind)).toEqual(["none-past", "forecast"]);
  });
  it("an end before the start gives no segments", () => {
    expect(segmentPeriod("2026-11-20", "2026-11-10", c)).toEqual([]);
  });
});

describe("request ordering", () => {
  it("only the newest request may update the view", () => {
    const l = createLatest();
    const a = l.next();
    const b = l.next();
    expect(l.isLatest(a)).toBe(false); // older response arriving late is ignored
    expect(l.isLatest(b)).toBe(true);
  });
});

describe("NASA POWER history", () => {
  const doc = JSON.parse(readFileSync("public/data/power_daily.json", "utf8"));
  const s: PowerSeries = { startDate: doc.startDate, tmin: doc.tmin, tmax: doc.tmax, tmean: doc.tmean, precip: doc.precip };
  it("one year uses the real Tmax and names the dates of the extremes", () => {
    const p = periodInYear(s, "2027-04-10", 31, 2024);
    expect(p.start).toBe("2024-04-10");
    expect(p.end).toBe("2024-05-10");
    const st = periodStats(p);
    expect(st.complete).toBe(true);
    const i = (d: string) => (Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8)) - Date.UTC(1981, 0, 1)) / 864e5;
    expect(st.highestMax!.value).toBe(Math.max(...doc.tmax.slice(i("2024-04-10"), i("2024-05-10") + 1)));
    expect(doc.tmax[i(st.highestMax!.date)]).toBe(st.highestMax!.value);
    expect(doc.tmin[i(st.lowestMin!.date)]).toBe(st.lowestMin!.value);
  });
  it("29 Feb plans start on 28 Feb in non-leap years and keep the same length", () => {
    const p = periodInYear(s, "2028-02-29", 3, 2023);
    expect([p.start, p.end]).toEqual(["2023-02-28", "2023-03-02"]);
    expect(periodInYear(s, "2028-02-29", 3, 2024).start).toBe("2024-02-29");
  });
  it("same calendar dates across years: complete years only, ranges and the coldest year named", () => {
    const c = climatology(s, "2027-04-10", "2027-05-10", 1981, 2025)!;
    expect(c.years.length + c.excluded.length).toBe(45);
    expect(c.years.length).toBe(45);
    expect(c.bands).toHaveLength(31);
    expect(c.rainTotal.p10!).toBeLessThanOrEqual(c.rainTotal.p50!);
    expect(c.rainTotal.p50!).toBeLessThanOrEqual(c.rainTotal.p90!);
    expect(c.lowestMin.coldest!.value).toBe(Math.min(...c.perYear.map((y) => y.stats.lowestMin!.value)));
  });
  it("a period running past the record is excluded, not filled", () => {
    const c = climatology(s, "2027-12-20", "2028-01-10", 1981, 2025)!;
    expect(c.excluded).toContain(2025);
  });
  it("live query: validated, fill values become missing, last valid date reported", () => {
    const raw = {
      geometry: { coordinates: [-67.58, -39.03, 338.9] },
      header: { fill_value: -999, api: { version: "v2.10.3" } },
      parameters: { T2M: { units: "C" }, T2M_MIN: { units: "C" }, T2M_MAX: { units: "C" }, PRECTOTCORR: { units: "mm/day" } },
      properties: { parameter: { T2M: { "20260101": 20, "20260102": -999 }, T2M_MIN: { "20260101": 12, "20260102": -999 }, T2M_MAX: { "20260101": 28, "20260102": -999 }, PRECTOTCORR: { "20260101": 0, "20260102": -999 } } },
    };
    const r = parsePowerLive(raw, "2026-01-01", "2026-01-03");
    expect(r.series.tmin).toEqual([12, null, null]);
    expect(r.lastValid).toBe("2026-01-01");
    expect(powerLiveUrl("2026-01-01", "2026-01-03")).toContain("start=20260101");
    expect(() => parsePowerLive({ ...raw, geometry: { coordinates: [-60, -30] } }, "2026-01-01", "2026-01-03")).toThrow(/different location/);
  });
});
