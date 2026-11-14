# Space Apps 2026 submission drafts

Challenge: Field Shift: Adapting Farms with NASA Data. Team: one person, Julia Gastellu (General Roca, Río Negro, Argentina). Local event: Puerto Madryn.

## Project name
Umbral

## Title
Does a winter cover fit before the canals close and the cold arrives?

## Summary (high level)

In the Alto Valle of Río Negro, vegetable plots are irrigated from canals that close for winter, around late April, and reopen in August. Between the summer harvest and the next spring crop, the plot often sits bare. Umbral helps growers use that gap without wasting seed, fuel and work. Before anything is spent, it compares leaving the plot as it is with a grass cover and a legume cover. For each one it shows whether the dates fit and the last canal turns, how often those dates met an early cold night (NASA POWER), what real parcels looked like in a past season (NASA HLS), what each cover is for, and what your field's conditions add. The decision stays with the grower.

I built Umbral, a planning tool for vegetable growers and farm advisers in General Roca, in the Alto Valle of Río Negro. Plots there are irrigated by gravity from canals that close in winter. Between a summer crop and the next spring transplant, a plot often keeps residue, bare soil or volunteer plants. Umbral helps decide whether to try a winter cover in that gap, and which one, compared with current practice. It does not decide for the grower and does not predict agronomic success.

The grower moves the release date, the cover sowing date or the next-crop date on one timeline. Umbral updates three strategies at once (current practice, a grass cover and a legume cover). For each one it shows whether the dates fit, with the margin in days and the binding constraint. It also shows how many irrigation turns remain before the canal closes, what would change the result, and the single most useful thing to find out next. NASA POWER data from 1981 to 2025 links the same dates to historical frost exposure: in how many years there were at least D days before the first minimum at or below T °C. A station check shows that this regional product understates cold nights in the valley. NASA HLS observations of a cluster of parcels in the horticultural belt show what was actually green on dates in the 2024 season. Everything exports as JSON and a readable summary.

## Demo plan (7 slides, English)

1. **The gap.** A tomato plot in General Roca is released in autumn; the canal closes in late April (29 April in the 2024 season); the next tomato goes in mid-October. What fits in between?
2. **The question.** Which strategies fit, and what climate exposure did those same dates have in past years? Who controls the plot in winter decides whether the question applies at all.
3. **Three steps.** My field (main crop harvested, date it is free) → My next season (next main crop, planting date, last canal turn) → Compare options. Winter covers (rye, oat, vetch) are clearly separate from main crops (vegetables and maize). Then one timeline. Release, three strategy bars with termination intervals, irrigation turns, canal closure, the next crop, a frost band from 45 years of NASA POWER, and HLS observation ticks.
4. **Move one date.** Squash leaves the plot; tomato goes in on 15 October; the last canal turn is 25 April, every 10 days. If the plot is free on 25 March, the cover can grow 162 days, has 31 days of canal water and 4 turns, and in 41 of 45 past years there were at least 30 days before the first night at or below 0 °C. If the plot is free on 10 April: 146 days, 15 days of canal water, 2 turns, and 33 of 45 years. With the last turn unknown, the app shows "Needs data" and asks for that date.
5. **What NASA adds.** POWER turns a generic rule ("sow 30–45 days before a hard frost", US guidance) into how many days there actually were in each of 45 years for that date. HLS shows the 2024 season of real parcels: which dates were clear, and what was green.
6. **Honest limits.** At Neuquén Aero, POWER's first autumn night at or below 0 °C comes a median of 17.5 days later than the station's (24 days at −2 °C, 39 at −4 °C), so its cold-night counts are likely too favourable. The app says so next to every climate reading and in the export. "Fits" is a calendar statement, not establishment. Salinity is never converted or classified.
7. **Next step.** Each strategy ends with one concrete question for the grower, the irrigation consortium or INTA. The export is ready to share. Local validation with growers and INTA is pending.

## NASA data

- **NASA POWER** daily point API (v2.10.3, community AG; MERRA-2 / GEOS-IT): T2M_MIN, T2M_MAX, T2M, PRECTOTCORR, 1981–2025, General Roca cell. Used for first-frost exposure by date, the frost band, and growing degree days with an explicit base.
- **HLS v2.0** (HLSL30_VI, HLSS30_VI, HLSL30, HLSS30) via CMR STAC and LP DAAC: NDVI, Fmask and true-colour chips for the 2024 reference season over a cluster of four parcels.
- Earthdata CMR to verify collection IDs and availability.

## Space agency partner data
- ESA Sentinel-2, through HLS S30 (contains modified Copernicus Sentinel data).
- ESA WorldCover 10 m 2021 v200 (CC BY 4.0), to screen orchard parcels out of the study cluster.

## Other data and references
- NOAA NCEI GSOD, station 87715099999 (Neuquén airport): regional check of POWER minimum temperature.
- Gerencia de Catastro – Agencia de Recaudación Tributaria, Provincia de Río Negro (IDERN WFS geonode:PARCELARIO1): study-cluster selection and parcel-size statistics; only derived statistics and a generalized outline are published.
- Departamento Provincial de Aguas (2024 canal closure), INTA Alto Valle (mean last frost, vetch trial in Cipolletti), SARE cover-crop guides (US), Noale 2015 (UNLP), Reinoso et al. (INTA/UNRN), SAGyP 2023, Paredes 2019 (CIEA), POWO (Kew). Full list: `docs/DATA_SOURCES.md`.

## Tools
TypeScript, React, Vite, Vitest, Leaflet with EOX Sentinel-2 cloudless, NASA GIBS and OpenStreetMap tiles; Python (standard library; rasterio, earthaccess, shapely, pyproj, numpy, Pillow); Playwright for browser checks; Vercel for hosting.

## AI assistance

The Umbral logo was generated with an AI image tool (see `docs/AI_DISCLOSURE.md`).

I used AI assistants (large language models) to search the literature, write and review code, and draft documentation. I defined the problem, chose the data, assumptions and scope, and checked the outputs against the cited sources. Agronomic validation with local growers or INTA is still pending.
