# Decisions

One line per decision, in the order they were taken. Dates are 2026-11-14 unless noted. Later entries supersede earlier ones where they conflict; the current behaviour is summarized at the top of [METHODS.md](METHODS.md).

## Stack and environment

- **App:** Vite 6 + React 18 + TypeScript 5.7, no component library. Own components and CSS tokens. Fonts self-hosted with `@fontsource` (Fraunces, IBM Plex Sans, IBM Plex Mono), so the app works offline.
- **Engine:** pure TypeScript in `src/engine/`, tested with Vitest. No runtime dependencies besides React.
- **Build base path:** relative (`base: "./"`), so `dist/` runs on any static host or sub-path.
- **Python route:** POWER and the station check use only the Python 3.14 standard library. HLS, WorldCover and the cadastral cluster use a separate Python 3.11 environment (`.venv`, created with `uv`), because rasterio/GDAL wheels for 3.14 are not assured. Python 3.11 was already installed, so it replaced the suggested 3.12.
- **HLS access:** CMR STAC search without login; windowed reads of the cloud-optimized GeoTIFFs over HTTPS with `earthaccess` (the netrc file was created by the author on her own machine). GDAL forwarded a bearer header to the signed redirect and failed, so reads go through the `earthaccess` fsspec session via rasterio's `opener`. `boundless` reads were removed because they reopen the file outside that session.
- **Hosting:** Vercel, connected to the private GitHub repository of the author's personal account (author's instruction, replaces the Netlify/Cloudflare suggestion). `vercel.json`, `.vercelignore` and a post-build guard (`scripts/check-publish.mjs`) keep raw data and credentials out of the deployment.

## Tools

- **Used:** frontend-design guidance before writing UI; Playwright for browser checks and screenshots; Vitest.
- **Skipped:** Figma frames. The MCP server was available, but I chose to protect build time; hierarchy was settled in code and checked in the browser at four widths.
- **Not used:** IMERG (see below), any component library.

## Product decisions

- Planning season: release and next crop default to 2027 (the next autumn). The canal closure default is 29 Apr placed on that season and always labelled "DPA closure in the 2024 season (E15)".
- Preparation before the next crop defaults to 14 d, labelled as a scenario assumption without a source and editable.
- Turns required after sowing default to 1, labelled as a scenario assumption without a local source. "Turns that fit" is a count only.
- Cover sowing defaults to the release date (spec v3 §3).
- A sowing date typed before the original release is kept and flagged as invalid input. The "release later" control moves sowing only when release passes it.
- The climate sentence counts X as event years with at least D days. "No event before the search end" years are reported as Y and stay in N. They are never turned into a number of days.
- D defaults to 30 d, labelled as an assumption taken from US guidance for hairy vetch (SARE, 30–45 d before a hard frost). It is a display reference, not a requirement.
- A year is "insufficient data" when any day before the first event (or before the search end) is missing or outside the data. This is strict on purpose; the bundled POWER series has no gaps.
- Frost band on the timeline: P10–P90 of days to the first event from the selected start, with "no event" years ranked after the search end (nearest-rank quantiles). The band never shows a single date.
- HLS display classes: clear ≥ 80 % clean pixels, partly masked ≥ 20 %, mostly masked below that. This is a presentation rule.
- Orchard screen for the study cluster: drop parcels with ESA WorldCover 2021 tree-cover share above 25 %, then check visually on HLS true colour.
- Typical plot size shown in "Plot context" comes from the cadastral layer (SUBRURAL median 6.1 ha, P25–P75 2.9–12.1 ha).
- The family table uses APG IV families (POWO, Kew). Onion and garlic are Amaryllidaceae.
- Sensitivity is a direct scan (±1 d up to 120 d) over the engine. Tests check it against analytic margins and an independent brute-force loop.

## Resolved conflicts with older documents

