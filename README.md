# Umbral

**A little space. A living possibility.** A plan for living soil: explore which service crop could use the time and space around a commercial crop, and what it could do for the soil and that crop.

- Live app: https://umbral-altovalle.vercel.app
- Read-only API (Cloudflare Worker): https://umbral-api.juliacgastellu.workers.dev/api/health
- Code: https://github.com/JuliaGastellu/umbral

I built Umbral for the NASA Space Apps Challenge 2026, challenge "Field Shift: Adapting Farms with NASA Data". I am a one-person team from General Roca, Río Negro, Argentina.

## The problem

In the Alto Valle of Río Negro, farms are irrigated from canals that close for winter (about late April) and reopen in August. Between two annual crops the plot often sits bare; in orchards the interrow, and in strawberry beds the paths, are managed around a crop that stays. A service crop could protect and feed the soil, but only if the dates, the water and the weather allow it, and only if it suits what the grower wants from it. Umbral helps explore that choice. The decision stays with the grower.

## What the app does

The Plan view is one journey:

1. **Locate & understand.** A map of the public provincial parcel layer around General Roca, with four *study examples* (P1–P4). Only these four parcels have satellite readings; your own field has not been processed. Four NASA layers each answer one question: what was green on a real 2024 date (HLS), how the ground divided into green plants, dry material and bare soil (EMIT, the four examples together), and how often the planned window had enough days before a cold night in 45 years (POWER).
2. **Management conditions.** Production system, commercial crops, service goal, dates and canal water, and optional soil and plot details. The prefilled dates are example dates until you change them.
3. **Your possibilities.** All nine candidates are evaluated. Up to three are shown side by side with benefit, trade-off, evidence level and "Why this option?"; one is selected and drives the shared calendar, the date comparison, the cold-night question, the nitrogen-process chain, saving and export. Every blocking check of the selected option is listed ("Next check" and "Also before sowing"). While you edit, a compact "Result now" line keeps the current result in view.

**Climate & NASA** shows today and the next days from the Open-Meteo forecast (not NASA), NASA POWER history for the plan's period (the default when the plan is beyond the forecast horizon), the HLS and EMIT detail and, for annual plans, the full calendar with year-by-year cold nights. **Saved plans** keeps plans and dated field notes in this browser; plans export as JSON or a Markdown summary of the plan as it is on screen.

### Production systems

- **Annual rotation** (vegetables and field crops): the gap from the date the field is free to the date the soil must be ready for the next crop, with canal turns and closure.
- **Permanent orchard** (apple, pear, peach, nectarine, plum, cherry, apricot, almond, pecan, walnut, orange, mandarin, lemon, grapefruit): harvest does not free the plot. Only the cover area (interrow or tree row) and the cover window you enter are evaluated; water reaching that area, tree age and mowing are checks.
- **Beds / camellones** (strawberry): if the plants are kept, only a stated free area (the paths) and window are evaluated; drip on the beds is not taken as water for the paths. If the plants are removed, the annual rotation applies. If you are not sure, the result is labelled "if the plants stay (not confirmed)".

Crops in the catalogue show their regional source or "not verified"; being listed is not a recommendation to grow them. "Other crop" keeps the name you type.

### The nine candidates

- **Established:** cereal rye, oat, hairy vetch, hairy vetch + oat.
- **Experimental** (listed apart, labelled "Experimental candidate"): winter field pea, small-seeded faba bean, forage radish, buckwheat, strawberry clover (perennial; orchard interrow or bed paths only).

Umbral never guarantees establishment, growth, yield, profit or fertiliser savings.

### How options are evaluated

Documented rules, no score and no success probability (`src/engine/recommend.ts`; details in [docs/METHODS.md](docs/METHODS.md)):

- **Excluded** (cannot be selected): a candidate whose dates do not fit (including zero days) or that does not suit the production system, for example a perennial in an annual gap. The reason stays visible.
- **Grouped by goal match:** candidates are grouped by how well the cited guidance matches the goal. A weaker match ("Dates fit; partial match for this goal") or a mismatch ("Dates fit; does not serve this goal") stays selectable with that limit shown; it is not an exclusion.
- **Conditional:** missing inputs (for example the last canal turn), unread past weather, water that may not reach the cover area, reported waterlogging or salinity, young trees, or plot access that depends on someone else make a candidate "Conditional: check first". These checks never change the dates.
- **Past weather** changes a candidate's state only through a threshold its source states with a unit (forage radish about four weeks before −2.2 °C; buckwheat not frost tolerant, 70–90 days; winter pea about −12 °C). Otherwise POWER is context and does not rank candidates.
- **Assumptions stay labelled:** termination intervals without a local source (for example the 21-day default for several experimental species) are marked as assumptions and can be changed in the advanced settings.
- **Nitrogen:** only a legume adds nitrogen from the air, and how much depends on establishment, nodulation, biomass, management and timing with the following or standing crop. Umbral shows this as a process, never as a dose, a fertiliser credit or a satellite measurement.

## Data in one paragraph

NASA POWER daily records (1981–2025, about 55 km regional model) give past cold nights for the plan's dates; checked against the Neuquén airport station, POWER places the first autumn cold nights later, so its counts read optimistic. NASA HLS (30 m, 2024 season, cloud-masked) shows dated greenness of the four examples; little green is not proof of bare soil. NASA EMIT (60 m, four real dates in 2024 and September 2026) gives median ground-cover fractions for the four examples together. Open-Meteo provides the forecast. None of these measures soil nitrogen. Per-dataset roles, resolution, period, quality rules and terms: [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md).

## Architecture

