# Final independent audit

Scope: the repository as found at commit `eeedffd` (8 commits, clean tree, branch `master`, **no remote**), re-checked
against the previous session's report, then the finalization work on top of it. Nothing in the existing history was
rewritten. A bundle of the pre-finalization state is kept outside the package (`RELEASE_BACKUP/`, verified with
`git bundle verify`).

Legend: **V** verified here by running it or reading the artefact · **P** partially complete · **R** reported, not
independently verifiable · **F** failed · **E** blocked by the environment · **O** needs the owner.

## 1. Previous claims re-checked
| Claim | Result | How it was checked |
|---|---|---|
| 8 commits, Talk work committed, tree clean, no remote | **V** | `git log`, `git status`, `git remote -v` |
| 130 unit tests pass | **V** (130/130 at `eeedffd`; 144 now) | `npm test` |
| 16 e2e pass, 2 skipped | **V** | `npm run e2e` — the 2 skips are the hardware-keyboard tests on the mobile project, by design |
| 496-utterance gate corpus, 0 false passes | **V** (508 now, still 0) | `tests/evaluate.test.ts` |
| 37 answer cues, max drift 175 ms | **V** | `npm run audit:sync` |
| Re-ingest: 160 files byte-identical | **V** | SHA-256 of every output file before/after `npm run ingest` |
| 162 base + 58 Talk screenshots | **V** (file counts; images re-inspected in contact sheets) | `docs/screens/` |
| Synthetic Unit 2 ingests and renders | **V** | `tests/scalability.test.tsx`, `tests/conversation-content.test.ts` |
| 5 scenes, 35 turns, 18 approved, 17 draft | **V** | `conversation.json` |
| Default build has no finale | **V** — all 6 finale turns are drafts, so the scene is withheld | `tools/verify-release.mjs` |
| 31 scored questions + 5 worked examples | **V** | `unit.json`, `tests/content-coverage.test.ts` |
| Book coverage of the two supplied pages | **V** for those pages | `docs/coverage-report.md` (development repository only) |
| Official answers match the printed key | **R** — the key page was never supplied; answers come from the exercise deck's answer cards. Only the five printed examples were checked against the page. |
| Lighthouse 94 / 100 / 100 | superseded — measured before Talk; re-measured below |
| Speech recognition works | **R / E** — only a mock recogniser was ever used. No real-voice result exists. |
| LLM proxy works | **E** — never run against a live API (no credentials) |
| Model ID `claude-opus-5-5` is valid | **E** — the provider's documentation site is unreachable from here and no credentials exist to query the Models API. Not confirmed. The default was **removed**: the proxy now requires an explicit model and verifies it against the live Models API before starting. |
| LLM cost figures | **R** — estimates only; never measured |

## 2. Defects found by this audit and fixed
| # | Finding | Fix |
|---|---|---|
| 1 | Gate judged plural noun subjects as singular (a correct sentence was rejected as "wrong be") | Agreement rule in `src/engine/spelling.ts`; 12 regression cases |
| 2 | Partner-audio command was run through a shell with interpolated text (command-injection risk from content) | `execFileSync` with argv, no shell |
| 3 | Proxy: default model assumed; wildcard origin allowed; daily cap could be overshot by parallel requests; `X-Forwarded-For` trusted | Required model + Models API check; exact-origin allow-list; reserved-cost cap; global limit; opt-in proxy trust |
| 4 | Dev toolchain: 2 critical + 2 high advisories | Vite 8, Vitest 5, Zod 4; all versions pinned |
| 5 | Talk ended without a grammar summary, a replay option, or any note that content was withheld | Added to the summary screen |
| 6 | One draft partner line used a tense outside the unit | Reworded (still a draft) |
| 7 | 8 px horizontal overflow at 360 px (change-verbs scene) | Layout fix |
| 8 | Text contrast 4.35:1 on the "correct" banner | Darker green (now passes) |
| 9 | Long unit title overflowed the certificate | Auto-fit |
| 10 | Synthetic test data and the first sample-unit draft contained sentences that coincide with textbook sentences | Replaced; a package gate now scans for all 107 textbook sentences |
| 11 | Open-turn grammar analysis hard-wired to one structure | `registerAnalyser` registry with exact/near fallback |

## 3. Current test results (development repository)
| Suite | Command | Result |
|---|---|---|
| Unit | `npm test` | 144 passed, 10 files |
| Gate corpus | within `npm test` | 508 utterances, 0 false passes, every category 100 % |
| Browser | `npm run e2e` | 16 passed, 2 skipped (by design) |
| Release checks | `node tools/verify-release.mjs` | 12/12 — real installability (Chrome DevTools Protocol), service worker, 360 px on 16 routes, Talk Type mode 18/18 approved turns, drafts withheld and disclosed, completion unlocks, replay |
| Lint | `npm run lint` | 0 errors (warnings only: `any` in tests) |
| Type-check + build | `npm run build` | passes |
| Audio sync | `npm run audit:sync` | 37 cues, max 175 ms |
| Dependency audit | `npm audit` | 0 critical, 0 high, 9 moderate, 2 low (dev tooling); production deps 0 |

## 4. Performance after Talk integration (Lighthouse 12, mobile emulation, local preview)
| Build / route | Performance | Accessibility | Best practices |
|---|---|---|---|
| Unit 1 — map | 95 | 100 | 100 |
| Unit 1 — Talk | 93 | 100 | 100 |
| Package (sample unit) — map | 95 | 100 | 100 |
| Package — exercise | 91 | 100 | 100 |
| Package — explanation | 91 | 100 | 100 |
Single runs on a shared machine; performance varied by about ±4 between runs. SEO is 54 by design (`noindex`).
Initial JavaScript: **110 kB gzipped** (app 18.4 + React 42.5 + motion 49.2); Talk (11.5 kB) and the node player
(12.7 kB) load on demand; unit audio and media load per clip.

## 5. Package verification (from a clean copy of `UPLOAD_READY/`)
`npm ci` → `npm test` (24 passed) → `npm run lint` (0 errors) → `npm run build` → `npm run validate` →
`npm run preview` (HTTP 200) → release checks 7/7 → smoke browser test 2/2 (mobile + desktop).
Content gate: 0 of 107 textbook sentences present; no PDFs, decks, audio or Unit 1 files; no secrets.
**Not verified:** the Docker image (the Docker daemon is not available here); a different operating system or
machine; any public host.

## 6. Status by area
| Area | Status |
|---|---|
| Unit 1 explanation, exercises, checkpoint, Mistake Hunt, Rapid Review, completion | **V** |
| Talk engine, navigation, summary, retry, Type mode, completion gate | **V** (mock recogniser / typing) |
| Talk content | **P** — 18 approved turns ship; 17 drafts and the finale **O** |
| Real speech recognition, real devices, iOS Safari, Android | **E** — procedure in `docs/SPEECH_TEST_MATRIX.md` |
| Partner voice | **P** — browser voice behind the adapter; recorded clips need a TTS provider (**O**) |
| LLM layer | **P** — hardened and unit-tested, off by default; live test **E** |
| Privacy | documented; legal review **O** |
| Licensing of textbook-derived content | **O** — release gate; package uses the sample unit instead |
| Public live demo | **E / O** — no hosting access; not deployed |
| Marketplace requirements | **E** — the marketplace site was unreachable; requirements taken from the owner's brief only |
