import { useEffect, useRef, useState } from "react";
import { createLatest, normalizeOpenMeteo, openMeteoUrl, type Forecast, type Place } from "./model";
import { parsePowerLive, powerLiveUrl, type PowerSeries } from "../climate/history";
import type { ISODate } from "../engine/dates";

const FRESH_MS = 30 * 60 * 1000;
const memory = new Map<string, { at: number; value: unknown }>();

function readStore<T>(key: string): { at: number; value: T } | null {
  const m = memory.get(key);
  if (m) return m as { at: number; value: T };
  try {
    const s = localStorage.getItem(key);
    if (s) return JSON.parse(s);
  } catch {
    /* storage unavailable */
  }
  return null;
}

function writeStore(key: string, value: unknown) {
  const rec = { at: Date.now(), value };
  memory.set(key, rec);
  try {
    localStorage.setItem(key, JSON.stringify(rec));
  } catch {
    /* storage unavailable */
  }
}

export type ForecastState =
  | { status: "loading"; forecast: null; error: null }
  | { status: "fresh"; forecast: Forecast; error: null }
  | { status: "stale"; forecast: Forecast; error: string }
  | { status: "error"; forecast: null; error: string };

/**
 * Forecast for one place (provider: Open-Meteo, no key). Cached by provider +
 * location for 30 minutes; a failed refresh shows the last cached forecast
 * marked as stale with its original retrieval time. Older responses that
 * arrive late are ignored.
 */
export function useForecast(place: Place, enabled = true): ForecastState {
  const [state, setState] = useState<ForecastState>({ status: "loading", forecast: null, error: null });
  const latest = useRef(createLatest());
  const key = `umbral:forecast:open-meteo:${place.lat.toFixed(3)},${place.lon.toFixed(3)}:16d`;
  useEffect(() => {
    const id = latest.current.next();
    if (!enabled) return;
    const cached = readStore<Forecast>(key);
    if (cached && Date.now() - cached.at < FRESH_MS) {
      setState({ status: "fresh", forecast: cached.value, error: null });
      return;
    }
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(openMeteoUrl(place), { signal: ctl.signal });
        if (!r.ok) throw new Error(`Forecast service answered ${r.status}.`);
        const f = normalizeOpenMeteo(await r.json(), place, new Date().toISOString());
        writeStore(key, f);
        if (latest.current.isLatest(id)) setState({ status: "fresh", forecast: f, error: null });
      } catch (e) {
        if (ctl.signal.aborted || !latest.current.isLatest(id)) return;
        const msg = e instanceof Error ? e.message : "Forecast not available.";
        if (cached) setState({ status: "stale", forecast: cached.value, error: msg });
        else setState({ status: "error", forecast: null, error: msg });
      }
    }, 300); // debounce
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [key, place, enabled]);
  return state;
}

export type LiveState = {
  status: "idle" | "loading" | "ok" | "error";
  /** The exact dates this state answers; a series is never shown under other dates. */
  range: [ISODate, ISODate] | null;
  series: PowerSeries | null;
  lastValid: ISODate | null;
  /** Dates with complete values, so coverage reflects gaps and the first date, not only the last valid one. */
  validDays: ISODate[];
  version: string | null;
  error: string | null;
  retrievedAt: string | null;
};

const liveKey = (r: [ISODate, ISODate] | null) => (r ? `umbral:power-live:v2:${r[0]}:${r[1]}` : null);
const emptyLive = (status: LiveState["status"], range: [ISODate, ISODate] | null): LiveState => ({ status, range, series: null, lastValid: null, validDays: [], version: null, error: null, retrievedAt: null });

/**
 * Live NASA POWER for dates after the bundled record (no key). Each result is
 * bound to its query dates: while a new request loads, no earlier series is
 * returned, and a late answer to an older request is ignored.
 */
export function useLivePower(range: [ISODate, ISODate] | null): LiveState {
  const k = liveKey(range);
  const [state, setState] = useState<LiveState & { key: string | null }>({ ...emptyLive("idle", null), key: null });
  const latest = useRef(createLatest());
  useEffect(() => {
    const id = latest.current.next();
    if (!range || !k) {
      setState({ ...emptyLive("idle", null), key: null });
      return;
    }
    const cached = readStore<LiveState>(k);
    if (cached && Date.now() - cached.at < 6 * 3600 * 1000) {
      setState({ ...cached.value, key: k });
      return;
    }
    setState({ ...emptyLive("loading", range), key: k });
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(powerLiveUrl(range[0], range[1]), { signal: ctl.signal });
        if (!r.ok) throw new Error(`NASA POWER answered ${r.status}.`);
        const p = parsePowerLive(await r.json(), range[0], range[1]);
        const v: LiveState = { status: "ok", range, series: p.series, lastValid: p.lastValid, validDays: p.validDays, version: p.version, error: null, retrievedAt: new Date().toISOString() };
        writeStore(k, v);
        if (latest.current.isLatest(id)) setState({ ...v, key: k });
      } catch (e) {
        if (ctl.signal.aborted || !latest.current.isLatest(id)) return;
        setState({ ...emptyLive("error", range), error: e instanceof Error ? e.message : "NASA POWER not available.", key: k });
      }
    }, 400);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k]);
  // Between a date change and its effect, the stored state still belongs to the old dates: never return it.
  if (state.key !== k) return emptyLive(k ? "loading" : "idle", range);
  const { key: _key, ...out } = state;
  return out;
}
