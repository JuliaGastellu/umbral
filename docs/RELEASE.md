# Release check

## 15 Nov 2026, 14:45 (UTC−3) — incident on b2887b1: blank page in a browser that had visited the previous release

- **Seen:** https://umbral-altovalle.vercel.app showed a blank page in a browser that had opened the earlier version. Console: `TypeError: Cannot use 'in' operator to search for '_leaflet_id' in undefined` (map setup), which unmounted the whole app.
- **Cause:** the data files in `data/` keep fixed names and were served with `Cache-Control: public, max-age=3600`. That browser reused its cached copy of the previous `study_parcels.json` (`label`, `rings`, no `geometry`), the map received no boundary and threw. The release checks used clean browsers, so they did not see it. Reproduced on production by serving the previous file to the unversioned URL.
- **Fix (next commit):** data requests carry a content version (`?v=` plus a hash of `public/data/*.json`, computed at build time), so a new release never reuses an older cached file; `vercel.json` now asks browsers to revalidate data files (`max-age=0, must-revalidate`); the parcel file's shape is checked before the map uses it; the map and satellite sections are wrapped so a failure shows a message while the rest of the page keeps working. Tests in `src/ui/staleData.test.tsx`. Verified locally on the production build with the stale file and with the previous format forced on the new URL.
- **Until the fix is deployed:** a hard reload (Ctrl+Shift+R) or one hour without visiting clears it.

## 15 Nov 2026, 14:29 (UTC−3) — commit b2887b1

**Result: the public site and the repository correspond to the same product, and the checked journeys pass.**

### What is published

- **Repository:** https://github.com/JuliaGastellu/umbral (public), branch `JuliaGastellu` at `b2887b1b68d52f729d716db2411f8e6c3c891748`.
- **Frontend:** https://umbral-altovalle.vercel.app. GitHub records a successful Vercel deployment for `b2887b1`. Building that commit locally with the production value of `VITE_UMBRAL_API` produces exactly the asset files the site serves (`assets/index-CfDLEei3.js`, `assets/index-4hSWdl-h.css`); because the API address is compiled into the bundle, this links the served build to that commit and to the API setting. I had no access to the Vercel dashboard itself.
- **API:** https://umbral-api.juliacgastellu.workers.dev, Cloudflare version `ee78fc44-c64d-4242-8902-3d70e0107ff5`, data version 2026-11-15. Its 8 data routes (health, sources, HLS observations by date, scope and missing date, EMIT cluster, two history queries) return the same content as the Worker code in this commit, apart from time fields; the only later change to its inputs is an unused date helper, so no redeploy is needed. `/api/weather` was not compared because it is live.

### Checks on the public site (clean browser, no account, no saved plans)

- Loads without login (HTTP 200, ready in about 1.6 s); reload works; no console errors and no failed requests apart from one Open-Meteo request cancelled when the view re-rendered (the forecast then loaded).
- Map with parcel boundaries and the four layers "Connected".
- **API in use:** `GET /api/sources` and `GET /api/observations?scope=p2&product=hls&date=2024-04-06` answered 200 with CORS for the production origin only; the response's scope, date and NDVI (0.61) match the screen. Chips load from the site's own host. A quick switch P1 → P3 ends on P3 (no earlier answer applied). "Sources and methods": "Loaded from: Umbral API". All requests came from a fresh browser context.
- **Fallback:** with the API blocked in the test browser only, the HLS panel and "Sources and methods" switch to the bundled snapshot, chips still load, no errors.
- **Annual journey (desktop):** Maize → Onion, P2, goal "Hold back weeds", oat selected; saved, reloaded, reopened from Saved plans with oat; JSON (`umbral.plan/2`) and Markdown agree with the screen (153 days, cold-night question from 10 Apr: 33 of 45 years; reference strategies labelled as not the plan).
- **Permanent journey (desktop and 375 px):** established almond, no water to the interrow, waterlogging and salinity: three checks before sowing shown at once; export uses the 1 Apr–15 Sep cover window with no annual sections; NASA history follows the cover window.
- **Climate:** a 2027 plan opens on NASA history ("from the date the field is free, 10 Apr 2027, for 31 days"); "Today" and "Next days" show the live Open-Meteo forecast for the coming days with its retrieval time.
- **Phone (375×812):** no horizontal scroll; "Logo: AI-generated" visible; the bottom bar shows "View result" with a short status ("No option fits" when nothing fits); the result title is not covered; saving notice in the page flow; footer reachable in all three views.
- **Published files:** the publication guard passes on the files the site serves; `.env`, `.netrc`, `.dodsrc`, the original parcel file and the Worker configuration return 404; derived parcel files carry their attribution.

### Limitations that remain

- No grower or agronomist has tested the app; the checks above are automated and AI-driven.
- The visible decision text is about 344 words, above the 250-word goal.
- Real browser zoom (125 %, 150 %) was approximated with equivalent viewports, not applied.
- Map tiles, the forecast and recent POWER days depend on external services at the time of use.
