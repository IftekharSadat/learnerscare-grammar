# Vibe96 pre-submission audit

**No marketplace score is claimed.** The marketplace's pages (`/sell`, `/seller-agreement`) could not be opened
from the build environment and no search result describes them, so the official checks, weights and thresholds are
**unknown to this audit**. The six areas below are the ones named in the owner's brief. Each is assessed against the
distributable package (`UPLOAD_READY/`). Re-check against the live requirements before submitting.

| # | Area | Finding | Evidence | Self-assessment |
|---|---|---|---|---|
| 1 | Secrets and credentials | None in the package, the repository or any commit. `.env.example` has no values. `VITE_*` variables are public by design and documented as such. The only secret in the system (optional proxy key) lives in the proxy's environment. | Pattern scan of the tree and of `git log -p --all`; package gate in `tools/package.mjs` | No known failing check |
| 2 | Dependency vulnerabilities | 0 critical, 0 high. 9 moderate + 2 low remain, all in development tooling (ESLint TypeScript parser chain; Workbox build chain pulled in by the PWA plugin). Runtime dependencies (React, React DOM, Framer Motion, Zustand): 0. Every version pinned exactly; lockfile included; `npm ci` reproduces. | `npm audit`, `npm audit --omit=dev` | No critical/high. Moderate dev-only items are open (ISSUE_REGISTER P2-1) |
| 3 | Authorization and access control | The product has no backend, accounts, sessions or data-changing routes; all learner data is local to the browser. Nothing to authorize. The optional proxy exposes one POST route protected by an origin allow-list, input validation, rate limits and a hard daily spend cap; it holds no user data. | `SECURITY.md`, `server/limits.mjs`, `tests/proxy-limits.test.ts` | Not applicable by design; documented rather than invented |
| 4 | Database access rules | No server database and no SQL. Client storage is a single IndexedDB document (localStorage fallback) created on first run from an empty state; "Erase my progress" removes it. | `src/engine/progress.ts` | Not applicable by design |
| 5 | Code structure and duplication | Clear module boundaries (engine / speech / exercises / scenes / screens / tools). Largest files: Talk screen 550 lines, scene renderers 430, node player 420 — cohesive but long (P3). No circular imports between engine and UI. One deliberate duplication: output validation exists in both the proxy and the app (defence in depth). TypeScript strict; ESLint 0 errors. | `ARCHITECTURE.md`, `npm run lint`, `tsc --noEmit` | No known failing check; refactoring candidates listed |
| 6 | Build reproducibility | From a clean copy of the package: `npm ci` → `npm test` → `npm run build` → `npm run preview` all succeed; documented in `HowToSetup.md` with exact commands and Node version. Pinned versions + lockfile. | Section 5 of `FINAL_INDEPENDENT_AUDIT.md` | Verified on one Linux machine with Node 22 only. Docker image and other platforms unverified |

## Items the marketplace is likely to require that are NOT satisfied
| Requirement (from the brief) | Status |
|---|---|
| Working public live demo | **Missing.** Nothing is deployed; no hosting credentials. Checklist in `DEPLOYMENT.md`. |
| Rights to all included content | Package is limited to original sample content (wording awaits owner approval). Unit 1 is excluded. |
| At least five genuine screenshots | Present: 7 at 1920 × 1080 in `MARKETPLACE_MEDIA/`, captured from the packaged build. The Talk shots show the "Draft" label because the sample dialogue is not approved yet. |
| Setup documentation, technical details, two deployment approaches | Present (`HowToSetup.md`, `ARCHITECTURE.md`, `DEPLOYMENT.md`: static hosting verified locally; Docker written, unbuilt). |
| Licence information | `LICENSING.md` — inventory and open decisions; buyer licence terms not set by the owner yet. |

## Honest summary
On the six named areas there is no known failing item, but **this is a self-assessment against a checklist that
could not be read**, not a marketplace result. Submission is blocked by the missing live demo and the owner
decisions in `docs/BLOCKERS.md`.
