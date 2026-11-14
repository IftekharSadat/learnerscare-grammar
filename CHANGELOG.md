# Changelog

## 1.0.0-rc.1 — release candidate (not yet published)
### Added
- Rights-cleared **sample unit** (unit-900): original explanations, 4 exercises (16 questions + 4 worked examples),
  Mistake Hunt and a 10-turn Talk draft — so the engine can be distributed without textbook material.
- Talk: grammar-notes summary, "practise again", and a notice when content is withheld pending approval.
- Pluggable grammar analysers for Talk (`registerAnalyser`), with exact / near matching as the safe fallback.
- Release check script (`tools/verify-release.mjs`): real PWA installability, 360 px layout, production Talk run.
- Buyer documentation: HowToSetup, ARCHITECTURE, DEPLOYMENT, SECURITY, CLAUDE.md; Dockerfile + nginx config.
- Audits: FINAL_INDEPENDENT_AUDIT, VIBE96_AUDIT_REPORT, item-section-mapping-audit, TALK_DRAFT_APPROVAL, SPEECH_TEST_MATRIX.
### Changed
- LLM proxy: no default model (must be configured and is verified against the Models API at start-up); required
  origin allow-list; daily cap reserves worst-case cost per request; global rate limit; stricter input validation.
- Dev toolchain upgraded to clear critical/high advisories (Vite 8, Vitest 5, Zod 4); every dependency pinned exactly.
- Partner-audio generation command no longer goes through a shell.
### Fixed
- Subject–verb agreement with plural noun subjects ("The days are getting shorter" was judged wrong).
- 8 px horizontal overflow at 360 px in the change-verbs scene.
- One draft partner line that used the past simple (TD6).

## 0.2.0 — Talk level
Conversation data + validators, deterministic `evaluateUtterance`, dialogue state machine, speech adapters,
Talk screen, completion gate, Speech Lab, optional LLM proxy.

## 0.1.0 — Unit 1
Ingest pipeline, unit schema, engine, explanation scenes, six exercise plugins, map, progress, PWA/offline.
