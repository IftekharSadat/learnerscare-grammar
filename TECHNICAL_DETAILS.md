# Technical details

| Item | Value |
|---|---|
| Type | Static single-page web app (installable PWA), works offline after first load |
| Frontend | React 18.3, TypeScript 5 (strict), Vite 8, Tailwind CSS 3, Framer Motion, Zustand |
| Build tooling | Vite 8, Vitest 5, Playwright 1.63, ESLint 8, Zod 4 (build-time schema validation) |
| Database | **None.** Learner progress is stored in the browser (IndexedDB, localStorage fallback). No SQL, no server database. |
| Authentication | **None.** The app has no accounts or logins. Nothing is sent to a server about a learner. |
| Screens | 6: unit map, node player (explanation / exercise / checkpoint / mistake hunt / rapid review / completion), Talk conversation, profile, fix-it session, speech test page (developer-only, off unless enabled) |
| Data tables | 0 server tables. 1 browser object store (`kv`) holding one JSON document per learner. |
| API endpoints | 0 in the product. Optional separate LLM proxy (`server/`): 1 route, `POST /partner-line`, off by default. |
| Server needs | None for the product: any static file host with HTTPS. Optional proxy needs Node.js 22. |
| Browser support | Current Chrome, Edge, Safari (iOS 16+), Firefox. Speech recognition needs Chrome, Edge or Safari; Type mode works everywhere. |
| Languages | English interface. Arabic/RTL is not implemented. |
| Package size | About 2.3 MB source package; about 110 kB gzipped initial JavaScript. |
| Hosting estimate | Static hosting only; no paid server or database is required by the product. Costs depend on the host chosen. |
| Node.js for building | 22.x |
| Live demo | https://learnerscare-grammar-dguh.vercel.app/ (sample unit) |
| Deployment routes | (1) static hosting of `dist/` (verified on Vercel); (2) Docker Compose with nginx (`docker-compose.yml`, written and not built during development). |
