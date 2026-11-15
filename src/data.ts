import { useEffect, useState } from "react";
import { withFallback } from "./api/client";
import type { DailySeries } from "./engine/climate";

export interface PowerMeta {
  requestUrl: string;
  retrieved: string;
  sha256: string;
  powerVersion: string;
  point: { lat: number; lon: number; elevationM: number };
  grid: string;
  units: Record<string, string>;
  fillValue: number;
  start: string;
  end: string;
  validYearRule: string;
  nValidYears: number;
  headerSources?: string[];
}

export interface HlsObservation {
  id: string;
  date: string;
  sensor: "L30" | "S30";
  tileCloudCover: number | null;
  pixels: number;
  cleanPixels: number;
  cleanFraction: number;
  quality: "clear" | "partial" | "obscured";
  ndviMedian: number | null;
  ndviP25: number | null;
  ndviP75: number | null;
  fmask: Record<string, number>;
  parcels: { label: string; pixels: number; cleanPixels: number; cleanFraction: number; quality: string; ndviMedian: number | null }[];
  ndviChip?: string;
  rgbChip?: string;
}

export interface HlsSeason {
  meta: {
    retrieved: string;
    collections: string[];
    season: { start: string; end: string; label: string };
    cleanRule: string;
    qualityClasses: Record<string, string>;
    itemsFound: number;
    itemsProcessed: number;
    chipSizePx: number;
    chipSizeM: number;
    outlinePx: number[][];
    parcelPixels: { label: string; pixels: number }[];
    clusterPixels: number;
    fmaskDescriptionTag?: string;
    chipGrid?: { cornersLonLat: Record<"nw" | "ne" | "se" | "sw", [number, number]>; note: string };
  };
  observations: HlsObservation[];
}

export interface HlsInterannual {
  meta: { retrieved: string; window: string; summaryRule: string };
  years: { year: number; itemsFound: number; processed: number; clearObservations: number; ndviMedianOfClear: number | null; clearDates: string[] }[];
}

export interface StationCheck {
  status: string;
  scope: string;
  station: { id: string; name: string; lat: number; lon: number; elevationM: number; source: string; variable: string; dayDefinition: string };
  caveats: string[];
  period: { months: string; firstYear: number; lastYear: number; commonDays: number; yearsWithCommonDays: number };
  dailyTmin: { biasPowerMinusStationC: number; rmseC: number; pearsonR: number };
  thresholdDays: { T: number; bothAtOrBelow: number; powerOnly: number; stationOnly: number; neither: number; stationEventDays: number; powerEventDays: number; hitRate: number | null; falseAlarmRatio: number | null; agreement: number }[];
  firstEvent: { T: number; searchWindow: string; rule?: string; validYears: number; yearsBothFound: number; medianDiffDays: number | null; meanAbsDiffDays: number | null; within7Days: number }[];
  summary: import("./engine/exposure").StationSummary;
}

export interface StudyArea {
  name: string;
  status: string;
  outlineNote: string;
  outline: number[][];
  nParcels: number;
  parcels: { label: string; declaredHa: number; innerHa: number; worldCover: Record<string, number> }[];
  inwardBufferM: number;
  orchardScreen: string;
}

export interface ParcelStats {
  parcelsInLayer: number;
  excludedPlateauRural: number;
  subrural: { n: number; p25Ha: number; medianHa: number; p75Ha: number };
  geometryVsDeclaredMedianRelDiff: number;
  note: string;
}

export interface StudyParcels {
  source: string;
  note: string;
  request?: string | null;
  serviceTimeStamp?: string | null;
  terms?: string;
  /** The four processed examples with their boundaries as served by the public layer and the sampling polygon used for NASA values. */
  parcels: { label: string; objectid: number; type: string; declaredHa: number; geometry: GeoJSON.Geometry; samplingGeometry: GeoJSON.Geometry }[];
}

export interface RegistryEntry {
  id: string;
  name: string;
  status: string;
  question: string;
  version?: string | null;
  retrieved?: string | null;
  variables?: string;
  dates?: string;
  scope?: string;
  quality?: string;
  processing?: string;
  note?: string;
}

export interface EmitScene {
  scene: string;
  acquired: string;
  timeUTC: string;
  sceneCloudPct: number;
  status: string;
  pixelsInside?: number;
  validPixels?: number;
  median?: { PV: number; NPV: number; BARE: number };
  medianUncertainty?: { PV: number; NPV: number; BARE: number };
}

export interface EmitFrcov {
  product: string;
  retrieved: string;
  scope: string;
  variables: string;
  limits: string;
  scenes: EmitScene[];
}

export interface AppData {
  power: (DailySeries & { meta: PowerMeta; tmean: (number | null)[]; tmax: (number | null)[]; precip: (number | null)[] }) | null;
  hls: HlsSeason | null;
  hlsInter: HlsInterannual | null;
  station: StationCheck | null;
  area: StudyArea | null;
  parcels: ParcelStats | null;
  shapes: StudyParcels | null;
  registry: { entries: RegistryEntry[]; origin?: string } | null;
  outlines: GeoJSON.FeatureCollection | null;
  emit: EmitFrcov | null;
  errors: string[];
  loading: boolean;
}

async function getJson<T>(path: string, timeoutMs = 15000): Promise<T> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(path, { signal: ctl.signal });
    if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
    return (await r.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

/** Loads the bundled data files (served with the app; no external requests). */
export function useAppData(): AppData {
  const [d, setD] = useState<AppData>({ power: null, hls: null, hlsInter: null, station: null, area: null, parcels: null, shapes: null, registry: null, emit: null, outlines: null, errors: [], loading: true });
  useEffect(() => {
    let alive = true;
    const files = {
      power: "data/power_daily.json",
      hls: "data/hls_season.json",
      hlsInter: "data/hls_interannual.json",
      station: "data/station_check.json",
      area: "data/study_area.json",
      parcels: "data/parcel_stats.json",
      shapes: "data/study_parcels.json",
      outlines: "data/parcel_outlines.json",
      registry: "data/sources_registry.json",
      emit: "data/emit_frcov.json",
    } as const;
    const load = (k: string, p: string) =>
      k === "registry"
        ? withFallback("/api/sources", (b) => ({ entries: b.data as RegistryEntry[], updated: String(b.processed ?? "") }), () => getJson<{ entries: RegistryEntry[] }>(p)).then((r) => ({ ...r.data, origin: r.note }))
        : getJson<unknown>(p);
    Promise.allSettled(Object.entries(files).map(([k, p]) => load(k, p))).then((res) => {
      if (!alive) return;
      const keys = Object.keys(files) as (keyof typeof files)[];
      const next: AppData = { power: null, hls: null, hlsInter: null, station: null, area: null, parcels: null, shapes: null, registry: null, emit: null, outlines: null, errors: [], loading: false };
      res.forEach((r, i) => {
        const k = keys[i];
        if (r.status === "fulfilled") (next as unknown as Record<string, unknown>)[k] = r.value;
        else if (k !== "hlsInter" && k !== "registry" && k !== "emit" && k !== "outlines") next.errors.push(`Could not load ${files[k]}.`);
      });
      setD(next);
    });
    return () => {
      alive = false;
    };
  }, []);
  return d;
}
