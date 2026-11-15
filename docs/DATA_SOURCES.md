# Data sources

Access dates are 2026-11-14 unless stated. Original-language titles are kept.

## What each implemented dataset contributes

Only these are used by the app. Sources that were probed or only catalogued are listed under "Sources researched" with their status; they are not integrated.

| Dataset | What it answers in Umbral | Resolution and scope | Period | Quality rule | Limits |
|---|---|---|---|---|---|
| NASA POWER daily (T2M_MIN, T2M_MAX, T2M, PRECTOTCORR) | How many past years had enough days before a night at or below the chosen threshold, from the selected option's sowing (annual) or over the cover window (orchard, kept beds); climate history view | About 55 km regional model cell at −39.03, −67.58; one value for all examples | 1981–2025 bundled; recent days fetched live (cached 6 h) | Fill −999 treated as missing; missing years "can't tell", never counted | Not a forecast and not a plot sensor. Against NOAA GSOD Neuquén Aero, POWER places the first autumn nights at or below 0 °C a median of 17.5 days later, so counts read optimistic; no correction is applied. A temperature reading is not crop damage or a probability of success |
| NASA HLS v2.0 NDVI (L30, S30) with Fmask; true-colour chips | What was green on a real 2024 date on each study example, and the season trajectory | 30 m; four study parcels sampled 30 m inside their boundaries, or the four together | 2024 season, real acquisition dates | Fmask clean-pixel rule; "no valid image" (cloud, shadow, snow, water or missing) is distinct from low greenness | Vegetation greenness, not soil nitrogen. Little green is not proof of bare soil (residue may cover it); orchard pixels mix canopy, interrow and shadow. Changing the plan does not change a past image |
| NASA EMIT L2B fractional cover v002 | Share of green plants, dry plant material and bare soil on a few real dates | 60 m; the four examples together only (32 valid pixels); no per-parcel value | 8 Jan, 23 Feb, 11 Nov 2024; 15 Sep 2026 (no scene March–October 2024) | Pixels with the product's valid code (QC 0) | Medians of each fraction taken separately (need not add to 100 %). The uncertainty shown is the median of the per-pixel uncertainties, not the uncertainty or a confidence interval of the cluster value. Dry material is more than crop residue |
| NOAA NCEI GSOD, Neuquén Aero | Regional check of POWER minimum temperature | One station | Common March–June records | Complete years only for first-event comparison | Shown next to climate readings; not used to correct POWER |
| Open-Meteo forecast | Today and up to 16 days ahead for the General Roca area | Weather-model grid point | Issued at request time; cached 30 min in the browser; the last cached forecast is labelled when a refresh fails | Units validated or converted; missing values never shown as "no frost" or "no rain" | Not NASA, not station observations, not official warnings. Beyond its horizon the app shows NASA history for the same calendar dates, never an invented forecast |
| Provincial parcel layer (IDERN) | Where the study examples are; boundaries on the maps; sampling areas | Cadastral parcels as served | Downloaded 13–15 Nov 2026 | Derived files keep boundaries as served | Parcels are not management fields; no owner or land use; see the terms below |
| ESA WorldCover 2021 | Screening orchards out of the study selection | 10 m | 2021 | — | Used once in processing; not shown in the app |

## NASA data

| Dataset | Identifier | Use | Access | License / terms |
|---|---|---|---|---|
| NASA POWER daily point API v2.10.3, community AG (MERRA-2 / GEOS-IT) | <https://power.larc.nasa.gov/api/temporal/daily/point> | Daily T2M, T2M_MIN, T2M_MAX, PRECTOTCORR at −39.03, −67.58, 1981–2025 | No login. Exact request URL and SHA-256 in `public/data/provenance.json` | NASA open data; cite POWER |
| POWER meteorology sources and validation (E9) | <https://power.larc.nasa.gov/docs/methodology/data/sources_meteorology/> | Context: global Tmin validation | Read 2026-11-10 | — |
| HLS Landsat vegetation indices HLSL30_VI v2.0 | C3246892554-LPCLOUD, DOI 10.5067/HLS/HLSL30_VI.002 | NDVI and Fmask, 2024 season | CMR STAC search without login; files with Earthdata Login | NASA/USGS data, no restrictions; cite |
| HLS Sentinel-2 vegetation indices HLSS30_VI v2.0 | C3246894861-LPCLOUD, DOI 10.5067/HLS/HLSS30_VI.002 | Same | Same | Contains modified Copernicus Sentinel data (ESA, partner agency); cite |
| HLS reflectance HLSL30 / HLSS30 v2.0 | C2021957657-LPCLOUD (10.5067/HLS/HLSL30.002), C2021957295-LPCLOUD (10.5067/HLS/HLSS30.002) | B04, B03, B02 for true-colour chips | Same | Same |
| CMR STAC | <https://cmr.earthdata.nasa.gov/stac/LPCLOUD> | Scene search | No login | — |
| GPM IMERG Final daily v07 | GPM_3IMERGDF, DOI 10.5067/GPM/IMERGDF/DAY/07 | Not used: file access confirmed on 15 Nov 2026, data not processed (see "Sources researched") | — | — |