- Spec v3 §4.2 evaluates exposure "at Neuquén Aero". Now: exposure uses the POWER General Roca cell; Neuquén Aero is only the regional check.
- Spec v3 and redesign v2 use "Tmin below T" in places. Now: one rule, `Tmin ≤ T`, "at or below", everywhere.
- Spec v3 §4.2 summary (min, P20, median, P80, max) and GDD to 30 Jun. Now: one sentence form, a strip plot per year and a P10–P90 band; GDD runs to the same search end and is labelled with its base.
- Spec v3 lists direct-sown onion in August as a successor. Now: onion keeps its external-zone reference only (southern Buenos Aires, SAGyP 2023); no Roca date.
- Spec v3 §3 inputs for sowing method, machinery and soil moisture at sowing. Dropped: they do not change the calendar arithmetic and are outside the closed scope. Field operations are shown as a fixed count per strategy.
- Spec v3 §5bis "What to resolve" screen. Now: a single "Next step" per strategy, ordered by the same rule (access, then data that changes a calendar status, then plot-condition reviews).
- Spec v3 §7 composite plot "Roca-1". Now: "Illustrative scenario: Alto Valle composite plot".
- Spec v3 treats HLS as an extension. Now: HLS is in the main path (timeline lane and panel).
- Spec v3 vetch termination 21 d: kept as "scenario assumption without a source".
- Spec v3 "tight margin" threshold: still none by default.

## Data decisions

- **POWER point:** −39.03, −67.58 (irrigated area of General Roca). Response coordinates match; cell elevation 338.9 m. Effective period 1981-01-01 to 2025-12-31, 45 valid years.
- **Station check:** GSOD 87715099999 against POWER at the station coordinates (a different cell). Result: on the same calendar date POWER is also at or below T on 46 % of station days at or below 0 °C and 12 % at −4 °C (UTC versus local day, so not a pure detection rate); its first autumn event comes a median of 17.5, 24 and 39 d later (34 complete years). Shown next to every climate reading and exported; not corrected.
- **HLS study area:** first a provisional 8 × 8 pixel block chosen on imagery; replaced by a cluster of four SUBRURAL cadastral parcels (4.0–4.4 ha) after the cadastral layer became available. Parcels buffered 30 m inward.
- **Cadastral layer:** used for the analysis only. Published: derived statistics and a generalized outline (convex hull + 60 m, simplified, rounded to 0.001°). Not published: the raw layer, parcel geometries, CCA, PAR_ID, OBJECTID.
- **IMERG:** deferred until the core passes the acceptance checks. It needs the GES DISC EULA, which only the author can accept.

## Revision of 14 Nov 2026 (after the independent review)

- Climate question redefined: met / not met / not evaluable, with first-event timing kept as a separate descriptive output. A censored year with at least D observed days counts as met; a window shorter than D cannot.
- Water after closure "unknown" is a missing input, not "no".
- Turns from a reference date and frequency without a stated last turn are nominal and keep the result in "Needs data".
- Turn shortfalls have their own field and unit; margins are days only.
- POWER climate readings are labelled as regional reanalysis (calculated), not observations.
- The planning-season canal closure is an assumption; the 29 Apr 2024 DPA record is listed separately as observed.
- Station first-event comparison uses only years with no missing value before the event (34 years): medians 17.5 / 24 / 39 d.
- Main screen reordered around three questions: what remains (overview with three separate quantities), how the strategies differ (three aligned cards, current practice as a neutral baseline), and where the evidence is (calendar evidence lanes, climate year table, satellite section, drawer).
- Calendar: key dates as large labels; frost and satellite lanes behind an explicit "Show evidence lanes" toggle.
- Location map: Leaflet 1.9.4 with OpenStreetMap standard tiles (live, attributed, not cached). Google Maps satellite was considered; it needs an API key and billing that are not set up, so it is not used. The app works without the map.
- Satellite chart: lines break across gaps over 20 days (display rule).
- Explainer: deterministic and engine-based. A generative assistant was not added: no model API with a server-side key is set up for this deployment, and the static Vercel site has no server. Growers are never asked to sign in.
- Mobile: removed `overflow-x: hidden` from body; grid and flex children get `min-width: 0`; checked with element bounds at 375, 768, 1280 and 1440 px.

## UX pass for growers (14 Nov 2026)

- Logo: `umbral-logo-v2.png` (newest) redrawn as `public/logo.svg`; header mark and favicon are crops. The author confirmed the logo was generated with an AI image tool: disclosed in `docs/AI_DISCLOSURE.md` and credited in the footer and the Markdown export.
- App default is `demoScenario()` (see METHODS §8); `defaultScenario()` stays as the test baseline so the engine tests are unchanged.
- Map background: NASA GIBS has HLS true colour for 2024 but only to zoom 12 (30 m), too coarse to recognise fields, so it is an option ("NASA view on this date"). The default is EOX Sentinel-2 cloudless 2024 (about 10 m, CC BY-NC-SA 4.0, non-commercial use with attribution). OpenStreetMap is the fallback.
- Parcel shapes (reversed on 14 Nov 2026): earlier published as simplified geometry of the four study parcels. The publish check now also rejects TPA, ARA, UND_ARA and SAG fields.
- Per-field "Assumed" tags replaced by one notice; only the canal closure (DPA 2024) and the termination intervals with a source (SARE) keep a source tag.
- Text at least 13 px everywhere, including chart labels; monospace only in tables and numeric readouts; the greenness chart keeps its full size and scrolls inside its box on small screens.

