# Marketplace listing — draft text (describe only what exists)

**Product name:** LearnersCare Interactive Grammar Engine — with sample unit

**Short description (≤ 160 characters):**
Installable React + TypeScript web app that plays narrated grammar units: interactive explanations, six exercise types, a speaking level, offline support.

**Detailed description:**
A static, local-first learning app and the pipeline that feeds it. A unit is data — explanation scenes, exercises,
a speaking ("Talk") conversation — and the engine renders it as a guided path: explain a section, practise it,
speak it, complete the unit. The package includes an original sample unit on the present continuous so you can run
and evaluate everything immediately, and the tools to turn your own narrated slide decks into further units.

**Features:**
- Unit map with recommended path, stars, XP, forgiving streak, badges, certificate image.
- Explanation scenes that reveal on narration cues, with captions, speed control and one-tap checks.
- Exercise plugins: gap-fill / picture-and-verb, matching (single or whole-board), question building, positive-or-negative
  with clue finding, mistake hunt, rapid review. Tiles or typing; specific feedback; hint ladder.
- Talk: partner characters, read-aloud / repeat / ask / decide / respond turns, deterministic grammar gate,
  word-level feedback, hints, full Type-mode fallback, draft/approved workflow for new dialogue.
- Mistake bank with spaced repetition, weak-section view, progress export/import.
- Light / dark / high-contrast themes, text size, easy-read font, reduced motion, keyboard operation.
- PWA: installable, offline after caching, per-unit download.
- Content pipeline (Python + TypeScript) with schema validation and review reports.
- Optional, hardened LLM proxy for partner replies (off by default; never grades).

**Known limitations (state these in the listing):**
- Speech recognition uses the browser's engine (Chrome, Edge, Safari) and was tested with a mock recogniser only;
  real-world accuracy has not been measured. Firefox users get Type mode.
- Partner lines use the browser's voice; no recorded partner audio is included.
- The sample unit has no narration audio. The sample dialogue is marked "Draft" until you approve it.
- The explanation-deck ingest expects LearnersCare's deck conventions (shape names, speaker-note markers).
- Open-ended Talk checking and named grammar feedback exist for the present continuous; other structures use exact /
  near matching until an analyser is added.
- No accounts, cloud sync or analytics. No textbook content is included or licensed.
- The Docker route is provided but was not built during development; the LLM proxy was not live-tested.

**Technology stack:** Vite 8, React 18, TypeScript 5, Zustand, Framer Motion, Tailwind CSS 3, vite-plugin-pwa / Workbox,
Vitest, Testing Library, Playwright, Zod. Pipeline: Python 3, lxml, ffmpeg, poppler. Optional proxy: Node 22.

**Technical requirements:** Node.js 22 and npm 10 to build. Any static https host to run. No database or server.
**Hosting requirements:** static file hosting with https and byte-range support for audio. ~1 MB for the engine and
sample unit; roughly 30 MB per narrated unit.
**Installation summary:** `npm ci` → `npm run build` → upload `dist/`. See `HowToSetup.md`.
**Deployment:** static hosting (verified locally) or Docker + nginx (provided, unbuilt). See `DEPLOYMENT.md`.
**Screenshots:** `MARKETPLACE_MEDIA/screenshot-01…07` (1920 × 1080, from the packaged build).
**Demo URL:** `__________________________` (not deployed yet)
**Licence:** to be set by the seller after reading the Seller Agreement. Third-party: fonts under SIL OFL 1.1;
libraries under MIT. See `LICENSING.md`.
