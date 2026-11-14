"""Build HLS observations for the Umbral study cluster.

Requires the Python 3.11 environment in .venv (rasterio, earthaccess, shapely,
pyproj, numpy, pillow) and an Earthdata Login that the user set up on her own
machine (a .netrc she created). This script never prints, stores or logs
credentials or tokens.

Inputs:
    public/data/study_area.json     generalized outline and season (published)
    data/raw/cluster_parcels.json   inward-buffered parcel geometries from
                                    scripts/parcels.py (git-ignored, never published)

Usage (from the repository root):
    .venv/Scripts/python.exe -I scripts/hls_trajectory.py season
    .venv/Scripts/python.exe -I scripts/hls_trajectory.py interannual
    .venv/Scripts/python.exe -I scripts/hls_trajectory.py overview YYYY-MM-DD

Method:
  1. Search CMR STAC (no login) for HLSL30_VI / HLSS30_VI v2.0 items.
  2. For each item, read only a small window around the cluster from the
     cloud-optimized GeoTIFFs over authenticated HTTPS: NDVI and Fmask from the
     VI item, B04/B03/B02 from the matching reflectance item for an RGB chip.
  3. Decode Fmask (bit meanings verified from the file's own "Fmask
     description" tag), apply the clean-pixel rule, compute per-parcel and
     cluster statistics on pixels whose centre lies inside a buffered parcel.
"""

from __future__ import annotations

import datetime as dt
import json
import os
import sys
import urllib.request
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "data"
CHIPS = OUT / "hls"
RAW = ROOT / "data" / "raw"

STAC = "https://cmr.earthdata.nasa.gov/stac/LPCLOUD/search"
AREA = json.loads((OUT / "study_area.json").read_text(encoding="utf-8"))
OUTLINE: list[list[float]] = AREA["outline"]
PARCELS = json.loads((RAW / "cluster_parcels.json").read_text(encoding="utf-8"))["parcels"]
CHIP_HALF_M = 450

# Fmask bits (HLS v2.0, from the file tag "Fmask description"):
# 7-6 aerosol (00 climatology, 01 low, 10 average, 11 high), 5 water,
# 4 snow/ice, 3 cloud shadow, 2 adjacent to cloud, 1 cloud, 0 cirrus.
BITS = {"cirrus": 0, "cloud": 1, "adjacent": 2, "shadow": 3, "snow": 4, "water": 5}
EXCLUDE = ("cloud", "adjacent", "shadow", "snow", "water", "aerosolHigh")
# Display classes for the observation lane: a presentation rule, not agronomic.
CLEAR_MIN = 0.8
PARTIAL_MIN = 0.2
FMASK_FILL = 255


def bbox() -> list[float]:
    lons = [p[0] for p in OUTLINE]
    lats = [p[1] for p in OUTLINE]
    return [min(lons), min(lats), max(lons), max(lats)]


def stac_search(collections: list[str], start: str, end: str) -> list[dict]:
    body = {"collections": collections, "bbox": bbox(),
            "datetime": f"{start}T00:00:00Z/{end}T23:59:59Z", "limit": 250}
    items: list[dict] = []
    url, data = STAC, json.dumps(body).encode()
    while url:
        req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=120) as r:
            page = json.load(r)
        items.extend(page.get("features", []))
        nxt = [l for l in page.get("links", []) if l.get("rel") == "next"]
        if nxt:
            url = nxt[0]["href"]
            data = json.dumps(nxt[0]["body"]).encode() if nxt[0].get("body") else None
        else:
            url = None
    return items


_FS = None


def login_env():
    """Log in with earthaccess (netrc by default) and return a rasterio Env."""
    global _FS
    import earthaccess
    import rasterio

    auth = earthaccess.login(strategy=os.environ.get("UMBRAL_EDL_STRATEGY", "netrc"))
    if not auth or not auth.authenticated:
        raise SystemExit("Earthdata Login is not available on this machine.")
    _FS = earthaccess.get_fsspec_https_session()
    return rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR")


def ropen(href: str):
    import rasterio

    return rasterio.open(href, opener=_FS.open)


