"""Record a SHA-256 checksum for every published data file in provenance.json.

Run after any data script:
    python -I scripts/checksums.py
"""
import datetime as dt
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "public" / "data"
PROV = DATA / "provenance.json"

prov = json.loads(PROV.read_text(encoding="utf-8"))
files = {}
for p in sorted(DATA.rglob("*")):
    if p.is_file() and p.name != "provenance.json":
        files[p.relative_to(DATA).as_posix()] = hashlib.sha256(p.read_bytes()).hexdigest()
prov["files"] = {"computed": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "algorithm": "sha256", "checksums": files}
prov["requests"] = {
    "power": prov.get("power", {}).get("requestUrl"),
    "stationCheck": "NOAA GSOD https://www.ncei.noaa.gov/data/global-summary-of-the-day/access/{year}/87715099999.csv and POWER at the station point (see stationCheck.power.requestUrl)",
    "hls": "CMR STAC https://cmr.earthdata.nasa.gov/stac/LPCLOUD/search (HLSL30_VI_2.0, HLSS30_VI_2.0), windowed reads from LP DAAC; see scripts/hls_trajectory.py",
    "parcels": "IDERN WFS https://idern.rionegro.gov.ar/geoserver/ows layer geonode:PARCELARIO1 (raw file not published); see scripts/parcels.py and scripts/parcel_outlines.py",
}
PROV.write_text(json.dumps(prov, indent=1, ensure_ascii=False), encoding="utf-8")
print(len(files), "files")
