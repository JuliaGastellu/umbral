# Methods

## How to read this file

The section below, "Current behaviour", describes the final app. Sections 1–18 are a dated record of how the rules were built and corrected; where an earlier section conflicts with a later one or with "Current behaviour", the later text applies. Parts marked as removed or superseded are kept for traceability only.

## Current behaviour (15 Nov 2026)

Umbral helps explore a service crop for the time and space around a commercial crop. It checks dates, water, past weather and published evidence; it does not decide, and it does not predict establishment, growth, yield, income or fertiliser savings.

- **Systems** (`src/engine/period.ts`, `recommend.ts`). Annual rotation, or beds whose plants are removed: the management period runs from the date the field is free to the date the soil must be ready (next crop minus preparation), with canal turns and closure (§1). Permanent orchard, or beds whose plants stay: harvest does not free the plot; only the cover area and the cover window entered are evaluated, and the main crop is the standing crop. Beds with plants "not sure" are calculated as if the plants stay and labelled as not confirmed.
- **Candidates.** Established: cereal rye, oat, hairy vetch, hairy vetch + oat. Experimental: winter field pea, small-seeded faba bean, forage radish, buckwheat, strawberry clover (perennial; orchard interrow or bed paths only).
- **Statuses.** Excluded and not selectable: dates do not fit (including zero days, or a sourced frost condition that fails in most past years) or the system does not suit the species. Selectable: "Worth exploring", "Conditional: check first", "Experimental candidate", "Dates fit; partial match for this goal", "Dates fit; does not serve this goal". Goal match, calendar viability and evidence level are kept separate (§15–§17).
- **Checks before sowing** (`src/engine/planText.ts`). The selected option's blocking checks plus the shared ones, without duplicates, in a fixed priority (access, system, soil, water, calendar, climate, species); all are shown, the first as the next check (§18). Reported waterlogging or salinity, water that does not or may not reach the cover area, young or unknown-age trees, a missing last canal turn and unread past weather make an option conditional; they never change the dates. No tolerance threshold is applied.
- **Past weather** (§3). A general cold check with the person's threshold and days, from the selected option's sowing (annual) or over the cover window (standing crops). It changes a candidate's status only where a source states a threshold with a unit (forage radish, buckwheat, winter pea). The station check travels with every climate output.
- **Satellite evidence** (§4, §13, §17). HLS shows dated greenness of the study examples; EMIT shows median ground-cover fractions for the four examples together. Neither ranks candidates or measures soil nitrogen.
- **Nitrogen** is shown as a process (establishment, growth and nodulation with water, biomass retained, breakdown, overlap with uptake), never as an amount.
- **Assumptions.** Termination intervals without a local source (including the 21-day default for several experimental species) are labelled as scenario assumptions and can be changed.
- **Export** (§17). JSON (`umbral.plan/2`) and Markdown are built from the plan on screen, including unsaved edits, the selected option and the system's management period. The annual A/B/C strategies appear only for annual plans, as labelled reference comparators.
- **Browser state.** Saved plans and notes in `localStorage` (`umbral:plans:v2`); the plan on screen is not saved automatically.

## 1. Engine rules (`src/engine/`)

### Dates (`dates.ts`)
- Plain calendar dates with full years, no time zones. Arithmetic uses integer day numbers.
- A window may cross 31 December; the successor may be in the following year.
- When a scenario date is mapped to a historical year, the year offset between start and end is kept. 29 February maps to 28 February in years without it.

### Window and calendar compatibility (`calendar.ts`)
- Window = release → soil ready, where soil ready = next-crop date − preparation.
- Each cover has a termination deadline = soil ready − termination interval.
- Constraints:
  - current practice (A): release on or before soil ready;
  - covers (B, C): sowing on or after release (otherwise the input is invalid); termination deadline after sowing (plus the target duration, if set); at least *m* irrigation turns after sowing, unless another water source after closure is stated.
  - Water after closure has three values. "Yes" satisfies the turn requirement (quantity is never checked). "No" leaves canal turns only. "Unknown" is never read as "no": if canal turns alone cannot meet the requirement, the result is "Needs data: fits if water is available after canal closure from another source".
- States:
  - **Fits**: all stated constraints are met. The card lists what "Fits" covers and what it does not (cover duration when no target is set, water sufficiency, establishment).
  - **Needs data**: no known constraint fails, a constraint depends on a missing input, and its best case passes. The threshold is shown, e.g. "fits if the last turn is on or after 12 Apr".
  - **Doesn't fit even with data**: the best case of an unknown constraint fails (for example, sowing after canal closure with no other water).
  - **Doesn't fit**: a known constraint fails; the binding constraint and its shortfall are named.
  - **Check inputs**: invalid dates, sowing before release, or a next crop on or before release. Explained inline; the app never crashes.
- Units are kept apart. A margin is always days; a shortfall in irrigation turns is always a number of turns (`turnDeficit`) and is reported as "N turns short", never as days.
- Margin: the smallest slack (days) among known time constraints. Ties list every binding constraint. There is no default "tight" threshold.
- The overview shows three separate quantities for the selected cover: days from sowing to the termination deadline; days from sowing to the last irrigation opportunity, with its status (stated in the scenario, nominal, or unknown with canal closure as the latest possible date); and irrigation turns after sowing as a count or range, never in days.
- Without a target cover duration, Umbral shows the available interval (sowing → termination deadline) and says that the duration requirement is missing.

### Irrigation turns (`turns.ts`)
- A schedule is a reference turn date plus a frequency, ending at the last known turn or at canal closure. The last known turn, when given, is the reference.
- Knowing the phase (a dated turn) is different from knowing until when service continues. With a reference turn and a frequency but no stated last turn, future turns are **nominal**: shown with dashed marks, counted as "up to N (nominal)", and the result is "Needs data: fits if irrigation continues until at least [date]". Only a stated last turn makes them confirmed.
- The schedule never moves with the sowing date.
- A frequency without a reference date gives a range: the minimum and maximum number of turns over all possible phases, up to closure.
- With no frequency, only the last turn (if known) is used: "at least 1".
- "Turns that fit" = scheduled turns between sowing (inclusive) and the end of irrigation (inclusive). It is never "enough water".
- "Lose the last turn" removes the last scheduled turn.

