# Data sources

Access dates are 2026-11-14 unless stated. Original-language titles are kept.

## NASA data

| Dataset | Identifier | Use | Access | License / terms |
|---|---|---|---|---|
| NASA POWER daily point API v2.10.3, community AG (MERRA-2 / GEOS-IT) | <https://power.larc.nasa.gov/api/temporal/daily/point> | Daily T2M, T2M_MIN, T2M_MAX, PRECTOTCORR at −39.03, −67.58, 1981–2025 | No login. Exact request URL and SHA-256 in `public/data/provenance.json` | NASA open data; cite POWER |
| POWER meteorology sources and validation (E9) | <https://power.larc.nasa.gov/docs/methodology/data/sources_meteorology/> | Context: global Tmin validation | Read 2026-11-10 | — |
| HLS Landsat vegetation indices HLSL30_VI v2.0 | C3246892554-LPCLOUD, DOI 10.5067/HLS/HLSL30_VI.002 | NDVI and Fmask, 2024 season | CMR STAC search without login; files with Earthdata Login | NASA/USGS data, no restrictions; cite |
| HLS Sentinel-2 vegetation indices HLSS30_VI v2.0 | C3246894861-LPCLOUD, DOI 10.5067/HLS/HLSS30_VI.002 | Same | Same | Contains modified Copernicus Sentinel data (ESA, partner agency); cite |
| HLS reflectance HLSL30 / HLSS30 v2.0 | C2021957657-LPCLOUD (10.5067/HLS/HLSL30.002), C2021957295-LPCLOUD (10.5067/HLS/HLSS30.002) | B04, B03, B02 for true-colour chips | Same | Same |
| CMR STAC | <https://cmr.earthdata.nasa.gov/stac/LPCLOUD> | Scene search | No login | — |
| GPM IMERG Final daily v07 | GPM_3IMERGDF, DOI 10.5067/GPM/IMERGDF/DAY/07 | Not used (deferred; needs the GES DISC EULA) | — | — |

## Partner and other data

| Dataset | Identifier | Use | Access | License / terms |
|---|---|---|---|---|
| NOAA NCEI Global Surface Summary of the Day, station 87715099999 (Presidente Perón, Neuquén) | <https://www.ncei.noaa.gov/data/global-summary-of-the-day/access/> | Regional check of POWER Tmin | No login; readme <https://www.ncei.noaa.gov/data/global-summary-of-the-day/doc/readme.txt> | NOAA data; WMO Resolution 40 restrictions may apply to some non-US stations. Only derived statistics are published |
| ESA WorldCover 10 m 2021 v200 | DOI 10.5281/zenodo.7254221; tile ESA_WorldCover_10m_2021_v200_S42W069_Map | Orchard screen for the study cluster | Public S3 bucket, no login | CC BY 4.0 (© ESA WorldCover project 2021 / contains modified Copernicus Sentinel data) |
| Gerencia de Catastro – Agencia de Recaudación Tributaria, Provincia de Río Negro. Parcel layer | IDERN GeoServer WFS <https://idern.rionegro.gov.ar/geoserver/ows>, layer `geonode:PARCELARIO1` | Selection of the HLS study cluster; parcel-size statistics | Filter: TPA in (SUBRURAL, RURAL), bounding box around General Roca; EPSG:4326; 2,341 MultiPolygons. Downloaded by the author on 2026-11-14 | See below |

### Parcel boundaries on the map
- `public/data/parcel_outlines.json`, built by `scripts/parcel_outlines.py`: 212 parcels whose centroid is within 3 km of the study cluster (−39.05, −67.60), plateau parcels left out, simplified to 3 m in UTM 19S, coordinates rounded to 6 decimals, ordered by position, **properties empty** (no OBJECTID, PAR_ID, CCA, TPA, ARA or any attribute), about 45 KB. Shown as thin lines with the note "Parcel lines: Río Negro land registry (IDERN). Lines may not match fences exactly." The publish check fails the build if any feature carries properties or any cadastral attribute name or value appears.

### Cadastral layer: license status
- The service is a public provincial service. Its capabilities declare "Fees: NONE" and "AccessConstraints: NONE". This describes technical access, not reuse terms.
- PARCELARIO0 and PARCELARIO1 have no abstract or license keywords and do not appear in the public portal catalog.
- A 2019 provincial government press release states that the provincial parcel layer is available "para su uso libre y abierto" in GIS: <https://registrocivil.rionegro.gov.ar/?contID=54058>. It does not name these layers.
- **Status: public provincial service with a 2019 provincial statement of free and open GIS use; not a formal open license.**
- Use: analysis, and the map of the study cluster. Published: derived statistics (`public/data/parcel_stats.json`), a generalized outline (`public/data/study_area.json`) and simplified shapes of the four study parcels only (`public/data/study_parcels.json`: 10 m simplification, coordinates rounded to about 10 m, labels "Parcel 1–4", no cadastral attributes). Not published: the raw layer, individual parcel geometries, and cadastral codes (CCA, PAR_ID, OBJECTID). The raw file lives in `data/raw/`, which is git-ignored and excluded from deployment.

