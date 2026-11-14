"""Thin parcel-boundary layer for the map, around the study cluster.

Input (git-ignored, never published):
    data/raw/parcelario_roca_rural_subrural.geojson  (IDERN WFS geonode:PARCELARIO1)

Output:
    public/data/parcel_outlines.json
    Parcels whose centroid is within 3 km of the cluster centre (-39.05, -67.60),
    simplified to 3 m in UTM 19S, outlines only, properties EMPTY (no OBJECTID,
    PAR_ID, CCA, TPA, ARA or any other attribute), coordinates rounded to 6
    decimals, feature order shuffled by geometry (not by any identifier).

Usage:
    .venv/Scripts/python.exe -I scripts/parcel_outlines.py
"""

from __future__ import annotations

import json
from pathlib import Path

from pyproj import Transformer
from shapely.geometry import Point, mapping, shape
from shapely.ops import transform

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "raw" / "parcelario_roca_rural_subrural.geojson"
OUT = ROOT / "public" / "data" / "parcel_outlines.json"
CENTRE = (-67.60, -39.05)
RADIUS_M = 3000
SIMPLIFY_M = 3

to_utm = Transformer.from_crs("EPSG:4326", "EPSG:32719", always_xy=True).transform
to_ll = Transformer.from_crs("EPSG:32719", "EPSG:4326", always_xy=True).transform


def rnd(coords):
    if isinstance(coords[0], (int, float)):
        return [round(coords[0], 6), round(coords[1], 6)]
    return [rnd(c) for c in coords]


def main() -> None:
    doc = json.loads(SRC.read_text(encoding="utf-8"))
    c = Point(*to_utm(*CENTRE))
    feats = []
    for f in doc["features"]:
        g = transform(to_utm, shape(f["geometry"]))
        if g.centroid.distance(c) > RADIUS_M:
            continue
        if g.area / 1e4 > 500:  # plateau parcels
            continue
        s = g.simplify(SIMPLIFY_M, preserve_topology=True)
        ll = mapping(transform(to_ll, s))
        feats.append({"type": "Feature", "properties": {}, "geometry": {"type": ll["type"], "coordinates": rnd(ll["coordinates"])}, "_k": (round(s.centroid.x), round(s.centroid.y))})
    feats.sort(key=lambda x: x["_k"])  # order by position, never by a cadastral code
    for f in feats:
        del f["_k"]
    out = {
        "type": "FeatureCollection",
        "note": "Parcel outlines near the study cluster, simplified to 3 m. No cadastral codes or attributes. Source: Gerencia de Catastro – Agencia de Recaudación Tributaria, Provincia de Río Negro (IDERN). Lines may not match fences exactly.",
        "features": feats,
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(len(feats), "parcels,", OUT.stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main()
