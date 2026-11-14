# Licensing, copyright and distribution rights

**This is an engineering inventory, not legal advice. No permission from any rights holder has been obtained or is
claimed. The Vibe96 Seller Agreement could not be read during preparation (the site was unreachable from the build
environment), so its terms are not summarised here — read it before submitting.**

## 1. Inventory of what the full development repository contains
| Material | Where | Origin | May it be redistributed commercially? |
|---|---|---|---|
| Unit 1 explanation text and example sentences | `content/units/unit-001/unit.json` (`sections[].book`, scene text), `docs/coverage-report.md` | Third-party published grammar textbook | **No — not without the publisher's written licence** |
| Exercises 1.1–1.4 (instructions, items, cue words, verb bank, matching sentences) | `unit.json` (`exercises[]`) | Same textbook | **No** |
| Answers quoted from the book's key | `unit.json` (`officialAnswer`, `acceptedAnswers`) | Same textbook (via the decks' answer cards) | **No** |
| Scanned book pages | `source/unit-001/*.pdf` | Same textbook | **No** |
| Narration recordings | `content/units/unit-001/audio/*.mp3`, inside the decks | LearnersCare recordings that read the book's sentences aloud | **No** — a recording of protected text is a derivative; LearnersCare owns the performance, not the text |
| Talk turns marked `origin: "book"` (18) | `conversation.json` | Book sentences spoken by the learner | **No** |
| Screenshots of Unit 1 | `docs/screens/` | Show the book's sentences | **No** (do not use in a public listing) |
| WHY explanations, clues, spelling notes, common-mistakes slide, guided practice wording | `unit.json` (`origin: "learnerscare"`) | LearnersCare | Yes, by LearnersCare — but they are tied to the book's items and make little sense alone |
| 17 draft Talk turns | `conversation.json` (`origin: "learnerscare"`, `status: "draft"`) | Written during development for LearnersCare | Yes once the owner approves them |
| Deck illustrations (pictures, icons) | `content/units/*/media/*.svg` | Converted from the LearnersCare decks' own shapes | Yes, **if LearnersCare owns the deck artwork** (owner to confirm). The book's printed artwork is not used or traced; note that the six picture scenes illustrate the book's exercise actions. |
| Application source code | `src/`, `tools/`, `server/`, `tests/`, `e2e/` | Written for LearnersCare | Yes, by LearnersCare (owner to confirm ownership terms of AI-assisted code under the marketplace's rules) |
| Sample unit (unit-900) | `content-sample/` → `content/` in the package | Original wording written for LearnersCare; no textbook text, no audio | Yes once the owner approves the wording |
| Fonts: Fraunces, Nunito, Atkinson Hyperlegible | bundled from `@fontsource` | SIL Open Font License 1.1 | Yes (keep the licence notices; do not sell the fonts on their own) |
| Runtime libraries: React, React DOM, Framer Motion, Zustand | bundled | MIT | Yes (keep notices) |
| Sound effects, mascot, partner characters, icons | generated in code / drawn for the app | LearnersCare | Yes |

Grammar itself (the present continuous, its rules, the idea of a gap-fill or matching exercise) is not protected;
the textbook's specific wording, selection and arrangement of examples and exercises is.

## 2. What follows from that
- **The Unit 1 content must not be published, sold or shown in a public demo unless the publisher grants a licence
  that covers software distribution and resale.** Owning the book or using it for teaching does not grant this.
- **The marketplace package therefore contains the engine and the rights-cleared sample unit only.** It excludes
  `source/`, `content/units/unit-001/`, `docs/screens/`, the coverage reports and the book-specific tests. The
  packaging script scans the package for the textbook's sentences and fails if any is found.
- The full repository stays private. It is `noindex` and has no remote.

## 3. Two lawful routes to a complete product
| Route | What it takes |
|---|---|
| A. Licence the textbook content | Written permission from the publisher for digital reproduction, adaptation (narration, exercises, speaking turns) and commercial redistribution, in the intended territories. Then Unit 1 can ship as built. |
| B. Replace with original content | Write original explanations, examples, exercises and dialogues for each unit (the sample unit shows the format), record narration of the original text, and ingest that. The engine, pipeline and UI are unchanged. |

## 4. What the buyer would receive (to be confirmed against the Seller Agreement)
Source code of the engine, pipeline and optional proxy; the sample unit; documentation. **Not** included: any
textbook content, any right to use the textbook, the LearnersCare name/brand unless the owner decides otherwise.
Support and update commitments are the owner's to define; none are promised by this document.

## 5. Decisions only the owner can make
1. Route A or B (or both) — this is the release gate for any public listing.
2. Confirm LearnersCare owns the deck artwork and the narration performances.
3. Approve the sample unit's wording and its 10 Talk turns.
4. Buyer licence terms, brand use, support and update policy, after reading the Seller Agreement.
5. Whether the marketplace's rules on AI-assisted code and on educational content are met (unverified).
