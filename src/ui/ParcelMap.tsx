import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { fmtDate } from "../engine/dates";
import type { HlsObservation, StudyParcels } from "../data";
import { cloudText, GREEN_STEPS, greenStep, NO_VALUE_COLOR, NO_VALUE_LABEL, satelliteName } from "./plain";

interface Props {
  shapes: StudyParcels;
  /** Study-cluster outline (lon, lat), used only to frame the view. */
  area: [number, number][] | null;
  /** Public provincial parcel layer around the cluster (boundaries as served). */
  outlines?: GeoJSON.FeatureCollection | null;
  /** "context": a readable map for finding and choosing an example. "nasa": the dated NASA image with greenness colours. */
  mode: "context" | "nasa";
  selected: HlsObservation | null;
  /** Selected example index, or null for the four-example cluster. */
  parcel: number | null;
  onParcel: (i: number | null) => void;
  height?: number;
}

type Base = "photo" | "street" | "hls";

const EOX_ATTR =
  'Satellite photo: <a href="https://s2maps.eu">Sentinel-2 cloudless 2024</a> by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2024), <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/">CC BY-NC-SA 4.0</a>';
const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const GIBS_ATTR = 'Imagery: <a href="https://earthdata.nasa.gov/gibs">NASA GIBS</a>, HLS (NASA/USGS Landsat, ESA Sentinel-2)';

