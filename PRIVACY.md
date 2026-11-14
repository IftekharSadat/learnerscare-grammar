# Privacy — voice features (Talk level)

**Status: not reviewed by a lawyer. Learners include children; voice features directed at children may fall under
rules such as COPPA (US) and the GDPR's provisions for children ("GDPR-K") and need legal review before any public launch.**

## What is processed, and where
| Data | Where it is processed | Stored? |
|---|---|---|
| Microphone audio during a turn | **Browser speech recognition (Chrome, Edge, Safari):** by the browser vendor's speech service — on these browsers audio normally leaves the device. The learner is told this on the pre-flight screen *before* the first microphone prompt. **On-device recogniser (optional, when configured):** on the device only. | No. The app never records, uploads or keeps audio. |
| Microphone level (pre-flight meter, 5-second calibration) | In the page, in memory | No |
| Transcript of what was said | In the page: checked by `evaluateUtterance`, shown once ("I heard: …") | Not stored. Only the result is kept (pass, stars, clarity score, which words to practise). |
| Talk progress (scene, turn, stars, words to practise) | On the device (IndexedDB), same as all other progress | Yes, locally; removable with "Erase my progress"; exportable |
| Optional LLM partner lines (`VITE_LLM_PROXY_URL`, **off by default**) | The transcript of that one turn (max 200 characters), the partner's line and the scene id are sent to *your* proxy (`server/proxy.mjs`), which forwards them to the model provider | Not stored by the app or the proxy; the proxy logs no content. The provider's own retention terms apply. |

There is no account, no analytics and no third-party script. Without the optional proxy the only possible third party
is the browser vendor's speech service.

## Controls the learner always has
- **Type mode** completes the whole level without the microphone (and is offered automatically when permission is
  denied, no recogniser exists, or the network is needed and missing).
- The microphone opens only after a tap or key press, only while the red "Listening…" state is visible, and never
  while the partner is speaking.
- "Continue later" leaves the level at any time without losing the place or the streak.

## Things deliberately not built
- No "save my recordings" feature yet. The brief allows an opt-in, local-only version; it is left out until the legal
  review, so today no audio can be stored at all.
- No voice-print, speaker identification or emotion detection.

## Age / consent hook
Set `VITE_TALK_AGE_GATE=true` to show a consent step before the privacy screen ("A parent or teacher says it is OK,
or I am an adult"). It is a hook, not a verified-consent mechanism: replace it with whatever your legal review
requires (verifiable parental consent, school agreement, age screen).

## Child-privacy rules to review per market (identification only — not a compliance claim)
| Market | Rule to review | Why it may apply |
|---|---|---|
| United States | COPPA (children under 13), state student-privacy laws if sold to schools, FERPA context | Voice is personal information; a browser speech service is a third-party recipient |
| EU / EEA | GDPR incl. Art. 8 (child consent age 13–16 by member state), ePrivacy for device storage | Voice processing by a cloud recogniser; local storage of progress |
| United Kingdom | UK GDPR + Age Appropriate Design Code (Children's Code) | Service likely to be accessed by children |
| India | Digital Personal Data Protection Act 2023 (verifiable parental consent under 18) | If distributed there |
| Bangladesh and other markets | Local data-protection and child-protection law | To be identified with counsel |

What the product does that helps: no accounts, no analytics, no ads, no audio storage, progress on the device only,
one-tap erase, Type mode without any microphone use, disclosure before the first microphone prompt, optional consent
step. What it cannot do by itself: verify age or parental consent, or control what a browser vendor does with audio.

## Checklist before a public launch
1. Legal review of child-directed voice processing in each market.
2. Decide whether browser (cloud) recognition is acceptable for under-16s or whether to require the on-device
   recogniser / Type mode for them.
3. If the LLM proxy is used: data-processing agreement with the model provider, region, and retention settings.
4. A user-facing privacy notice (this file is an internal engineering description).
