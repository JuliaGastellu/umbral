"""Regional check: NASA POWER daily Tmin vs NOAA GSOD, Neuquén Aero.

This checks the regional reanalysis against one station. It does not validate
POWER for a plot in General Roca, and no bias correction is derived or applied.

Station: GSOD 87715099999 "PRESIDENTE PERON, AR" (Neuquén airport),
lat -38.949, lon -68.155711, elevation 272.79 m (values from the GSOD files).
POWER is requested for the station coordinates, i.e. the POWER cell that
contains the station (not the General Roca cell).

Definitions (verified in the GSOD readme, NCEI):
  - MIN: minimum temperature reported during the day, deg F to tenths;
    missing = 9999.9. A trailing "*" flag means it was derived from hourly data.
  - Days are summarized on the GMT/UTC day (0000Z-2359Z).
POWER daily values use local solar time (header time_standard "LST").
The day-boundary mismatch is reported as a caveat, not corrected.

Usage:
    python -I scripts/station_check.py
Output:
    public/data/station_check.json and a "stationCheck" entry in provenance.json
"""

from __future__ import annotations

import csv
import datetime as dt
import hashlib
import io
import json
import math
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw" / "gsod"
OUT = ROOT / "public" / "data"

STATION = "87715099999"
ST_LAT, ST_LON = -38.949, -68.155711
YEARS = range(1981, 2026)
MONTHS = (3, 4, 5, 6)  # March-June
THRESHOLDS = (0.0, -2.0, -4.0)
GSOD_URL = "https://www.ncei.noaa.gov/data/global-summary-of-the-day/access/{y}/{s}.csv"
POWER_URL = "https://power.larc.nasa.gov/api/temporal/daily/point"
# First-event comparison uses only years with no missing value before the event
# (or before 31 Jul when there is no event) in both series.


def get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "umbral-data-prep/1.0"})
    with urllib.request.urlopen(req, timeout=180) as r:
        return r.read()


def load_gsod() -> dict[dt.date, float]:
    RAW.mkdir(parents=True, exist_ok=True)
    out: dict[dt.date, float] = {}
    for y in YEARS:
        p = RAW / f"{y}_{STATION}.csv"
        if not p.exists():
            try:
                p.write_bytes(get(GSOD_URL.format(y=y, s=STATION)))
            except Exception as exc:  # year not available
                print(f"GSOD {y}: {type(exc).__name__}")
                continue
        for row in csv.DictReader(io.StringIO(p.read_text(encoding="utf-8"))):
            v = float(row["MIN"])
            if v >= 9999.0:
                continue
            out[dt.date.fromisoformat(row["DATE"])] = round((v - 32.0) * 5.0 / 9.0, 2)
    return out


def load_power() -> tuple[dict[dt.date, float], dict]:
    q = {"parameters": "T2M_MIN", "community": "AG", "longitude": f"{ST_LON}", "latitude": f"{ST_LAT}",
         "start": "19810101", "end": "20251231", "format": "JSON"}
    url = POWER_URL + "?" + urllib.parse.urlencode(q)
    p = ROOT / "data" / "raw" / "power_station_raw.json"
    body = p.read_bytes() if p.exists() else get(url)
    p.write_bytes(body)
    doc = json.loads(body)
    fill = doc["header"].get("fill_value", -999.0)
    series = {}
    for k, v in doc["properties"]["parameter"]["T2M_MIN"].items():
        if v != fill:
            series[dt.date(int(k[:4]), int(k[4:6]), int(k[6:]))] = float(v)
    meta = {"requestUrl": url, "sha256": hashlib.sha256(body).hexdigest(),
            "powerVersion": doc["header"].get("api", {}).get("version"),
            "timeStandard": doc["header"].get("time_standard"),
            "unit": doc["parameters"]["T2M_MIN"]["units"],
            "cellPoint": doc["geometry"]["coordinates"]}
    return series, meta


def first_event(series: dict[dt.date, float], start: dt.date, end: dt.date, t: float):
    d, missing = start, 0
    while d <= end:
        v = series.get(d)
        if v is None:
            missing += 1
        elif v <= t:
            return (d - start).days, missing
        d += dt.timedelta(days=1)
    return None, missing