## Product flow revision (14 Nov 2026)

- Three steps plus "Adjust assumptions" and "Inspect the evidence"; the left input rail became the assumptions panel (fields moved to the steps are not repeated there).
- Crop icons: local SVG components (`src/ui/CropIcon.tsx`) for maize, tomato, squash, onion, rye, oat, vetch; always next to the name, `aria-hidden`. No apple or pear option was added.
- Two-date comparison is the main chart; the dense calendar moved to the evidence section.
- Image selection no longer follows the scenario silently: it starts at the clear image nearest the plan's date when the data loads, and then changes only by the image-date control or by "Follow my plan's date" (off by default).
- Regional sources added as context only (SENASA/INTA 2026 news, INTA 2025 Alto Valle Este characterization, INTA repository items 8309 and 14470); their full PDFs were not read and they are not used for dates or validation.
- No producer tested this version; checks were technical (tests, browser walkthrough, widths, axe).

## Map-first weather consultation (14 Nov 2026)

- Meteomatics: no credentials configured on this machine or in the project, so it is not connected. Open-Meteo's free non-commercial API is used directly from the browser (CORS allowed, no key, no server needed on Vercel). If a commercial or Meteomatics route is wanted later, it needs Julia's account and a server-side function to keep the secret.
- Open-Meteo rate limits apply per IP; a busy shared host could hit them. The app caches for 30 minutes and degrades to a stale or unavailable state.
- Live NASA POWER is queried only for past dates after the bundled record; nothing is filled in when it returns no value.
- Page order: short intro → parcels map + weather side by side → plan steps → comparison → evidence.
- Nobody outside development has tried this version.

## UX pass 2 (14 Nov 2026)

- Default map was the dated NASA HLS image (changed on 14 Nov 2026: a context map for choosing, and a separate dated NASA map in the evidence).
- NASA's cold-night reading became the fourth number of the main result.
- Forecast (not NASA, not useful for a plan months ahead) moved to a collapsed item; NASA climate history took its place.
- Repetition removed: one result card, one options table, one date comparison; the evidence is collapsed.


## Suggestion and correction pass (14 Nov 2026)

- Direction: suggest a winter cover that works with the next crop and the grower's goal; no financial calculator, cost, saving, ROI or fertiliser-replacement quantity, under any label.
- No composite score. Separate dimensions, documented rules, ties shown with what decides them. A calendar failure always blocks an unqualified suggestion.
- Goal "productive use" stays qualitative and provisional: SARE mentions rye hay/bale silage and oat grazing (US); vetch is "only fair grazing"; the mixture is not assessed.
- Publication boundary restored: no parcel boundaries at any precision; approximate example locations at 0.001°, generalized outline, derived statistics. Areas per example rounded to whole hectares.
- HLS export bug fixed: the old export compared 2024 acquisition dates with the 2027 plan interval and returned nothing; it also exported cluster values while naming one example.
- Weather consultation moved next to the field map, with Today / Next days / NASA history; history follows the plan unless edited.
- Test runner updated from Vitest 3.2.7 to 5.1.0 (the release with the fixes for the tinypool and @vitest/mocker advisories), plus jsdom for one hook test. Development-only packages; the static site does not ship them. `npm audit` now reports 0 vulnerabilities.
- IMERG: GES DISC authorization missing on my account (HTTP 403); I did not accept terms. SMAP and ECOSTRESS: catalog checked only; not integrated in this version.
- QuickResult (example result before choosing a field) removed: the page no longer gives a conclusion before the inputs.
- Nobody outside development has tried this version.


## Workspace redesign (14 Nov 2026)