## Partner and other data

| Dataset | Identifier | Use | Access | License / terms |
|---|---|---|---|---|
| NOAA NCEI Global Surface Summary of the Day, station 87715099999 (Presidente Perón, Neuquén) | <https://www.ncei.noaa.gov/data/global-summary-of-the-day/access/> | Regional check of POWER Tmin | No login; readme <https://www.ncei.noaa.gov/data/global-summary-of-the-day/doc/readme.txt> | NOAA data; WMO Resolution 40 restrictions may apply to some non-US stations. Only derived statistics are published |
| ESA WorldCover 10 m 2021 v200 | DOI 10.5281/zenodo.7254221; tile ESA_WorldCover_10m_2021_v200_S42W069_Map | Orchard screen for the study cluster | Public S3 bucket, no login | CC BY 4.0 (© ESA WorldCover project 2021 / contains modified Copernicus Sentinel data) |
| Gerencia de Catastro – Agencia de Recaudación Tributaria, Provincia de Río Negro. Parcel layer | IDERN GeoServer WFS <https://idern.rionegro.gov.ar/geoserver/ows>, layer `geonode:PARCELARIO1` | Selection of the HLS study cluster; parcel-size statistics | Filter: TPA in (SUBRURAL, RURAL), bounding box around General Roca; EPSG:4326; 2,341 MultiPolygons. Downloaded by the author on 2026-11-14 | See below |

### Provincial parcel layer: how it is obtained and used (revised 15 Nov 2026)

- **Source:** IDERN GeoServer WFS <https://idern.rionegro.gov.ar/geoserver/ows>, layer `geonode:PARCELARIO1`; producer credited: Gerencia de Catastro – Agencia de Recaudación Tributaria, Provincia de Río Negro. Fields served: OBJECTID, PAR_ID, CCA, TPA, ARA, UND_ARA, SAG and the parcel geometry. The layer has no owner, holder or land-use information, and Umbral attaches none.
- **Download (reproducible):** `python -I scripts/fetch_parcelario.py` requests `TPA IN ('SUBRURAL','RURAL') AND BBOX(the_geom, -67.75, -39.15, -67.35, -38.90, 'EPSG:4326')` as GeoJSON and writes `data/raw/parcelario_roca_rural_subrural.geojson` plus a `.provenance.json` sidecar (request URL, retrieval time, service time stamp, feature count, SHA-256). The file used for the analysis was downloaded on 13–14 Nov 2026 (service time stamp 2026-11-13T14:09:34Z) without recording the request; on 15 Nov 2026 this script returned the same 2,341 parcels with identical geometry and attributes.
- **Processing:** `scripts/parcels.py` (size statistics, candidate selection with ESA WorldCover, the four examples and their 30 m inward sampling polygons) and `scripts/parcel_layers.py` (publishes the boundaries as served, with no simplification or rounding). The NASA scripts (`hls_trajectory.py`, `emit_frcov.py`, `hls_ndre.py`) sample pixels whose centre lies inside those sampling polygons.
- **Use in the app:** the Plan map and the dated NASA map draw the four example parcels with their boundaries and the surrounding parcel boundaries (toggle "Parcel boundaries (provincial cadastre)"); the NASA map also draws the sampled area. Attribution is shown under each map.
- **Included in the repository:** public/data/parcel_outlines.json (212 parcels around the cluster, boundaries as served, properties objectid and type), public/data/study_parcels.json (the four examples: boundary as served, the 30 m inward sampling polygon used for HLS and EMIT, objectid, type, declared area), public/data/study_area.json (cluster outline for framing, selection notes) and public/data/parcel_stats.json (size statistics). These are derived from the public layer and keep its source terms; the MIT licence of the code does not apply to them.
- **Obtained by download, not included:** the original GeoJSON (`data/raw/parcelario_roca_rural_subrural.geojson`, 2,341 parcels with the full attribute table) and the intermediate `data/raw/cluster_parcels.json`. `data/raw/` stays git-ignored.
- **Previous restriction:** on 14 Nov 2026 the boundaries were withheld as a precaution while reuse terms were unclear. On 15 Nov Julia confirmed the layer is a public provincial service announced for free and open GIS use; the boundaries are restored at source precision. The removed files were never committed in a way that needs history changes; no history was rewritten.

