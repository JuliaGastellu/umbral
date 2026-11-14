# Methods

Umbral answers one question: *between the release of this plot and the next crop, which strategies fit, and what climate exposure did those same dates have in past years?* It compares calendars and shows historical weather frequencies. It does not decide, and it does not predict establishment, growth, yield or income.

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

Deferred. It would only add satellite precipitation accumulated over the selected window, per year, next to POWER's PRECTOTCORR. It needs the GES DISC EULA, which only the author can accept, and it comes after the core passes the acceptance checks. If it is not added, this section records why.

## 6. Scenario explainer

"Ask about this scenario" offers three questions: what limits this option, what changes if sowing is delayed, and what information is missing. Answers are rule-based and computed with the same engine; no AI model is used and nothing is labelled as a model response. "What changes if sowing is delayed?" runs the engine for +7 and +14 days, shows the three quantities and the calendar check for each, and lets the user apply one. It never states species suitability, yields, forecasts or water sufficiency.

## 7. Revision of 14 Nov 2026 (independent review)

Fixed with regression tests in `src/engine/review.test.ts`: unknown water after closure no longer read as "no"; nominal turns separated from confirmed turns; turn shortfalls reported in turns, never days; the D-day climate question classified as met / not met / not evaluable; regional check carried in every climate output and in exports; planning-season closure marked as an assumption with the 2024 record kept separately; first-event station comparison restricted to complete years; mobile overflow fixed at the source (no hidden body overflow).

## 8. Grower-facing presentation (UX pass, 14 Nov 2026)

- Plain words in the main view; technical terms (NDVI, median, reanalysis, Fmask, sensor codes) stay in "How this was built" sections and in Sources and methods.
- Example opened by default (after computing): squash then tomato, plot free 10 Apr, last canal turn 25 Apr every 10 days, cold night at 0 °C, D = 30. It shows 146 days the cover can grow, 15 days until the last irrigation, 2 canal turns, and 33 of 45 years with at least 30 days before the first cold night. With the plot free on 25 Mar: 162 days, 31 days, 4 turns, 41 of 45. At −2 °C the years only split from mid-April, so 0 °C is the default. The engine tests keep their own baseline scenario.
- Map: four study parcels drawn from simplified shapes and coloured by greenness on the selected date in five display steps (below 0.2 "little or no green cover", 0.2–0.35, 0.35–0.5, 0.5–0.65, 0.65 and above "very green"); a parcel with fewer than 20 % visible pixels is shown as "hidden by clouds". Background: EOX Sentinel-2 cloudless 2024 (a mosaic; it does not change with the date), optional NASA GIBS HLS true colour for the selected date, OpenStreetMap as fallback. If every background fails, the parcels and colours still show.
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

- First screen: the question, a purpose line, the example result with the NASA cold-night number, and one action ("Try another free date", which moves the field-free date and the cover sowings together) plus "See the NASA image nearest this date". A cover sown after the last useful turn is described in words ("you would sow after the last useful canal turn"), never as a saving.
- "What NASA data does here": POWER gives the 45-year cold-night count for the chosen dates; HLS shows the real parcels on each 2024 date.
- The result card ends with "What this does not tell you".
- Map: thin parcel boundaries (land registry, no attributes) over every background, toggle on by default; the four example parcels keep a thicker outline and labels.
- Walkthrough check (automated, about 20 s): open → change the free date (15 → 31 days of canal water, 2 → 4 turns, 33 → 41 of 45) → open the NASA image nearest the date (1 Apr 2024) → export.
