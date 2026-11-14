# Blockers and decisions

## Blocking a marketplace submission
1. ~~Public live demo~~ — **done**: https://learnerscare-grammar-dguh.vercel.app/ (sample unit, verified in a browser on 2026-11-14).
   The source repository is public on GitHub; make it private before selling the code if buyers should not get it free.
2. **Marketplace requirements unread.** The marketplace site could not be opened. Read the sell page and the Seller
   Agreement, then compare with `docs/VIBE96_AUDIT_REPORT.md`.
3. **Content rights.** Unit 1 is textbook-derived and excluded from the package (`LICENSING.md`). Decide: obtain a
   publisher licence, or replace with original content. Also confirm ownership of the deck artwork and narration.
4. **Approve the sample unit** (wording and its 10 Talk turns) — it is the only content in the package.
5. **Buyer licence, support and update terms** — yours to define.

## Needing external access
6. Real-device speech testing — `docs/SPEECH_TEST_MATRIX.md`.
7. LLM proxy live test, model ID confirmation and cost measurement — `server/README.md`. No model is assumed.
8. Docker image build and smoke test.
9. Partner voice provider (`PARTNER_TTS_CMD`).
10. Legal review of voice features for child learners — `PRIVACY.md`.

## Decisions on Unit 1 (development repository)
11. Approve, edit or reject the 17 draft Talk turns — `docs/TALK_DRAFT_APPROVAL.md`.
12. Three item-to-section judgement calls — `docs/item-section-mapping-audit.md`.
13. Supply the printed answer-key page if you want the key verified against print.
14. Equivalent contractions outside the printed key are accepted and labelled; say if they should be marked wrong.
15. Word-level captions need a speech recogniser at ingest time (model download was blocked).