### Cadastral layer: license status
- The service is a public provincial service. Its capabilities declare "Fees: NONE" and "AccessConstraints: NONE". This describes technical access, not reuse terms.
- PARCELARIO0 and PARCELARIO1 have no abstract or license keywords and do not appear in the public portal catalog.
- A 2019 provincial government press release states that the provincial parcel layer is available "para su uso libre y abierto" in GIS: <https://registrocivil.rionegro.gov.ar/?contID=54058>. It does not name these layers.
- **Status: public provincial service with a 2019 provincial statement of free and open GIS use; not a formal open license.**
- **Showing and using the layer:** consistent with a public service that declares no access constraints and the 2019 statement of free and open GIS use. Done with attribution.
- **Redistributing the original GeoJSON inside the repository:** not done. What was found: the service declares Fees NONE and AccessConstraints NONE (technical access); the 2019 provincial press release announces free and open use of the parcel layer in GIS without naming these layers or giving licence text; no licence, attribution or redistribution clause was found in the layer metadata. What remains unconfirmed: whether copying the full original file (with its attribute table) into a public repository is covered, and under which attribution or licence. Until that is confirmed with IDERN or the Agencia de Recaudación Tributaria, the original file is obtained with the download script instead of being committed. This is a decision about the original file, not a claim that the data are private.

| EOX Sentinel-2 cloudless 2024 (EOxCloudless) | WMTS layer `s2cloudless-2024_3857`, <https://tiles.maps.eox.at/wmts/1.0.0/WMTSCapabilities.xml> | Background of the context map for finding the examples ("Satellite photo"); a 2024 mosaic with no single date, so no greenness colours are drawn on it | Loaded live by the viewer's browser; not downloaded, cached or bundled. Checked 2026-11-14 | "EOxCloudless by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2024)", CC BY-NC-SA 4.0 (license text in the WMTS capabilities); commercial use needs a license from EOX. Umbral is a non-commercial demo and shows the attribution on the map |
| NASA GIBS, HLS true colour | WMTS layers `HLS_S30_Nadir_BRDF_Adjusted_Reflectance` and `HLS_L30_Nadir_BRDF_Adjusted_Reflectance`, EPSG:3857, to zoom 12; <https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/WMTSCapabilities.xml> | Background of the dated NASA evidence map: the HLS image of the selected 2024 date (30 m; tiles stop at zoom 12 and are enlarged to zoom 14 at most, without smoothing, so pixels stay visible and no detail is invented) | Loaded live, no login. 2024 dates are covered (checked 2026-11-14) | NASA open data; attribution shown |
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


## Sources researched on 14 Nov 2026 (status per source)

Each entry is also in `public/data/sources_registry.json` and in the app's "Sources and methods" panel, built by `scripts/sources_registry.py` from the probe outputs.

| Source | Identifier | Question | Status |
|---|---|---|---|
| EMIT L2B Fractional Cover v002 | EMITL2BFRCOV.002, C4303752957-LPCLOUD, DOI 10.5067/EMIT/EMITL2BFRCOV.002 | What was on the ground on a date: green plants, dry plant material, bare soil | Probed with authenticated LP DAAC reads of the six layers plus QC. Values (median of the 32 valid 60 m pixels in the cluster, QC 0): 8 Jan 2024 green 62 %, dry plant material 6 %, bare soil 27 %; 23 Feb 2024 68 %, 0 %, 23 %; 11 Nov 2024 74 %, 0 %, 26 %; 15 Sep 2026 24 %, 45 %, 33 %. Scene 20260915T162209 has only fill values over the area (its twin 20260915T162157 covers it; counted once). No scene between March and October 2024. Shown in the evidence as "What was on the ground on a few dates"; not used in the suggestion. The September 2026 dry-material share may include cloud-edge effects noted by the producer |
| HLS S30 red edge (NDRE) | HLSS30 v2.0 reflectance B8A, B05 | Exploratory vegetation signal; not soil nitrogen | Probed: all 48 Sentinel-2 dates of the 2024 season read (0 read failures), 32 clear for the cluster; cluster NDRE medians 0.15–0.46. Scale 0.0001 and fill −9999 read from each file. Landsat dates not computed. Kept in `public/data/hls_ndre.json` and the source registry; not shown in the main flow and not used in the suggestion, because it adds no grower question beyond NDVI here and must not be read as a nitrogen measure |
| ECOSTRESS JET v002 / ETAUX v003 / JET v003 | C2076106409-LPCLOUD / C4057520953-LPCLOUD / C4057232489-LPCLOUD | Historical evapotranspiration, modelled moisture | Catalog checked only: 41 JET v002 granules in 2024 over the study rectangle; 0 ETAUX/JET v003 in 2024, 70 in 2022–2026. Not read; QA and geolocation not verified. ETAUX moisture is downscaled from GEOS-5 FP, not a plot measurement |
| SMAP L4 SPL4SMGP v008 | C3480440870-NSIDC_CPRD | Regional surface and root-zone moisture | Catalog checked only (1,718 granules Apr–Oct 2024). 9 km model grid: says nothing about a 4 ha irrigated plot; provider notice on 14 May–28 Jul 2026 geolocation |
| GPM IMERG Final daily | V07, C2723754864-GES_DISC, catalog through 2025-09-30 | Historical rain for comparable dates | Access confirmed, not integrated. An earlier test (14 Nov 2026) returned HTTP 403; a repeat on 15 Nov 2026 (UTC) returned HTTP 200 from data.gesdisc.earthdata.nasa.gov through a CloudFront redirect (sanitized record in data/raw/imerg_access_test.json). The file was not processed. POWER rain remains the source used in the app. |
| ORNL IGBP-DIS (569), HYSOGs250m, SoilGrids | ORNL DAAC; ISRIC | Regional soil context | Assessed, not integrated: historical or regional surfaces cannot give current plant-available nitrogen or certify a field's drainage; access and units not verified |
| ERA5-Land | ECMWF | Regional cross-check | Not obtained |

