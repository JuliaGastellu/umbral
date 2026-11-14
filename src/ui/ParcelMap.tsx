import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { fmtDate } from "../engine/dates";
import type { HlsObservation, StudyParcels } from "../data";
import { cloudText, GREEN_STEPS, greenStep, NO_VALUE_COLOR, NO_VALUE_LABEL, satelliteName } from "./plain";

interface Props {
  shapes: StudyParcels;
  selected: HlsObservation | null;
  /** Selected parcel index, or null for the four-parcel cluster. */
  parcel: number | null;
  onParcel: (i: number | null) => void;
  /** Thin cadastral outlines around the cluster, no attributes. */
  outlines: GeoJSON.FeatureCollection | null;
}

type Base = "photo" | "hls" | "street";

const EOX_ATTR =
  'Satellite photo: <a href="https://s2maps.eu">Sentinel-2 cloudless 2024</a> by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2024), <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/">CC BY-NC-SA 4.0</a>';
const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const GIBS_ATTR = 'Imagery: <a href="https://earthdata.nasa.gov/gibs">NASA GIBS</a>, HLS (NASA/USGS Landsat, ESA Sentinel-2)';

function gibsUrl(o: HlsObservation): string {
  const layer = o.sensor === "L30" ? "HLS_L30_Nadir_BRDF_Adjusted_Reflectance" : "HLS_S30_Nadir_BRDF_Adjusted_Reflectance";
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layer}/default/${o.date}/GoogleMapsCompatible_Level12/{z}/{y}/{x}.png`;
}

/** Plain words for one parcel on one date. */
export function parcelText(label: string, o: HlsObservation, i: number): string {
  const p = o.parcels[i];
  if (!p) return label;
  const shown = p.ndviMedian !== null && p.cleanFraction >= 0.2;
  const step = shown ? greenStep(p.ndviMedian) : null;
  return `${label}, image of ${fmtDate(o.date, true)}, ${satelliteName(o.sensor)}: ${step === null ? NO_VALUE_LABEL : `${GREEN_STEPS[step].label} (greenness index ${p.ndviMedian!.toFixed(2)})`}; ${cloudText(p.cleanPixels, p.pixels)}.`;
}

/**
 * Map of the study parcels. Backgrounds load live from their providers and are
 * never stored by the app. The background photo is a 2024 mosaic and does not
 * change with the selected date; the "NASA HLS" background shows that date.
 */
export function ParcelMap({ shapes, selected, parcel, onParcel, outlines }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layers = useRef<Record<Base, L.TileLayer> | null>(null);
  const parcelLayer = useRef<L.LayerGroup | null>(null);
  // Default: the dated NASA image, so parcel colours and background share one date.
  const [base, setBase] = useState<Base>("hls");
  const [problem, setProblem] = useState<string | null>(null);
  const [showLines, setShowLines] = useState(true);
  const linesLayer = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { scrollWheelZoom: false, attributionControl: true, maxZoom: 14 });
    map.current = m;
    const watch = (layer: L.TileLayer, name: Base) => {
      let ok = 0;
      let bad = 0;
      layer.on("tileload", () => (ok += 1));
      let pending = false;
      const fail = () => {
          if (name === "hls") {
            setProblem("The NASA image did not load (offline or blocked). Showing the year photo instead: outlines only, no greenness colours.");
            setBase("photo");
          } else if (name === "photo") {
            setProblem("The year photo did not load either. Showing the street map: outlines only.");
            setBase("street");
          } else setProblem("Background maps did not load (offline or blocked). The parcel outlines still show; the greenness reading is in the text below.");
      };
      // At zoom 13-14 the NASA layer needs only one or two tiles: fall back when tiles fail and none has loaded shortly after.
      layer.on("tileerror", () => {
        bad += 1;
        if (pending || ok > 0) return;
        pending = true;
        setTimeout(() => { pending = false; if (ok === 0 && bad > 0) fail(); }, 1500);
      });
      return layer;
    };
    layers.current = {
      // HLS is 30 m and GIBS tiles stop at zoom 12: never enlarge beyond zoom 14.
      hls: watch(L.tileLayer("", { maxZoom: 14, maxNativeZoom: 12, attribution: GIBS_ATTR }), "hls"),
      photo: watch(L.tileLayer("https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg", { maxZoom: 18, maxNativeZoom: 16, attribution: EOX_ATTR }), "photo"),
      street: watch(L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: OSM_ATTR }), "street"),
    };
    L.control.scale({ metric: true, imperial: false }).addTo(m);
    const all = L.featureGroup(shapes.parcels.map((p) => L.polygon(p.rings.map((r) => r.map(([lon, lat]) => [lat, lon] as [number, number])))));
    m.setView(all.getBounds().getCenter(), 14); // centred on the four example parcels
    linesLayer.current = L.layerGroup().addTo(m); // under the example parcels
    parcelLayer.current = L.layerGroup().addTo(m);
    return () => {
      m.remove();
      map.current = null;
    };
  }, [shapes]);

  // background switch; zoom limit follows the layer
  useEffect(() => {
    const m = map.current;
    const ls = layers.current;
    if (!m || !ls) return;
    (Object.keys(ls) as Base[]).forEach((k) => {
      if (k !== base && m.hasLayer(ls[k])) m.removeLayer(ls[k]);
    });
    if (base === "hls") {
      if (!selected) return; // no image date yet: never request tiles from an empty URL
      ls.hls.setUrl(gibsUrl(selected));
    }
    m.setMaxZoom(base === "hls" ? 14 : 18);
    if (base === "hls" && m.getZoom() > 14) m.setZoom(14);
    if (!m.hasLayer(ls[base])) ls[base].addTo(m);
  }, [base, selected]);

  // thin parcel boundaries over every base map (no click, no tooltip)
  useEffect(() => {
    const g = linesLayer.current;
    if (!g) return;
    g.clearLayers();
    if (!showLines || !outlines) return;
    L.geoJSON(outlines, { interactive: false, style: { color: "#000000", opacity: 0.45, weight: 2.6, fill: false } }).addTo(g);
    L.geoJSON(outlines, { interactive: false, style: { color: "#ffffff", opacity: 0.95, weight: 1, fill: false } }).addTo(g);
  }, [outlines, showLines]);

  // parcels: outline plus a label badge; greenness colour only on the dated NASA image
  useEffect(() => {
    const g = parcelLayer.current;
    if (!g) return;
    g.clearLayers();
    const dated = base === "hls";
    const clusterCentre = L.featureGroup(shapes.parcels.map((q) => L.polygon(q.rings.map((r) => r.map(([lon, lat]) => [lat, lon] as [number, number]))))).getBounds().getCenter();
    shapes.parcels.forEach((p, i) => {
      const v = selected?.parcels[i];
      const shown = v && v.ndviMedian !== null && v.cleanFraction >= 0.2;
      const step = shown ? greenStep(v!.ndviMedian) : null;
      const isSel = parcel === i;
      const colour = step === null ? NO_VALUE_COLOR : GREEN_STEPS[step].color;
      const poly = L.polygon(p.rings.map((r) => r.map(([lon, lat]) => [lat, lon] as [number, number])), {
        color: isSel ? "#f2a93b" : "#ffffff",
        weight: isSel ? 4.5 : 3,
        fillColor: dated ? colour : "#ffffff",
        fillOpacity: dated ? 0.2 : 0,
        dashArray: dated && step === null ? "5 4" : undefined,
      });
      const label = p.label.replace("Parcel ", "P");
      // Badge outside the parcel, at the end of a short leader line pointing away from the cluster centre.
      const pc = poly.getBounds().getCenter();
      const cc = clusterCentre;
      let dx = (pc.lng - cc.lng) * Math.cos((cc.lat * Math.PI) / 180);
      let dy = -(pc.lat - cc.lat);
      const n = Math.hypot(dx, dy) || 1;
      dx = n === 1 && dx === 0 && dy === 0 ? 1 : dx / n;
      dy = dy / n;
      const LEN = 52;
      const ex = 70 + dx * LEN;
      const ey = 70 + dy * LEN;
      const bg = dated ? colour : "#ffffff";
      const fg = dated && step !== null && step >= 2 ? "#fff" : "#1d2b22";
      const html = `<svg width="140" height="140" aria-hidden="true" style="position:absolute;left:0;top:0;pointer-events:none"><line x1="70" y1="70" x2="${ex}" y2="${ey}" stroke="#000" stroke-opacity="0.5" stroke-width="3.5"/><line x1="70" y1="70" x2="${ex}" y2="${ey}" stroke="#fff" stroke-width="1.6"/><circle cx="70" cy="70" r="2.6" fill="#fff" stroke="#000" stroke-opacity="0.5"/></svg><span class="pbadge${isSel ? " sel" : ""}" style="position:absolute;left:${ex}px;top:${ey}px;transform:translate(-50%,-50%);background:${bg};color:${fg}">${label}</span>`;
      const marker = L.marker(pc, { icon: L.divIcon({ className: "pbadge-icon", html, iconSize: [140, 140], iconAnchor: [70, 70] }), keyboard: false, title: p.label });
      marker.on("click", () => onParcel(isSel ? null : i));
      marker.addTo(g);
      poly.on("click", () => onParcel(isSel ? null : i));
      poly.addTo(g);
    });
  }, [shapes, selected, parcel, onParcel, base]);

  const dated = base === "hls";
  return (
    <div>
      <div className="map-bar">
        <div className="seg" role="radiogroup" aria-label="Map background">
          <button type="button" role="radio" aria-checked={base === "hls"} onClick={() => setBase("hls")} disabled={!selected}>NASA satellite image, {selected ? fmtDate(selected.date, true) : "—"}</button>
          <button type="button" role="radio" aria-checked={base === "photo"} onClick={() => setBase("photo")}>Year photo 2024 (many dates combined, for finding the place)</button>
          <button type="button" role="radio" aria-checked={base === "street"} onClick={() => setBase("street")}>Street map</button>
        </div>
      </div>
      <label className="chk" style={{ marginTop: 0 }}>
        <input type="checkbox" checked={showLines} onChange={(e) => setShowLines(e.target.checked)} /> Parcel boundaries
      </label>
      {problem && <p className="caveat-line" role="status">{problem}</p>}
      <div ref={el} className="map" role="region" aria-label={dated && selected ? `NASA satellite image of ${fmtDate(selected.date, true)} with the four example parcels; badge colours show greenness on that date. Use the parcel buttons to select one.` : "Map of the four example parcels, outlines only. Use the parcel buttons to select one."} />
      {dated ? (
        <div className="legend" aria-label="Badge colours">
          {GREEN_STEPS.map((g) => (
            <span key={g.label} className="lg"><span className="sw" style={{ background: g.color }} aria-hidden="true" />{g.label}</span>
          ))}
          <span className="lg"><span className="sw nv" aria-hidden="true" />{NO_VALUE_LABEL}</span>
        </div>
      ) : (
        <p className="chart-foot">Outlines only: this background {base === "photo" ? "combines many dates of 2024" : "is a street map"}, so greenness colours are not drawn on it. Switch to the NASA satellite image to see them.</p>
      )}
      <p className="chart-foot">
        {dated && selected ? `NASA image of ${fmtDate(selected.date, true)}: 30 m pixels, so fields look blocky; badge colours show greenness on the same date. ` : ""}
        Shapes simplified; parcels anonymous.
      </p>
      {showLines && outlines && <p className="chart-foot">Parcel lines: Río Negro land registry (IDERN). Lines may not match fences exactly.</p>}
      {selected && (
        <details className="more">
          <summary>Each parcel in words</summary>
          <ul className="parcel-list" aria-label="Parcels on the selected date">
            {shapes.parcels.map((p, i) => <li key={p.label}>{parcelText(p.label, selected, i)}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}
