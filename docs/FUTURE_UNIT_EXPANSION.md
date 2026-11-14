# Adding Unit 2 and later units

## Workflow
1. **Sources** → `source/unit-002/`: explanation deck, exercise deck (narrated, with the LearnersCare shape names and
   `[PAUSE n s]` notes), and the book pages if you are licensed to use them. These are never part of a distribution.
2. **Ingest**
```bash
python3 -I tools/ingest/ingest.py --unit 002 --explain source/unit-002/<explain>.pptx --exercises source/unit-002/<exercises>.pptx --book-explain source/unit-002/<page-1>.pdf --book-exercises source/unit-002/<page-2>.pdf
```
3. **Validate**
```bash
npm run validate
```
4. **Read `content/units/unit-002/ingest-report.md`**: problems, pause cross-check, accepted answers, item → section mapping.
5. **Talk draft**
```bash
npm run conversation -- --unit 002
```
   Writes a template `conversation.json` (book sentences approved, everything else draft), `conversation-review.md`
   and a coverage table. Edit the dialogues by hand, re-run until 0 errors.
6. **Approve** turns by setting `"status": "approved"` — a person does this, not a script.
7. **Manifest**: the ingest adds the unit to `content/index.json`. Commit the folder. The unit appears in the app.

No application code changes for steps 1–7 when the unit uses existing layouts.

## What is generic and what is not (be precise when describing the product)
| Part | Generic? |
|---|---|
| Explanation rendering, cue sync, captions, exercises of existing types, scoring, progress, map, PWA | Yes — proven with a synthetic Unit 2 in `tests/scalability.test.tsx` and with the hand-written sample unit |
| Talk flow: scenes, turns, hints, shadow pass, summary, Type mode, read-aloud / listen-repeat thresholds | Yes |
| Talk closed turns (accepted utterances, near-miss) | Yes — exact and near matching |
| Talk **open** turns ("any correct sentence of the pattern") and named grammar feedback | **Only for structures that have an analyser.** Today one exists: `presentContinuous`. Other structures fall back to exact / near matching, which is safe but stricter. |
| Answer-check feedback in exercises (missing be, wrong be, -ing spelling) | Tuned to be + verb-ing. Other structures still get correct/incorrect and word-order feedback; add rules in `answer.ts::diagnose` per structure. |
| Deck layouts | New slide layouts need a rule in `tools/ingest/normalize.py` (step type or exercise type). Unknown explanation layouts render through the generic block scene. |

## Extension points
- **Grammar analyser** (`src/speech/evaluate.ts`):
```ts
registerAnalyser({ id: 'presentSimple', analyse(tokens) { /* return { clause, issues } */ } });
```
  then `"structureId": "presentSimple"` in the unit's `conversation.json`. One analyser per structure, shared by all
  units that teach it. The validator warns when a unit names an analyser that is not registered.
- **Exercise type**: implement `ExercisePlugin` in `src/exercises/<type>.tsx`, add it to the registry in
  `src/exercises/index.ts`, and teach the ingest to recognise the deck layout (`exercise_type` + an `items_<type>` builder).
- **Scene type**: add a case in `StepScene.tsx`.
- **Conversation templates**: `draftConversation` in `tools/conversation/lib.ts` maps exercise types to turn types.
- **Section mapping**: `tools/ingest/config/unit-NNN.json`.

## Scale notes for ~200 units
- Each unit is loaded lazily; the manifest is one small file. A unit with narration is ~30 MB; nothing is downloaded
  until a learner opens it or taps "Download unit".
- The map screen shows one unit with a unit switcher; a library screen will be needed long before 200 units.
- Homophone leniency in Talk ("were" heard as "we're") is safe only while past forms are out of scope — revisit
  `HOMOPHONES` when a unit teaches *was / were -ing*.
- Synthetic test units are created in a temp folder by the tests and removed; none is in the repository or the package.
