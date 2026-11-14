# LearnersCare Interactive English Grammar — engine + Unit 1

A narrated, game-like web app (installable PWA, works offline) that turns a grammar unit into
**explain → practise → speak → complete**. It is an engine plus a content pipeline: units are data.

> **Status: release candidate, private.** The Unit 1 content in the development repository is derived from a
> third-party textbook and may not be distributed without the publisher's licence. The distributable package
> contains the engine and an original **sample unit** instead. See `LICENSING.md`.

## Features (all implemented)
- **Unit map** with a recommended path, stars, XP, forgiving streak and badges.
- **Narrated explanations** as interactive scenes: elements appear on the narration's cues; captions, speed
  control, replay, skip; one-tap quick checks. Unknown layouts fall back to a generic scene.
- **Exercise plugins**: gap-fill / picture + verb bank, matching (one by one or all at once with connector lines),
  question building from tiles, positive-or-negative (find the clue → decide → build), Mistake Hunt, Rapid Review.
  Every question follows Read → Try → Check → Understand with a hint ladder and specific feedback. Tiles or typing.
- **Talk**: speaking scenes with a partner character — read aloud, listen and repeat, describe, ask, decide, respond.
  A deterministic gate checks the grammar; word-level clarity feedback; hints; "say it with me" fallback;
  **Type mode** completes the level with no microphone. New dialogue ships only after human approval.
- **Mistake bank** with spaced repetition (Fix-it sessions), weak-section view, certificate image export.
- **Audience presets** (Explorer / Classic / Focus), light / dark / high-contrast, text size, easy-read font,
  reduced motion, separate volumes. Keyboard operable; WCAG-minded.
- **Offline**: app shell precached; per-unit download; progress stored only in the browser, export / import.
- **Pipeline**: narrated decks → validated unit JSON, cut audio, SVG art, captions, reports; Talk draft + validators.
- **Optional LLM proxy** for more natural partner replies — off by default, never judges answers.

Not implemented / not verified: real-world speech accuracy (tested with a mock recogniser only), recorded partner
voices (browser voice is used), on-device speech recognition (config slot, untested), accounts or cloud sync,
a public demo. See `docs/BLOCKERS.md`.

## Technology
Vite 8 · React 18 · TypeScript (strict) · Zustand · Framer Motion · Tailwind CSS · vite-plugin-pwa (Workbox) ·
Vitest + Testing Library · Playwright · Zod (build-time schema). Pipeline: Python 3 (`lxml`) + ffmpeg + poppler.
Runtime dependencies: React, React DOM, Framer Motion, Zustand. No backend, no database.

## Quick start
```bash
npm ci
```
```bash
npm run dev
```
Full instructions: `HowToSetup.md`. Deployment (static hosting or Docker): `DEPLOYMENT.md`.

## Main commands
| Command | Does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `npm run preview` | Production build / local preview on :4173 |
| `npm test` | Unit tests (engine, gate, validators, sample unit) |
| `npm run e2e` | Browser tests (development repository with Unit 1) |
| `npm run lint` | ESLint |
| `npm run validate` | Validate content against the schema |
| `npm run sample` | Rebuild and validate the sample unit |
| `npm run conversation -- --unit NNN` | Talk pipeline: draft, validate, review file |
| `npm run ingest` | Re-ingest Unit 1 from `source/` (development repository only) |

## Project structure
```
content/            unit manifest + one folder per unit (unit.json, conversation.json, audio/, media/)
src/engine/         loader, answer checker, scoring, SRS, audio, cue scheduler, progress store
src/exercises/      exercise plugins
src/scenes/         explanation scenes
src/speech/         Talk: gate, state machine, recogniser / voice / brain adapters
src/screens, src/ui map, node player, Talk, profile, design system
tools/              ingest (Python), conversation + sample + validation (TypeScript), release checks
server/             optional LLM proxy (never bundled into the app)
tests/, e2e/        Vitest and Playwright suites
deploy/, Dockerfile container deployment
docs/               audits, blockers, expansion guide
```

## Documentation
`HowToSetup.md` · `ARCHITECTURE.md` · `DEPLOYMENT.md` · `SECURITY.md` · `PRIVACY.md` · `LICENSING.md` · `DESIGN.md` ·
`CHANGELOG.md` · `CLAUDE.md` · `docs/FINAL_INDEPENDENT_AUDIT.md` · `docs/VIBE96_AUDIT_REPORT.md` ·
`docs/FUTURE_UNIT_EXPANSION.md` · `docs/SPEECH_TEST_MATRIX.md` · `docs/BLOCKERS.md`
