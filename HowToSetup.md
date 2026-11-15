# How to set up

## Requirements
| Need | Version used in development | For |
|---|---|---|
| Node.js | 22.x (npm 10+) | build, dev server, tests |
| A modern browser | Chrome / Edge / Safari / Firefox | running the app |
| Chromium via Playwright | 1.63 (`npx playwright install chromium`) | only for `npm run e2e` |
| Python 3.10+ with `lxml`, plus `ffmpeg` and `pdftotext` (poppler) | optional | only for ingesting a new unit from decks |

No database, no account system and no server are required. The app is a static site.

## Install and run
```bash
npm ci
```
```bash
npm run dev
```
Open the printed URL (default http://localhost:5173).

## Production build
```bash
npm run build
```
```bash
npm run preview
```
Preview runs on http://localhost:4173. The build output is `dist/` (static files).

## Environment variables
None are required. Copy `.env.example` to `.env` only if you want an optional feature:

| Variable | Default | Effect |
|---|---|---|
| `VITE_TALK_INCLUDE_DRAFTS` | `false` | Include Talk turns that are not approved yet, labelled "Draft" (review builds) |
| `VITE_SPEECH_LAB` | `false` | Enable the speech test page at `#/lab/speech` in a production build |
| `VITE_TALK_AGE_GATE` | `false` | Show a consent step before the microphone is used |
| `VITE_LLM_PROXY_URL` | empty | URL of the optional LLM proxy (`server/`); empty = fully scripted partner |
| `CONTENT_DIR` | `content` | Folder served as `/content` (build-time) |

Never put secrets in `VITE_*` variables: they are compiled into the public bundle. The only secret in this project
is the optional proxy's API key, which lives in the proxy's own environment (`server/README.md`).

## Docker (one command)
```bash
docker compose up -d --build
```
Open http://localhost:8080. Requires Docker with the Compose plugin. Nothing needs to be configured.

## Tests
```bash
npm test
```
```bash
npx playwright install chromium
```
```bash
npm run e2e
```
In a package without the Unit 1 book content, `npm test` runs the engine and sample-unit suites and skips the
book-specific ones automatically; `npm run e2e` targets Unit 1 and is for the full development repository.

## Troubleshooting
| Symptom | Cause / fix |
|---|---|
| Blank page when opening `dist/index.html` from disk | The app must be served over http(s); use `npm run preview` or any static host |
| No narration on first screen | Browsers block audio until the first tap or key press — by design |
| Microphone button does nothing | The page must be on `https://` (or `localhost`); otherwise use Type mode |
| "Speaking is not available on this browser" | The browser has no speech recognition (e.g. Firefox). Type mode completes the level |
| Partner has no voice | The device has no speech-synthesis voice installed; captions still show |
| Old version after deploying | The service worker updates on the next visit; `sw.js` and `index.html` must not be cached by the host |
| `npm ci` fails on Node < 20 | Use Node 22 |
| Talk node missing on the map | Every Talk turn of that unit is still a draft; approve turns or build with `VITE_TALK_INCLUDE_DRAFTS=true` |
