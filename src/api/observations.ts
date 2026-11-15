/**
 * One HLS observation for a scope and acquisition date, from the optional
 * Umbral API (schema umbral.api/1) or from the bundled processed file. The
 * answer is accepted only if its scope and date are the ones requested; image
 * paths are resolved against an explicit asset base, never against the API or
 * another host by accident.
 */
import { useEffect, useRef, useState } from "react";
import { API_BASE } from "./client";
import type { HlsObservation } from "../data";

export interface ObsView {
  acquisitionDate: string;
  sensor: string;
  quality: string;
  cleanPixels: number;
  totalPixels: number;
  ndviMedian: number | null;
  scope: string;
  /** Absolute URLs of the processed 30 m chips, or null when none exists. */
  rgbUrl: string | null;
  ndviUrl: string | null;
  origin: "Umbral API" | "bundled snapshot";
}

/** Base for processed assets (chips). Defaults to the app's own base, where the files are deployed with it. */
export const ASSET_BASE: string = (import.meta.env?.VITE_UMBRAL_ASSET_BASE as string | undefined) || (typeof document !== "undefined" ? document.baseURI : "http://localhost/");

export function assetUrl(path: string | null | undefined, base = ASSET_BASE): string | null {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  return new URL(path.replace(/^\//, ""), base.endsWith("/") ? base : `${base}/`).toString();
}

export function scopeKey(parcel: number | null): string {
  return parcel === null ? "cluster" : `p${parcel + 1}`;
}

export function fromBundled(o: HlsObservation, parcel: number | null, base = ASSET_BASE): ObsView {
  const p = parcel === null ? null : o.parcels[parcel];
  return {
    acquisitionDate: o.date, sensor: o.sensor, quality: p ? p.quality : o.quality, cleanPixels: p ? p.cleanPixels : o.cleanPixels, totalPixels: p ? p.pixels : o.pixels, ndviMedian: p ? p.ndviMedian : o.ndviMedian,
    scope: scopeKey(parcel), rgbUrl: assetUrl(o.rgbChip, base), ndviUrl: assetUrl(o.ndviChip, base), origin: "bundled snapshot",
  };
}

/** Validate an API body for exactly this request; anything else is rejected. */
export function fromApi(body: unknown, scope: string, date: string, base = ASSET_BASE): ObsView | null | "no data" {
  const b = body as { schema?: string; status?: string; data?: unknown };
  if (!b || b.schema !== "umbral.api/1" || !Array.isArray(b.data)) return null;
  if (b.status === "no data" || b.data.length === 0) return "no data";
  const d = b.data[0] as Record<string, unknown>;
  if (d.scope !== scope || d.acquisitionDate !== date) return null;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    acquisitionDate: date, sensor: String(d.sensor), quality: String(d.quality), cleanPixels: num(d.cleanPixels) ?? 0, totalPixels: num(d.totalPixels) ?? 0, ndviMedian: num(d.ndviMedian),
    scope, rgbUrl: assetUrl(d.preview as string | null, base), ndviUrl: assetUrl(d.ndviPreview as string | null, base), origin: "Umbral API",
  };
}

/** Observation for the selected scope/date; a late answer for an earlier selection is ignored. */
export function useObservation(selected: HlsObservation | null, parcel: number | null, fetcher: typeof fetch = fetch, apiBase: string | null = API_BASE, assetBase: string = ASSET_BASE): ObsView | null {
  const [view, setView] = useState<ObsView | null>(null);
  const seq = useRef(0);
  useEffect(() => {
    const id = ++seq.current;
    if (!selected) {
      setView(null);
      return;
    }
    const local = fromBundled(selected, parcel, assetBase);
    setView(local);
    if (!apiBase) return;
    const scope = scopeKey(parcel);
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 3000);
    fetcher(`${apiBase}/api/observations?scope=${scope}&product=hls&date=${selected.date}`, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (id !== seq.current) return; // a newer selection exists
        const v = body ? fromApi(body, scope, selected.date, assetBase) : null;
        if (v && v !== "no data") setView(v);
      })
      .catch(() => undefined) // keep the bundled view
      .finally(() => clearTimeout(t));
    return () => {
      ctl.abort();
      clearTimeout(t);
    };
  }, [selected, parcel, fetcher, apiBase, assetBase]);
  return view;
}