| EOX Sentinel-2 cloudless 2024 (EOxCloudless) | WMTS layer `s2cloudless-2024_3857`, <https://tiles.maps.eox.at/wmts/1.0.0/WMTSCapabilities.xml> | Optional map background, labelled "Year photo 2024 (many dates combined, for finding the place)"; a yearly mosaic with no single date, so only parcel outlines are drawn on it (about 10 m) | Loaded live by the viewer's browser; not downloaded, cached or bundled. Checked 2026-11-14 | "EOxCloudless by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2024)", CC BY-NC-SA 4.0 (license text in the WMTS capabilities); commercial use needs a license from EOX. Umbral is a non-commercial demo and shows the attribution on the map |
| NASA GIBS, HLS true colour | WMTS layers `HLS_S30_Nadir_BRDF_Adjusted_Reflectance` and `HLS_L30_Nadir_BRDF_Adjusted_Reflectance`, EPSG:3857, to zoom 12; <https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/WMTSCapabilities.xml> | Default map background, labelled "NASA satellite image, [date]": the HLS image of the selected 2024 date (30 m; opens at zoom 13, limited to zoom 14 because tiles stop at zoom 12) | Loaded live, no login. 2024 dates are covered (checked 2026-11-14) | NASA open data; attribution shown |
| Open-Meteo Forecast API | <https://api.open-meteo.com/v1/forecast>; docs <https://open-meteo.com/en/docs>, terms <https://open-meteo.com/en/terms> | "Now" and up to 16-day forecast for the General Roca area (current, hourly, daily: temperature, rain amount and probability, humidity, wind, gusts, weather code) | Requested live from the viewer's browser, no key (CORS allowed); timezone America/Argentina/Buenos_Aires; cached in the browser 30 min; checked 2026-11-14 | Free tier for non-commercial use only, under 10,000 calls/day; data CC BY 4.0, attribution shown; no warranty. Weather-model values ("current" = 15-minute model data), not NASA data, not station observations, not official SMN warnings |
| NASA POWER daily API (live query) | <https://power.larc.nasa.gov/api/temporal/daily/point> | Past dates after the bundled record (from 2026-01-01 to yesterday), same point and parameters | Requested live, no key; validated (point, units, fill −999); cached 6 h | NASA open data |
| OpenStreetMap standard tiles | <https://tile.openstreetmap.org/> | Location map background (current street map, not dated imagery) | Loaded live by the viewer's browser; tiles are not downloaded, cached or bundled | Data © OpenStreetMap contributors, ODbL; attribution shown on the map; use under the OSMF tile usage policy (<https://operations.osmfoundation.org/policies/tiles/>) |

## References

| Code | Reference | Region, year | What is used |
|---|---|---|---|
| E15 | Departamento Provincial de Aguas, "Río Negro se prepara para la temporada de corte de riego" <https://dpa.rionegro.gov.ar/articulo/49125/rio-negro-se-prepara-para-la-temporada-de-corte-de-riego?n=MzU1> | Alto Valle, 2024 | Closure on 29 Apr in the 2024 season (system closure, not a plot's last turn) |
| E19 | INTA Alto Valle mean last frost 6 Oct; frost period first half of April to first half of October (argentina.gob.ar item 398315; secondary summary) | Alto Valle | Context only; primary source not yet read |
| E17 | Domini et al., "Evaluación del aporte de nitrógeno de Vicia villosa" (INTA EEA Alto Valle / UNCo) <https://repositorio.inta.gob.ar/handle/20.500.12123/24945> | Cipolletti, 2024 (almond orchard) | Context: vetch sown 10 Apr 2024 in another system |
| E5 | SARE, Managing Cover Crops Profitably: Hairy Vetch <https://www.sare.org/publications/managing-cover-crops-profitably/legume-cover-crops/hairy-vetch/> | United States | D reference (30–45 d before a hard frost) |
| — | SARE, Cereal Rye <https://www.sare.org/publications/managing-cover-crops-profitably/nonlegume-cover-crops/cereal-rye/> | United States | Rye termination interval (assumption) |
| — | SARE, Oats <https://www.sare.org/publications/managing-cover-crops-profitably/nonlegume-cover-crops/oats/> | United States | Oat termination interval (assumption) |
| — | Noale (2015), Trabajo final, UNLP <https://lipa.agro.unlp.edu.ar/wp-content/uploads/sites/29/2020/03/Trabajo-Final-Noale.pdf> | Choele Choel, Valle Medio | Tomato transplant in early October; a winter green crop before tomato in table 7 |
| — | "Huerta de noviembre: qué verduras y hortalizas sembrar según el INTA", Diario Río Negro <https://www.rionegro.com.ar/estar-bien/huerta-de-noviembre-que-verduras-y-hortalizas-sembrar-segun-el-inta-4775247/> | Río Negro | Squash sowing October–November (press summary) |
| — | Reinoso et al., potencial de maíz (INTA Valle Inferior, UNRN) <https://rid.unrn.edu.ar/bitstream/20.500.12049/7522/1/Reinoso_potencial_maiz%20%281%29.pdf> | Valle Inferior | Maize sowing 1 Oct–15 Nov |
| — | SAGyP, "Informe de producción de cebolla" (enero 2023) <https://www.argentina.gob.ar/sites/default/files/sagyp-informe-produccion-cebolla-enero-2023-2.pdf> | Southern Buenos Aires (external zone) | Onion early sowing March–May |
| — | Paredes (2019), CIEA <https://www.ciea.com.ar/web/CIEA2019/doc/16-V/5_Paredes---Tamara-Paredes.docx> | Campo Grande and Cipolletti | Context: no field operations May–August in the group described; tenure |
| — | Plants of the World Online, Royal Botanic Gardens, Kew <https://powo.science.kew.org/> | — | Botanical families (APG IV) |
| — | HLS v2.0 User Guide (LP DAAC) <https://lpdaac.usgs.gov/documents/1698/HLS_User_Guide_V2.pdf> | — | Product description; Fmask bits confirmed from file metadata |
