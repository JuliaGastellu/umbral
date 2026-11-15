"""Probe EMIT L2B Fractional Cover v002 over the Umbral study cluster.

Question: "What was on the ground on this date?" (green vegetation, non-green
plant material, bare soil), for real EMIT acquisition dates only.

Requires the .venv environment and the Earthdata Login the user set up herself
(netrc). Never prints, stores or logs credentials or tokens; reuses the
authenticated session helper of scripts/hls_trajectory.py.

Inputs:
    data/raw/cluster_parcels.json  inward-buffered geometries (git-ignored, never published)
Outputs:
    public/data/emit_frcov.json    cluster-level summaries and a status per scene
    data/raw/emit_probe.json       file metadata seen during the probe (local)

Usage:
    .venv/Scripts/python.exe -I scripts/emit_frcov.py
"""
from __future__ import annotations

import datetime as dt
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import hls_trajectory as H  # noqa: E402  (login_env / ropen helpers)

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "public" / "data"
BASE = "https://data.lpdaac.earthdatacloud.nasa.gov/lp-prod-protected/EMITL2BFRCOV.002"
# Candidates from a public CMR query (collection C4303752957-LPCLOUD, rectangle -67.62,-39.07,-67.58,-39.03),
# with the scene cloud cover CMR reports. Scene cover does not certify the study area.
SCENES = [
    ("G4382483672-LPCLOUD", "20240108T140434", 0),
    ("G4384641503-LPCLOUD", "20240223T194227", 0),
    ("G4410409203-LPCLOUD", "20241111T184432", 56),
    ("G4321599381-LPCLOUD", "20260915T162209", 0),
    ("G4321599382-LPCLOUD", "20260915T162157", 1),
]
LAYERS = ["PV", "NPV", "BARE", "PVUNC", "NPVUNC", "BAREUNC", "QC"]


def url(stamp: str, layer: str) -> str:
    return f"{BASE}/EMIT_L2B_FRCOV_002_{stamp}/EMIT_L2B_FRCOV{layer}_002_{stamp}.tif"


def main() -> int:
    from pyproj import Transformer
    from rasterio.windows import from_bounds
    from shapely.geometry import Point, shape
    from shapely.ops import transform, unary_union

    parcels = json.loads((RAW / "cluster_parcels.json").read_text(encoding="utf-8"))["parcels"]
    union_ll = unary_union([shape(p["innerGeometry"]) for p in parcels])
    probe_log, out_scenes = [], []
    with H.login_env():
        for gid, stamp, scene_cloud in SCENES:
            rec = {"granule": gid, "scene": f"EMIT_L2B_FRCOV_002_{stamp}", "acquired": f"{stamp[:4]}-{stamp[4:6]}-{stamp[6:8]}", "timeUTC": f"{stamp[9:11]}:{stamp[11:13]}", "sceneCloudPct": scene_cloud}
            try:
                arrays, meta = {}, {}
                for layer in LAYERS:
                    with H.ropen(url(stamp, layer)) as ds:
                        tr = Transformer.from_crs("EPSG:4326", ds.crs, always_xy=True)
                        g = transform(lambda x, y, z=None: tr.transform(x, y), union_ll)
                        minx, miny, maxx, maxy = g.buffer(abs(ds.res[0]) * 2).bounds
                        win = from_bounds(minx, miny, maxx, maxy, ds.transform).round_offsets().round_lengths()
                        a = ds.read(1, window=win)
                        wt = ds.window_transform(win)
                        arrays[layer] = a
                        meta[layer] = {"crs": str(ds.crs), "res": list(ds.res), "dtype": str(a.dtype), "nodata": ds.nodata, "scales": list(ds.scales), "offsets": list(ds.offsets), "tags": {k: v[:300] for k, v in ds.tags().items()}, "band1": {k: v[:300] for k, v in ds.tags(1).items()}}
                rows, cols = arrays["PV"].shape
                inside = np.zeros((rows, cols), bool)
                for r in range(rows):
                    for c in range(cols):
                        x, y = wt * (c + 0.5, r + 0.5)
                        inside[r, c] = g.contains(Point(x, y))
                rec["pixelsInside"] = int(inside.sum())
                rec["pixelSizeNative"] = meta["PV"]["res"]
                nod = {k: meta[k]["nodata"] for k in LAYERS}
                valid = inside.copy()
                for k in ("PV", "NPV", "BARE"):
                    a = arrays[k].astype(float)
                    if nod[k] is not None:
                        valid &= a != nod[k]
                    valid &= np.isfinite(a) & (a >= 0) & (a <= 1)
                qc = arrays["QC"]
                # QC (ATBD section 4.6): 0 = no flag, valid pixel; 1 cloud, 2 urban, 3 water, 4 snow/ice; -9999 fill.
                valid &= qc == 0
                rec["qcValuesInside"] = {str(int(v)): int((qc[inside] == v).sum()) for v in np.unique(qc[inside])} if inside.any() else {}
                rec["validPixels"] = int(valid.sum())
                if valid.sum() >= 3:
                    rec["median"] = {k: round(float(np.median(arrays[k][valid])), 3) for k in ("PV", "NPV", "BARE")}
                    rec["medianUncertainty"] = {k[:-3]: round(float(np.median(arrays[k][valid])), 3) for k in ("PVUNC", "NPVUNC", "BAREUNC")}
                    rec["status"] = "values"
                else:
                    rec["status"] = "no valid pixels in the study area"
                probe_log.append({"scene": rec["scene"], "meta": meta})
            except Exception as e:  # access, missing file or format problem: record, do not invent
                rec["status"] = f"not read: {type(e).__name__}: {str(e)[:160]}"
            out_scenes.append(rec)
            print(json.dumps({k: rec.get(k) for k in ("scene", "status", "pixelsInside", "validPixels", "median", "medianUncertainty", "qcValuesInside")}))
    (RAW / "emit_probe.json").write_text(json.dumps(probe_log, indent=1), encoding="utf-8")
    OUT.joinpath("emit_frcov.json").write_text(json.dumps({
        "product": "EMIT L2B Estimated Fractional Cover v002 (EMITL2BFRCOV.002, DOI 10.5067/EMIT/EMITL2BFRCOV.002)",
        "collection": "C4303752957-LPCLOUD",
        "retrieved": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "scope": "Cluster of the four processed examples: pixels whose centre lies inside the inward-buffered parcels, together. Not per parcel.",
        "variables": "PV green vegetation, NPV non-photosynthetic material (dry plants, litter, wood and other material; not only crop residue), BARE exposed soil; fractions 0-1, with per-pixel uncertainty.",
        "qcRule": "Only pixels with QC = 0 (no flag: valid fractional cover pixel; EMIT L2B FRCOV ATBD section 4.6) and fractions within 0-1 are used.",
        "limits": "60 m pixels; a few pixels per parcel. NPV can be inflated near cloud and shadow edges. No scene between March and October 2024 in this collection over the area; values are never moved to another date or year.",
        "scenes": out_scenes,
    }, indent=1), encoding="utf-8")
    return 0


if __name__ == "__main__":
    sys.exit(main())
