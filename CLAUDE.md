# CLAUDE.md — orientation for AI coding agents and new developers

## What this is
A static, local-first React + TypeScript PWA that plays grammar units: narrated explanation → exercises → Talk
(speaking) → completion. Content is JSON + media under `content/`; the app is a generic engine. Read
`ARCHITECTURE.md` first.

## Commands
| Task | Command |
|---|---|
| Install | `npm ci` |
| Dev server | `npm run dev` |
| Type-check + build | `npm run build` |
| Unit tests | `npm test` |
| Browser tests (full repo with Unit 1) | `npm run e2e` |
| Lint | `npm run lint` |
| Validate content | `npm run validate` |
| Rebuild + validate the sample unit | `npm run sample` |
| Talk pipeline for a unit | `npm run conversation -- --unit 001` |
| Release checks against a running preview | `node tools/verify-release.mjs` |

## Rules that must not be broken
1. **Never invent or alter book content.** `origin: "book"` text is verbatim; everything else is `learnerscare` or `generated`.
2. **New Talk sentences are `status: "draft"` until a human approves them.** Never flip a status yourself.
3. **`evaluateUtterance` and `checkText` are the only judges of correctness.** They are pure and deterministic. An LLM must never decide pass/fail.
4. **No secrets in the app.** `VITE_*` values are public. The only secret is the optional proxy's key, in the proxy's environment.
5. **No audio is stored.** Do not add recording without a privacy design and owner approval (`PRIVACY.md`).
6. **Content stays out of code.** No unit-specific strings or conditions in `src/`; extend the data or add a plugin.
7. Keep TypeScript strict and tests green; add a test with every behaviour change.

## Conventions
- Pure logic lives in `src/engine` and `src/speech` (no React); UI in `src/screens`, `src/scenes`, `src/ui`, `src/exercises`.
- Styling: Tailwind utilities + CSS variables in `src/theme/tokens.css`. Grammar colours are fixed: subject coral,
  be teal, verb-ing violet, question word gold; never colour-only (add text/icon).
- Every interactive element has a `data-testid` used by tests; keep them stable.
- Touch targets ≥ 44 px; respect `data-motion="reduce"`.
- UI strings go through `src/engine/i18n.ts` where a key exists.

## Where to change things
| I want to… | Go to |
|---|---|
| Add a unit | `docs/FUTURE_UNIT_EXPANSION.md` |
| Add an exercise type | new file in `src/exercises/` implementing `ExercisePlugin`, register in `src/exercises/index.ts`, map the deck layout in `tools/ingest/normalize.py::exercise_type` |
| Add an explanation scene type | `src/scenes/StepScene.tsx` (case in the dispatcher) + rule in `STEP_RULES` in `normalize.py` |
| Support a new grammar structure in open Talk turns | `registerAnalyser({ id, analyse })` in `src/speech/evaluate.ts`, set `scope.structureId` in the unit's `conversation.json` |
| Change answer feedback wording | `src/engine/answer.ts` (`diagnose`), `src/speech/evaluate.ts` (`FEEDBACK_COPY`) |
| Change scoring | `src/engine/scoring.ts`, `src/speech/machine.ts` (`starsFor`) |
| Add cloud sync | implement `ProgressRepository` in `src/engine/progress.ts` |

## Testing notes
- `tests/*.test.ts(x)` run under Vitest; `.tsx` files declare `// @vitest-environment jsdom`.
- Book-specific suites are excluded automatically when `content/units/unit-001` is absent (see `vite.config.ts`).
- Speech is tested with `MockRecognizer` (`window.__mockSpeech`). That proves the flow, **not** real recognition accuracy.