- The long report page became three views (Plan, Climate & NASA, Saved plans). Climate and satellite work was kept, moved out of the decision path, and is one action away from the result.
- For plans beyond the 16-day forecast, the weather block opens on NASA history.
- Removed: the duplicate options overview, the step numbering and the separate "About your field" card; the grower priority (keep date / soil cover / fewer operations) stays only in the full option table, because the winter goal now carries the explanation.
- CSS: rules for removed components were deleted (183 rules) instead of overridden; base controls were resized in place to 44 px targets.
- IMERG access was confirmed on a repeat test; integration was left out to keep this pass to the design and rule fixes.
- Nobody outside development has tried this version; the ten-second comprehension target is a design aim, not a test result.


## Systems and evidence pass (15 Nov 2026)

- Scope widened from annual fields to orchards and beds at Julia's request; the annual engine is reused only for annual rotations and beds whose plants are removed.
- Crop selection became one grouped native select per crop (with "Other crop…"), replacing button clouds; editor groups collapse to a one-line summary.
- Experimental species are listed apart and never promoted to "Worth exploring".
- NASA POWER is used computationally only with a sourced threshold; no species threshold was invented to make NASA change a winner.
- The default decision surface measured about 360 words after this pass (target 200–250); further cuts would remove required states, so the gap is reported rather than hidden.
- Native select popups cannot be captured in screenshots; the closed control and the "Other crop" state are shown instead.


## Parcel layer restriction revised (15 Nov 2026)

- Julia confirmed that the provincial parcel layer is a public service announced for free and open GIS use. The 14 Nov precaution (approximate locations, no boundaries) was reviewed and withdrawn: boundaries are shown and published as served, without simplification or rounding, with attribution and no owner or crop.
- Showing and using the layer is separated from redistributing the original file. The original GeoJSON stays out of the repository and is reproduced with `scripts/fetch_parcelario.py` until its redistribution terms are confirmed; the MIT code licence is not applied to these data.
- The build guard now blocks only credentials, the original file and its attribute table, and requires attribution in the derived parcel files.
- No Git history was rewritten.

## 15 Nov 2026: final interface integration

- The Framer prototype is the approved layout, not code: I rebuilt it in the app's components and kept the engine, types and tests. Its fixtures ("33 of 45" hard-coded, schematic map, "Not connected" layers) were replaced by computed values and real load states.
- One active candidate drives everything below the cards. A candidate that does not fit (dates, goal or system) can be inspected from the catalogue but not selected, so the calendar never shows a cover the rules ruled out.
- Reload starts a fresh plan; saved plans reopen from "Saved plans" with their selected candidate.
- The cold-night question follows the active candidate's sowing, so changing the candidate can change the count; the orchard and bed window is the person's own input.
- Removed: `Result.tsx` (replaced by `Possibilities.tsx`) and `Explainer.tsx` (unused since the redesign).
- The live address keeps the earlier deployment until I deploy this version.

## 15 Nov 2026: corrections after the independent audit of the integration

- The export is rebuilt from the selected candidate and the system instead of appending the candidate to the older annual export. The annual A/B/C strategies remain only as labelled reference comparators for annual plans.
- One management period per system feeds history, HLS, the cold-night question and exports. A standing crop has no field-free date, and nothing says it has one.
- A weaker documented goal match is no longer treated as an exclusion; only date and system conflicts exclude.
- Reported soil problems make every candidate conditional in every system; no tolerance threshold was added because none is sourced.
- Evidence labels no longer upgrade a research summary or a guide to a "published study". The EMIT per-pixel uncertainty is labelled as such and no aggregate uncertainty was invented.
- Not re-measured after these fixes: the 250-word target and the 125 %/150 % zoom cases.

## 15 Nov 2026: grower-facing clarity pass

- Path water for kept beds is shown as not confirmed instead of adding a new irrigation input. A question "Does water reach the paths?" can be added later, as for orchards.
- The current result follows the person while editing in a compact line; the full result is not made sticky.
- A typed year outside 2000–2100 is treated as incomplete. This is an input boundary, not a change to calendar arithmetic.
- Comparing saved plans against each other is out of scope for this pass.

## 15 Nov 2026: release pass

- Undated high-resolution basemaps (for example those used by geojson.io) were considered as a visual alternative to the NASA HLS image. Deferred after the delivery: a mosaic has no acquisition date for each pixel, so it cannot show "the same moment" as a dated HLS observation; if added later it must be labelled as undated context, not NASA evidence, and follow the provider's terms.
- Real browser zoom (125 %, 150 %) could not be applied in the test browser; equivalent CSS viewports were checked instead and are reported as approximations.
- No grower has tested the app yet. AI walkthroughs and automated accessibility checks do not replace that test.
