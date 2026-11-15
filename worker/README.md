# Umbral API (optional Cloudflare Worker)

A small read-only API that serves Umbral's already processed, approved data with provenance. The web app does not depend on it: when `VITE_UMBRAL_API` is unset, or the API fails or times out (3 s), the app uses its bundled files and says so ("Bundled snapshot" in Sources and methods, "bundled snapshot" next to the HLS layer). The app uses `/api/sources` and `/api/observations` (HLS); it accepts an observation only for the exact scope and date it asked for, and ignores a late answer for an earlier selection. Chip paths in the answer are resolved against the app's asset base, not against the API host.

Published on 15 Nov 2026 as `umbral-api`: https://umbral-api.juliacgastellu.workers.dev (health: `/api/health`; Cloudflare version `ee78fc44-c64d-4242-8902-3d70e0107ff5`, compatibility date 2026-11-01). It was built from this folder and the processed files in `public/data/`. No secrets, storage services or Earthdata credentials are used. The frontend calls only `/api/sources` and `/api/observations`; the other routes are public but not used by the app.

## Routes (all GET; one envelope `umbral.api/1`)

Every success carries: `schema, dataVersion, source, product, version, observed, issued, processed, scope, resolution, quality, status, role, data`. `status` is one of `processed snapshot`, `live`, `cached`, `stale snapshot`, `no data`. Errors: `{schema, error}` with 400/404/405/503.

| Route | Parameters | What it returns | Implemented |
|---|---|---|---|
| `/api/health` | none | data versions and route list | yes |
| `/api/sources` | none | the source registry (integrated / probed / catalog-only / not obtained) | yes |
| `/api/observations` | `scope` = cluster, p1–p4; `product` = hls, emit; optional `date` | HLS: available real dates, or one date with scoped NDVI, quality, pixel counts and chip paths; an unavailable date returns `no data`, never a substitute. EMIT: cluster-only summaries (a parcel scope is a 400) | yes |
| `/api/history` | `start`, `end` (≤ 366 days), `t` (−15…5 °C), `d` (1…120 days) | NASA POWER per-year first night ≤ t, years meeting d, rain totals (missing stays null), station-check note; computed with the app's own climate engine | yes |
| `/api/weather` | none (fixed General Roca point; no arbitrary coordinates) | Open-Meteo forecast (not NASA), 4 s timeout, 30-minute in-isolate cache, last valid response labelled `stale snapshot` with its retrieval time, 503 if none | yes |

Deferred: imagery from R2, refreshing data from Earthdata, any authenticated upstream, plan storage, IMERG/SMAP/ECOSTRESS routes. No arbitrary URL proxy, raster API or admin route exists.

## Examples (local, no credentials)

```
GET /api/observations?scope=p1&product=hls&date=2024-04-16
→ 200 {"status":"processed snapshot","observed":"2024-04-16","data":[{"acquisitionDate":"2024-04-16","sensor":"S30","quality":"clear","ndviMedian":0.722,"scope":"p1",...}]}
GET /api/observations?scope=p2&product=hls&date=2024-04-17   → 200 {"status":"no data","data":[]}
GET /api/observations?scope=p1&product=emit                  → 400 "EMIT is processed as a cluster summary only…"
GET /api/history?start=2027-04-10&end=2027-10-15&t=0&d=30    → 200 {"data":{"years":45,"met":33,...}}
GET /api/weather                                             → 200 {"source":"Open-Meteo forecast (CC BY 4.0); not NASA","status":"live",...}
```

## Run locally

- Without Cloudflare tooling: `npx vite-node worker/dev-server.ts` (from the repository root), then `http://127.0.0.1:8787/api/health`. Allowed browser origins come from `ALLOWED_ORIGINS` (comma-separated; default: production, localhost:5199 and :5173), e.g. `ALLOWED_ORIGINS=http://localhost:4173 npx vite-node worker/dev-server.ts` for `npm run preview`.
- With the Workers runtime: `cd worker && npx wrangler dev` (installs Wrangler; no login needed for local dev).
- Point the app at it: `VITE_UMBRAL_API=http://127.0.0.1:8787 npx vite --port 5173` (5173 and 5199 are in the CORS allow-list).
- Tests: `npm run test` runs `worker/test/worker.test.ts` and the frontend fallback test with the rest.

## Deploy or redeploy

1. Re-check the Workers limits page (checked 15 Nov 2026: Free plan 100,000 requests/day, 10 ms CPU per HTTP request, 128 MB memory, 50 subrequests, 64 MiB uncompressed script).
2. `cd worker && npx wrangler login` (the account owner, in a browser; the token stays in the owner's credential store, never in this repository) then `npx wrangler deploy`.
3. `ALLOWED_ORIGINS` in `wrangler.toml` allows exactly the production site and `http://localhost:5199`, `http://localhost:5173`. Add a specific origin only when needed; never `*`. CORS is not authentication.
4. `VITE_UMBRAL_API` in the hosting settings must be the public Worker URL; the frontend reads it at build time, so a new frontend build is needed after changing it. Check that Sources and methods says "Loaded from: Umbral API".
5. Redeploy the Worker whenever `worker/src/`, the engine helpers it imports (`src/engine/climate.ts`, `exposure.ts`, `dates.ts`, `src/weather/model.ts`) or the files in `public/data/` change, so the API and the bundled fallback serve the same data.

## Measured (local Node, not Cloudflare CPU)

Handler time measured on 15 Nov 2026 with the local server: health 13.4 ms on the very first request (module and JSON initialisation), then 0.8–2.4 ms for health, sources, observations, history (366 days, 2.4 ms warm; 6.3 ms on its first call) and cached weather. A fresh forecast took about 1.07 s of network wait (not CPU). Payloads: health 543 B, sources 6.8 kB, HLS dates 5.7 kB, one HLS date 0.7 kB, EMIT 2.9 kB, history 3.7 kB, weather 3.2 kB. The bundled POWER series (about 350 kB JSON) is parsed once per isolate at start-up. These are Node timings; confirm CPU in the Cloudflare dashboard before relying on the 10 ms limit.

## Boundaries

Serves only files already in `public/data`. Parcel boundaries come from the public provincial layer with attribution (no owners or crops); the original layer file is not served. HLS values are for the four processed examples with real acquisition dates; EMIT is cluster-level; POWER is a regional reanalysis, not a forecast; the forecast is Open-Meteo, not NASA. No tokens are read, stored or shipped; an Earthdata token would be a Worker secret (`wrangler secret put`), never a `VITE_` variable.
