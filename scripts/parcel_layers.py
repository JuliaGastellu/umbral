"""Publish the parcel layers used by the app's maps and by the NASA sampling.

Inputs (data/raw/, git-ignored):
    parcelario_roca_rural_subrural.geojson  from scripts/fetch_parcelario.py (public IDERN WFS)
    cluster_parcels.json                    from scripts/parcels.py select (the four examples and
                                            their 30 m inward-buffered sampling polygons)

Outputs (public/data/):
    parcel_outlines.json  parcels of the public layer whose centroid lies within 3 km of the study
                          cluster (plateau RURAL parcels > 500 ha left out), geometry exactly as served
                          (no simplification, no rounding), properties: objectid, type
    study_parcels.json    the four processed examples: label, objectid in the public layer, type,
                          declared area, geometry exactly as served, and the sampling polygon actually
                          used for HLS and EMIT (30 m inward buffer)

No owner, holder or crop is attached to any parcel: the layer has none of that information.

Usage:
    .venv/Scripts/python.exe -I scripts/parcel_layers.py
"""
from __future__ import annotations

import json
from pathlib import Path

from pyproj import Transformer
from shapely.geometry import Point, shape
from shapely.ops import transform

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "public" / "data"
SRC = RAW / "parcelario_roca_rural_subrural.geojson"
CLUSTER = RAW / "cluster_parcels.json"
CENTRE = (-67.60, -39.05)
RADIUS_M = 3000
PLATEAU_HA = 500
ATTRIBUTION = "Parcelario provincial (IDERN WFS geonode:PARCELARIO1), Gerencia de Catastro – Agencia de Recaudación Tributaria, Provincia de Río Negro"

to_utm = Transformer.from_crs("EPSG:4326", "EPSG:32719", always_xy=True).transform


def declared_ha(p: dict) -> float:
    return float(p["ARA"]) / (10000.0 if str(p["UND_ARA"]).upper().startswith("METRO") else 1.0)


def main() -> None:
    src = json.loads(SRC.read_text(encoding="utf-8"))
    prov_path = Path(str(SRC) + ".provenance.json")
    check_prov = RAW / "parcelario_check.geojson.provenance.json"
    prov = json.loads(prov_path.read_text(encoding="utf-8")) if prov_path.exists() else json.loads(check_prov.read_text(encoding="utf-8")) if check_prov.exists() else {}
    centre = Point(*to_utm(*CENTRE))
    feats = []
    for f in src["features"]:
        g = shape(f["geometry"])
        gu = transform(to_utm, g)
        if gu.centroid.distance(centre) > RADIUS_M or declared_ha(f["properties"]) > PLATEAU_HA:
            continue
        feats.append({"type": "Feature", "properties": {"objectid": f["properties"]["OBJECTID"], "type": f["properties"]["TPA"]}, "geometry": f["geometry"]})
    common = {
        "source": ATTRIBUTION,
        "request": prov.get("request"),
        "serviceTimeStamp": src.get("timeStamp"),
        "terms": "Public provincial service (Fees: NONE, AccessConstraints: NONE) and a 2019 provincial statement of free and open use in GIS. No formal licence text found for the layer; the code licence (MIT) does not apply to these data.",
    }
    (OUT / "parcel_outlines.json").write_text(json.dumps({"type": "FeatureCollection", **common, "selection": f"Parcels with centroid within {RADIUS_M} m of {CENTRE}, plateau parcels > {PLATEAU_HA} ha excluded; geometry as served", "features": feats}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    cluster = json.loads(CLUSTER.read_text(encoding="utf-8"))["parcels"]
    examples = []
    for c in cluster:
        inner = shape(c["innerGeometry"])
        hit = [f for f in src["features"] if shape(f["geometry"]).contains(inner.representative_point()) and shape(f["geometry"]).buffer(1e-6).contains(inner)]
        if len(hit) != 1:
            raise SystemExit(f"{c['label']}: expected one source parcel, found {len(hit)}")
        f = hit[0]
        examples.append({
            "label": c["label"],
            "objectid": f["properties"]["OBJECTID"],
            "type": f["properties"]["TPA"],
            "declaredHa": round(declared_ha(f["properties"]), 2),
            "geometry": f["geometry"],
            "samplingGeometry": c["innerGeometry"],
        })
    (OUT / "study_parcels.json").write_text(json.dumps({
        **common,
        "note": "Four processed examples. 'geometry' is the parcel as served by the public layer; 'samplingGeometry' is the 30 m inward buffer whose pixels (pixel centre inside) were used for NASA HLS and EMIT values. No owner or crop is known or implied.",
        "parcels": examples,
    }, ensure_ascii=False, indent=1), encoding="utf-8")
    print(len(feats), "outline parcels;", len(examples), "examples:", [(e["label"], e["objectid"]) for e in examples])


if __name__ == "__main__":
    main()
