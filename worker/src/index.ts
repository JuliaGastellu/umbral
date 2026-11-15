/**
 * Umbral API (optional). A small Cloudflare Worker that serves already
 * processed, approved data with provenance. It does not process rasters,
 * proxy arbitrary URLs, accept arbitrary coordinates, or hold credentials.
 * The app keeps working from its bundled data when this API is absent.
 */
import power from "../../public/data/power_daily.json";
import hls from "../../public/data/hls_season.json";
import emit from "../../public/data/emit_frcov.json";
import registry from "../../public/data/sources_registry.json";
import station from "../../public/data/station_check.json";
import { exposureByYear, summarize, yearsInRange, type DailySeries } from "../../src/engine/climate";
import { seriesYears } from "../../src/engine/exposure";
import { normalizeOpenMeteo, openMeteoUrl, type Place } from "../../src/weather/model";

export const SCHEMA = "umbral.api/1";
export const DATA_VERSION = "2026-11-15";

export interface Env {
  /** Comma-separated origins allowed by CORS (production app, prototype, local dev). Not authentication. */
  ALLOWED_ORIGINS?: string;
}

/** Shared envelope for every successful response. */
export interface Envelope<T> {
  schema: typeof SCHEMA;
  dataVersion: string;
  source: string;
  product: string;
  version: string | null;
  observed: string | null;
  issued: string | null;
  processed: string | null;
  scope: string;
  resolution: string;
  quality: string;
  status: "processed snapshot" | "live" | "cached" | "stale snapshot" | "catalog" | "no data";
  role: string;
  data: T;
}

