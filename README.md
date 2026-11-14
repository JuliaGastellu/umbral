# Umbral

**Does a winter cover fit before the canals close and the cold arrives?**

In the Alto Valle of Río Negro, vegetable plots are irrigated from canals that close for winter, around late April, and reopen in August. Between the summer harvest and the next spring crop, the plot often sits bare. Umbral helps growers use that gap without wasting seed, fuel and work. Before anything is spent, it compares leaving the plot as it is with a grass cover and a legume cover. For each one it shows whether the dates fit and the last canal turns, how often those dates met an early cold night (NASA POWER), what real parcels looked like in a past season (NASA HLS), what each cover is for, and what your field's conditions add. The decision stays with the grower.

I built Umbral for the NASA Space Apps Challenge 2026, challenge "Field Shift: Adapting Farms with NASA Data". I am a one-person team from General Roca, Río Negro, Argentina, competing at the Puerto Madryn local event.

## Who it is for and the decision it supports

Umbral is for growers and farm advisers with irrigated annual fields (vegetables and maize) in the Alto Valle, around General Roca. It supports one decision: whether to sow a winter cover between two main crops, and which one, compared with leaving the field as it is. It does not make that decision.

Scale, from the provincial land registry layer I used (parcels, not growers): around General Roca the layer holds 2,341 rural and sub-rural parcels; after leaving out 29 very large plateau parcels, 2,312 remain, of which 2,265 are sub-rural, with a typical size of about 6 ha (half between 3 and 12 ha). Many of them are orchards; the layer has no land use, so it does not say how many are annual fields. I have no adoption or benefit figures, and Umbral computes no savings in money, yield or soil.

## The problem in General Roca

In the Alto Valle, vegetable plots are irrigated by gravity from canals that close in winter (in the 2024 season the first cut at Dique Ballester was on 29 April). After a summer crop such as tomato or squash, a plot can sit with residue, bare soil or volunteer plants until the next spring crop. A winter cover could protect that soil, but it has to fit between dates the grower does not fully control: when the plot is released, when the last irrigation turn comes, when frost arrives, and when the soil must be ready for the next transplant. Many growers also rent for one or two seasons, so who controls the plot in winter matters as much as the agronomy.

## What the app does

Three steps: **My field** (main crop harvested and the date the field is free), **My next season** (next main crop, planting date, last canal turn) and **Compare options**. Main crops (tomato, squash, onion, maize) are kept apart from winter covers (rye, oat, vetch). The scope is irrigated annual fields in the Alto Valle; orchards are a different system and are not covered.


- Answers first what remains under the stated inputs: days until the cover must be terminated, days until the last irrigation opportunity (and whether that date is stated, nominal or unknown), and how many irrigation turns follow sowing.
- Draws the available window from release to the date the soil must be ready, on one shared calendar with three strategies: current practice (a neutral baseline), a grass cover (rye or oat) and a legume cover (hairy vetch or vetch with oat).
- Shows irrigation turns as exact dates when a reference turn and frequency are known, and as a range when the phase is unknown. Turns never move with the sowing date.
- For each strategy, separates **calendar compatibility** (with its margin and binding constraint) from **reported plot conditions**, and lists **what would change this** and one **next step**.
- Links the selected dates to **cold nights in past years** from NASA POWER (1981–2025): in how many years there were at least D days before the first minimum at or below T °C, in how many there were not, and how many cannot be evaluated.
- Shows four example parcels on a satellite map, coloured by how green they were on each 2024 satellite date, and **HLS** satellite observations (Landsat and Sentinel-2) of a small cluster of parcels for the 2024 season: each date's image, its clear pixels and a greenness chart.
- Answers three questions about the scenario with the same engine (rule-based, no AI model): what limits this option, what changes if sowing is delayed, and what information is missing.
- Exports inputs, assumptions, sources and results as JSON and a readable Markdown summary.

Moving any date updates the timeline, the columns, the turns, the climate sentence, the HLS highlight and the export together.

## How to run it

```bash
npm ci
npm run dev        # http://localhost:5173
npm run test       # engine tests (Vitest)
npm run build      # type-check, build to dist/, and check that no private data is published
```

The app works offline from the bundled data in `public/data/`.

### Data preparation (optional, already done)