class Grid:
    """Chip window on the 30 m HLS grid, centred on the cluster."""

    def __init__(self, ds, half_m: float):
        from pyproj import Transformer
        from rasterio.windows import Window

        self.tr = Transformer.from_crs("EPSG:4326", ds.crs, always_xy=True)
        xs, ys = self.tr.transform([p[0] for p in OUTLINE], [p[1] for p in OUTLINE])
        cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
        res = ds.res[0]
        col = int(round((cx - half_m - ds.transform.c) / res))
        row = int(round((ds.transform.f - (cy + half_m)) / res))
        self.size = int(round(2 * half_m / res))
        self.left = ds.transform.c + col * res
        self.top = ds.transform.f - row * res
        self.res = res
        self.window = Window(col, row, self.size, self.size)

    def to_px(self, lon: float, lat: float) -> list[float]:
        x, y = self.tr.transform(lon, lat)
        return [(x - self.left) / self.res, (self.top - y) / self.res]

    def mask(self, geom_ll: dict) -> np.ndarray:
        from shapely.geometry import Point, shape
        from shapely.ops import transform

        g = transform(lambda x, y, z=None: self.tr.transform(x, y), shape(geom_ll))
        m = np.zeros((self.size, self.size), dtype=bool)
        for r in range(self.size):
            for c in range(self.size):
                x = self.left + (c + 0.5) * self.res
                y = self.top - (r + 0.5) * self.res
                m[r, c] = g.contains(Point(x, y))
        return m


def read_scaled(ds, win) -> np.ndarray:
    arr = ds.read(1, window=win).astype(float)
    if ds.nodata is not None:
        arr[arr == ds.nodata] = np.nan
    scale = ds.scales[0] if ds.scales and ds.scales[0] not in (None, 1.0) else None
    if scale is None and "scale_factor" in ds.tags():
        scale = float(ds.tags()["scale_factor"])
    if scale is None:
        raise SystemExit("No scale factor found; refusing to guess.")
    return arr * scale


def decode(fm: np.ndarray) -> dict[str, np.ndarray]:
    out = {n: ((fm >> b) & 1).astype(bool) for n, b in BITS.items()}
    out["aerosolHigh"] = ((fm >> 6) & 3) == 3
    return out


def stats_for(ndvi, clean, fill, bits, m) -> dict:
    n = int(m.sum())
    ok = clean & m
    vals = ndvi[ok]
    frac = int(ok.sum()) / n if n else 0.0
    rnd = lambda v: None if v is None else round(float(v), 3)
    return {
        "pixels": n,
        "cleanPixels": int(ok.sum()),
        "cleanFraction": round(frac, 3),
        "quality": "clear" if frac >= CLEAR_MIN else "partial" if frac >= PARTIAL_MIN else "obscured",
        "ndviMedian": rnd(np.median(vals)) if vals.size else None,
        "ndviP25": rnd(np.percentile(vals, 25)) if vals.size else None,
        "ndviP75": rnd(np.percentile(vals, 75)) if vals.size else None,
        "fmask": {**{b: int((bits[b] & m).sum()) for b in (*EXCLUDE, "cirrus")}, "fill": int((fill & m).sum())},
    }


def ndvi_png(ndvi, clean, path: Path) -> None:
    from PIL import Image

    stops = np.array([[-0.1, 150, 118, 84], [0.2, 214, 196, 150], [0.5, 120, 170, 90], [0.9, 30, 100, 50]])
    v = np.clip(np.nan_to_num(ndvi, nan=-0.1), -0.1, 0.9)
    rgb = np.zeros(ndvi.shape + (3,), dtype=np.uint8)
    for ch in range(3):
        rgb[..., ch] = np.interp(v, stops[:, 0], stops[:, ch + 1]).astype(np.uint8)
    rgb[~clean] = (205, 205, 205)
    Image.fromarray(rgb).save(path, optimize=True)


def rgb_png(r, g, b, path: Path) -> None:
    from PIL import Image

    stack = np.stack([r, g, b], axis=-1)
    stack = np.nan_to_num(stack, nan=0.0)
    img = np.clip(stack / 0.25, 0, 1) ** (1 / 1.4)  # fixed stretch, comparable across dates
    Image.fromarray((img * 255).astype(np.uint8)).save(path, optimize=True)


def refl_href(vi_item: dict, band: str) -> str:
    return vi_item["assets"]["Fmask"]["href"].replace("Fmask.tif", f"{band}.tif")