Public CMR queries and counts are saved in `data/raw/catalog_checks_2026-11-14.json` (local).


## Regional studies used as evidence records (14 Nov 2026)

Shown in a candidate's details as context, with site, system, what was found and why it does not transfer. No figure from these studies is shown or used.

| Record | What was read | Used for |
|---|---|---|
| Domini et al. 2024 (INTA EEA Alto Valle / UNCo), E17 | Repository record and abstract | Hairy vetch and vetch + oat: April sowing in the Alto Valle; nitrogen depends on cut timing; orchard, not vegetables |
| Vanzolini 2011, Tesis de Magíster UNS, EEA INTA Hilario Ascasubi <https://repositorio.inta.gob.ar/handle/20.500.12123/6999> | Abstract only (full thesis not read) | Vetch before maize under irrigation: more soil nitrogen at maize sowing, higher maize yield than after fallow; later kill, more biomass and nitrogen |
| Aapresid 2025, Chacra VINPA <https://www.aapresid.org.ar/blog/maices-12-toneladas-fertilizante> | Institutional post | Vetch before irrigated maize in North Patagonia; also reports a December 2023 late frost that hit maize after vetch harder |
| Suarez et al. 2025, CURZA-UNCo / EEA INTA Valle Inferior <https://admin.curza.uncoma.edu.ar/publicaciones/wp-content/uploads/sites/19/2025/08/3-Suarez.pdf> | One-page abstract | Oat-vetch versus oat with urea for grazing: similar dry matter; forage use, not a retained cover |

Not used: Pera Williams, "Manejo del suelo y fertilización" (INTA Alto Valle), which I have not read; CC-NCALC, PCSE/WOFOST/SNOMIN and APSIM, which I have not run or verified for Argentina. A nitrogen-release scenario would need one coherent trial with its own parameters and a verified model; it is not part of this version.


## Commercial crops and service species (15 Nov 2026)

| Record | Source | Read status | Used for |
|---|---|---|---|
| Apple, pear | INTA EEA Alto Valle (2025), argentina.gob.ar news | Read | Presence only |
| Peach, nectarine, plum | Calvo et al., INTA Alto Valle variety sheets | Cited in the research brief; PDF did not open on re-check | Presence only |
| Cherry, apricot, walnut | none | Not verified | Listed with "not verified" |
| Almond | Domini et al. 2024 (E17) | Abstract read | Presence; local study for vetch in almond |
| Pecan | INTA Valle Inferior (2026) news | Read | Presence in another valley; not copied from walnut |
| Strawberry | Miserendino, INTA Patagonia guide | Cited in the research brief; PDF did not open on re-check | Bed system (plants kept about two years) |
| Orange, mandarin, lemon, grapefruit | none | Not verified for the Alto Valle | Listed as requested; not assumed suitable |
| Winter field pea | SARE Field peas | Read 15 Nov 2026 | Experimental candidate; −12 °C minor-injury statement |
| Forage radish | SARE Brassicas and mustards | Read 15 Nov 2026 | Experimental candidate; four weeks before the first 28 °F (−2.2 °C) freeze |
| Buckwheat | SARE Buckwheat | Read 15 Nov 2026 | Experimental candidate; not frost tolerant, 70–90 days |
| Small-seeded faba bean | UC SAREP bell bean | HTTP 403; statements from the research brief | Experimental candidate, labelled |
| Strawberry clover | UC SAREP strawberry clover | HTTP 403; statements from the research brief | Experimental candidate, perennial, labelled |
