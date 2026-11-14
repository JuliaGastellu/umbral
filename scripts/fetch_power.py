"""Download and validate NASA POWER daily data for the General Roca point.

Usage (from the repository root):
    python -I scripts/fetch_power.py

Outputs:
    data/raw/power_raw.json          raw API response (git-ignored)
    public/data/power_daily.json     compact validated series used by the app
    public/data/power_validation.json validation report
    public/data/provenance.json      updated "power" entry

Only the Python standard library is used, so this runs on Python 3.14
without geospatial wheels.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"
OUT_DIR = ROOT / "public" / "data"

LAT = -39.03
LON = -67.58
PARAMS = ["T2M", "T2M_MIN", "T2M_MAX", "PRECTOTCORR"]
START = "19810101"
END = "20251231"
FILL = -999.0
# A year is valid for frost search when T2M_MIN has at most this many missing days
# between 1 Feb and 31 Dec. This is a data-completeness rule, not an agronomic one.
MAX_MISSING_DAYS_PER_YEAR = 10

ENDPOINT = "https://power.larc.nasa.gov/api/temporal/daily/point"


def build_url() -> str:
    query = {
        "parameters": ",".join(PARAMS),
        "community": "AG",
        "longitude": f"{LON}",
        "latitude": f"{LAT}",
        "start": START,
        "end": END,
        "format": "JSON",
    }
    return ENDPOINT + "?" + urllib.parse.urlencode(query)


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "umbral-data-prep/1.0"})
    with urllib.request.urlopen(req, timeout=180) as resp:
        return resp.read()


def main() -> int:
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    url = build_url()
    raw_path = RAW_DIR / "power_raw.json"
    if raw_path.exists() and "--refresh" not in sys.argv:
        body = raw_path.read_bytes()
        print(f"Using cached {raw_path}")
    else:
        print(f"GET {url}")
        body = fetch(url)
        raw_path.write_bytes(body)
    sha256 = hashlib.sha256(body).hexdigest()
    doc = json.loads(body)

    # --- Validate header -------------------------------------------------
    geom = doc.get("geometry", {}).get("coordinates", [])
    header = doc.get("header", {})
    params_meta = doc.get("parameters", {})
    props = doc.get("properties", {}).get("parameter", {})
    issues: list[str] = []
    if len(geom) < 2 or abs(geom[0] - LON) > 0.01 or abs(geom[1] - LAT) > 0.01:
        issues.append(f"Response coordinates {geom} differ from request ({LON}, {LAT}).")
    units = {p: params_meta.get(p, {}).get("units") for p in PARAMS}
    longnames = {p: params_meta.get(p, {}).get("longname") for p in PARAMS}
    for p in ("T2M", "T2M_MIN", "T2M_MAX"):
        if units.get(p) not in ("C", "°C", "degrees C"):
            issues.append(f"Unexpected unit for {p}: {units.get(p)!r}")
    fill = header.get("fill_value", FILL)
    if float(fill) != FILL:
        issues.append(f"Header fill value is {fill}, expected {FILL}; using header value.")
    fill = float(fill)

    # --- Build daily series ----------------------------------------------
    start = dt.date(1981, 1, 1)
    end = dt.date(2025, 12, 31)
    n_days = (end - start).days + 1
    series: dict[str, list[float | None]] = {p: [] for p in PARAMS}
    for i in range(n_days):
        key = (start + dt.timedelta(days=i)).strftime("%Y%m%d")
        for p in PARAMS:
            v = props.get(p, {}).get(key)
            if v is None or float(v) == fill:
                series[p].append(None)
            else:
                series[p].append(round(float(v), 2))

    # --- Per-year completeness -------------------------------------------
    years = []
    for y in range(1981, 2026):
        y0 = (dt.date(y, 1, 1) - start).days
        y1 = (dt.date(y, 12, 31) - start).days
        feb1 = (dt.date(y, 2, 1) - start).days
        tmin = series["T2M_MIN"][y0 : y1 + 1]
        missing_all = sum(v is None for v in tmin)
        missing_season = sum(v is None for v in series["T2M_MIN"][feb1 : y1 + 1])
        years.append(
            {
                "year": y,
                "days": y1 - y0 + 1,
                "missingTmin": missing_all,
                "missingTminFebDec": missing_season,
                "missingPrecip": sum(v is None for v in series["PRECTOTCORR"][y0 : y1 + 1]),
                "valid": missing_season <= MAX_MISSING_DAYS_PER_YEAR,
            }
        )
    valid_years = [y["year"] for y in years if y["valid"]]

    retrieved = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    version = header.get("api", {}).get("version") if isinstance(header.get("api"), dict) else None
    meta = {
        "source": "NASA POWER daily point API, community AG",
        "requestUrl": url,
        "retrieved": retrieved,
        "sha256": sha256,
        "powerVersion": version,
        "headerTitle": header.get("title"),
        "headerSources": header.get("sources"),
        "point": {"lat": LAT, "lon": LON, "elevationM": geom[2] if len(geom) > 2 else None},
        "grid": "MERRA-2 / GEOS-IT, 0.5 deg x 0.625 deg (about 55 km). Not plot-level.",
        "units": units,
        "longnames": longnames,
        "fillValue": fill,
        "start": "1981-01-01",
        "end": "2025-12-31",
        "validYearRule": (
            f"T2M_MIN missing on at most {MAX_MISSING_DAYS_PER_YEAR} days between 1 Feb and 31 Dec"
        ),
        "nValidYears": len(valid_years),
        "issues": issues,
    }

    (OUT_DIR / "power_daily.json").write_text(
        json.dumps(
            {
                "meta": meta,
                "startDate": "1981-01-01",
                "tmin": series["T2M_MIN"],
                "tmax": series["T2M_MAX"],
                "tmean": series["T2M"],
                "precip": series["PRECTOTCORR"],
            },
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )
    (OUT_DIR / "power_validation.json").write_text(
        json.dumps({"meta": meta, "years": years}, indent=1), encoding="utf-8"
    )
    update_provenance("power", meta)
    print(json.dumps({k: meta[k] for k in ("units", "nValidYears", "issues", "powerVersion")}, indent=1))
    return 0


def update_provenance(key: str, entry: dict) -> None:
    path = OUT_DIR / "provenance.json"
    data = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    data[key] = entry
    path.write_text(json.dumps(data, indent=1), encoding="utf-8")


if __name__ == "__main__":
    sys.exit(main())
