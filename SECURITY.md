# Security

## Security model (what this application actually is)
A **local-first static web app**. There is no backend, no database, no user accounts, no sessions and no
data-changing server routes in the product. All learner data (progress, settings, Talk results) is stored in the
learner's own browser (IndexedDB, localStorage fallback) and never leaves the device. Consequently:

| Area | Status |
|---|---|
| Authentication / authorisation | Not applicable: there is nothing to log in to and no shared data to authorise. Nothing was added just to satisfy a checklist. |
| Database | None on a server. Client storage is one document per browser profile; "Erase my progress" deletes it. No SQL anywhere. |
| Secrets | The app has none. `VITE_*` variables are public by design and hold no secrets. |
| Third-party requests | None at runtime, except (a) the browser's own speech-recognition service if the learner chooses to speak, and (b) the optional LLM proxy if the operator enables it. |
| Untrusted input | Learner text and transcripts are only compared against expected answers in memory and rendered as text (React escapes it). No `dangerouslySetInnerHTML`, `eval` or dynamic script loading from user input. |
| Content | Unit JSON, audio and SVG are static files produced at build time by the operator and validated against a schema. |

## The only server-side component: optional LLM proxy (`server/`)
Off by default. When enabled it is the single place a secret (the model provider's API key) exists.
Controls, all enforced server-side (`server/limits.mjs`, tested in `tests/proxy-limits.test.ts`):
- key only in the proxy's environment; exact-origin allow-list (fails closed); one route, JSON only, 4 kB body cap;
- strict input shape (five length-capped strings) and output validation (≤ 14 words, plain characters, banned topics);
- per-client interval and hourly budget, global per-minute limit, and a **daily spend cap with worst-case cost
  reserved before each call**, so repeated or parallel requests cannot exceed it;
- request timeout, no retries, no content logging; any failure returns 204 and the app uses its scripted line;
- the model **never** decides whether an answer is correct — it only words the partner's reply;
- the proxy refuses to start unless the configured model ID is accepted by the provider's Models API.
Limitation: an origin check and IP limits do not authenticate users; a determined attacker can spoof the Origin header
from a script. The spend cap is the hard backstop. Not live-tested (no credentials during development).

## Build-time tools
- Ingest (`tools/ingest`) parses decks/PDFs as data only (zip + XML), run with `python3 -I`; nothing inside a source
  file is executed.
- Partner-audio generation (`PARTNER_TTS_CMD`) runs a command configured **only** by the operator's environment, without
  a shell, with the text passed as a single argument — dialogue content cannot inject commands.

## Dependencies
All versions are pinned exactly and `package-lock.json` is committed. `npm audit` at release: **0 critical, 0 high**
(9 moderate, 2 low — all in development tooling: eslint parser and the service-worker build chain). Production
(runtime) dependencies: 0 known vulnerabilities. Runtime dependencies are only React, React DOM, Framer Motion and Zustand.

## Secrets scan
No keys, tokens, passwords, private keys or connection strings in the working tree or anywhere in Git history
(pattern scan over all commits). The only env-like file ever committed is `.env.example`, which contains no values.

## Hardening for deployment
Serve over https; use the headers in `deploy/nginx.conf` (CSP, `Permissions-Policy`, `X-Frame-Options`,
`nosniff`, `Referrer-Policy`). The build is `noindex` by default.

## Reporting
Report security issues privately to the seller before public disclosure.
