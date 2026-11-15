"""Download the public Río Negro parcel layer used by Umbral (reproducible step).

Source: IDERN GeoServer (Infraestructura de Datos Espaciales de Río Negro),
WFS https://idern.rionegro.gov.ar/geoserver/ows, layer geonode:PARCELARIO1.
Producer credited by the layer: Gerencia de Catastro – Agencia de Recaudación
Tributaria, Provincia de Río Negro.

Query: parcels of type SUBRURAL or RURAL whose geometry intersects a bounding
box around General Roca, in EPSG:4326, GeoJSON. The service is public (its
capabilities declare Fees: NONE, AccessConstraints: NONE); no login is used.

Usage (standard library only):
    python -I scripts/fetch_parcelario.py                     # writes data/raw/parcelario_roca_rural_subrural.geojson
    python -I scripts/fetch_parcelario.py --out data/raw/check.geojson --compare data/raw/parcelario_roca_rural_subrural.geojson

Writes a provenance sidecar <out>.provenance.json with the exact request URL,
retrieval time, feature count, the service time stamp and a SHA-256 checksum.
The raw file stays in data/raw/ (git-ignored): see docs/DATA_SOURCES.md for why
the original file is not redistributed in the repository.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WFS = "https://idern.rionegro.gov.ar/geoserver/ows"
LAYER = "geonode:PARCELARIO1"
# Bounding box around General Roca (lon/lat), W S E N. Reproduces the 2,341 parcels of the file used on 13-14 Nov 2026.
BBOX = (-67.75, -39.15, -67.35, -38.90)
TYPES = ("SUBRURAL", "RURAL")


def request_url(bbox=BBOX) -> str:
    w, s, e, n = bbox
    cql = f"TPA IN ({', '.join(repr(t) for t in TYPES)}) AND BBOX(the_geom, {w}, {s}, {e}, {n}, 'EPSG:4326')"
    q = {"service": "WFS", "version": "2.0.0", "request": "GetFeature", "typeNames": LAYER, "outputFormat": "application/json", "srsName": "EPSG:4326", "cql_filter": cql}
    return f"{WFS}?{urllib.parse.urlencode(q)}"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="data/raw/parcelario_roca_rural_subrural.geojson")
    ap.add_argument("--compare", default=None, help="another download to compare feature IDs with")
    a = ap.parse_args()
    url = request_url()
    req = urllib.request.Request(url, headers={"User-Agent": "umbral-research-script"})
    with urllib.request.urlopen(req, timeout=180) as r:
        raw = r.read()
    doc = json.loads(raw)
    out = ROOT / a.out
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(raw)
    prov = {
        "source": "IDERN GeoServer WFS, layer geonode:PARCELARIO1 (Gerencia de Catastro – Agencia de Recaudación Tributaria, Provincia de Río Negro)",
        "request": url,
        "filter": {"TPA": list(TYPES), "bbox": BBOX, "crs": "EPSG:4326"},
        "retrieved": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "serviceTimeStamp": doc.get("timeStamp"),
        "features": len(doc.get("features", [])),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "terms": "Public service, Fees NONE, AccessConstraints NONE; 2019 provincial statement of free and open use in GIS. No formal licence text found for this layer; redistribution terms of the original file not confirmed.",
    }
    Path(str(out) + ".provenance.json").write_text(json.dumps(prov, indent=1, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({k: prov[k] for k in ("features", "serviceTimeStamp", "sha256")}))
    if a.compare:
        other = json.loads((ROOT / a.compare).read_text(encoding="utf-8"))
        ids = lambda d: {f["properties"]["OBJECTID"] for f in d["features"]}
        x, y = ids(doc), ids(other)
        print(json.dumps({"inBoth": len(x & y), "onlyNew": len(x - y), "onlyCompared": len(y - x)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