### Termination intervals
| Cover | Default | Status |
|---|---|---|
| Cereal rye | 28 d | Scenario assumption, from US guidance (SARE) for small-seeded vegetable crops after rye (3–4 weeks) |
| Oat | 21 d | Scenario assumption, from US guidance (SARE) before sensitive crops (about 3 weeks) |
| Hairy vetch | 21 d | Scenario assumption without a source |
| Hairy vetch + oat | 21 d | Scenario assumption, from US guidance for oats; no source for the mixture |

All are editable. They are not universal constants.

### Climate exposure (`climate.ts`, `exposure.ts`)
- One comparison everywhere: an event is a day with **Tmin ≤ T** ("at or below"). T ∈ {0, −2, −4} °C, meteorological references only.
- For each year 1981–2025, the search runs from the start date (release for A, sowing for B or C), mapped to that year, to a fixed, visible search end (default: the next-crop date).
- Two outputs per year, kept separate:
  1. **First-event timing** (descriptive): days to the first event (start day = day 0); "no event before the search end" (censored: no date is invented); or "insufficient data" (a missing value or the end of the record before any event; the number of clean days observed is kept).
  2. **The question "at least D days before the first day at or below T?"** (first-event day k ≥ D): **met** when an event comes on day D or later, or when at least D days were observed with no event (a censored year can demonstrate the condition); **not met** when an event comes before day D; **not evaluable** when fewer than D days were observed with no event (search window shorter than D, missing data, or end of record). Missing values are not replaced: they only matter if they occur before D clean days.
- A search end before the start is an input error, reported as such (not as missing data).
- Summary sentence (one form for screen and export): "Of N years (first–last), the first day with a minimum at or below T °C came at least D days after [start] in X years and sooner in Y. Z could not be evaluated (reasons). Search until [end]." The screen shows the same counts as three labelled groups of year cells (solid, hatched, dashed with ×), plus a year-by-year table with dates, days, Tmin and the answer.
- Reproduced by an independent count: T 0 °C, D 30, until 15 Oct: 43 met / 2 not met from 15 Mar; 33 / 12 from 10 Apr.
- Timeline band: P10, P50, P90 of days to the first event, with no-event years ranked after the search end.
- Growing degree days: Σ max(0, Tmean − base) with an explicit base (0 °C, assumption). Thermal accumulation, not observed growth.
- Climate never changes a calendar status. This is enforced by the engine's signature (`evaluate(scenario)` takes no climate input) and tested.

### Sensitivity (`sensitivity.ts`)
For each strategy, each parameter (release, sowing, next-crop date, preparation, termination interval, last turn, target duration) is shifted one day at a time in both directions up to 120 d. The first shift that changes the calendar status is listed. Tests compare the result with analytic margins and an independent brute-force loop.

### Plot context (`context.ts`)
- Texture, waterlogging (sector, duration), salinity, last three crops, plant health problem. "Unknown" is valid everywhere.
- Salinity keeps value, unit, method (irrigation water / saturated-paste ECe / EC1:5 / other), date and depth. It is shown as entered: never converted between methods and never classified.
- Botanical family alert when the previous and next crops share a family (APG IV, POWO). Fixed descriptive text; it does not estimate disease or claim that a cover breaks a cycle.
- These inputs feed only "Reported plot conditions" and "Next step". Tests check that the calendar result is identical with and without them.

### Next step
One item per strategy, in this order: plot access; data that changes a calendar status (with its threshold); the smallest date change that would make a non-fitting strategy fit; plot-condition reviews (waterlogging, salinity, family repeat without a health record); missing cover duration; otherwise confirming the termination interval with a local adviser.

### Grower priority
Keep the next crop's date / explore soil cover / avoid extra field operations. It orders each explanation and highlights the matching line. It produces no score, no benefit figure and no income claim.

## 2. Parameters and their status

| Parameter | Default | Status |
|---|---|---|
| Release | 15 Mar 2027 (presets 20 Feb, 15 Mar, 10 Apr) | Scenario input |
| Next crop | Tomato transplant, 15 Oct 2027 | Scenario assumption; mean last frost 6 Oct (E19) is context only |
| Preparation | 14 d | Assumption without a source |
| Canal closure | 29 Apr | DPA closure in the 2024 season (E15), placed on the planning season |
| Last turn, frequency, reference turn | unknown | Grower inputs |
| Turns required after sowing | 1 | Assumption without a local source |
| Target cover duration | not set | Grower input |
| D (climate sentence) | 30 d | Display reference from US guidance for hairy vetch (SARE) |
| GDD base | 0 °C | Assumption |

## 3. NASA POWER

- Daily point API v2.10.3, community AG, parameters T2M, T2M_MIN, T2M_MAX, PRECTOTCORR, 1981-01-01 to 2025-12-31, at −39.03, −67.58 (irrigated area of General Roca). Sources in the header: MERRA2, POWER. Grid ½° × ⅝° (about 55 km). Not plot-level.
- Validation in `scripts/fetch_power.py`: response coordinates, units from the header (°C, mm/day), fill value −999 → missing, per-year completeness. Valid year: T2M_MIN missing on at most 10 days between 1 Feb and 31 Dec. Result: 45 valid years, no gaps.
- Provenance (`public/data/provenance.json`): request URL, retrieval time, SHA-256 of the response, POWER version.
- Hand-checked year (test): from 15 Mar 2024, the first day with T2M_MIN ≤ 0 °C is 13 May 2024 (−0.04 °C), 59 days. 3 May (0.02 °C) does not count.