```bash
python -I scripts/fetch_power.py           # NASA POWER, standard library only
python -I scripts/station_check.py         # POWER vs NOAA GSOD Neuquén Aero
uv venv --python 3.11 .venv && uv pip install --python .venv/Scripts/python.exe earthaccess rasterio numpy pillow pyproj shapely
.venv/Scripts/python.exe -I scripts/parcels.py candidates -67.609 -39.062 1500   # needs the cadastral file in data/raw/
.venv/Scripts/python.exe -I scripts/hls_trajectory.py season                      # needs your own Earthdata Login (.netrc)
.venv/Scripts/python.exe -I scripts/hls_trajectory.py interannual
```

## Data and methods

NASA POWER retrieved 2026-11-14 (API v2.10.3) and HLS v2.0 via NASA CMR/LP DAAC, processed by the scripts in /scripts; each file's request and checksum are in public/data/provenance.json.

- **NASA POWER** daily T2M_MIN, T2M_MAX, T2M and PRECTOTCORR at −39.03, −67.58, 1981–2025 (MERRA-2 / GEOS-IT, ½° × ⅝°, about 55 km). 45 valid years. Validated for coordinates, units, fill values and gaps.
- **Regional check:** POWER against NOAA GSOD at Neuquén Aero, March–June. POWER's daily minimum is +0.64 °C warmer on average (RMSE 2.94 °C), and in the 34 years with complete data its first autumn night at or below 0, −2 and −4 °C comes a median of 17.5, 24 and 39 days later than at the station. I show this next to every climate reading and in the export, and do not correct it.
- **HLS v2.0** (HLSL30_VI, HLSS30_VI, plus reflectance for true colour), Fmask-based clean-pixel rule, parcels buffered 30 m inward.
- **Study area:** a cluster of four cadastral parcels in the horticultural belt of General Roca, selected from the provincial cadastral layer and screened with ESA WorldCover 2021. Only a generalized outline and derived statistics are published.

Full details: [docs/METHODS.md](docs/METHODS.md), [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md), [docs/DECISIONS.md](docs/DECISIONS.md).

## What Umbral does not claim

- "Fits" means only that the stated dates and turns line up. It does not mean the cover will establish, grow or pay off.
- The climate sentence is a historical frequency of a weather condition, not a probability of success and not a forecast. Climate never changes the calendar status.
- "Turns that fit" is a count, not a statement that the water is enough.
- Salinity is shown as entered; it is never converted between methods or classified.
- The family alert describes a repeated botanical family; it does not estimate disease or say that a cover breaks a cycle.
- HLS shows what was green or not on given dates; it does not date harvest or release, and a low NDVI is not bare soil (residue is not green).

## External prerequisites

- Weather forecast: Open-Meteo's free non-commercial API is connected directly (no key). Meteomatics is not connected; it would need my account and a server-side function for the credentials.

- Deployment: connect the private GitHub repository to Vercel and check the production URL in a private window (see `docs/DEPLOY.md`).
- Optional: IMERG needs the GES DISC license accepted by me.
- Optional: a generative assistant would need a model API with a server-side key; the current explainer is rule-based.

## Limitations

- POWER is a ~55 km reanalysis cell, not a plot. At the nearest station it understates cold nights; a valley-floor plot is likely colder.
- The scenario is illustrative. Its dates are assumptions, and the termination intervals come from US guidance.
- The 2024 HLS season covers one cluster of parcels; cadastral parcels are not management fields, and land use was not verified on the ground.
- Agronomic validation with local growers or INTA is pending.

## Sources and licenses

Code: MIT ([LICENSE](LICENSE)). Data: NASA POWER; NASA HLS (NASA/USGS Landsat 8/9 and ESA Sentinel-2, partner-agency data) via LP DAAC; NOAA NCEI GSOD; ESA WorldCover 2021 (CC BY 4.0); Gerencia de Catastro – Agencia de Recaudación Tributaria, Provincia de Río Negro (derived statistics only; no formal open license confirmed). Full list with DOIs and access dates in [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md).

## AI assistance

The logo was generated with an AI image tool; see [docs/AI_DISCLOSURE.md](docs/AI_DISCLOSURE.md).


I used AI assistants (large language models) to search the literature, write and review code, and draft documentation. I defined the problem, chose the data, assumptions and scope, and checked the outputs against the cited sources. Agronomic validation with local growers or INTA is still pending.
