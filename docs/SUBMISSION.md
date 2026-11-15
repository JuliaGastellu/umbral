# Space Apps 2026 submission text

Challenge: Field Shift: Adapting Farms with NASA Data. Team: one person, Julia Gastellu (General Roca, Río Negro, Argentina). Local event: Puerto Madryn.

## Project name
Umbral

## Title
Umbral: a plan for living soil around your commercial crop

## Project links
- Live app: https://umbral-altovalle.vercel.app
- Code: https://github.com/JuliaGastellu/umbral
- Read-only API used by the app: https://umbral-api.juliacgastellu.workers.dev/api/health

## Summary

In the Alto Valle of Río Negro, farms are irrigated from canals that close for winter, around late April, and reopen in August. Between two annual crops the plot often sits bare; in orchards the interrow, and in strawberry beds the paths, are managed around a crop that stays. I built Umbral to help growers explore a service crop for that time and space without wasting seed, fuel and work, and to show honestly what NASA data can and cannot say about it.

The page is one journey. I start on a map of the public provincial parcel layer around General Roca with four study examples; only those four parcels have satellite readings, and the app says that my own field has not been processed. Four NASA layers each answer one question: what was green on a real 2024 date (HLS, 30 m), how the ground divided into green plants, dry material and bare soil (EMIT, the four examples together), and how often the planned window had enough days before a cold night in 45 years (POWER). Then I set the management conditions: production system (annual rotation, permanent orchard or beds), commercial crops, goal, dates and canal water. Umbral evaluates nine candidates, four established and five experimental, shows up to three side by side with their benefit, trade-off and evidence, and lets me select one. That option drives the calendar, the cold-night question, the date comparison, the nitrogen-process chain, saving and export, and every check I must settle before sowing is listed at once. Leaving the ground as it is stays a valid baseline.

The rules are documented and tested, with no score. A cover whose dates or system do not fit cannot be selected; a weaker match for the goal stays selectable with that limit shown. Missing inputs, water that may not reach the cover area, and reported waterlogging or salinity make an option conditional without changing its dates. No money, yield or nitrogen amount is computed. A station check shows that the regional NASA POWER record places cold nights later than the nearest station, and the app says so next to its climate readings.

## Demo plan (7 slides, English)

1. **The gap.** A squash plot in General Roca is free on 10 April; the canal closes in late April (29 April in the 2024 season); tomato goes in on 15 October. What could go in between?
2. **Locate and understand.** The parcel map with the study examples P1–P4 and four NASA layers: HLS chips and greenness for P2 on 16 April 2024, EMIT fractions for the four examples together, POWER cold nights from the planned sowing.
3. **Conditions.** Production system, previous and next crop, the free date, the last canal turn (25 April, every 10 days) and the goal "Prepare the next crop". The "Result now" line follows every change.
4. **The options.** Hairy vetch or vetch with oat: a legume adds nitrogen from the air (SARE, US guidance). 2 canal turns after sowing; in 33 of 45 past years there were 30+ days before the first night at or below 0 °C. What decides between them: how early I can sow. Next check: the last canal turn with the irrigation consortium.
5. **Change one thing.** Goal "Hold back weeds": cereal rye, oat and the mix are shown with what decides between them; dates and weather do not change. Move the free date to 20 June: no option fits, and the app says so.
6. **Other systems.** An established almond orchard with no water reaching the interrow, waterlogging and salinity: the trees stay, only the interrow window is evaluated, and all three checks are listed before sowing. Strawberry beds with plants kept: drip on the beds is shown, and water for the paths stays "not confirmed".
7. **What NASA adds, and its limits; keeping the plan.** POWER turns a generic rule ("sow vetch 30–45 days before a killing frost") into how many days there actually were in each of 45 years, and reads optimistic against Neuquén airport. HLS shows real parcels on real dates; little green is not proof of bare soil, and greenness is not soil nitrogen. Save the plan, reopen it and export JSON or Markdown with its reasons, assumptions and sources. Local validation with growers is pending.

## NASA data

- **NASA POWER** daily point API (v2.10.3, MERRA-2 / GEOS-IT): T2M_MIN, T2M_MAX, T2M, PRECTOTCORR, 1981–2025, General Roca cell (about 55 km), plus recent past days fetched live. Used for cold-night exposure in the plan's period and the climate history view.
- **HLS v2.0** (HLSL30_VI, HLSS30_VI, HLSS30 reflectance) via CMR STAC and LP DAAC: NDVI, Fmask and true colour for the 2024 season over the four study examples; an exploratory red-edge index from Sentinel-2 dates is kept in the data but not shown in the main flow.
- **NASA GIBS** HLS imagery tiles for the dated map.
- **EMIT L2B Fractional Cover v002**: median green-plant, dry-material and bare-soil fractions over the four examples together, on the real acquisition dates with valid pixels (8 January, 23 February and 11 November 2024; 15 September 2026).
- Earthdata CMR to verify collection IDs and the availability of ECOSTRESS, SMAP and IMERG. These are assessed or catalogued only and are not used in the app (IMERG file access was confirmed, but its data are not processed).

## Space agency partner data
- ESA Sentinel-2, through HLS S30 (contains modified Copernicus Sentinel data).
- ESA WorldCover 10 m 2021 v200 (CC BY 4.0), to screen orchard parcels out of the study selection.

## Other data and references
- Open-Meteo forecast API (CC BY 4.0): weather for the coming days; not NASA data.
- NOAA NCEI GSOD, station 87715099999 (Neuquén airport): regional check of POWER minimum temperature.
- Gerencia de Catastro – Agencia de Recaudación Tributaria, Provincia de Río Negro (IDERN WFS geonode:PARCELARIO1): public provincial parcel layer. I used it to select and sample the four study examples and show the derived boundaries on the maps with attribution; the original file is obtained with a download script and not redistributed.
- Departamento Provincial de Aguas (2024 canal closure), INTA Alto Valle publications (mean last frost; a vetch study in an almond orchard in Cipolletti, used as context), SARE cover-crop guides (US), Noale 2015 (UNLP), Reinoso et al. (INTA/UNRN), SAGyP 2023, Paredes 2019 (CIEA), POWO (Kew). Full list: `docs/DATA_SOURCES.md`.

## Tools
TypeScript, React, Vite, Vitest, Leaflet with EOX Sentinel-2 cloudless, NASA GIBS and OpenStreetMap tiles; Python (standard library; rasterio, earthaccess, shapely, pyproj, numpy, Pillow); Cloudflare Workers for the read-only API; Vercel for hosting; Playwright and axe-core for browser and accessibility checks.

## Online use
The calculations and bundled data run in the browser once the page has loaded. Maps, the forecast and recent NASA POWER days need a connection. There is no offline installation; a first visit needs the network.

## AI assistance

The Umbral logo is an AI-generated image; it carries a visible "Logo: AI-generated" mark in the app and in the logo file used in exports (see `docs/AI_DISCLOSURE.md`). NASA imagery and charts are data, not generated images.

I used AI assistants (large language models) to search the literature, write and review code, run browser checks and draft documentation. I defined the problem, chose the data, assumptions and scope, and checked the outputs against the cited sources. Agronomic validation with local growers or agronomists is still pending; no institution has reviewed or endorsed the app.
