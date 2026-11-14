# Issue register

| ID | Pri | Component | Description | Impact | Recommended fix | Status | Blocks submission |
|---|---|---|---|---|---|---|---|
| P0-1 | P0 | Unit 1 content (development repository) | Text, exercises, key answers, narration and screenshots derive from a third-party textbook | Unlawful if distributed | Publisher licence, or replace with original content | Mitigated: excluded from the package; automated content gate | Yes for any listing that includes Unit 1; no for the sample-unit package |
| P1-1 | P1 | Live demo | No public deployment exists | Marketplace requires a demo | Deploy `dist/` of the sample build to an https host | Open — needs hosting access | **Yes** |
| P1-2 | P1 | Marketplace requirements | Official `/sell` page and Seller Agreement unread (site unreachable) | Unknown requirements may be unmet | Owner reads both; re-run the audit against them | Open | **Yes** |
| P1-3 | P1 | Sample unit wording + its 10 Talk turns | New content not yet approved by the owner; Talk therefore absent from the default package build | Demo lacks Talk unless approved | Review `content/units/unit-900/conversation-review.md`, set status | Open — owner | Yes for a demo that shows Talk |
| P1-4 | P1 | Talk Unit 1 drafts | 17 turns and the finale await approval | Unit 1 Talk is 4 scenes without finale | `docs/TALK_DRAFT_APPROVAL.md` | Open — owner | No (Unit 1 is not in the package) |
| P1-5 | P1 | Speech recognition | Never tested with real voices or devices | Unknown real-world accuracy and browser quirks | Run `docs/SPEECH_TEST_MATRIX.md` | Open — needs devices | No (Type mode is verified), but must be disclosed in the listing |
| P2-1 | P2 | Dev dependencies | 9 moderate + 2 low advisories (ESLint TS parser 7, Workbox build chain) | Build-time tooling only | Move to ESLint 9 / typescript-eslint 8; follow the PWA plugin's next release | Open | No |
| P2-2 | P2 | Docker deployment | `Dockerfile` / `deploy/nginx.conf` never built or run | Second deployment route unproven | Build and smoke-test on a host with Docker | Open | Possibly (two approaches are required) |
| P2-3 | P2 | LLM proxy | Never called against the live API; model ID unverified; cost unmeasured | Optional feature unproven | `server/README.md` live-test procedure | Open — needs credentials | No (off by default) |
| P2-4 | P2 | Partner voice | Browser synthesis only; quality varies; none on some devices | Less polished Talk audio | Configure `PARTNER_TTS_CMD` and generate clips | Open — owner | No |
| P2-5 | P2 | Privacy | No legal review for child-directed voice features | Regulatory risk in some markets | Counsel review of `PRIVACY.md` | Open — owner | Depends on market |
| P2-6 | P2 | Captions | Sentence-level timing, not word-level | Less precise karaoke | Add a recogniser at ingest when one is available | Open | No |
| P2-7 | P2 | Answer feedback rules | Named near-miss feedback is tuned to be + verb-ing | Other structures get generic feedback | Per-structure rules as units are added | Open | No |
| P2-8 | P2 | Answer key | Printed key page never supplied | Key answers rest on the decks | Supply the page; extend the coverage test | Open — owner | No |
| P2-9 | P2 | Lighthouse | Performance 91–95 on single local runs, ±4 variance | Could dip below 90 on slow hosts | Re-measure on the real host | Open | No |
| P3-1 | P3 | `TalkScreen.tsx`, `StepScene.tsx`, `NodeScreen.tsx` | 420–550 lines each | Maintainability | Split by stage when next touched | Open | No |
| P3-2 | P3 | Unit library | One-unit map with a switcher | Will not scale visually to 200 units | Library screen | Open | No |
| P3-3 | P3 | On-device recogniser | Config slot, never run | Firefox/offline speaking unavailable | Device test, then enable | Open | No |
| P3-4 | P3 | Bengali hint layer | Wired, empty | — | Owner supplies text | Open | No |
| P3-5 | P3 | "Save my recordings" | Deliberately not built | — | Only after privacy design and approval | Closed by decision | No |
