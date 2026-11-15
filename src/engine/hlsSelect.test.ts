import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { historicalInterval, scopeObservation, seasonSummary, selectHls, toExported, type HlsObs } from "./hlsSelect";
import { buildExport, exportMarkdown } from "./export";
import { demoScenario, evaluate } from "./scenario";

const hls = JSON.parse(readFileSync("public/data/hls_season.json", "utf8"));
const obs: HlsObs[] = hls.observations;
const power = JSON.parse(readFileSync("public/data/power_daily.json", "utf8"));
const series = { startDate: power.startDate, tmin: power.tmin, tmean: power.tmean };
const cfg = { t: 0, d: 30, strategy: "B" as const, searchEnd: null };

function exportFor(plan: [string, string], parcel: number | null, selectedDate?: string) {
  const s = demoScenario();
  const scope = parcel === null ? ({ kind: "cluster" } as const) : ({ kind: "parcel", index: parcel } as const);
  const selection = selectHls(obs, plan, 2024, scope)!;
  const sel = selectedDate ? obs.find((o) => o.date === selectedDate)! : null;
  const selectedImage = sel ? { ...toExported(sel, scope), followPlanDate: false, planDate: null, offsetDays: null, note: "Real 2024 observation." } : null;
  return buildExport(s, evaluate(s), series, cfg, { label: "test", selection, selectedImage }, null);
}

describe("historical HLS selection shared by screen and exports", () => {
  it("exports the 2024 observations for a 2027 plan period (was empty)", () => {
    const x = exportFor(["2027-04-10", "2027-10-01"], null);
    expect(x.hls!.observations.length).toBe(44);
    expect(x.hls!.historicalInterval).toEqual(["2024-04-10", "2024-10-01"]);
    expect(x.hls!.planInterval).toEqual(["2027-04-10", "2027-10-01"]);
    // Real acquisition dates are kept, never relabelled as 2027.
    expect(x.hls!.observations.every((o) => o.acquisitionDate.startsWith("2024-"))).toBe(true);
  });

  it("the default plan exports a non-empty set", () => {
    const s = demoScenario();
    const ev = evaluate(s);
    const sel = selectHls(obs, [ev.effective.cal.release, ev.window.soilReady], 2024, { kind: "cluster" })!;
    expect(sel.observations.length).toBeGreaterThan(0);
  });

  it("applies the selected parcel scope; the cluster stays separate and labelled", () => {
    const x = exportFor(["2027-04-10", "2027-04-30"], 0, "2024-04-16");
    const im = x.hls!.selectedImage!;
    expect(im.acquisitionDate).toBe("2024-04-16");
    expect(im.ndviMedian).toBe(0.722);
    expect(im.scope).toBe("example parcel P1");
    expect(im.sensor).toBe("S30");
    expect(im.quality).toBe("clear");
    expect(im.cleanPixels).toBeGreaterThan(0);
    expect(im.totalPixels).toBeGreaterThanOrEqual(im.cleanPixels);
    const p1 = x.hls!.observations.find((o) => o.acquisitionDate === "2024-04-16")!;
    const cl = x.hls!.clusterForComparison!.find((o) => o.acquisitionDate === "2024-04-16")!;
    expect(p1.ndviMedian).toBe(0.722);
    expect(cl.ndviMedian).toBe(0.595);
    expect(cl.scope).toBe("cluster of four example parcels");
    const md = exportMarkdown(x);
    expect(md).toContain("| 2024-04-16 | S30 | clear |");
    expect(md).toContain("0.722");
    expect(md).toContain("for comparison only");
  });

  it("cluster scope has no separate comparison block", () => {
    const x = exportFor(["2027-04-10", "2027-04-30"], null, "2024-04-16");
    expect(x.hls!.selectedImage!.ndviMedian).toBe(0.595);
    expect(x.hls!.clusterForComparison).toBeNull();
  });

  it("maps a plan crossing December onto the season and the following year", () => {
    const h = historicalInterval(["2026-11-20", "2027-02-10"], 2024)!;
    expect(h.historical).toEqual(["2024-11-20", "2025-02-10"]);
    const fake = (date: string): HlsObs => ({ id: date, date, sensor: "S30", quality: "clear", pixels: 10, cleanPixels: 10, cleanFraction: 1, ndviMedian: 0.3, parcels: [] });
    const sel = selectHls([fake("2024-02-01"), fake("2024-12-15"), fake("2025-01-10"), fake("2025-03-01")], ["2026-11-20", "2027-02-10"], 2024, { kind: "cluster" })!;
    expect(sel.observations.map((o) => o.acquisitionDate)).toEqual(["2024-12-15", "2025-01-10"]);
  });

  it("rejects an inverted or invalid interval", () => {
    expect(historicalInterval(["2027-05-01", "2027-04-01"], 2024)).toBeNull();
    expect(historicalInterval(["bad", "2027-04-01"], 2024)).toBeNull();
  });

  it("scopeObservation falls back to the cluster for a missing parcel", () => {
    const o = obs[0];
    expect(scopeObservation(o, { kind: "parcel", index: 9 })).toBe(o);
  });
});

describe("season summary wording follows the values", () => {
  it("cluster: seasons with about the same value are named together", () => {
    const t = seasonSummary(obs)!;
    expect(t).toContain("Highest in February–April and October–November (about the same), lowest in June–August");
  });
  const scoped = (i: number) => obs.map((o) => scopeObservation(o, { kind: "parcel", index: i }));
  it("P2: October–November is the highest, not February–April", () => {
    const t = seasonSummary(scoped(1))!;
    expect(t).toContain("February–April 0.57");
    expect(t).toContain("June–August 0.35");
    expect(t).toContain("October–November 0.64");
    expect(t).toContain("Highest in October–November, lowest in June–August");
    expect(t).not.toMatch(/greenest from February/i);
  });
  it("P4: small differences are described as about the same, and low", () => {
    const t = seasonSummary(scoped(3))!;
    expect(t).toContain("About the same through the year");
    expect(t).toContain("All are low");
    expect(t).not.toMatch(/green again|return/i);
  });
});
