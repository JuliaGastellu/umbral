"""Select the HLS study cluster from the Río Negro cadastral parcel layer.

Input (git-ignored, never published):
    data/raw/parcelario_roca_rural_subrural.geojson
    IDERN GeoServer WFS, layer geonode:PARCELARIO1, SUBRURAL + RURAL parcels
    in a bounding box around General Roca.

Outputs:
    data/raw/cluster_parcels.json   full-precision buffered parcels for the
                                    HLS script (git-ignored, never published)
    public/data/parcel_stats.json   derived size statistics (publishable)
    public/data/study_area.json     generalized cluster outline (publishable)
    data/raw/candidates.png         review image (git-ignored)

Privacy: cadastral codes (CCA, PAR_ID, OBJECTID) are dropped on load and are
never written anywhere. Parcels are labelled "Parcel 1..n" in published files.

Usage:
    .venv/Scripts/python.exe -I scripts/parcels.py candidates LON LAT RADIUS_M
    .venv/Scripts/python.exe -I scripts/parcels.py select LON LAT RADIUS_M N
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from pyproj import Transformer
from shapely.geometry import Point, mapping, shape
from shapely.ops import transform as stransform, unary_union

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "public" / "data"
SRC = RAW / "parcelario_roca_rural_subrural.geojson"

WORLDCOVER = (
    "https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/"
    "ESA_WorldCover_10m_2021_v200_S42W069_Map.tif"
)
MIN_HA, MAX_HA = 2.0, 15.0
PLATEAU_HA = 500.0  # RURAL parcels above this are plateau land, excluded
INWARD_BUFFER_M = 30.0
MAX_TREE_SHARE = 0.25  # WorldCover "tree cover" share above which a parcel is treated as a likely orchard

TO_UTM = Transformer.from_crs("EPSG:4326", "EPSG:32719", always_xy=True).transform
TO_LL = Transformer.from_crs("EPSG:32719", "EPSG:4326", always_xy=True).transform


def load() -> list[dict]:
    doc = json.loads(SRC.read_text(encoding="utf-8"))
    rows = []
    for f in doc["features"]:
        p = f["properties"]
        ha = float(p["ARA"]) / (10000.0 if p["UND_ARA"].upper().startswith("METRO") else 1.0)
        geom = shape(f["geometry"])
        utm = stransform(TO_UTM, geom)
        rows.append({"type": p["TPA"], "declaredHa": ha, "geomHa": utm.area / 1e4, "ll": geom, "utm": utm})
    return rows


def stats(rows: list[dict]) -> dict:
    sub = [r for r in rows if r["type"] == "SUBRURAL"]
    rur = [r for r in rows if r["type"] == "RURAL" and r["declaredHa"] <= PLATEAU_HA]
    keep = sub + rur
    ha = np.array([r["declaredHa"] for r in keep])
    sub_ha = np.array([r["declaredHa"] for r in sub])
    diff = np.array([abs(r["geomHa"] - r["declaredHa"]) / r["declaredHa"] for r in keep if r["declaredHa"] > 0])
    q = lambda a, x: round(float(np.percentile(a, x)), 1)
    return {
        "source": "Derived from IDERN WFS layer geonode:PARCELARIO1 (SUBRURAL and RURAL parcels around General Roca).",
        "credit": "Gerencia de Catastro – Agencia de Recaudación Tributaria, Provincia de Río Negro",
        "parcelsInLayer": len(rows),
        "excludedPlateauRural": sum(1 for r in rows if r["type"] == "RURAL" and r["declaredHa"] > PLATEAU_HA),
        "parcelsUsed": len(keep),
        "subrural": {"n": len(sub), "p25Ha": q(sub_ha, 25), "medianHa": q(sub_ha, 50), "p75Ha": q(sub_ha, 75)},
        "all": {"n": len(keep), "p25Ha": q(ha, 25), "medianHa": q(ha, 50), "p75Ha": q(ha, 75)},
        "geometryVsDeclaredMedianRelDiff": round(float(np.median(diff)), 4),
        "note": "Cadastral parcels are not management fields: one farm can hold several fields, orchards included. The layer has no land use or owner information.",
    }


def tree_share(geoms_ll: list) -> list[dict]:
    import rasterio
    from rasterio.features import geometry_mask
    from rasterio.windows import from_bounds

    res = []
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR"):
        with rasterio.open("/vsicurl/" + WORLDCOVER) as ds:
            for g in geoms_ll:
                win = from_bounds(*g.bounds, ds.transform).round_offsets().round_lengths()
                win = win.__class__(win.col_off - 1, win.row_off - 1, win.width + 2, win.height + 2)
                arr = ds.read(1, window=win)
                tr = ds.window_transform(win)
                inside = ~geometry_mask([mapping(g)], arr.shape, tr)
                vals = arr[inside]
                n = vals.size
                share = lambda c: float((vals == c).sum()) / n if n else 0.0
                res.append({"n10m": int(n), "tree": share(10), "crop": share(40), "grass": share(30), "built": share(50), "bare": share(60)})
    return res


def candidates(rows, lon, lat, radius):
    c = Point(*TO_UTM(lon, lat))
    cand = [r for r in rows if r["type"] == "SUBRURAL" and MIN_HA <= r["declaredHa"] <= MAX_HA and r["utm"].centroid.distance(c) <= radius]
    cand.sort(key=lambda r: r["utm"].centroid.distance(c))
    for r in cand:
        r["inner"] = r["utm"].buffer(-INWARD_BUFFER_M)
    wc = tree_share([r["ll"] for r in cand])
    for r, w in zip(cand, wc):
        r["wc"] = w
        r["likelyOrchard"] = w["tree"] > MAX_TREE_SHARE
    return cand


def review_png(cand, path):
    """Draw candidate outlines (index labels only) for visual review."""
    from PIL import Image, ImageDraw

    allu = unary_union([r["utm"] for r in cand])
    minx, miny, maxx, maxy = allu.bounds
    s = 900 / max(maxx - minx, maxy - miny)
    im = Image.new("RGB", (int((maxx - minx) * s) + 20, int((maxy - miny) * s) + 20), "white")
    d = ImageDraw.Draw(im)
    for i, r in enumerate(cand):
        geoms = getattr(r["utm"], "geoms", [r["utm"]])
        col = (200, 60, 40) if r["likelyOrchard"] else (40, 120, 60)
        for g in geoms:
            d.polygon([((x - minx) * s + 10, (maxy - y) * s + 10) for x, y in g.exterior.coords], outline=col)
        cx, cy = r["utm"].centroid.coords[0]
        d.text(((cx - minx) * s + 10, (maxy - cy) * s + 10), str(i), fill=col)
    im.save(path)


def main() -> int:
    mode = sys.argv[1]
    rows = load()
    st = stats(rows)
    (OUT / "parcel_stats.json").write_text(json.dumps(st, indent=1, ensure_ascii=False), encoding="utf-8")
    lon, lat, radius = float(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4])
    cand = candidates(rows, lon, lat, radius)
    if mode == "candidates":
        for i, r in enumerate(cand):
            print(f"{i:3d} {r['declaredHa']:6.2f} ha  inner {r['inner'].area/1e4:5.2f} ha  tree {r['wc']['tree']:.2f} crop {r['wc']['crop']:.2f} grass {r['wc']['grass']:.2f} built {r['wc']['built']:.2f} {'ORCHARD?' if r['likelyOrchard'] else ''}")
        review_png(cand, RAW / "candidates.png")
        return 0
    if mode == "select":
        idx = [int(x) for x in sys.argv[5].split(",")]
        chosen = [cand[i] for i in idx]
        parcels = []
        for k, r in enumerate(chosen, 1):
            inner_ll = stransform(TO_LL, r["inner"])
            parcels.append({
                "label": f"Parcel {k}",
                "declaredHa": round(r["declaredHa"], 2),
                "innerHa": round(r["inner"].area / 1e4, 2),
                "worldCover": {kk: round(v, 3) for kk, v in r["wc"].items()},
                "innerGeometry": mapping(inner_ll),  # full precision: raw folder only
            })
        (RAW / "cluster_parcels.json").write_text(json.dumps({"parcels": parcels}), encoding="utf-8")
        hull = unary_union([r["utm"] for r in chosen]).convex_hull.buffer(60).simplify(60)
        hull_ll = stransform(TO_LL, hull)
        outline = [[round(x, 3), round(y, 3)] for x, y in hull_ll.exterior.coords]
        area = {
            "name": "A cluster of cadastral parcels in the horticultural belt of General Roca",
            "status": "Selected from the provincial cadastral layer (SUBRURAL, 2-15 ha), screened with ESA WorldCover 2021 and HLS true colour. Land use not verified on the ground.",
            "outlineNote": "Generalized outline: convex hull of the cluster, buffered 60 m, simplified and rounded to 0.001 deg (about 100 m). Individual parcel geometries are not published.",
            "outline": outline,
            "nParcels": len(chosen),
            "parcels": [{k: v for k, v in p.items() if k != "innerGeometry"} for p in parcels],
            "inwardBufferM": INWARD_BUFFER_M,
            "orchardScreen": f"Dropped parcels with ESA WorldCover 2021 tree-cover share above {MAX_TREE_SHARE}, then checked visually on HLS true colour.",
            "season": {"start": "2024-02-01", "end": "2024-11-30", "label": "2024 reference season (summer harvest to the following spring)"},
        }
        (OUT / "study_area.json").write_text(json.dumps(area, indent=1), encoding="utf-8")
        # Simplified parcel shapes for the map: labels and geometry only, no cadastral attributes.
        # Douglas-Peucker 10 m in UTM, then coordinates rounded to 1e-4 deg (about 10 m).
        shapes = []
        for k, r in enumerate(chosen, 1):
            simp = r["utm"].simplify(10, preserve_topology=True)
            ll = stransform(TO_LL, simp)
            geoms = getattr(ll, "geoms", [ll])
            rings = [[[round(x, 4), round(y, 4)] for x, y in g.exterior.coords] for g in geoms]
            shapes.append({"label": f"Parcel {k}", "rings": rings})
        (OUT / "study_parcels.json").write_text(json.dumps({
            "note": "Simplified outlines of the four study parcels (10 m simplification, coordinates rounded to about 10 m). No cadastral codes or attributes. Greenness values come from pixels at least 30 m inside each parcel.",
            "source": "Derived from IDERN WFS geonode:PARCELARIO1 (Gerencia de Catastro – Agencia de Recaudación Tributaria, Provincia de Río Negro)",
            "parcels": shapes,
        }, ensure_ascii=False), encoding="utf-8")
        print(json.dumps({k: area[k] for k in ("nParcels", "parcels")}, indent=1))
        return 0
    return 1


if __name__ == "__main__":
    sys.exit(main())
