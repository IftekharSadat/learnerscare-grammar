# Design brief

## Concept — "The sentence workbench"
Grammar is treated as something you **build with your hands**. Every screen puts one sentence on a workbench:
big, serif, centre stage. Around it are chunky, colour-coded tiles that snap into the sentence. Explanations,
exercises and rewards all use the same object — the tile — so the learner always knows what is tappable and what
each colour means.

The look is taken from the LearnersCare decks so the videos and the app feel like one product: deep navy ink on
lavender paper, violet as the action colour, gold for anything earned or "official", flat rounded illustrations.

## Grammar colour code (identical everywhere, never colour-only)
| part | colour | second signal |
|---|---|---|
| subject | coral | label "subject", solid tile |
| be-verb (am / is / are) | teal | label "be" |
| verb-ing | violet | label "verb-ing" |
| not | navy outline | outlined tile |
| question word | gold | label "question word" |

Correct / incorrect always carry an icon (✓ / ✕) and words as well as teal / coral.

## Type
- **Fraunces** (serif, 600–700) — headlines and the hero sentence. Warm, slightly bookish, matches the decks.
- **Nunito** (variable sans) — UI, tiles, body. Rounded terminals fit the tile geometry.
- **Atkinson Hyperlegible** — optional reading font (Settings → "Easy-read font").
All self-hosted (no network calls).

## Signature moment — "the click"
When an answer is right, the tiles slide together into one sentence, the gaps close, a soft glow sweeps left to
right and the sentence settles with a small spring. One sound (three rising notes). This is the reward; confetti
is reserved for finishing a node or the unit.

## Layout
- Mobile first, one column, thumb zone at the bottom: the primary action is always a full-width button in the
  bottom bar. Content column max 560 px; on wide screens the stage becomes two columns (picture / passage left,
  workbench right) inside a 1040 px frame.
- Cards: 20 px radius, 1 px line, soft navy shadow. Tiles: 14 px radius with a 4 px "depth" edge that compresses
  on press.
- The unit map is a winding path of stepping stones; the next stone bobs gently and shows a teaser.

## Motion principles
1. Motion explains: things come from where they belong (tiles fly from the bank into the slot; the connector line
   draws from the sentence to its ending).
2. Transform and opacity only; springs for objects, 160–240 ms ease-out for chrome.
3. One hero motion at a time; celebrations scale with the achievement (tick → sentence click → star burst → confetti).
4. `prefers-reduced-motion` (or the setting) replaces movement with fades and removes confetti.

## Sound
Procedural (Web Audio): soft mallet-like sines and triangles in C major pentatonic. Wrong answers get two gentle
falling notes, never a buzzer. Narration, effects and music have separate volumes; music is off by default.

## Mascot — Pip
An original character: a small violet speech bubble with eyes and a gold tail. Pip reacts (idle, thinking,
happy, oops, cheer) and speaks in short lines. Can be switched off; hidden by default in Focus mode.

## Audience modes
Explorer (bigger type, more bounce, Pip chatty) · Classic (default) · Focus (quiet chrome, no Pip, minimal
celebration). One codebase, three presets of the same tokens.
