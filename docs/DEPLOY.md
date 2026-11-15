# Deploy

Umbral has two deployable parts: the static frontend (Vercel) and an optional read-only API (Cloudflare Worker, `worker/`). The frontend works without the API.

## State (15 Nov 2026)

- **Frontend:** https://umbral-altovalle.vercel.app. Vercel builds every push to the production branch of https://github.com/JuliaGastellu/umbral. The production environment has `VITE_UMBRAL_API=https://umbral-api.juliacgastellu.workers.dev` (a public URL, not a secret); a variable takes effect only in a new build. The check of each published version is recorded in [RELEASE.md](RELEASE.md).
- **API:** Worker `umbral-api` at https://umbral-api.juliacgastellu.workers.dev, published on 15 Nov 2026 (Cloudflare version `ee78fc44-c64d-4242-8902-3d70e0107ff5`, compatibility date 2026-11-01), built from `worker/src/index.ts` in this repository with the processed files in `public/data/`. No R2, D1, KV, paid service or Earthdata credential is used.

## What gets published

- Vercel builds from the repository, so git-ignored files never reach it: `data/raw/` (the original provincial parcel GeoJSON and its download record, raw POWER and GSOD responses), `.venv/`, `.netrc`, `.dodsrc`, `.env` and `.env.*` (except the credential-free `.env.example`), `.wrangler/`. `.vercelignore` repeats these for CLI uploads.
- `npm run build` ends with `scripts/check-publish.mjs`. It fails the build if `dist/` contains a `.netrc`, `.dodsrc` or `.env*` file, a credential pattern (netrc entry, bearer token, JSON web token, access token, Cloudflare or Earthdata credential variable, private key), the original parcel file or its download record, or the original parcel attributes (PAR_ID, CCA, UND_ARA, SAG); and if the derived parcel files lack their attribution. Tested in `src/engine/publishGuard.test.ts`. It checks documented rules; it is not a general secret scanner.
- Published data: `public/data/` only (processed POWER series and validation report, station check, HLS observations and 30 m chips, exploratory red edge, EMIT summaries, parcel-size statistics, study outline, parcel boundaries derived from the public provincial layer with attribution, source registry, provenance with checksums).

## Frontend (Vercel)

1. Project imported from the GitHub repository, preset **Vite**. `vercel.json` sets install `npm ci`, build `npm run build`, output `dist`.
2. Environment variables (Production), both public and optional: `VITE_UMBRAL_API` (the Worker's base URL) and `VITE_UMBRAL_ASSET_BASE` (only if image chips are served elsewhere; by default they load from the site itself).
3. Deployment Protection covers preview URLs only; production is public.
4. Data files keep fixed names: each request carries `?v=` with a hash of `public/data/*.json` (set in `vite.config.ts`), and `vercel.json` asks browsers to revalidate `/data/` (`max-age=0, must-revalidate`), so a release never runs on files cached from an earlier one.

## API (Cloudflare Worker)

Routes, limits, local use and boundaries: [worker/README.md](../worker/README.md).

```bash
cd worker
npx wrangler deploy        # uses wrangler.toml; needs the owner's own `wrangler login`
```

- CORS allows exactly `https://umbral-altovalle.vercel.app`, `http://localhost:5199` and `http://localhost:5173` (`ALLOWED_ORIGINS` in `wrangler.toml`). Preview domains and `127.0.0.1` are not allowed; add a specific origin only when needed, never `*`. CORS is not authentication.
- Responses carry `Cache-Control: public` (health 60 s, data routes 1 h, history 1 day, weather 10 min, or 1 min when the forecast is a stale snapshot). Redeploy the Worker after changing `worker/src/`, the engine helpers it imports or `public/data/`, so the API and the bundled fallback serve the same data.
- No secrets are needed. If an authenticated upstream is ever added, it goes in `wrangler secret put`, never in `[vars]` or a `VITE_` variable.

## Check after a deploy

1. Open the production domain in a private window, signed out: no login screen.
2. The map shows parcel boundaries, P1–P4 and four layers marked "Connected"; HLS chips load from the site's own address.
3. With the API configured, the HLS panel says "via Umbral API" and the network shows `GET …/api/observations?scope=…&product=hls&date=…` for the example and date on screen; "Sources and methods" says "Loaded from: Umbral API". Blocking the API in the test browser only must switch both to the bundled snapshot without errors.
4. The default plan shows hairy vetch and hairy vetch + oat; the POWER card reads "33 of 45 years".
5. Turning the network off on a loaded page keeps the calculations and bundled data; map tiles, the forecast and recent POWER days stop. There is no offline installation.
