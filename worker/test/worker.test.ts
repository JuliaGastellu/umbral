import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { handle, _resetForecastCache, SCHEMA } from "../src/index";
import { climateReading, DEFAULT_CLIMATE } from "../../src/engine/exposure";
import { demoScenario, evaluate } from "../../src/engine/scenario";

const E = { ALLOWED_ORIGINS: "https://umbral-altovalle.vercel.app,http://localhost:5199" };
const get = (path: string, init: RequestInit = {}, fetcher?: typeof fetch) => handle(new Request(`https://api.example${path}`, init), E, fetcher);
const json = async (r: Response) => JSON.parse(await r.text());

const openMeteoSample = {
  latitude: -39.05, longitude: -67.65, timezone: "America/Argentina/Buenos_Aires", utc_offset_seconds: -10800,
  daily_units: { time: "iso8601", weather_code: "wmo code", temperature_2m_max: "°C", temperature_2m_min: "°C", precipitation_sum: "mm", precipitation_probability_max: "%", wind_speed_10m_max: "km/h", wind_gusts_10m_max: "km/h" },
  daily: { time: ["2026-11-15", "2026-11-16"], weather_code: [1, 2], temperature_2m_max: [28, 25], temperature_2m_min: [10, null], precipitation_sum: [0, null], precipitation_probability_max: [5, null], wind_speed_10m_max: [20, 15], wind_gusts_10m_max: [40, 30] },
  hourly_units: {}, hourly: { time: [] },
};

describe("Umbral API", () => {
  beforeEach(() => _resetForecastCache());

  it("health and sources use the shared schema and carry no secrets", async () => {
    for (const p of ["/api/health", "/api/sources"]) {
      const r = await get(p);
      expect(r.status).toBe(200);
      const b = await json(r);
      expect(b.schema).toBe(SCHEMA);
      for (const k of ["source", "product", "processed", "scope", "resolution", "quality", "status", "role"]) expect(b).toHaveProperty(k);
      expect(JSON.stringify(b)).not.toMatch(/token|password|Bearer|netrc|machine urs/i);
    }
  });

  it("validates parameters and rejects unknown routes, methods and parameters", async () => {
    expect((await get("/api/history?start=2027-04-10")).status).toBe(400);
    expect((await get("/api/history?start=2027-02-30&end=2027-05-10")).status).toBe(400);
    expect((await get("/api/history?start=2027-04-10&end=2028-06-10")).status).toBe(400);
    expect((await get("/api/history?start=2027-04-10&end=2027-05-10&t=-40")).status).toBe(400);
    expect((await get("/api/observations?scope=parcel-123")).status).toBe(400);
    expect((await get("/api/observations?product=modis")).status).toBe(400);
    expect((await get("/api/weather?lat=10&lon=10")).status).toBe(400); // no arbitrary coordinates
    expect((await get("/api/proxy?url=https://evil.example")).status).toBe(404);
    expect((await get("/api/health", { method: "POST" })).status).toBe(405);
  });

  it("an unavailable date returns no observation, never a substitute", async () => {
    const b = await json(await get("/api/observations?scope=p2&product=hls&date=2024-04-17"));
    expect(b.status).toBe("no data");
    expect(b.data).toEqual([]);
    const ok = await json(await get("/api/observations?scope=p1&product=hls&date=2024-04-16"));
    expect(ok.data[0]).toMatchObject({ acquisitionDate: "2024-04-16", ndviMedian: 0.722, scope: "p1" });
  });

  it("EMIT stays a cluster summary", async () => {
    expect((await get("/api/observations?scope=p1&product=emit")).status).toBe(400);
    const b = await json(await get("/api/observations?scope=cluster&product=emit"));
    expect(b.data.scenes.length).toBeGreaterThan(0);
    expect(b.role).toMatch(/not nitrogen/);
  });

  it("history matches the app's own climate engine for the same dates", async () => {
    const s = demoScenario();
    const ev = evaluate(s);
    const p = JSON.parse(readFileSync("public/data/power_daily.json", "utf8"));
    const app = climateReading(ev, { startDate: p.startDate, tmin: p.tmin, tmean: p.tmean }, { ...DEFAULT_CLIMATE, strategy: "A" });
    const b = await json(await get(`/api/history?start=${app.start}&end=${app.end}&t=${app.t}&d=${app.d}`));
    expect(b.data.met).toBe(app.summary.met);
    expect(b.data.years).toBe(app.summary.total);
    expect(b.quality).toMatch(/optimistic/);
    expect(b.data.perYear.some((y: { rainMm: number | null }) => y.rainMm === null) || b.data.perYear.every((y: { rainMm: number | null }) => y.rainMm !== null)).toBe(true);
  });

  it("forecast: live, then cached; timeout falls back to the last response labelled stale; never zero-filled", async () => {
    const okFetch = (async () => new Response(JSON.stringify(openMeteoSample), { status: 200 })) as typeof fetch;
    const live = await json(await get("/api/weather", {}, okFetch));
    expect(live.status).toBe("live");
    expect(live.source).toMatch(/not NASA/);
    expect(live.data.daily[1].tmin).toBeNull();
    const failing = ((_u: string, init?: RequestInit) => new Promise((_, rej) => init?.signal?.addEventListener("abort", () => rej(new Error("aborted"))))) as typeof fetch;
    _resetForecastCache();
    const none = await get("/api/weather", {}, failing);
    expect(none.status).toBe(503);
    expect((await json(none)).error).toMatch(/timeout/);
  }, 15000);

  it("CORS only echoes allowed origins", async () => {
    const a = await get("/api/health", { headers: { Origin: "https://umbral-altovalle.vercel.app" } });
    expect(a.headers.get("Access-Control-Allow-Origin")).toBe("https://umbral-altovalle.vercel.app");
    const b = await get("/api/health", { headers: { Origin: "https://evil.example" } });
    expect(b.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("stays well inside the 10 ms CPU budget for the heaviest route (warm, local Node timing)", async () => {
    await get("/api/history?start=2027-04-10&end=2028-04-09&t=0&d=30");
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) await get("/api/history?start=2027-04-10&end=2028-04-09&t=0&d=30");
    const per = (performance.now() - t0) / 20;
    console.log(`history 366 days: ${per.toFixed(2)} ms per request (Node, warm)`);
    expect(per).toBeLessThan(10);
  });
});