def process(items: list[dict], tag: str, chips: bool = True, half_m: float = CHIP_HALF_M):
    CHIPS.mkdir(parents=True, exist_ok=True)
    out, meta = [], {}
    grid = masks = None
    with login_env():
        for i, it in enumerate(sorted(items, key=lambda x: x["properties"]["datetime"])):
            iid = it["id"]
            sensor = "S30" if ".S30." in iid else "L30"
            date = it["properties"]["datetime"][:10]
            try:
                with ropen(it["assets"]["NDVI"]["href"]) as ds:
                    if grid is None:
                        grid = Grid(ds, half_m)
                        masks = [grid.mask(p["innerGeometry"]) for p in PARCELS]
                        meta.update(crs=str(ds.crs), ndviNodata=ds.nodata, ndviScale=list(ds.scales)[0],
                                    chipSizePx=grid.size, chipSizeM=grid.size * grid.res,
                                    outlinePx=[grid.to_px(*p) for p in OUTLINE])
                    ndvi = read_scaled(ds, grid.window)
                with ropen(it["assets"]["Fmask"]["href"]) as fs:
                    fm = fs.read(1, window=grid.window).astype(np.uint8)
                    meta.setdefault("fmaskDescriptionTag", fs.tags().get("Fmask description"))
            except Exception as exc:
                print(f"[{i}] {iid}: read failed ({type(exc).__name__})")
                continue
            bits = decode(fm)
            bad = np.zeros(fm.shape, dtype=bool)
            for b in EXCLUDE:
                bad |= bits[b]
            fill = (fm == FMASK_FILL) | np.isnan(ndvi)
            clean = ~bad & ~fill
            union = np.any(masks, axis=0)
            rec = {"id": iid, "date": date, "datetime": it["properties"]["datetime"], "sensor": sensor,
                   "tileCloudCover": it["properties"].get("eo:cloud_cover"),
                   **stats_for(ndvi, clean, fill, bits, union),
                   "parcels": [{"label": p["label"], **{k: v for k, v in stats_for(ndvi, clean, fill, bits, m).items() if k != "fmask"}}
                               for p, m in zip(PARCELS, masks)]}
            if chips:
                base = f"{tag}_{date}_{sensor}"
                ndvi_png(ndvi, clean, CHIPS / f"{base}_ndvi.png")
                rec["ndviChip"] = f"data/hls/{base}_ndvi.png"
                try:
                    bands = []
                    for b in ("B04", "B03", "B02"):
                        with ropen(refl_href(it, b)) as rs:
                            bands.append(read_scaled(rs, grid.window))
                    rgb_png(*bands, CHIPS / f"{base}_rgb.png")
                    rec["rgbChip"] = f"data/hls/{base}_rgb.png"
                except Exception as exc:
                    print(f"[{i}] RGB chip failed ({type(exc).__name__})")
            out.append(rec)
            print(f"[{i}] {date} {sensor} clean={rec['cleanPixels']}/{rec['pixels']} ndvi={rec['ndviMedian']} {rec['quality']}", flush=True)
    if masks is not None:
        meta["parcelPixels"] = [{"label": p["label"], "pixels": int(m.sum())} for p, m in zip(PARCELS, masks)]
        meta["clusterPixels"] = int(np.any(masks, axis=0).sum())
    return out, meta


def update_provenance(key: str, entry: dict) -> None:
    path = OUT / "provenance.json"
    data = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    data[key] = entry
    path.write_text(json.dumps(data, indent=1), encoding="utf-8")


COLLECTIONS = ["HLSL30_VI_2.0", "HLSS30_VI_2.0"]
COLLECTION_IDS = ["HLSL30_VI v2.0 (C3246892554-LPCLOUD)", "HLSS30_VI v2.0 (C3246894861-LPCLOUD)",
                  "HLSL30 v2.0 (C2021957657-LPCLOUD), HLSS30 v2.0 (C2021957295-LPCLOUD): B04/B03/B02 for RGB chips"]
CLEAN_RULE = ("Pixel centre inside a parcel after a 30 m inward buffer; Fmask cloud, adjacent to cloud/shadow, "
              "cloud shadow, snow/ice and water bits all 0; aerosol level not 'high'; NDVI not fill (-19999).")


