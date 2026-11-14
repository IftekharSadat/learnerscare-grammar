# Architecture

```
source/unit-NNN/ (decks, pages)          content/units/unit-NNN/                 browser
        │  tools/ingest (Python)          ├─ unit.json        ◄── schema (Zod)     ┌──────────────────────────┐
        └────────────────────────────►    ├─ audio/*.mp3                          │ engine  (src/engine)      │
        tools/conversation (TS) ─────►    ├─ media/*.svg                          │ scenes  (src/scenes)      │
        tools/sample (TS)                 ├─ conversation.json ◄── schema (Zod)   │ exercise plugins          │
                                          └─ files.json                           │ Talk    (src/speech)      │
content/index.json  (unit manifest) ───────────── static files ────────────────► │ screens + UI              │
                                                                                  └──────────────────────────┘
```
Content is data; the app is an engine. A unit is added by producing its folder and listing it in `content/index.json`.

## Main learning engine — `src/engine`
| Module | Responsibility |
|---|---|
| `schema.ts`, `types.ts` | Unit schema (Zod, source of truth) and inferred types. Not shipped to the browser. |
| `content.ts` | Loads the manifest, a unit and its conversation; injects the Talk node; offline download list. |
| `answer.ts`, `spelling.ts` | Pure answer checking: normalisation, accepted variants, contraction equivalence, named near-miss feedback. |
| `scoring.ts`, `srs.ts`, `badges.ts` | Stars, XP, forgiving streak, Leitner/SM-2-lite mistake bank, badges. |
| `audio.ts`, `sfx.ts`, `cueScheduler.ts` | Narration player (one media element), synthesised effects, cue state derived from the audio clock. |
| `progress.ts`, `store.ts` | `ProgressRepository` (IndexedDB → localStorage) and the Zustand store. |
| `variants.ts`, `i18n.ts`, `analytics.ts` | "Try a similar one" generator, UI strings, opt-in analytics stub (no sink by default). |

## Unit pipeline — `tools/`
- `tools/ingest/` (Python): reads the two narrated decks and the two book pages as data → `unit.json`, audio clips cut
  on verified pauses, SVG illustrations, captions, `ingest-report.md`. Deterministic. Deck conventions are documented
  in `normalize.py`.
- `tools/conversation/` (TypeScript): drafts a Talk conversation from templates, runs blocking validators, writes the
  review and coverage documents, optionally generates partner audio.
- `tools/sample/build.ts`: writes the rights-cleared sample unit.
- `tools/validate-content.ts`, `tools/gen-schema.ts`: Zod + JSON Schema validation and schema export.

## Explanation scenes — `src/scenes`
`StepScene` dispatches on `Step.type` (form, contractions, build, timeline, periods, compare, changeVerbs, …) and falls
back to a generic block renderer, so an unknown layout still renders. Blocks appear on narration cues.

## Exercise plugins — `src/exercises`
Contract (`types.ts`): `initial · Render · check · ready · hint · revealAnswer · serialize`. Registered in `index.ts`:
`gapFill`, `pictureVerb`, `matching` (+ all-at-once board), `buildQuestion`, `positiveNegative`, `spotMistake`,
`rapidReview`, `conversation`. `screens/ItemStage.tsx` hosts any plugin in the loop Read → Try → Check → Understand.

## Talk module — `src/speech`
| Module | Responsibility |
|---|---|
| `schema.ts` | Conversation schema (scenes → turns, status draft/approved). |
| `evaluate.ts` | **The gate.** Pure `evaluateUtterance(turn, transcript)` → pass / near miss / fail + word alignment + clarity. Grammar analysers are plug-ins (`registerAnalyser`); units without one use exact / near matching. |
| `machine.ts` | Pure dialogue state machine: tries, hint ladder, shadow pass, missions, summary, resumable snapshot. |
| `recognizer.ts` | `SpeechRecognizer` adapters: mock (tests), Web Speech API, optional on-device Whisper slot. |
| `mic.ts`, `voice.ts` | Level meter + calibration; `PartnerVoice` (pre-generated clip → browser voice → captions only). |
| `brain.ts` | `ScriptedBrain` (default) and optional `LLMBrain` (never judges; validated; falls back). |
`screens/TalkScreen.tsx` is the UI; `screens/SpeechLab.tsx` is the diagnostic page.

## Progress repository
One JSON document per browser profile: settings + progress (XP, streak, per-item stars, node completion, mistake
cards, Talk snapshot). Export / import as a file. The `ProgressRepository` interface is the seam for a future
account or sync backend; none exists today.

## Routing and shell
Hash routes (`src/router.ts`): `#/` map · `#/u/:unit` · `#/u/:unit/n/:node` · `#/profile` · `#/fixit/:unit` ·
`#/lab/speech`. `App.tsx` lazy-loads the node player, Talk and profile. PWA via `vite-plugin-pwa` (app shell
precached; unit content cache-first; audio cached as whole files so range requests work offline).

## Future expansion
See `docs/FUTURE_UNIT_EXPANSION.md`. In short: new unit = new content folder; new exercise type = one plugin file +
one registry line; new grammar structure for open Talk turns = one analyser registration.
