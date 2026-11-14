# Deployment

The app is a static site (`dist/`). It needs **https** (service worker and microphone) and nothing else.
A public demo of the sample-unit build is live on Vercel: https://learnerscare-grammar-dguh.vercel.app/ (see "Live demo" at the end).

## Approach 1 — static hosting (recommended)
Works on any static host (Netlify, Vercel, Cloudflare Pages, GitHub Pages, S3 + CloudFront, any web server).
```bash
npm ci
```
```bash
npm run build
```
Upload the contents of `dist/`. Host settings:
- Build command `npm run build`, publish directory `dist`, Node 22.
- Routing uses the URL hash, so **no rewrite rules** are needed; the app also works from a sub-path (`base: './'`).
- Do not cache `sw.js`, `index.html`, `manifest.webmanifest` (`Cache-Control: no-cache`). `assets/*` can be immutable.
- Serve `/content/**/*.mp3` with byte-range support (all common hosts do).
- Recommended headers: see `deploy/nginx.conf` (CSP, `Permissions-Policy: microphone=(self)`, `X-Frame-Options`).

## Approach 2 — Docker / VPS (nginx)
```bash
docker build -t learnerscare-grammar .
```
```bash
docker run -d -p 8080:80 --name grammar learnerscare-grammar
```
Put a TLS-terminating reverse proxy (Caddy, Traefik, nginx + certbot) in front. `deploy/nginx.conf` already sets
caching and security headers. **The image was not built during development (no Docker available there); build and
smoke-test it on your host.**

Without Docker on a VPS: run the build, copy `dist/` to the web root and use `deploy/nginx.conf` as the server block.

## Optional: LLM proxy
Separate small Node service, off by default. See `server/README.md`. Deploy it on any Node host, set its required
environment variables, then rebuild the app with `VITE_LLM_PROXY_URL` and add that origin to `connect-src` in the CSP.

## Updating
Deploy a new `dist/`. The service worker (`registerType: autoUpdate`) picks up the new version on the next visit and
replaces the precache; unit content is cached separately in `unit-content` and refreshed when files change name or
the learner clears storage. Learner progress lives in the browser (IndexedDB) and is not touched by a deploy.

## Live demo
**https://learnerscare-grammar-dguh.vercel.app/** — Vercel, deployed from the `main` branch of the GitHub repository; every push redeploys automatically.
Verified on 2026-11-14 in a real browser at phone width: map loads, service worker registers, an explanation node
plays to the end, an exercise accepts a correct answer, no failed requests, no page errors, no horizontal overflow.
It shows the original sample unit only (no textbook content). Talk does not appear yet because the sample dialogue
is still awaiting the owner's approval. No environment variables or secrets are set on the host.

Vercel settings used: framework preset Vite, build command `npm run build`, output directory `dist`, Node 22.