def main() -> int:
    gsod = load_gsod()
    power, pmeta = load_power()
    common = sorted(d for d in gsod if d in power and d.month in MONTHS)
    if not common:
        print("No common days")
        return 1
    diffs = [power[d] - gsod[d] for d in common]
    n = len(diffs)
    bias = sum(diffs) / n
    rmse = math.sqrt(sum(x * x for x in diffs) / n)
    mean_g = sum(gsod[d] for d in common) / n
    mean_p = sum(power[d] for d in common) / n
    cov = sum((power[d] - mean_p) * (gsod[d] - mean_g) for d in common)
    r = cov / math.sqrt(sum((power[d] - mean_p) ** 2 for d in common) * sum((gsod[d] - mean_g) ** 2 for d in common))
    thresholds = []
    for t in THRESHOLDS:
        both = sum(1 for d in common if power[d] <= t and gsod[d] <= t)
        p_only = sum(1 for d in common if power[d] <= t and gsod[d] > t)
        s_only = sum(1 for d in common if power[d] > t and gsod[d] <= t)
        neither = n - both - p_only - s_only
        thresholds.append({
            "T": t, "bothAtOrBelow": both, "powerOnly": p_only, "stationOnly": s_only, "neither": neither,
            "stationEventDays": both + s_only, "powerEventDays": both + p_only,
            "hitRate": round(both / (both + s_only), 3) if both + s_only else None,
            "falseAlarmRatio": round(p_only / (both + p_only), 3) if both + p_only else None,
            "agreement": round((both + neither) / n, 3),
        })
    # First event from 1 March, searched to 31 July, per year.
    first = []
    for t in THRESHOLDS:
        rows = []
        for y in YEARS:
            s, e = dt.date(y, 3, 1), dt.date(y, 7, 31)
            fp, mp = first_event(power, s, e, t)
            fg, mg = first_event(gsod, s, e, t)
            # Strict: a first-event date is only demonstrated when no value is missing before it
            # (or before the search end when there is no event) in either series.
            valid = mp == 0 and mg == 0
            rows.append({"year": y, "powerDays": fp, "stationDays": fg, "stationMissing": mg, "valid": valid})
        ok = [x for x in rows if x["valid"] and x["powerDays"] is not None and x["stationDays"] is not None]
        d = [x["powerDays"] - x["stationDays"] for x in ok]
        first.append({
            "T": t, "searchWindow": "1 Mar to 31 Jul", "rule": "years with no missing value before the first event in either series", "validYears": sum(1 for x in rows if x["valid"]),
            "yearsBothFound": len(ok),
            "medianDiffDays": (sorted(d)[len(d) // 2] if len(d) % 2 else (sorted(d)[len(d) // 2 - 1] + sorted(d)[len(d) // 2]) / 2) if d else None,
            "meanDiffDays": round(sum(d) / len(d), 1) if d else None,
            "meanAbsDiffDays": round(sum(abs(x) for x in d) / len(d), 1) if d else None,
            "within7Days": sum(1 for x in d if abs(x) <= 7),
            "years": rows,
        })
    years_with_data = sorted({d.year for d in common})
    result = {
        "status": "done",
        "scope": "Regional check of the reanalysis at one station. It does not validate POWER for a plot in General Roca. No bias correction is applied.",
        "station": {"id": STATION, "name": "PRESIDENTE PERON, AR (Neuquén airport)", "lat": ST_LAT, "lon": ST_LON,
                    "elevationM": 272.79, "source": "NOAA NCEI Global Surface Summary of the Day (GSOD)",
                    "variable": "MIN (deg F, converted to deg C); missing = 9999.9", "dayDefinition": "GMT/UTC day"},
        "power": {**pmeta, "variable": "T2M_MIN", "dayDefinition": "local solar time (LST)"},
        "caveats": [
            "GSOD summarizes on the UTC day; POWER uses local solar time. The minimum of a night can fall on different dates, so same-date matches understate agreement somewhat; they are not a pure detection rate.",
            "The station is about 50 km west of General Roca and in a different POWER cell.",
            "A good global correlation (POWER validation) does not validate threshold crossings.",
        ],
        "period": {"months": "March-June", "firstYear": years_with_data[0], "lastYear": years_with_data[-1],
                   "commonDays": n, "yearsWithCommonDays": len(years_with_data)},
        "dailyTmin": {"biasPowerMinusStationC": round(bias, 2), "rmseC": round(rmse, 2), "pearsonR": round(r, 3)},
        "thresholdDays": thresholds,
        "firstEvent": first,
        "retrieved": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    result["summary"] = {
        "station": "Neuquén Aero (NOAA GSOD 87715099999, about 50 km west of General Roca)",
        "period": f"{years_with_data[0]}–{years_with_data[-1]}, March–June",
        "biasC": round(bias, 2),
        "rmseC": round(rmse, 2),
        "firstEventMedianLagDays": {str(int(f["T"]) if f["T"] != 0 else 0): f["medianDiffDays"] for f in first},
        "matchingDays": {str(int(x["T"]) if x["T"] != 0 else 0): {"station": x["stationEventDays"], "both": x["bothAtOrBelow"]} for x in thresholds},
        "caveats": result["caveats"],
    }
    (OUT / "station_check.json").write_text(json.dumps(result, indent=1, ensure_ascii=False), encoding="utf-8")
    prov_path = OUT / "provenance.json"
    prov = json.loads(prov_path.read_text(encoding="utf-8"))
    prov["stationCheck"] = {k: result[k] for k in ("scope", "station", "power", "period", "retrieved")}
    prov_path.write_text(json.dumps(prov, indent=1, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({k: result[k] for k in ("period", "dailyTmin", "thresholdDays")}, indent=1))
    for f in first:
        print({k: f[k] for k in f if k != "years"})
    return 0


if __name__ == "__main__":
    sys.exit(main())
