"""Exploratory NDRE from HLS Sentinel-2 (S30) reflectance for the 2024 season.

NDRE = (B8A - B05) / (B8A + B05), Sentinel-2 narrow NIR (B8A) and red edge 1 (B05),
HLS v2.0 surface reflectance (scale and fill read from each file). Landsat (L30)
has no red-edge band, so no NDRE is computed for L30 dates and the two sensors
are never mixed in one series. Same clean-pixel rule and inward-buffered
parcels as the NDVI series (scripts/hls_trajectory.py).

NDRE is a vegetation signal related to chlorophyll. It does not measure soil
nitrogen and is not a fertilization diagnosis.

Usage:
    .venv/Scripts/python.exe -I scripts/hls_ndre.py
Output:
    public/data/hls_ndre.json
"""
from __future__ import annotations

import datetime as dt
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import hls_trajectory as H  # noqa: E402

OUT = H.OUT


def write(rows, meta):
    rows = sorted(rows, key=lambda r: r["date"])
    OUT.joinpath("hls_ndre.json").write_text(json.dumps({
        "meta": {
            "retrieved": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "collection": "HLSS30 v2.0 surface reflectance bands B8A and B05 (assets of the HLSS30_VI v2.0 items), Fmask from the same item",
            "formula": "NDRE = (B8A - B05) / (B8A + B05)",
            "sensor": "Sentinel-2 only (S30). Landsat L30 has no red-edge band; not computed, not mixed.",
            "cleanRule": "Same as the NDVI series: pixel centre inside a parcel after a 30 m inward buffer; Fmask cloud, adjacent, shadow, snow, water and high aerosol excluded.",
            "meaning": "Vegetation signal related to chlorophyll. Not soil nitrogen, not a fertilization diagnosis, not nitrogen fixed by a legume.",
            **meta,
        },
        "observations": rows,
    }, indent=1), encoding="utf-8")


def main() -> int:
    season = json.loads((OUT / "hls_season.json").read_text(encoding="utf-8"))
    wanted = {o["id"] for o in season["observations"] if o["sensor"] == "S30"}
    items = [it for it in H.stac_search(["HLSS30_VI_2.0"], season["meta"]["season"]["start"], season["meta"]["season"]["end"]) if it["id"] in wanted]
    print(f"S30 items to read: {len(items)} of {len(wanted)} S30 observations", flush=True)
    out_path = OUT / "hls_ndre.json"
    prev = json.loads(out_path.read_text(encoding="utf-8")) if out_path.exists() else None
    rows = prev["observations"] if prev else []
    meta = {k: v for k, v in (prev["meta"] if prev else {}).items() if k.startswith("B")}
    done = {r["id"] for r in rows}
    items = [it for it in items if it["id"] not in done]
    print(f"resuming: {len(done)} done, {len(items)} to read", flush=True)
    grid = masks = None
    with H.login_env():
        for i, it in enumerate(sorted(items, key=lambda x: x["properties"]["datetime"])):
            try:
                with H.ropen(it["assets"]["Fmask"]["href"]) as fs:
                    if grid is None:
                        grid = H.Grid(fs, H.CHIP_HALF_M)
                        masks = [grid.mask(p["innerGeometry"]) for p in H.PARCELS]
                    fm = fs.read(1, window=grid.window).astype(np.uint8)
                bands = {}
                for b in ("B8A", "B05"):
                    with H.ropen(H.refl_href(it, b)) as rs:
                        bands[b] = H.read_scaled(rs, grid.window)
                        meta.setdefault(f"{b}Scale", list(rs.scales)[0])
                        meta.setdefault(f"{b}Nodata", rs.nodata)
            except Exception as exc:
                print(f"[{i}] {it['id']}: read failed ({type(exc).__name__})", flush=True)
                continue
            bits = H.decode(fm)
            bad = np.zeros(fm.shape, dtype=bool)
            for b in H.EXCLUDE:
                bad |= bits[b]
            nir, re = bands["B8A"], bands["B05"]
            with np.errstate(invalid="ignore", divide="ignore"):
                ndre = (nir - re) / (nir + re)
            fill = (fm == H.FMASK_FILL) | ~np.isfinite(ndre) | (nir <= 0) | (re <= 0)
            clean = ~bad & ~fill
            union = np.any(masks, axis=0)

            def stat(m):
                ok = clean & m
                n = int(m.sum())
                v = ndre[ok]
                frac = int(ok.sum()) / n if n else 0.0
                return {"pixels": n, "cleanPixels": int(ok.sum()), "quality": "clear" if frac >= H.CLEAR_MIN else "partial" if frac >= H.PARTIAL_MIN else "obscured",
                        "ndreMedian": round(float(np.median(v)), 3) if v.size else None}

            rec = {"id": it["id"], "date": it["properties"]["datetime"][:10], "sensor": "S30", **stat(union),
                   "parcels": [{"label": p["label"], **stat(m)} for p, m in zip(H.PARCELS, masks)]}
            rows.append(rec)
            write(rows, meta)
            print(f"[{i}] {rec['date']} clean={rec['cleanPixels']}/{rec['pixels']} ndre={rec['ndreMedian']} {rec['quality']}", flush=True)
    write(rows, meta)
    return 0


if __name__ == "__main__":
    sys.exit(main())