- **Frontend:** static Vite + React + TypeScript build on Vercel. The engine runs in the browser; the processed data in `public/data/` are bundled with the site.
- **API:** a small read-only Cloudflare Worker (`worker/`) serving the same processed data with provenance. The frontend uses `/api/sources` and `/api/observations` (HLS) when `VITE_UMBRAL_API` is set at build time. An answer is used only for the exact example and date requested; if the API fails or takes more than 3 s, the app uses its bundled files and says so. Image chips always load from the site's own address. The Worker also offers `/api/health`, `/api/history` and `/api/weather`, which the frontend does not call. See [worker/README.md](worker/README.md).
- **Live services:** map tiles (EOX, NASA GIBS, OpenStreetMap), the Open-Meteo forecast and recent NASA POWER days are requested from the browser. The app is not an offline app: a first visit needs the network, and maps and forecasts stop without it, while the calculations and bundled data keep working on a loaded page.
- **What the browser keeps:** saved plans and notes in `localStorage` (`umbral:plans:v2`), the forecast for 30 minutes and recent POWER days for 6 hours. The plan on screen is not saved automatically: reloading starts again from the example plan; open a saved plan to continue it.

## Run it

Checked with Node 24.14 and npm 11 on Windows 11 (Vite 6.4, TypeScript 5.7, Vitest 5).

```bash
npm ci
npm run dev                      # http://localhost:5173
npm test                         # engine, UI, API client, publication guard and Worker tests
npx tsc --noEmit -p worker       # type-check the Worker
npm run build                    # type-check, build to dist/ and run the publication guard
npm run preview                  # serve dist/ at http://localhost:4173
```

No environment variable is required. The two optional public settings are in [.env.example](.env.example): `VITE_UMBRAL_API` (API base URL) and `VITE_UMBRAL_ASSET_BASE` (where chips are served; default: the site itself). Neither is a secret. Local API: `ALLOWED_ORIGINS=http://localhost:5173 npx vite-node worker/dev-server.ts`, then `VITE_UMBRAL_API=http://localhost:8787 npm run dev`. Deployment: [docs/DEPLOY.md](docs/DEPLOY.md).

### Data preparation (already done; outputs are in `public/data/`)

```bash
python -I scripts/fetch_power.py           # NASA POWER, standard library only
python -I scripts/fetch_parcelario.py      # public provincial parcel layer (IDERN WFS) -> data/raw/ (not committed)
python -I scripts/station_check.py         # POWER vs NOAA GSOD Neuquén Aero
uv venv --python 3.11 .venv && uv pip install --python .venv/Scripts/python.exe earthaccess rasterio numpy pillow pyproj shapely
.venv/Scripts/python.exe -I scripts/parcels.py candidates -67.609 -39.062 1500
.venv/Scripts/python.exe -I scripts/parcels.py select -67.609 -39.062 1500 <ids>   # the four examples and sampling polygons
.venv/Scripts/python.exe -I scripts/parcel_layers.py                               # derived boundary files
.venv/Scripts/python.exe -I scripts/hls_trajectory.py season                      # needs your own Earthdata Login (.netrc, never committed)
.venv/Scripts/python.exe -I scripts/hls_trajectory.py interannual
.venv/Scripts/python.exe -I scripts/emit_frcov.py
.venv/Scripts/python.exe -I scripts/hls_ndre.py                                    # exploratory, not shown in the main flow
python -I scripts/sources_registry.py && python -I scripts/checksums.py
```

## What Umbral does not claim

- "Worth exploring" is not proof that a cover will establish, grow or pay off here. Local validation with growers and agronomists is pending.
- "Fits" means only that the stated dates and turns line up; turns after sowing are chances to water, not enough water.
- A count of past years is a frequency, not a forecast or a probability of crop success; a night at or below a threshold is a temperature reading, not crop damage.
- P1–P4 and the prefilled dates are study examples; Umbral does not analyse the user's own field.
- No money, yield, nitrogen amount, fertiliser saving or soil-health score is computed.

## Documentation

[METHODS](docs/METHODS.md) (rules and their history) · [DATA_SOURCES](docs/DATA_SOURCES.md) · [DECISIONS](docs/DECISIONS.md) · [DEPLOY](docs/DEPLOY.md) · [SUBMISSION](docs/SUBMISSION.md) · [AI_DISCLOSURE](docs/AI_DISCLOSURE.md) · [worker/README](worker/README.md)

Screenshots of the final interface (15 Nov 2026): [first screen](docs/screenshots/01-first-screen-1366x768.png), [HLS layer](docs/screenshots/02-hls-layer-p2.png), [EMIT layer](docs/screenshots/03-emit-layer-cluster-only.png), [POWER cold nights](docs/screenshots/04-power-cold-nights.png), [options and a date comparison](docs/screenshots/05-possibilities-pea-compare.png), [almond orchard with three checks](docs/screenshots/06-orchard-almond.png), [Climate & NASA](docs/screenshots/07-climate-view.png), [phone, 375 px](docs/screenshots/08-mobile-375.png), [editing with the current result](docs/screenshots/09-editing-with-current-result.png), [beds: drip is not path water](docs/screenshots/10-beds-drip-not-path-water.png).

## Licence, data terms and AI use

Code: MIT ([LICENSE](LICENSE)). The MIT licence covers the code only; data and map tiles keep their own terms, including the parcel boundaries derived from the provincial layer ([NOTICE](NOTICE), [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md)).

The logo is an AI-generated image and is marked "Logo: AI-generated" wherever it is shown. I used AI assistants to search the literature, write and review code and draft documentation; I defined the problem, chose the data, assumptions and scope, and checked the outputs against the cited sources ([docs/AI_DISCLOSURE.md](docs/AI_DISCLOSURE.md)). Agronomic validation with local growers or agronomists is still pending.