const PLACE: Place = { name: "General Roca area", lat: -39.053, lon: -67.6 };
const FORECAST_TIMEOUT_MS = 4000;
const FORECAST_FRESH_S = 1800;
const ALLOWED_UPSTREAM = new Set(["api.open-meteo.com"]);
const SERIES: DailySeries = { startDate: (power as { startDate: string }).startDate, tmin: (power as { tmin: (number | null)[] }).tmin };
const PRECIP: (number | null)[] = (power as { precip: (number | null)[] }).precip;
const POWER_META = (power as { meta: { powerVersion: string; retrieved: string } }).meta;
let lastForecast: { body: Envelope<unknown>; at: number } | null = null;

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function env<T>(p: Omit<Envelope<T>, "schema" | "dataVersion">): Envelope<T> {
  return { schema: SCHEMA, dataVersion: DATA_VERSION, ...p };
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
function isoParam(u: URL, k: string, required = true): string | null {
  const v = u.searchParams.get(k);
  if (v === null || v === "") {
    if (required) throw new HttpError(400, `Missing parameter "${k}" (YYYY-MM-DD).`);
    return null;
  }
  if (!ISO.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`)) || new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) !== v) throw new HttpError(400, `Parameter "${k}" must be a real date YYYY-MM-DD.`);
  return v;
}
function numParam(u: URL, k: string, def: number, min: number, max: number): number {
  const v = u.searchParams.get(k);
  if (v === null || v === "") return def;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) throw new HttpError(400, `Parameter "${k}" must be a number between ${min} and ${max}.`);
  return n;
}
function onlyParams(u: URL, allowed: string[]) {
  for (const k of u.searchParams.keys()) if (!allowed.includes(k)) throw new HttpError(400, `Unknown parameter "${k}". Allowed: ${allowed.join(", ") || "none"}.`);
}
const days = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);

function health() {
  return env({
    source: "Umbral API", product: "health", version: DATA_VERSION, observed: null, issued: null, processed: null,
    scope: "service", resolution: "—", quality: "—", status: "processed snapshot", role: "Availability and data versions only.",
    data: { ok: true, powerVersion: POWER_META.powerVersion, powerRetrieved: POWER_META.retrieved, hlsRetrieved: (hls as { meta: { retrieved: string } }).meta.retrieved, emitRetrieved: (emit as { retrieved: string }).retrieved, routes: ["/api/health", "/api/sources", "/api/observations", "/api/history", "/api/weather"] },
  });
}

function sources() {
  return env({
    source: "Umbral source registry", product: "sources", version: DATA_VERSION, observed: null, issued: null, processed: (registry as { updated: string }).updated,
    scope: "all sources considered", resolution: "—", quality: "statuses as recorded by the processing scripts", status: "processed snapshot",
    role: "Which sources are integrated, probed, catalog-only or not obtained; a catalog lookup is not an integrated dataset.",
    data: (registry as { entries: unknown[] }).entries,
  });
}

type HlsObs = { id: string; date: string; sensor: string; quality: string; pixels: number; cleanPixels: number; ndviMedian: number | null; ndviChip?: string; rgbChip?: string; parcels: { label: string; pixels: number; cleanPixels: number; quality: string; ndviMedian: number | null }[] };
const SCOPES = ["cluster", "p1", "p2", "p3", "p4"];

function observations(u: URL) {
  onlyParams(u, ["scope", "product", "date"]);
  const scope = u.searchParams.get("scope") ?? "cluster";
  const product = u.searchParams.get("product") ?? "hls";
  if (!SCOPES.includes(scope)) throw new HttpError(400, `Unknown scope. Allowed: ${SCOPES.join(", ")} (anonymous processed examples only).`);
  const date = isoParam(u, "date", false);
  if (product === "emit") {
    if (scope !== "cluster") throw new HttpError(400, "EMIT is processed as a cluster summary only; there are no per-parcel EMIT values.");
    const e = emit as { product: string; retrieved: string; scope: string; limits: string; qcRule?: string; scenes: { acquired: string; status: string }[] };
    const scenes = date ? e.scenes.filter((x) => x.acquired === date) : e.scenes;
    return env({
      source: "NASA EMIT via LP DAAC", product: e.product, version: "002", observed: date, issued: null, processed: e.retrieved,
      scope: e.scope, resolution: "60 m pixels, cluster median", quality: e.qcRule ?? "QC = 0 only", status: scenes.length ? "processed snapshot" : "no data",
      role: "Dated evidence of green, non-green and bare fractions; not nitrogen, not winter-2024 cover.", data: { scenes, limits: e.limits },
    });
  }
  if (product !== "hls") throw new HttpError(400, "Unknown product. Allowed: hls, emit.");
  const all = (hls as { observations: HlsObs[] }).observations;
  const idx = scope === "cluster" ? -1 : Number(scope.slice(1)) - 1;
  const view = (o: HlsObs) => {
    const p = idx >= 0 ? o.parcels[idx] : null;
    return { acquisitionDate: o.date, sensor: o.sensor, quality: p ? p.quality : o.quality, cleanPixels: p ? p.cleanPixels : o.cleanPixels, totalPixels: p ? p.pixels : o.pixels, ndviMedian: p ? p.ndviMedian : o.ndviMedian, scope, preview: o.rgbChip ?? null, ndviPreview: o.ndviChip ?? null };
  };
  if (date) {
    const hit = all.filter((o) => o.date === date);
    return env({
      source: "NASA HLS v2.0 via LP DAAC (NASA/USGS Landsat, ESA Sentinel-2)", product: "HLSL30_VI / HLSS30_VI", version: "2.0", observed: hit.length ? date : null, issued: null, processed: (hls as { meta: { retrieved: string } }).meta.retrieved,
      scope: `${scope} (anonymous processed example)`, resolution: "30 m pixels, 30 m inward buffer", quality: "Fmask clean-pixel rule", status: hit.length ? "processed snapshot" : "no data",
      role: "Observed greenness on a real acquisition date; does not choose a cover species.", data: hit.map(view),
    });
  }
  return env({
    source: "NASA HLS v2.0 via LP DAAC", product: "HLSL30_VI / HLSS30_VI", version: "2.0", observed: null, issued: null, processed: (hls as { meta: { retrieved: string } }).meta.retrieved,
    scope: `${scope} (anonymous processed example)`, resolution: "30 m", quality: "per-date quality class", status: "processed snapshot",
    role: "Available real acquisition dates with quality; no date is substituted.", data: all.map((o) => ({ acquisitionDate: o.date, sensor: o.sensor, quality: idx >= 0 ? o.parcels[idx].quality : o.quality })),
  });
}

/** Bounded regional climate summary for the requested dates, computed with the app's own engine. */
function history(u: URL) {
  onlyParams(u, ["start", "end", "t", "d"]);
  const start = isoParam(u, "start")!;
  const end = isoParam(u, "end")!;
  const span = days(start, end);
  if (span < 1 || span > 366) throw new HttpError(400, "The period must run forward and last at most 366 days.");
  const t = numParam(u, "t", 0, -15, 5);
  const d = numParam(u, "d", 30, 1, 120);
  const { first, last } = seriesYears(SERIES);
  const years = yearsInRange(first, last);
  const rows = exposureByYear(SERIES, { start, end, t, years });
  const sum = summarize(rows, d);
  // Rain total per year for the same calendar dates (complete years only; missing days are not zero).
  const base = Date.parse(`${SERIES.startDate}T00:00:00Z`);
  const rain: { year: number; mm: number | null }[] = years.map((y) => {
    const s = `${y}${start.slice(4)}`;
    const i0 = Math.round((Date.parse(`${s.slice(5) === "02-29" ? `${y}-02-28` : s}T00:00:00Z`) - base) / 864e5);
    let tot = 0;
    for (let k = 0; k <= span; k++) {
      const v = PRECIP[i0 + k];
      if (v === null || v === undefined) return { year: y, mm: null };
      tot += v;
    }
    return { year: y, mm: Math.round(tot * 10) / 10 };
  });
  const st = (station as { summary?: { firstEventMedianLagDays?: Record<string, number> } }).summary;
  return env({
    source: "NASA POWER daily (MERRA-2 / GEOS-IT)", product: "T2M_MIN, PRECTOTCORR", version: POWER_META.powerVersion, observed: `${years[0]}–${years[years.length - 1]}`, issued: null, processed: POWER_META.retrieved,
    scope: "General Roca reference point; one regional value for every example field", resolution: "about 55 km grid", quality: `Station check: first cold nights later than Neuquén Aero by about ${st?.firstEventMedianLagDays?.["0"] ?? "?"} days at 0 °C (reads optimistic)`,
    status: "processed snapshot", role: "Past frequency for these calendar dates; not a forecast and not next season's probability. 0 °C is not a lethal threshold.",
    data: { start, end, t, d, years: sum.total, met: sum.met, notMet: sum.notMet, notEvaluable: sum.notEvaluable, perYear: rows.map((r, i) => ({ year: r.year, firstNightDay: r.outcome === "event" ? r.days : null, outcome: r.outcome, rainMm: rain[i].mm })) },
  });
}

async function weather(u: URL, fetcher: typeof fetch): Promise<Envelope<unknown>> {
  onlyParams(u, []);
  const url = new URL(openMeteoUrl(PLACE));
  if (!ALLOWED_UPSTREAM.has(url.hostname)) throw new HttpError(500, "Upstream not allowed.");
  if (lastForecast && Date.now() - lastForecast.at < FORECAST_FRESH_S * 1000) return { ...lastForecast.body, status: "cached" };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FORECAST_TIMEOUT_MS);
  try {
    const r = await fetcher(url.toString(), { signal: ctl.signal, headers: { "User-Agent": "umbral-api (Space Apps demo)" } });
    if (!r.ok) throw new Error(`Forecast provider answered ${r.status}.`);
    const f = normalizeOpenMeteo(await r.json(), PLACE, new Date().toISOString());
    const body = env({
      source: "Open-Meteo forecast (CC BY 4.0); not NASA", product: "best_match forecast", version: null, observed: null, issued: f.retrievedAt, processed: f.retrievedAt,
      scope: `Model grid point ${f.gridLat.toFixed(3)}, ${f.gridLon.toFixed(3)}`, resolution: "weather-model grid, a few km", quality: `Units: ${Object.values(f.units).slice(0, 3).join(", ")}…`, status: "live" as const,
      role: `Forecast for operations in the next days (${f.firstDate} to ${f.lastDate}); never extended to dates beyond its horizon.`, data: { firstDate: f.firstDate, lastDate: f.lastDate, units: f.units, daily: f.daily },
    });
    lastForecast = { body, at: Date.now() };
    return body;
  } catch (e) {
    if (lastForecast) return { ...lastForecast.body, status: "stale snapshot", role: `${lastForecast.body.role} Refresh failed (${e instanceof Error ? e.message : "error"}); this is the last valid response, retrieved ${lastForecast.body.issued}.` };
    throw new HttpError(503, `Forecast not available (${ctl.signal.aborted ? "timeout" : e instanceof Error ? e.message : "error"}); no snapshot cached yet.`);
  } finally {
    clearTimeout(timer);
  }
}

function cors(req: Request, e: Env): Record<string, string> {
  const origin = req.headers.get("Origin");
  const allowed = (e.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (origin && allowed.includes(origin)) return { "Access-Control-Allow-Origin": origin, Vary: "Origin", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Max-Age": "86400" };
  return { Vary: "Origin" };
}

export async function handle(req: Request, e: Env = {}, fetcher: typeof fetch = fetch): Promise<Response> {
  const u = new URL(req.url);
  const base = { "Content-Type": "application/json; charset=utf-8", "X-Content-Type-Options": "nosniff", ...cors(req, e) };
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: base });
  if (req.method !== "GET") return new Response(JSON.stringify({ schema: SCHEMA, error: "Only GET is supported." }), { status: 405, headers: { ...base, Allow: "GET, OPTIONS" } });
  try {
    let body: Envelope<unknown>;
    let maxAge = 3600;
    switch (u.pathname) {
      case "/api/health": onlyParams(u, []); body = health(); maxAge = 60; break;
      case "/api/sources": onlyParams(u, []); body = sources(); break;
      case "/api/observations": body = observations(u); break;
      case "/api/history": body = history(u); maxAge = 86400; break;
      case "/api/weather": body = await weather(u, fetcher); maxAge = body.status === "live" || body.status === "cached" ? 600 : 60; break;
      default: throw new HttpError(404, "Unknown route. See /api/health for the list.");
    }
    return new Response(JSON.stringify(body), { status: 200, headers: { ...base, "Cache-Control": `public, max-age=${maxAge}` } });
  } catch (err) {
    const status = err instanceof HttpError ? err.status : 500;
    const msg = err instanceof HttpError ? err.message : "Internal error.";
    return new Response(JSON.stringify({ schema: SCHEMA, error: msg }), { status, headers: { ...base, "Cache-Control": "no-store" } });
  }
}

/** Reset the in-isolate forecast cache (tests only). */
export function _resetForecastCache() {
  lastForecast = null;
}

export default { fetch: (req: Request, e: Env) => handle(req, e) };
