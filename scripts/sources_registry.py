"""Write public/data/sources_registry.json: one entry per researched source with
its question, version, variable/unit, dates, spatial scope, quality, processing
and an honest status. Statuses for probed sources are read from the files the
probes produced; nothing is filled in by hand when a probe did not run.

Usage: python -I scripts/sources_registry.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
D = ROOT / "public" / "data"
RAW = ROOT / "data" / "raw"


def load(p):
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return None


prov = load(D / "provenance.json") or {}
emit = load(D / "emit_frcov.json")
ndre = load(D / "hls_ndre.json")
cat = load(RAW / "catalog_checks_2026-11-14.json") or {}

entries = [
    {
        "id": "power", "name": "NASA POWER daily (regional reanalysis)", "status": "integrated",
        "question": "How often did the plan's dates meet an early cold night, and what rain and temperatures did the same dates have in past years?",
        "version": (prov.get("power") or {}).get("powerVersion"), "retrieved": (prov.get("power") or {}).get("retrieved"),
        "variables": "T2M_MIN, T2M_MAX, T2M (°C); PRECTOTCORR (mm/day)", "dates": "1981-2025 bundled; recent past days fetched live",
        "scope": "One regional value (grid about 55 km) for the whole area; not per field",
        "quality": "Checked against NOAA GSOD Neuquén Aero: places first cold nights later than the station (reads optimistic); no bias correction applied",
        "processing": "scripts/fetch_power.py, scripts/station_check.py",
    },
    {
        "id": "hls", "name": "NASA HLS v2.0 vegetation index (NDVI), Landsat L30 + Sentinel-2 S30", "status": "integrated",
        "question": "What did the processed example parcels look like on each 2024 date?",
        "version": "HLSL30_VI / HLSS30_VI v2.0", "retrieved": (prov.get("hlsSeason") or {}).get("retrieved"),
        "variables": "NDVI (unitless), Fmask", "dates": "1 Feb-30 Nov 2024; winters 2016-2025 summary",
        "scope": "Four processed example parcels (30 m pixels, 30 m inward buffer) and their cluster",
        "quality": "Fmask clean-pixel rule; dates classed clear / partly masked / mostly masked", "processing": "scripts/hls_trajectory.py",
    },
    {
        "id": "open-meteo", "name": "Open-Meteo forecast (not NASA)", "status": "integrated (live)",
        "question": "What weather is expected for actions in the coming days?",
        "version": "best_match blend", "retrieved": "at page load, cached 30 min", "variables": "temperature (°C), rain (mm), rain chance (%), wind (km/h); units validated or converted",
        "dates": "today to about 16 days ahead", "scope": "nearest model grid point (a few km)", "quality": "weather-model estimate; not an official warning", "processing": "src/weather/model.ts",
    },
    {
        "id": "gsod", "name": "NOAA GSOD, Neuquén Aero station 87715099999", "status": "integrated (check)",
        "question": "Does the regional POWER record place cold nights like a nearby station?",
        "version": "GSOD", "retrieved": (prov.get("stationCheck") or {}).get("retrieved"), "variables": "daily minimum temperature (°C)",
        "dates": "complete years in the overlap", "scope": "one station about 45 km away; not a validation at the plot",
        "quality": "different hours (UTC vs local) and siting", "processing": "scripts/station_check.py",
    },
]

if ndre and ndre.get("observations"):
    obs = ndre["observations"]
    clear = [o for o in obs if o["quality"] == "clear" and o["ndreMedian"] is not None]
    entries.append({
        "id": "hls-ndre", "name": "HLS S30 red edge (NDRE, exploratory)", "status": "probed: subset produced, not used in the suggestion",
        "question": "Does a red-edge signal add anything to NDVI for the examples?",
        "version": "HLSS30 v2.0 reflectance B8A, B05", "retrieved": ndre["meta"]["retrieved"], "variables": "NDRE = (B8A - B05)/(B8A + B05), unitless",
        "dates": f"{len(obs)} Sentinel-2 dates in 2024 ({len(clear)} clear for the cluster)", "scope": "cluster and examples, 30 m",
        "quality": "same clean-pixel rule as NDVI; Landsat dates excluded (no red-edge band)", "processing": "scripts/hls_ndre.py",
        "note": "A vegetation signal related to chlorophyll; it does not measure soil nitrogen and is not a fertilization diagnosis.",
    })
else:
    entries.append({"id": "hls-ndre", "name": "HLS S30 red edge (NDRE, exploratory)", "status": "not run", "question": "Exploratory vegetation signal", "note": "The probe script exists (scripts/hls_ndre.py) but produced no subset."})

if emit:
    sc = emit["scenes"]
    ok = [s for s in sc if s.get("status") == "values"]
    entries.append({
        "id": "emit-frcov", "name": "EMIT L2B Fractional Cover v002", "status": "probed: values for some dates" if ok else "probed: no usable values",
        "question": "What was on the ground on a given date: green plants, dry plant material, bare soil?",
        "version": "EMITL2BFRCOV.002 (C4303752957-LPCLOUD)", "retrieved": emit["retrieved"], "variables": "PV, NPV, BARE fractions (0-1) and uncertainties",
        "dates": "; ".join(f"{d}: {v}" for d, v in sorted({s["acquired"]: (f"{s.get('validPixels')} valid px" if s.get("status") == "values" else "no valid pixels") for s in sorted(sc, key=lambda s: s.get("status") == "values")}.items())) + " (2026-09-15 has two scenes; the one with values is used, its twin covered the area with fill only)",
        "scope": "cluster of the four examples together; 60 m pixels", "quality": "NPV can be inflated near cloud and shadow edges; no March-October 2024 scene",
        "processing": "scripts/emit_frcov.py",
    })
else:
    entries.append({"id": "emit-frcov", "name": "EMIT L2B Fractional Cover v002", "status": "not run", "question": "What was on the ground on a given date?"})

eco = (cat.get("ecostress") or {})
entries += [
    {
        "id": "ecostress", "name": "ECOSTRESS JET v002 / ETAUX v003 / JET v003", "status": "catalog checked only; not integrated",
        "question": "Historical evapotranspiration and modelled moisture for specific dates",
        "dates": f"Granules intersecting the study rectangle: JET v002 2024 {eco.get('C2076106409-LPCLOUD 2024-2024', '?')}; ETAUX v003 2024 {eco.get('C4057520953-LPCLOUD 2024-2024', '?')}, 2022-2026 {eco.get('C4057520953-LPCLOUD 2022-2026', '?')}",
        "scope": "70 m", "note": "ETAUX soil moisture is downscaled from GEOS-5 FP (model-derived), not a plot measurement. Not read: QA and geolocation of specific scenes were not verified in this version.",
    },
    {
        "id": "smap", "name": "SMAP L4 SPL4SMGP v008", "status": "catalog checked only; not integrated",
        "question": "Regional surface and root-zone moisture for comparing periods",
        "version": "C3480440870-NSIDC_CPRD", "dates": f"{cat.get('smap_2024_aprOct_hits', '?')} granules Apr-Oct 2024 over the area",
        "scope": "9 km model grid", "note": "Too coarse to say anything about a 4 ha irrigated plot; provider notice of a geolocation issue 14 May-28 Jul 2026 under reprocessing.",
    },
    {
        "id": "imerg", "name": "GPM IMERG Final daily", "status": "access confirmed; not integrated",
        "question": "Historical rain for comparable dates (complement to POWER)",
        "version": "V07 (C2723754864-GES_DISC), catalog through 2025-09-30",
        "note": "An earlier test (14 Nov 2026) returned HTTP 403; a repeat on 15 Nov 2026 (UTC) returned HTTP 200 from data.gesdisc.earthdata.nasa.gov through a CloudFront redirect (sanitized record in data/raw/imerg_access_test.json). The file was not processed. POWER rain remains the source used in the app.",
    },
    {
        "id": "soil", "name": "Soil context: ORNL IGBP-DIS (569), HYSOGs250m, SoilGrids", "status": "assessed; not integrated",
        "question": "Regional soil context",
        "note": "Historical or regional surfaces (5 arc-min, 250 m) cannot give current plant-available nitrogen or certify drainage of a field; access and units were not verified. Soil analysis stays a user input with method, depth and date; unknown is valid.",
    },
    {
        "id": "worldcover", "name": "ESA WorldCover 2021", "status": "used in selection only",
        "question": "Screen out tree-covered parcels when choosing the examples", "note": "Broad land cover, not crop identity; 2021 vs 2024 imagery.",
    },
    {
        "id": "cadastre", "name": "Río Negro provincial parcel layer (IDERN WFS geonode:PARCELARIO1)", "status": "integrated",
        "question": "Where are the example parcels and which pixels were sampled?", "version": "WFS 2.0.0", "dates": "service time stamp 2026-11-13; re-download 2026-11-15 identical", "scope": "2,341 SUBRURAL/RURAL parcels around General Roca; 212 shown on the map; 4 examples sampled", "processing": "scripts/fetch_parcelario.py, scripts/parcels.py, scripts/parcel_layers.py", "note": "Boundaries shown as served, with attribution; no owner or crop. The original GeoJSON is reproduced by download, not redistributed, while redistribution terms are unconfirmed.",
    },
    {
        "id": "era5", "name": "ERA5-Land", "status": "not obtained", "question": "Regional cross-check", "note": "No subset was obtained; models sharing inputs would not be an independent validation.",
    },
]

D.joinpath("sources_registry.json").write_text(json.dumps({"updated": "2026-11-14", "entries": entries}, indent=1, ensure_ascii=False), encoding="utf-8")
print(len(entries), "entries")