def main() -> int:
    mode = sys.argv[1] if len(sys.argv) > 1 else "season"
    now = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    if mode == "overview":
        global CHIPS
        CHIPS = RAW / "hls"
        items = stac_search(COLLECTIONS, sys.argv[2], sys.argv[2])
        recs, meta = process(items[:1], "overview", half_m=float(sys.argv[3]) if len(sys.argv) > 3 else 900)
        print(json.dumps({"outlinePx": meta.get("outlinePx"), "parcelPixels": meta.get("parcelPixels")}))
        return 0
    if mode == "season":
        s = AREA["season"]
        items = stac_search(COLLECTIONS, s["start"], s["end"])
        print(f"STAC: {len(items)} items", flush=True)
        recs, meta = process(items, "s")
        doc = {"meta": {"retrieved": now, "collections": COLLECTION_IDS, "stacEndpoint": STAC, "season": s,
                        "cleanRule": CLEAN_RULE,
                        "qualityClasses": {"clear": f"clean fraction >= {CLEAR_MIN}", "partial": f">= {PARTIAL_MIN}", "obscured": f"< {PARTIAL_MIN} (median not shown)"},
                        "itemsFound": len(items), "itemsProcessed": len(recs), **meta},
               "observations": recs}
        (OUT / "hls_season.json").write_text(json.dumps(doc, indent=1), encoding="utf-8")
        update_provenance("hlsSeason", {k: doc["meta"][k] for k in ("retrieved", "collections", "stacEndpoint", "season", "itemsFound", "itemsProcessed", "cleanRule")})
        return 0
    if mode == "interannual-year":
        # Process one year and store the row in data/raw (merge later with "interannual-merge").
        y = int(sys.argv[2])
        items = stac_search(COLLECTIONS, f"{y}-06-01", f"{y}-08-31")
        recs, _ = process(items, f"w{y}", chips=False)
        clear = [r for r in recs if r["quality"] == "clear" and r["ndviMedian"] is not None]
        med = float(np.median([r["ndviMedian"] for r in clear])) if clear else None
        row = {"year": y, "itemsFound": len(items), "processed": len(recs), "clearObservations": len(clear),
               "ndviMedianOfClear": None if med is None else round(med, 3), "clearDates": [r["date"] for r in clear]}
        (RAW / f"hls_inter_{y}.json").write_text(json.dumps(row), encoding="utf-8")
        print(row, flush=True)
        return 0
    if mode == "interannual-merge":
        rows = [json.loads((RAW / f"hls_inter_{y}.json").read_text(encoding="utf-8")) for y in range(2016, 2026) if (RAW / f"hls_inter_{y}.json").exists()]
        doc = {"meta": {"retrieved": now, "window": "1 Jun - 31 Aug", "collections": COLLECTION_IDS, "cleanRule": CLEAN_RULE,
                        "summaryRule": "Median of per-observation cluster medians, clear observations only (clean fraction >= 0.8)."},
               "years": rows}
        (OUT / "hls_interannual.json").write_text(json.dumps(doc, indent=1), encoding="utf-8")
        update_provenance("hlsInterannual", {k: doc["meta"][k] for k in ("retrieved", "window", "summaryRule")} | {"years": len(rows)})
        return 0
    if mode == "interannual":
        rows = []
        for y in range(2016, 2026):
            items = stac_search(COLLECTIONS, f"{y}-06-01", f"{y}-08-31")
            recs, _ = process(items, f"w{y}", chips=False)
            clear = [r for r in recs if r["quality"] == "clear" and r["ndviMedian"] is not None]
            med = float(np.median([r["ndviMedian"] for r in clear])) if clear else None
            rows.append({"year": y, "itemsFound": len(items), "processed": len(recs), "clearObservations": len(clear),
                         "ndviMedianOfClear": None if med is None else round(med, 3),
                         "clearDates": [r["date"] for r in clear]})
            print(rows[-1], flush=True)
        doc = {"meta": {"retrieved": now, "window": "1 Jun - 31 Aug", "collections": COLLECTION_IDS, "cleanRule": CLEAN_RULE,
                        "summaryRule": "Median of per-observation cluster medians, clear observations only (clean fraction >= 0.8)."},
               "years": rows}
        (OUT / "hls_interannual.json").write_text(json.dumps(doc, indent=1), encoding="utf-8")
        update_provenance("hlsInterannual", {k: doc["meta"][k] for k in ("retrieved", "window", "summaryRule")} | {"years": len(rows)})
        return 0
    raise SystemExit(f"Unknown mode {mode}")


if __name__ == "__main__":
    sys.exit(main())