### Regional check (`scripts/station_check.py`)
- POWER T2M_MIN at the station coordinates (a different cell from Roca) against NOAA GSOD 87715099999 (Neuquén airport, about 50 km west), March–June, 1981–2025, 5,336 common days.
- GSOD MIN is the minimum reported during the UTC day (°F, missing 9999.9); POWER uses local solar time. The mismatch is a caveat, not corrected.
- Daily Tmin, POWER − station: bias +0.64 °C, RMSE 2.94 °C, r 0.86.
- Days at or below T (station / POWER / same date / share of station days): 0 °C 935 / 579 / 430 / 46 %; −2 °C 482 / 198 / 154 / 32 %; −4 °C 177 / 30 / 22 / 12 %.
- First event from 1 March (search to 31 July), using only years with no missing value before the event in either series (34 years): POWER later by a median of 17.5 d (0 °C), 24 d (−2 °C), 39 d (−4 °C). An independent check by the reviewer gave the same medians.
- "Same date" counts: station days at or below T on which POWER was also at or below T on the same date. Because GSOD uses the UTC day and POWER the local solar day, this share understates agreement somewhat and is not a pure detection rate.
- The short regional-check sentence is shown with every climate reading (strategy cards, climate panel, frost lane note) and is carried into the JSON and Markdown exports with the station summary.
- Reading: at this station POWER misses most cold nights, so POWER exposure is likely understated for a valley-floor plot. This checks the regional reanalysis, not a Roca plot. No bias correction was derived or applied. The good global correlation (E9) does not validate threshold crossings.

## 4. HLS

- Products verified in CMR: HLSL30_VI v2.0 (C3246892554-LPCLOUD), HLSS30_VI v2.0 (C3246894861-LPCLOUD), and HLSL30 / HLSS30 v2.0 for the RGB chips (B04, B03, B02). Tile T19HFS.
- From the file metadata: NDVI scale factor 0.0001, fill −19999; the VI item's Fmask asset is the reflectance product's Fmask. Fmask bits ("Fmask description" tag): 7–6 aerosol (00 climatology, 01 low, 10 average, 11 high), 5 water, 4 snow/ice, 3 cloud shadow, 2 adjacent to cloud, 1 cloud, 0 cirrus.
- Clean-pixel rule: pixel centre inside a parcel after a 30 m inward buffer; cloud, adjacent, shadow, snow/ice and water bits all 0; aerosol not "high"; NDVI not fill.
- Per observation: date, sensor, cluster and per-parcel median NDVI with P25–P75, clean-pixel count and fraction, Fmask counts, and 30 × 30-pixel RGB and NDVI chips (900 m). Chip corners are stored from the tile grid (EPSG:32619 as used by HLS) and converted to longitude/latitude, so the image can be placed on a map at its real location.
- Display: a location map (OpenStreetMap, loaded live with attribution, never cached) with the generalized outline, a scale bar and an optional overlay of the selected HLS image. The background is a current street map and does not change with the date; the overlay keeps its own 30 m resolution and acquisition date. If the map cannot load, a note replaces it and the bundled HLS image still shows.
- The NDVI view has a less-green → more-green legend and a separate grey for masked or missing pixels. The seasonal chart joins clear dates only when they are 20 days apart or less; longer gaps stay open. Mostly masked dates are shown on a separate "no value" row.
- The cluster value is the median of all clear pixels in the four buffered parcels; when clouds mask part of the cluster, the median comes from fewer pixels and can shift for that reason alone. The text summary describes observed change by season and does not infer crops, harvest or causes.
- Result for the 2024 season: 79 observations (L30 + S30, tile T19HFS), 46 clear, 4 partly masked, 29 mostly masked; clear observations in every month from February to November. Pixels after the 30 m inward buffer: 26, 24, 23 and 22 per parcel, 95 for the cluster. Cluster NDVI median goes from about 0.55–0.6 in February–April to about 0.3 in July–August and back to about 0.5 in late November. One parcel stays between 0.11 and 0.20 on every clear date of the season (a bare-looking patch on true colour); the cause is not known from the imagery.
- Inter-annual summary (secondary tab): 1 June–31 August of 2016–2025, 5 to 15 clear observations per winter; median of clear cluster medians between 0.27 and 0.37.
- Reference season 2024-02-01 to 2024-11-30 (the 2024 closure is documented, E15). Observations are placed on the planning season's calendar by day and month; their values never change with the strategies.
- Fixed notes: residue protects soil without looking green; volunteer weeds look green; edge pixels mix canals and windbreaks; HLS does not date harvest or release. A few clear observations do not prove that a whole season is represented.

### Study area
- Source: provincial cadastral layer (IDERN WFS, geonode:PARCELARIO1). SUBRURAL parcels of 2–15 ha near the irrigated belt southwest of General Roca, screened with ESA WorldCover 2021 (tree-cover share ≤ 25 %) and checked on HLS true colour (summer and winter 2024).
- Cluster: 4 parcels, 4.0–4.4 ha declared, 1.9–2.3 ha after the 30 m inward buffer.
- Published: a generalized outline only. Cadastral parcels are not management fields; the layer has no land use or owner information.

## 5. IMERG

Not integrated. It would only add satellite precipitation accumulated over the selected window, per year, next to POWER's PRECTOTCORR. File access was confirmed on 15 Nov 2026, but no IMERG data were processed, so POWER rain remains the only rain record in the app (status in `public/data/sources_registry.json`).

## 6. Scenario explainer (removed 15 Nov 2026)

Removed from the interface in the final integration; the "Why this option?" rows and the date comparison cover the same questions. Historical description: "Ask about this scenario" offered three questions: what limits this option, what changes if sowing is delayed, and what information is missing. Answers are rule-based and computed with the same engine; no AI model is used and nothing is labelled as a model response. "What changes if sowing is delayed?" runs the engine for +7 and +14 days, shows the three quantities and the calendar check for each, and lets the user apply one. It never states species suitability, yields, forecasts or water sufficiency.

## 7. Revision of 14 Nov 2026 (independent review)

Fixed with regression tests in `src/engine/review.test.ts`: unknown water after closure no longer read as "no"; nominal turns separated from confirmed turns; turn shortfalls reported in turns, never days; the D-day climate question classified as met / not met / not evaluable; regional check carried in every climate output and in exports; planning-season closure marked as an assumption with the 2024 record kept separately; first-event station comparison restricted to complete years; mobile overflow fixed at the source (no hidden body overflow).

## 8. Grower-facing presentation (UX pass, 14 Nov 2026)

