# Speech testing — what is and is not verified

## A. Mock recognition (automated, done)
`MockRecognizer` injects transcripts. It verifies the *flow and the gate*: pre-flight, half-duplex ordering, interim
display, verdicts, hints, shadow pass, resume, permission-denied → Type mode, keyboard. It says **nothing** about how
well a real recogniser hears real people. Results: `e2e/talk.spec.ts` (4 scenarios × 2 viewports, 1 skipped on
mobile by design), `tests/evaluate.test.ts` (508 utterances).

## B. Real recognition (manual, NOT done — needs devices and people)
No physical device, microphone or human voice was available in the build environment. Every cell below is **untested**.

### Procedure
1. Build with `VITE_SPEECH_LAB=true npm run build`, serve over **https** (or `localhost`).
2. Open `#/lab/speech`. Note the recogniser shown at the top.
3. For each sentence set below, press **Listen**, speak, and export/screenshot the table (transcript, confidence, gate, key, latency).
4. Then play Scene 1 of Talk normally and note anything confusing.
5. Record results in the table. A cell passes when ≥ 8 of 10 correct sentences pass the gate and 0 of 5 wrong sentences pass.

Sentence set: pick, from the unit's own Talk turns in the Speech Lab's turn list, two short read-aloud sentences, the
longest read-aloud sentence, one question turn, one negative turn and one "answer in your own words" turn. Then say
five wrong versions on purpose, one of each kind: be-verb left out, wrong be-verb for the subject, statement word
order in a question, "don't" + verb-ing, and the verb without -ing.

### Matrix (fill in)
| Case | Chrome desktop | Edge desktop | Android Chrome | iOS Safari |
|---|---|---|---|---|
| Recogniser available / starts | ☐ | ☐ | ☐ | ☐ |
| Adult, quiet room, short answers | ☐ | ☐ | ☐ | ☐ |
| Adult, quiet room, long answers | ☐ | ☐ | ☐ | ☐ |
| Non-native accent 1 (e.g. Bengali L1) | ☐ | ☐ | ☐ | ☐ |
| Non-native accent 2 | ☐ | ☐ | ☐ | ☐ |
| Younger voice (with guardian consent) | ☐ | ☐ | ☐ | ☐ |
| Background noise (TV / classroom) | ☐ | ☐ | ☐ | ☐ |
| Contractions heard correctly ('m / 's / 're) | ☐ | ☐ | ☐ | ☐ |
| Wrong sentences never pass | ☐ | ☐ | ☐ | ☐ |
| Permission denied → Type mode offered | ☐ | ☐ | ☐ | ☐ |
| No microphone present | ☐ | ☐ | n/a | n/a |
| Network drops while listening → notice + Type mode | ☐ | ☐ | ☐ | ☐ |
| Silence → "I did not hear anything", no hang (15 s cap) | ☐ | ☐ | ☐ | ☐ |
| Partner voice: plays after tap, replay, stops when leaving | ☐ | ☐ | ☐ | ☐ |
| Mic never opens while partner speaks | ☐ | ☐ | ☐ | ☐ |
| End of speech → verdict under 1.5 s | ☐ | ☐ | ☐ | ☐ |
| Tab to background while listening → listening stops | ☐ | ☐ | ☐ | ☐ |

Known expectations to confirm: Firefox has no recogniser → Type mode. iOS Safari needs a tap before any audio and may
end recognition early on pauses. Some Android devices have no English synthesis voice → captions only.

## Typing fallback (verified)
Type mode passes the same gate, is offered on the first screen, on every turn, and automatically when the microphone
or network fails. It completes the level and unlocks the certificate (`e2e/talk.spec.ts`, `tools/verify-release.mjs`).