function gibsUrl(o: HlsObservation): string {
  const layer = o.sensor === "L30" ? "HLS_L30_Nadir_BRDF_Adjusted_Reflectance" : "HLS_S30_Nadir_BRDF_Adjusted_Reflectance";
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layer}/default/${o.date}/GoogleMapsCompatible_Level12/{z}/{y}/{x}.png`;
}

/** Plain words for one example on one date. */
export function parcelText(label: string, o: HlsObservation, i: number): string {
  const p = o.parcels[i];
  if (!p) return label;
  const shown = p.ndviMedian !== null && p.cleanFraction >= 0.2;
  const step = shown ? greenStep(p.ndviMedian) : null;
  return `${label}, image of ${fmtDate(o.date, true)}, ${satelliteName(o.sensor)}: ${step === null ? NO_VALUE_LABEL : `${GREEN_STEPS[step].label} (greenness index ${p.ndviMedian!.toFixed(2)})`}; ${cloudText(p.cleanPixels, p.pixels)}.`;
}

const CADASTRE_ATTR = "Parcels: Parcelario provincial, IDERN (Gerencia de Catastro, Río Negro)";
const latlngs = (g: GeoJSON.Geometry) => L.geoJSON(g as GeoJSON.GeoJsonObject).getLayers()[0] as L.Polygon;

/**
 * Map of the processed examples, drawn with their boundaries from the public
 * provincial parcel layer. In the dated NASA view the dashed line is the area
 * whose pixels were actually used (30 m inward buffer). Backgrounds load live
 * from their providers; the NASA image is enlarged without smoothing, so no
 * field detail is invented. Parcels carry no owner or crop information.
 */
export function ParcelMap({ shapes, area, outlines, mode, selected, parcel, onParcel, height }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layers = useRef<Record<Base, L.TileLayer> | null>(null);
  const markLayer = useRef<L.LayerGroup | null>(null);
  const lineLayer = useRef<L.LayerGroup | null>(null);
  const [showLines, setShowLines] = useState(true);
  const [ctxBase, setCtxBase] = useState<"photo" | "street">("photo");
  const base: Base = mode === "nasa" ? "hls" : ctxBase;
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { scrollWheelZoom: false, attributionControl: true, maxZoom: mode === "nasa" ? 14 : 17 });
    map.current = m;
    const watch = (layer: L.TileLayer, name: Base) => {
      let ok = 0;
      let bad = 0;
      let pending = false;
      layer.on("tileload", () => (ok += 1));
      const fail = () => {
        if (name === "hls") setProblem("The NASA image did not load (offline or blocked). The greenness reading for this date is still in the text below.");
        else if (name === "photo") {
          setProblem("The satellite photo did not load. Showing the street map instead.");
          setCtxBase("street");
        } else setProblem("Background maps did not load (offline or blocked). The parcel boundaries still show.");
      };
      // Few tiles are needed at this zoom: fall back when tiles fail and none has loaded shortly after.
      layer.on("tileerror", () => {
        bad += 1;
        if (pending || ok > 0) return;
        pending = true;
        setTimeout(() => {
          pending = false;
          if (ok === 0 && bad > 0) fail();
        }, 1500);
      });
      return layer;
    };
    layers.current = {
      hls: watch(L.tileLayer("", { maxZoom: 14, maxNativeZoom: 12, attribution: GIBS_ATTR, className: "tiles-pixelated" }), "hls"),
      photo: watch(L.tileLayer("https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg", { maxZoom: 17, maxNativeZoom: 16, attribution: EOX_ATTR }), "photo"),
      street: watch(L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 17, attribution: OSM_ATTR }), "street"),
    };
    L.control.scale({ metric: true, imperial: false }).addTo(m);
    // Fit the four examples and their leader-line badges, with room around them.
    const bounds = L.featureGroup(shapes.parcels.map((p) => latlngs(p.geometry))).getBounds();
    m.fitBounds(bounds, { padding: [70, 70], maxZoom: mode === "nasa" ? 14 : 16 });
    void area;
    lineLayer.current = L.layerGroup().addTo(m);
    markLayer.current = L.layerGroup().addTo(m);
    return () => {
      m.remove();
      map.current = null;
    };
  }, [shapes, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const m = map.current;
    const ls = layers.current;
    if (!m || !ls) return;
    (Object.keys(ls) as Base[]).forEach((k) => {
      if (k !== base && m.hasLayer(ls[k])) m.removeLayer(ls[k]);
    });
    if (base === "hls") {
      if (!selected) return; // never request tiles from an empty URL
      ls.hls.setUrl(gibsUrl(selected));
    }
    if (!m.hasLayer(ls[base])) ls[base].addTo(m);
  }, [base, selected]);

  // Thin boundaries of the public parcel layer around the examples (no click, no tooltip).
  useEffect(() => {
    const g = lineLayer.current;
    if (!g) return;
    g.clearLayers();
    if (!showLines || !outlines) return;
    L.geoJSON(outlines, { interactive: false, style: { color: "#000000", opacity: 0.45, weight: 2.4, fill: false } }).addTo(g);
    L.geoJSON(outlines, { interactive: false, style: { color: "#ffffff", opacity: 0.9, weight: 1, fill: false } }).addTo(g);
  }, [outlines, showLines]);

  // Example parcels with their boundaries, the sampled area (NASA view), and a label badge on a short leader line.
  useEffect(() => {
    const g = markLayer.current;
    if (!g) return;
    g.clearLayers();
    const dated = mode === "nasa" && !!selected;
    const polys = shapes.parcels.map((p) => latlngs(p.geometry));
    const pts = polys.map((q) => q.getBounds().getCenter());
    const cc = L.latLngBounds(pts).getCenter();
    shapes.parcels.forEach((p, i) => {
      const v = selected?.parcels[i];
      const shown = v && v.ndviMedian !== null && v.cleanFraction >= 0.2;
      const step = shown ? greenStep(v!.ndviMedian) : null;
      const isSel = parcel === i;
      const colour = dated ? (step === null ? NO_VALUE_COLOR : GREEN_STEPS[step].color) : "#ffffff";
      const pc = pts[i];
      const poly = L.geoJSON(p.geometry as GeoJSON.GeoJsonObject, { style: { color: isSel ? "#f2a93b" : "#ffffff", weight: isSel ? 4 : 2.5, fillColor: colour, fillOpacity: dated ? 0.35 : 0.08 } });
      poly.on("click", () => onParcel(isSel ? null : i));
      poly.addTo(g);
      if (dated && p.samplingGeometry) L.geoJSON(p.samplingGeometry as GeoJSON.GeoJsonObject, { interactive: false, style: { color: "#1d2b22", weight: 1.5, dashArray: "4 3", fill: false } }).addTo(g);
      let dx = (pc.lng - cc.lng) * Math.cos((cc.lat * Math.PI) / 180);
      let dy = -(pc.lat - cc.lat);
      const n = Math.hypot(dx, dy);
      if (n === 0) {
        dx = 1;
        dy = 0;
      } else {
        dx /= n;
        dy /= n;
      }
      const LEN = 40;
      const ex = 70 + dx * LEN;
      const ey = 70 + dy * LEN;
      // White only on the darkest step (6.5:1); dark text elsewhere (at least 5.5:1).
      const fg = dated && step === 3 ? "#fff" : "#1d2b22";
      const label = p.label.replace("Parcel ", "P");
      const html = `<svg width="140" height="140" aria-hidden="true" style="position:absolute;left:0;top:0;pointer-events:none"><line x1="70" y1="70" x2="${ex}" y2="${ey}" stroke="#000" stroke-opacity="0.5" stroke-width="3.5"/><line x1="70" y1="70" x2="${ex}" y2="${ey}" stroke="#fff" stroke-width="1.6"/></svg><span class="pbadge${isSel ? " sel" : ""}" style="position:absolute;left:${ex}px;top:${ey}px;transform:translate(-50%,-50%);background:${colour};color:${fg}">${label}</span>`;
      const mk = L.marker(pc, { icon: L.divIcon({ className: "pbadge-icon", html, iconSize: [140, 140], iconAnchor: [70, 70] }), keyboard: false, title: `Example ${label}` });
      mk.on("click", () => onParcel(isSel ? null : i));
      mk.addTo(g);
    });
  }, [shapes, selected, parcel, onParcel, mode]);

  return (
    <div>
      {mode === "context" && (
        <div className="map-bar">
          <div className="seg" role="radiogroup" aria-label="Map background">
            <button type="button" role="radio" aria-checked={ctxBase === "photo"} onClick={() => setCtxBase("photo")}>Satellite photo</button>
            <button type="button" role="radio" aria-checked={ctxBase === "street"} onClick={() => setCtxBase("street")}>Street map</button>
          </div>
        </div>
      )}
      {outlines && (
        <label className="chk">
          <input type="checkbox" checked={showLines} onChange={(e) => setShowLines(e.target.checked)} /> Parcel boundaries (provincial cadastre)
        </label>
      )}
      {problem && <p className="caveat-line" role="status">{problem}</p>}
      <div
        ref={el}
        className="map"
        style={height ? { height } : undefined}
        role="region"
        aria-label={mode === "nasa" && selected ? `NASA satellite image of ${fmtDate(selected.date, true)} with the four example parcels; fill colours show greenness on that date. Use the example buttons to select one.` : "Map of the four processed example parcels. Use the example buttons to select one."}
      />
      {mode === "nasa" ? (
        <>
          <div className="legend" role="group" aria-label="Marker colours">
            {GREEN_STEPS.map((g) => (
              <span key={g.label} className="lg"><span className="sw" style={{ background: g.color }} aria-hidden="true" />{g.label}</span>
            ))}
            <span className="lg"><span className="sw nv" aria-hidden="true" />{NO_VALUE_LABEL}</span>
          </div>
          <p className="chart-foot">{selected ? `NASA HLS image of ${fmtDate(selected.date, true)}, ${satelliteName(selected.sensor)}. ` : ""}30 m pixels; dashed line: area sampled. {CADASTRE_ATTR}; no owner or crop is attached.</p>
        </>
      ) : (
        <p className="chart-foot">{ctxBase === "photo" ? "2024 photo combining many dates, for finding the place." : "Street map."} {CADASTRE_ATTR}; lines may not match fences exactly; no owner or crop is attached.</p>
      )}
      {mode === "nasa" && selected && (
        <details className="more">
          <summary>Each example in words</summary>
          <ul className="parcel-list" aria-label="Examples on the selected date">
            {shapes.parcels.map((p, i) => <li key={p.label}>{parcelText(p.label.replace("Parcel", "Example P").replace("P ", "P"), selected, i)}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}