- Plain words in the main view; technical terms (NDVI, median, reanalysis, Fmask, sensor codes) stay in "How this was built" sections and in Sources and methods.
- Example opened by default (after computing): squash then tomato, plot free 10 Apr, last canal turn 25 Apr every 10 days, cold night at 0 °C, D = 30. It shows 146 days the cover can grow, 15 days until the last irrigation, 2 canal turns, and 33 of 45 years with at least 30 days before the first cold night. With the plot free on 25 Mar: 162 days, 31 days, 4 turns, 41 of 45. At −2 °C the years only split from mid-April, so 0 °C is the default. The engine tests keep their own baseline scenario.
- Map (superseded on 14 Nov 2026, see §13): four study parcels drawn from simplified shapes and coloured by greenness on the selected date in five display steps (below 0.2 "little or no green cover", 0.2–0.35, 0.35–0.5, 0.5–0.65, 0.65 and above "very green"); a parcel with fewer than 20 % visible pixels is shown as "hidden by clouds". Background: EOX Sentinel-2 cloudless 2024 (a mosaic; it does not change with the date), optional NASA GIBS HLS true colour for the selected date, OpenStreetMap as fallback. If every background fails, the parcels and colours still show.
- The small 30 m image chip is no longer the main image; the season chart is linked to the map date and shades the scenario window placed on 2024 by day and month.

## 9. Product flow and evidence controls (14 Nov 2026)

- Scope stated on screen: irrigated annual fields in the Alto Valle (vegetables and maize). Main crops (harvested and next) are kept apart from the optional winter cover. Apple and pear orchards are perennial; inter-row covers are a different system and are out of scope. No orchard mode exists.
- Maize is a main crop in the catalog. Its reference is a sowing window from a Valle Inferior simulation; the app gives no harvest date for it and asks for the user's own field-free date (grain, forage and sweet corn differ).
- Flow: 1 My field, 2 My next season, 3 Compare options; assumptions under "Adjust assumptions and more about my field"; full calendar, year-by-year weather and satellite images under "Inspect the evidence".
- "Calendar time available" replaces "days the cover can grow": the engine counts calendar days from sowing to the date the cover must be ended, not growth under cold or limited water.
- Two-date comparison (`src/engine/compare.ts`): the proposed field-free date replaces the plan's; cover sowings move by the same number of days; everything is recomputed. Tested case: last turn 25 Apr every 10 days, 25 Mar vs 10 Apr → 31 vs 15 days to the last turn, 4 vs 2 turns, 162 vs 146 days of calendar time for rye (28-day assumption) and 169 vs 153 for vetch (21-day assumption), 41 vs 33 of 45 years at 0 °C, D 30. Turn dates never move.
- Historical image date: chosen only with its own control (previous/next clear image, date list) or with "Follow my plan's date", which places the plan's month and day on 2024 and selects the nearest clear image within 20 days, showing the real acquisition date and the offset; if none is that close the image is kept and the app says so. Crop or date choices never change the images. Tested in `src/engine/compare.test.ts`.
- Map: the context photo (EOX 2024 mosaic) never changes; the dated layer is NASA HLS of the selected date. Parcel colours use four display steps of the greenness index (NDVI below 0.2, 0.2–0.4, 0.4–0.6, 0.6 and above); one class covers every reason for no valid observation (clouds, shadow, snow, water, missing data). NDVI is not limited to 0–1; the chart shows 0–0.9 and says so. NDVI is not presented as percent protected soil.
- Exports include the two-date comparison and the image date shown, with the follow offset when used.

## 10. Map-first consultation: weather and NASA climate history (14 Nov 2026)

