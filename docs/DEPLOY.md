# Deploy on Vercel

Umbral is a static Vite build (`dist/`). Vercel builds it from the private GitHub repository of my personal account. The repository stays private; the production site is public.

## What gets published

- Built from the repository, so anything git-ignored never reaches Vercel: `data/raw/` (the cadastral layer, raw POWER and GSOD responses, HLS overview chips), `.venv/`, `.netrc`, `.dodsrc`, `.env*`.
- `.vercelignore` repeats those exclusions for CLI uploads.
- `npm run build` ends with `scripts/check-publish.mjs`, which fails the build if `dist/` contains the cadastral layer, cadastral identifiers (CCA, PAR_ID, OBJECTID), full-precision parcel geometry, netrc entries or tokens.
- Published data: `public/data/` only (processed POWER series, station-check summary, HLS observations and chips, parcel-size statistics, generalized study-area outline, provenance).

## One-time setup (done by me)

1. Push the repository to GitHub (private, personal account).
2. Sign in to <https://vercel.com> with GitHub (Hobby plan).
3. **Add New → Project → Import** the `umbral` repository. If it is not listed, use "Adjust GitHub App Permissions" and grant the Vercel app access to this repository only.
4. Framework preset: **Vite**. `vercel.json` already sets install `npm ci`, build `npm run build`, output `dist`. No environment variables are needed.
5. **Deploy.**
6. **Settings → Deployment Protection:** keep "Vercel Authentication" on *Standard Protection* (it protects preview URLs only) or turn it off. Do not choose a mode that protects production.

## Check the public link

1. Copy the **production domain** (Project → Domains, e.g. `umbral-<name>.vercel.app`), not a deployment-specific URL. Deployment-specific URLs can ask for a Vercel login under Standard Protection.
2. Open it in a private/incognito window, signed out of Vercel and GitHub.
3. Expected: the app loads without a login screen, the timeline shows, the climate sentence reads "… of 45 years …", and the HLS panel shows image chips.
4. Offline check: open the page, then turn the network off in DevTools and reload from cache, or run `npm run preview` locally with the network disabled.

## Later deploys

Every push to `main` triggers a production deploy; pushes to other branches create protected preview deploys.

## At submission

The repository can stay private (Vercel does not need it public). If I make it public for the judges, nothing changes for the site.