- Path: select an example parcel → check the area's weather and NASA records → enter management conditions → compare options. Only the four processed parcels have HLS readings; the context map and other fields carry none.
- Parcel selection (buttons and map) scopes the HLS reading, the image-date controls, the answer sentence and the greenness chart to that parcel's own pixels; "All four (cluster)" uses the cluster median. Weather and POWER values are one area value for all four parcels (POWER is a ~55 km cell).
- Forecast provider: Open-Meteo (no Meteomatics credentials were configured). Adapter `src/weather/model.ts` normalizes current, hourly and daily values with the units the response reports; dates come from the provider's local strings (America/Argentina/Buenos_Aires, UTC−3), never re-parsed. Requests are debounced, cancelled when obsolete and guarded so an older response cannot overwrite a newer selection; cache 30 min by provider and location. A failed refresh shows the last saved forecast marked with its original retrieval time.
- Consultation period: its own start and end, independent of the plan (a button can copy the plan's first month explicitly). Each day is assigned to one source: forecast (today to the last returned date), NASA POWER bundled (1981–2025), NASA POWER live (2026 past days, as far as the API returns valid values) or nothing. Gaps are shown, never filled; forecast and history are never joined into one series.
- Distant periods (e.g. 2027) get no daily forecast; the app offers NASA history for the same calendar dates, labelled with their real years.
- NASA climate history: "One specific year" (real Tmin, Tmax, Tmean and rain of that year; extremes named with their dates; missing days left empty) and "All years, same dates" (P10–P90 per day of Tmin and Tmax across complete years, typical accumulated rain and lowest night with the actual extreme year, and the existing cold-night question; periods shorter than D say so instead of a count). Comparable calendar: same start day and month, same length; 29 Feb starts on 28 Feb in non-leap years. The Neuquén Aero discrepancy line is shown with the cold-night count. Rain is an estimate, not canal water or soil moisture.
- Plain facts from the forecast (lowest minimum, days at or below 0 °C, most rain and total) are temperature and rain statements only, not damage, trafficability or irrigation advice.
- Tests: `src/weather/weather.test.ts` (adapter, units, missing values, time zone boundary, coverage segments for future, distant, partial and past periods, request ordering, history views, live-query validation).

## 11. UX pass 2 (14 Nov 2026)

- Map dates: the default background is the NASA HLS image of the selected date (GIBS), labelled with its full date; parcel badge colours show greenness on that same date. The EOX 2024 mosaic combines many dates, so on it only outlines are drawn, with no greenness colour. Parcels are outlines with a small label badge (fill at most 0.2 opacity on the NASA image). The NASA layer opens at zoom 13 and stops at 14. If it fails to load, the map switches to the year photo with a note.
- One sentence near the image-date control states that images are from the 2024 season and the plan is for a later year.
- Step-3 result: four numbers in one row: calendar time available, time until the last irrigation, canal turns after sowing, and the NASA POWER cold-night reading from the sowing date (with the one-line optimism note). The grower priority adds a line that changes with the choice (keep the next-crop date / soil cover / fewer field operations). "What limits this option?" and "What information is missing?" are inline links; the separate questions box was removed.
- Options: one table row per option with only what differs; shared facts once above.
- Next steps are tied to the limiting condition (e.g. confirm the last canal turn; a delay of more than N days leaves the seed without canal water). "Leave it as now": "No calendar decision needed."
- Crop references: the harvested crop shows its harvest window (or says no local date was found); the next crop shows its planting window.
- Step 2b "About your field (optional)": grower priority, soil and plot history, visible; they never change the dates.
- Weather: NASA climate history sits beside the map, open by default, with a frost summary for the free date. The Open-Meteo "Now" and forecast moved to a collapsed item at the end. "Inspect the evidence" is collapsed.

## 12. Judging pass (14 Nov 2026)

- First screen (replaced on 14 Nov 2026, see §13): the question, a purpose line, the example result with the NASA cold-night number, and one action ("Try another free date", which moves the field-free date and the cover sowings together) plus "See the NASA image nearest this date". A cover sown after the last useful turn is described in words ("you would sow after the last useful canal turn"), never as a saving.
- "What NASA data does here": POWER gives the 45-year cold-night count for the chosen dates; HLS shows the real parcels on each 2024 date.
- The result card ends with "What this does not tell you".
- Map (removed on 14 Nov 2026, see §13): thin parcel boundaries over every background.
- Walkthrough check (automated, about 20 s): open → change the free date (15 → 31 days of canal water, 2 → 4 turns, 33 → 41 of 45) → open the NASA image nearest the date (1 Apr 2024) → export.


## 13. Cover suggestion, corrections and new sources (14 Nov 2026)

### Flow
Map-first: (1) choose an example field on a context map (EOX photo or street map; examples then drawn as approximate locations; boundaries restored on 15 Nov, see §16); (2) weather for the example area with Today / Next days (Open-Meteo, weather models, not NASA) and NASA history (POWER); (3) crops, dates and canal water; (4) goal; (5) suggestion; (6) saved plans and dated field notes. Evidence follows: the dated NASA HLS map and chart, EMIT fractional cover when values exist, the calendar check per option, the comparison of two free dates, and the full calendar with year-by-year cold nights.

### Suggestion engine (`src/engine/recommend.ts`)
- Candidates: cereal rye, oat, hairy vetch, hairy vetch + oat; baseline "leave it as now". Each variant is evaluated with the existing calendar engine (its own termination interval).
- Dimensions kept apart: purpose match (supports / partial / against / not assessed, with sourced reasons), dates and canal water (existing calendar states, available days, turns, binding constraints), past cold nights (POWER count with the station-check warning), plot conditions (user inputs; unknown is valid), productive use (service cover / possible harvested use / not supported / not assessed), next step.
- Rules: calendar failure excludes; best purpose match among the viable covers; ties are shown together with a fixed, sourced deciding factor; "needs data" or a partial match makes the suggestion provisional; "not sure" shows a grass and a legume and asks for the goal; productive use is always provisional and states that removal reduces the soil effects and that profitability is not calculated.
- Species statements: SARE *Managing Cover Crops Profitably*, re-read 14 Nov 2026 (cereal rye, oats, hairy vetch pages). Next-crop links used only where the page states them: vetch before transplanted early-summer crops such as tomato; vetch partly replacing nitrogen fertiliser for maize (no amount); waiting 3–4 weeks after rye and 2–3 weeks after oats before sowing small-seeded crops (onion).
- No amounts: nitrogen, biomass, yield, money. A 0 °C night is reported as a temperature reading, not as SARE's "killing frost".

### HLS evidence and exports (`src/engine/hlsSelect.ts`)
- One historical-period function shared by the screen and both exports: the plan interval is placed on the reference season by day and month with the same length (a plan crossing 31 December continues into the next calendar year of the season). Real acquisition dates are kept; plan interval, historical interval and the rule are exported.
- The selected scope (one example or the cluster) is applied before summaries and exports; each exported observation carries acquisition date, sensor, quality, clear and total pixels, NDVI median and scope. When one example is selected, cluster values for the same dates are exported separately, labelled "for comparison only".
- The season summary is derived from the values: medians for February–April, June–August and October–November; the highest and lowest are named, with seasons within 0.05 of either named together as about the same; when all three are within 0.05 the text says they are about the same through the year (a display rule), and all values below 0.2 are called low. No cause is inferred.

### Weather
- Open-Meteo units are validated per variable (°C, mm, km/h, %); °F, inch, m/s, mph and knots are converted explicitly and recorded; any other or missing unit, mismatched columns or a location more than 0.25° away rejects the response.
- Forecast facts report N of M days covered; "no day at or below 0 °C" and "no rain" are said only when every expected day has a value; sums over incomplete days are called partial.
- Live NASA POWER results are bound to their exact query dates; while a new request loads, no earlier series is returned, and a late answer to an older request is ignored. Coverage uses the dates actually returned (first date and internal gaps included). Tested with a React hook test (`src/weather/useLivePower.test.tsx`).
- NASA history follows the plan (free date + 30 days) by default; editing the dates switches to "Exploring another period" with a button to follow the plan again.
- Chart wording: the climate band's lines are daily medians across years, not one real year. Hourly forecast gaps break the temperature line and are marked "?" for rain, never drawn as zero.

### New sources
- EMIT fractional cover (`scripts/emit_frcov.py`): cluster-level medians of PV, NPV and BARE with median per-pixel uncertainty, for real EMIT dates only. Probed with authenticated LP DAAC reads of the six layers plus QC. Values (median of the 32 valid 60 m pixels in the cluster, QC 0): 8 Jan 2024 green 62 %, dry plant material 6 %, bare soil 27 %; 23 Feb 2024 68 %, 0 %, 23 %; 11 Nov 2024 74 %, 0 %, 26 %; 15 Sep 2026 24 %, 45 %, 33 %. Scene 20260915T162209 has only fill values over the area (its twin 20260915T162157 covers it; counted once). No scene between March and October 2024. Shown in the evidence as "What was on the ground on a few dates"; not used in the suggestion. The September 2026 dry-material share may include cloud-edge effects noted by the producer.
- HLS S30 red edge (`scripts/hls_ndre.py`): NDRE = (B8A − B05)/(B8A + B05) on Sentinel-2 dates only, same clean-pixel rule; Landsat dates are not computed or mixed. Exploratory. Probed: all 48 Sentinel-2 dates of the 2024 season read (0 read failures), 32 clear for the cluster; cluster NDRE medians 0.15–0.46. Scale 0.0001 and fill −9999 read from each file. Landsat dates not computed. Kept in `public/data/hls_ndre.json` and the source registry; not shown in the main flow and not used in the suggestion, because it adds no grower question beyond NDVI here and must not be read as a nitrogen measure.
- Status of every other researched source: `docs/DATA_SOURCES.md`.

### Publication boundary (superseded on 15 Nov 2026, see §16)
The contextual 212-outline layer and the four simplified example outlines were removed on 14 Nov as a precaution; they were restored on 15 Nov at source precision.

### AI-generated logo
The logo is marked "AI-generated logo" next to it in the header, inside `public/logo.svg` (the file embedded in the Markdown export), and in the export caption. NASA imagery and charts are not marked as synthetic.


## 14. Workspace redesign and rule corrections (14 Nov 2026)

### Layout
Three views share one state: **Plan** (editor beside the result), **Climate & NASA** (weather, NASA history, HLS map and trajectory, EMIT, full calendar) and **Saved plans**. The Plan editor starts with the field map; after a choice it collapses to the field name with "Change field". Editor groups: Field, Crops & dates, Canal water, Winter goal (with plot access); soil history and advanced assumptions open on demand. The result shows a plan summary, up to three candidates side by side, the deciding factor, one next check, the canal-water and NASA cold-night facts once, a shared calendar, other options, and "Compare another free date" (applying a date is a named action). On narrow screens a bottom bar switches between "Edit plan" and "View options".

### Corrected rules (`src/engine/recommend.ts`)
- Zero or negative calendar time: never suggested ("No time for a living cover"). Positive time is calendar information, not proof of establishment; no minimum is invented.
- Statuses: "Worth exploring" needs a fitting calendar, a goal match and no blocking check; otherwise "Conditional: check first". Blocking checks: plot access (someone else, or agreement pending), reported waterlogging or salinity (review first; no tolerance data), a calendar input still needed, and past cold nights that could not be read. Species cold notes (vetch: SARE 30–45 days before a killing frost; oat winterkill) are shown but do not block. Checks never change the dates.
- Next check priority: access, soil review, missing calendar input, unread climate, then the irrigation action.
- Termination interval: if the person changed the group's interval, the setting applies to the other variant of that group and is labelled "your setting"; otherwise each variant uses its species default with its source.
- Baseline: residue, volunteer plants or bare soil stay as they are; their soil effect is not assessed (no claim of "no effects").
- Regional evidence records: see `docs/DATA_SOURCES.md`; context only, no figures.
- Past weather and satellite evidence do not rank covers; the result says so.

### Inputs
- "I know it" for the last canal turn opens an empty date; until one is entered the turn stays unknown. A labelled example date can be chosen on purpose.
- Date fields explain an incomplete entry instead of silently ignoring it.

### Saved plans (`src/engine/planStore.ts`)
Version-2 envelope: scenario, chosen field, climate settings, evidence choices (image, follow-plan, history period) and the plan's own notes. Version-1 saves and global notes are migrated (field "not recorded"; notes "not linked to a plan") and the originals are left in place.

### Tests added
Zero-day rejection, unread climate, waterlogging review, plot access, termination provenance, fair baseline, regional evidence by next crop, last-turn entry (React test), complete save/restore and migration.


## 15. Production systems, experimental species and the source-to-decision record (15 Nov 2026)

### Real-window reachability
Measured in a real Chrome window on the author's machine: outer 1366 × 720, CSS viewport 1366 × 599, DPR 1. `html` and `body` overflow visible; the page scrolls as one document and the wheel reaches the footer. The 1036 × 692 window reported in the audit could not be reproduced there (the window did not resize), and the person's own tab was not reachable by the browser connector, so the cause of the vertical cut-off reported in that tab is **not established**. Emulated CSS viewports 1366 × 657, 1036 × 571, 1093 × 526 (125 %), 911 × 438 (150 %) and 390 × 760: no horizontal page scroll, wheel and End reach the footer, focusing the last control scrolls it into view. Wide content (calendar, option table) scrolls inside its own box.

### Active candidate
One active candidate id in the app state (validated against the current suggestion; if it disappears the app says so). `candidateScenario()` gives the variant and effective termination interval used by the calendar, the date comparison, an applied date change, the export (`activeCandidate`) and saved plans. Fixes the audited case (oat on the calendar, rye in the comparison).

### Saved plans
Stored plans keep the active candidate and an input state ("incomplete" when a date was being edited). "Update plan" (keeps notes, shows when the field changes) and "Save a copy" (new plan, no notes) are separate; an "Unsaved changes" state is shown. Stored entries are schema-checked on load; unreadable ones are kept aside, not dropped; new fields get defaults.

### Systems
- Annual rotation: unchanged engine.
- Orchard: no field-free date; window entered by the person; checks for water reaching the area (drip on the tree row does not water the interrow), tree age, tree row versus interrow, mowing for perennial covers, late-frost note around flowering (stages not modelled), evergreen citrus (no winter dormancy), bell bean citrus caution. Almond with vetch counts as a local study in this system (Domini et al.); other orchards do not.
- Beds: plants kept → only a stated free area (paths) is evaluated and drip on the beds does not water the paths; plants removed → annual rotation.

### Experimental species
Pea, faba bean, forage radish, buckwheat, strawberry clover. States: "Experimental candidate" when dates fit; "Not on these dates" or "Not for this system" otherwise. Sourced climate tests on NASA POWER for each candidate's own dates (thresholds and units above). Nutrient mechanisms kept separate: legume fixation; radish captures existing N; buckwheat may recycle P but does not create it. Same-family checks against the next crop.

### Source-to-decision record
Each candidate carries five dimensions with provenance: kind (your input, calculation from your dates, reanalysis, published guidance, regional study, research brief, app rule), source, scope, dates, quality, role and what is missing. They are exported with the active candidate. No forecast is used for plans beyond the forecast horizon; regional products are never labelled as plot measurements; no nitrogen release model was run and no amount is computed.

### Sources assessed but not added to the decision
IMERG (access confirmed, file not processed), ECOSTRESS and SMAP (catalog only), soil maps (not verified at plot scale), CC-NCALC and PCSE (not run). See `docs/DATA_SOURCES.md`.


## 16. Provincial parcel layer: reproducible integration (15 Nov 2026)

- Download: `scripts/fetch_parcelario.py` (public IDERN WFS, `geonode:PARCELARIO1`, TPA SUBRURAL or RURAL, bounding box −67.75, −39.15, −67.35, −38.90, EPSG:4326), with a provenance sidecar. Re-download on 15 Nov 2026 matched the analysed file exactly (2,341 parcels, identical geometry and attributes).
- Selection and sampling: `scripts/parcels.py` (SUBRURAL 2–15 ha, WorldCover tree share ≤ 0.25, four adjacent examples; 30 m inward buffer); HLS, EMIT and NDRE use pixels whose centre lies inside those buffers.
- Publication: `scripts/parcel_layers.py` writes the 212 surrounding parcels and the four examples with their boundaries as served (no simplification or rounding) plus the sampling polygons, with source attribution and terms. No owner or crop is attached.
- Maps: example parcels drawn with their boundaries; the dated NASA map adds the sampled area (dashed); a toggle shows the surrounding parcel boundaries. Attribution under each map.
- Not included in the repository: the original GeoJSON; see `docs/DATA_SOURCES.md` for what is confirmed and what is not.

## 17. Final interface integration (15 Nov 2026)

The approved interface (designed as a prototype in Framer with illustrative fixtures) was rebuilt in the repository's own React components and connected to the real data; no Framer code or iframe is used.

- **One journey.** Plan view: (1) *Locate & understand*: the real parcel map (`ParcelMap`), P1–P4 or all four, and a layer rail (Location, HLS, EMIT, POWER) whose status reads "Connected" only when that file loaded; (2) *Management conditions*: the existing editor as compact selects; (3) *Your possibilities*: all nine evaluated candidates in one catalogue select, up to three cards, one active candidate.
- **POWER panel.** The cold-night question is asked from the active candidate's sowing to the next crop (annual), or over the window the person entered (orchard, beds with plants kept), with the person's threshold and days. The same numbers appear in the cards, in "Why this option?" and in the export (`coldNightQuestion`). The station-check lag is shown next to it.
- **HLS panel.** Real acquisition dates for the selected scope, the 30 m chips without smoothing, clear pixels of the chosen example, the trajectory. Data come from `/api/observations` when an API is configured (`src/api/observations.ts`); an answer is used only if its scope and date equal the request, a late answer for an earlier selection is ignored, and any failure keeps the bundled file. Chip paths resolve against the asset base (the app's address unless `VITE_UMBRAL_ASSET_BASE` is set), never against the API host.
- **EMIT panel.** One entry per acquisition date; on 2026-09-15 two scenes exist, and the one with valid pixels is used (its twin covered the area with fill only). Medians of each fraction are taken separately and need not add to 100 %. Next to each median, "pixel unc." is the median of the per-pixel uncertainties the product publishes; it is not a confidence interval for the cluster value, and no aggregate uncertainty is computed. A parcel selection states that EMIT has no per-parcel value.
- **Provenance chips.** Each "Why this option?" row carries the kind of evidence with its real strength: NASA observation, NASA historical model, Published guidance (for example SARE, US guidance, not a trial), Regional study, Research summary · original not rechecked (statements taken from the research brief whose source page could not be reread), Your input or Assumption. The export keeps the same kinds.
- **Standing crops.** For orchards and kept beds the goal reads "Support the standing crop", benefit texts say "the standing <crop>" and state that competition for water and nitrogen is the main risk; the annual option table is not shown.
- **Management period** (`src/engine/period.ts`). Derived once from the system: annual, field free to soil ready; orchard or kept beds, the cover window entered (there is no field-free date). The same period sets the NASA history default ("Following your plan: …"; the annual default stays the first 31 days after the field is free), the HLS period, the cold-night question and the export. A period chosen in the history view is labelled as exploration, with a way back. The annual calendar detail of the Climate view is not shown for a standing crop.
- **Soil in every system.** Reported waterlogging or salinity is a blocking review for every candidate, annual or permanent; the reported conditions are carried in the candidate (`soil`), its water-and-soil dimension, the next check and the export. Dates are never changed and no tolerance threshold is applied. The family rule (successor crop) does not apply to a standing crop.
- **Goal match, viability and evidence are separate.** Only a date or system conflict excludes a candidate. A viable candidate outside the best goal match is "Dates fit; partial match for this goal" or "Dates fit; does not serve this goal", stays selectable to compare, and carries that limit on its card and in the export.
- **Canonical export** (`src/engine/planExport.ts`, schema `umbral.plan/2`). JSON and Markdown are built from the selected candidate and the system: plan (goal, crops, management period), selected candidate (calendar, ending, benefit, trade-off, checks, reported soil, five dimensions with provenance, nutrient process), the selected candidate's own annual calendar (annual only), the cold-night question shown on screen with its per-year rows, all candidates evaluated, the two-date comparison (annual only), HLS, weather, assumptions for this system, and raw inputs with the fields that do not apply. The three annual strategies appear only for annual plans, last, as "Reference comparators (not the selected plan)". Tests in `src/engine/planExport.test.ts` inspect the whole structure for the audited cases.
- **First screen.** The HLS season trajectory is folded into "Greenness through the 2024 season" (closed by default).
- **Checks (15 Nov 2026, after the audit fixes).** 162 Vitest tests; app and Worker type checks; build and publish check; production build in a browser: almond with salinity and waterlogging (vetch from Worth exploring to Conditional, the soil review as next check, dates unchanged, both conditions in JSON and Markdown), kept beds with salinity, oat with the weeds goal (153 days in every primary field; rye's 146 days only among the labelled comparators), the orchard window in Plan, history, JSON and Markdown, oat selectable as a partial soil-cover match while strawberry clover stays excluded; axe without violations on Plan (all sections open), the EMIT layer and the orchard Climate view at 1366×768; no horizontal scroll at 375 px. The zoom levels and the other sizes listed below were not re-measured after these fixes.
- **Earlier checks (before the audit fixes).** 156 Vitest tests; app and Worker type checks; production build and publish check; `npm audit` 0 vulnerabilities; production build in a browser with the API, without it and with the API configured but down; axe without violations on every layer, the orchard case, Climate & NASA and Saved plans; no horizontal scroll and footer reachable at 1366×768, 1036×692, 125 % and 150 % zoom, 768 and 375 px with every section expanded.

## 18. Grower-facing clarity pass (15 Nov 2026)

Fixes from an AI walkthrough with two hypothetical growers (annual irrigated vegetables; orchard). Not a test with real people; a short test with a grower is still needed. Calendar arithmetic, species thresholds, data files and irrigation rules are unchanged.

- **Water statement by the input that answers it** (`src/engine/planText.ts`, `waterFact`). Kept beds: "Drip on the beds: Yes/No/Not sure" and, separately, "Water reaching the paths: not confirmed" (or the free area is not stated). The drip answer is never shown as water for the cover. Orchard: irrigation water reaching the interrow or tree row. Annual: canal opportunities. JSON adds `waterReachingCoverArea` next to `dripOnBeds`.
- **All checks before sowing** (`beforeSowing`). The selected option's blocking checks plus shared ones, without duplicates (same kind and same text), in the engine's priority order. The first is "Next check"; the rest are listed at once under "Also before sowing (N)". "Why this option?", the JSON (`selectedCandidate.beforeSowing`, additive) and the Markdown use the same list.
- **Current result while editing** (`ResultSummary`). Option, status and number of checks, with "View result"; it says when a date is incomplete and uses a warning style when nothing fits or only an exploratory option is selected. Sticky below the topbar at 1024 px and wider, inside the editor column; the bottom bar carries it below 1024 px. Focused controls are kept clear of it with scroll padding.
- **Notifications** (`src/ui/notice.ts`). One live region. A notice belongs to the state it was issued for: it is cleared by the next change of plan, field or selected option, by changing view, or after 8 s. Only save and open notices link to Saved plans. In the page flow below 700 px. Unresolved checks are never notices; they stay in the result.
- **Dates being typed.** A year outside 2000–2100 is treated as still being typed. Browsers fill the year digit by digit (0002, 0020, 0202, 2027); before this guard, a year such as 0002 was accepted as a plan date and froze the page while the calendar was computed over two thousand years.
- **Study examples and example dates.** P1–P4 carry a visible "Study examples" caption. Prefilled dates show "Starts with example dates — replace them with yours" until one is changed. New plan names state scenario, year and evidence (for example "Maize → Onion · 2027 · evidence: example P2"); existing names are not changed. The saved-plan list shows the selected option.
- **System switch.** `cropsBySystem` (optional, saved with the plan) remembers the main crop of each production system, so annual → orchard → annual restores the annual crop. Plans saved before it existed simply have none.
- **Opening over unsaved work.** Opening a saved plan while the plan on screen has unsaved changes asks: save a copy then open, discard and open, or cancel. The copy must be stored before anything opens; on a storage failure nothing opens. The untouched example never asks.
- **Wording.** Standing crops are not called "the next crop" in the deciding factor. Beds whose plants are "Don't know" read "If the … plants stay (not confirmed)". "?" answers read "Not sure". The vetch + oat trade-off is the sourced limitation of its vetch, not a restatement of its benefit; when no limitation is sourced, the card says none was assessed. The general cold check (your threshold) and a species guidance reference are labelled separately. EMIT shows "median per-pixel uncertainty", explained as not the uncertainty or a confidence interval of the cluster value; QC 0 is described as the product's code for valid pixels. NDVI is described as ranging from −1 to +1, with the chart axis 0–0.9. The HLS heading names the 2024 season; the EMIT card names its real dates (2024 and September 2026). Markdown uses plain labels; JSON keys are unchanged.
- **Accessibility.** Image-date controls use unique ids in each view. A provenance chip that inherited the form-field style (class `input`) was renamed. Labelled `div`s got a role. A description reference that pointed at a missing element was removed.

## 19. Release pass (15 Nov 2026)

- **Visible text.** Counted in a clean browser at 1366×768 on first load: every rendered text node in the Plan view, excluding `<option>` lists, closed `<details>` content (their summaries counted), hidden and zero-size elements, script and style; a word is a whitespace-separated token with a letter or digit. Before this pass: Plan view 952 words, "Your possibilities" 460. After: 805 and 344 (map section 338 → 293; editor 111 → 125 with the result line and the example-date cue). The 250-word target for the decision surface is not met; the remaining text is the options' benefits and trade-offs, the checks before sowing and the evidence labels, which were kept. Changes: the goal reasoning moved into "How this suggestion is made"; the station caveat appears once, inside the cold-check card; the nitrogen process is collapsed by default; map and image-date notes say each thing once.
- **Mobile bar.** "View result" shows a short status (for example "No option fits", or the selected option and its number of checks) on at most two lines; the full status is its accessible name.
- **Contrast over imagery** (axe "incomplete", reviewed by hand). Map credits and the scale bar now sit on a solid background, credit links are underlined and show a focus ring. The "green" example badge used white text on #6fae55 (2.67:1); it now uses dark text (5.53:1), and white remains only on the darkest step (6.54:1). Remaining incomplete items are decorative icons hidden from assistive technology.
- **Focus on date fields.** Chromium moves focus into a date field's internal parts, where `:focus-visible` does not match; form fields now show a focus ring on `:focus` and `:focus-within`. All 66 tab stops of the expanded editor show a ring at 1366×768 and 375×812.
- **Publication guard.** It now matches forbidden file names by name (Windows paths included), scans files without an extension such as `.netrc`, and detects bearer tokens without an `Authorization:` prefix, JSON web tokens, Cloudflare and Earthdata credential variables and private keys (`src/engine/publishGuard.test.ts`).
