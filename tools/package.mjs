// Assembles UPLOAD_READY/ (engine + rights-cleared sample unit, no textbook content) and runs the package gates.
//   node tools/package.mjs            assemble + scans
// Verification from a clean copy and the archive are separate steps (see docs/FINAL_INDEPENDENT_AUDIT.md).
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const OUT = 'UPLOAD_READY';
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);
const copy = (from, to = from, filter) => cpSync(from, join(OUT, to), { recursive: true, filter });
const skip = (src) => !/(__pycache__|node_modules|\.DS_Store)/.test(src);

for (const d of ['src', 'public', 'schema', 'deploy']) copy(d, d, skip);
copy('tools', 'tools', (s) => skip(s) && !/tools\/(peek\.mjs|sheet\.py|screens\.mjs|screens-talk\.mjs)$|unit-001/.test(s));
copy('server', 'server', skip);
copy('content-sample', 'content');
mkdirSync(join(OUT, 'tests')); mkdirSync(join(OUT, 'e2e')); mkdirSync(join(OUT, 'docs'));
for (const t of ['engine.test.ts', 'proxy-limits.test.ts', 'sample-unit.test.tsx', 'scalability.test.tsx']) copy(`tests/${t}`);
copy('e2e/smoke.spec.ts');
for (const f of ['package.json', 'package-lock.json', 'index.html', 'vite.config.ts', 'tsconfig.json', 'tailwind.config.js', 'postcss.config.js',
  '.env.example', '.eslintrc.cjs', '.prettierrc', '.dockerignore', 'Dockerfile', 'playwright.config.ts',
  'README.md', 'CLAUDE.md', 'HowToSetup.md', 'ARCHITECTURE.md', 'DEPLOYMENT.md', 'SECURITY.md', 'PRIVACY.md', 'LICENSING.md', 'LICENSE-NOTE.md', 'DESIGN.md', 'CHANGELOG.md', 'docker-compose.yml', 'TECHNICAL_DETAILS.md', 'SUBMISSION_CHECKLIST.md']) copy(f);
for (const f of ['FINAL_INDEPENDENT_AUDIT.md', 'VIBE96_AUDIT_REPORT.md', 'FUTURE_UNIT_EXPANSION.md', 'BLOCKERS.md', 'SPEECH_TEST_MATRIX.md', 'ISSUE_REGISTER.md', 'MARKETPLACE_LISTING.md']) if (existsSync(`docs/${f}`)) copy(`docs/${f}`);
if (existsSync('docs/marketplace-media')) copy('docs/marketplace-media', 'MARKETPLACE_MEDIA');
writeFileSync(join(OUT, '.gitignore'), 'node_modules\ndist\ntest-results\nplaywright-report\n.env\n');
// the package's browser test is the content-agnostic smoke test; drafts are included so Talk is exercised in review builds only
writeFileSync(join(OUT, 'playwright.config.ts'), `import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4173', trace: 'off', launchOptions: { args: ['--mute-audio'] } },
  webServer: { command: 'npm run build && npm run preview', url: 'http://localhost:4173', reuseExistingServer: true, timeout: 180_000 },
  projects: [{ name: 'mobile', use: { ...devices['Pixel 7'] } }, { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } }],
});
`);
// package.json: drop the script that needs the (excluded) Unit 1 sources
const pkg = JSON.parse(readFileSync(join(OUT, 'package.json'), 'utf8'));
delete pkg.scripts.ingest; delete pkg.scripts['audit:sync']; delete pkg.scripts.screens;
pkg.version = '1.0.0-rc.1';
writeFileSync(join(OUT, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');


/* ---------- layout: the marketplace archive keeps the web application in "React Web App/" and the guides at the top ---------- */
const APP_DIR = 'React Web App';
const ROOT_ITEMS = ['README.md', 'HowToSetup.md', 'CLAUDE.md', 'CHANGELOG.md', 'LICENSE-NOTE.md', 'LICENSING.md', 'PRIVACY.md', 'SECURITY.md',
  'DEPLOYMENT.md', 'DESIGN.md', 'ARCHITECTURE.md', 'TECHNICAL_DETAILS.md', 'SUBMISSION_CHECKLIST.md', 'docker-compose.yml', 'docs', 'MARKETPLACE_MEDIA'];
mkdirSync(join(OUT, APP_DIR));
for (const n of readdirSync(OUT)) {
  if (n === APP_DIR || ROOT_ITEMS.includes(n)) continue;
  renameSync(join(OUT, n), join(OUT, APP_DIR, n));
}
const appNote = '> The web application is in the `React Web App/` folder. Run every command in this guide inside that folder (`cd "React Web App"`).\n\n';
for (const f of ['README.md', 'HowToSetup.md']) writeFileSync(join(OUT, f), appNote + readFileSync(join(OUT, f), 'utf8'));
writeFileSync(join(OUT, 'docker-compose.yml'), readFileSync(join(OUT, 'docker-compose.yml'), 'utf8').replace('build: .', 'build: ./React Web App'));
mkdirSync(join(OUT, '.github', 'workflows'), { recursive: true });
writeFileSync(join(OUT, '.github', 'workflows', 'ci.yml'), `name: CI
on: [push, pull_request]
jobs:
  test-and-build:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: React Web App
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: React Web App/package-lock.json
      - run: npm ci
      - run: npm run lint
      - run: npm test
      - run: npm run build
`);

/* ---------- gates ---------- */
const files = [];
const walk = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? walk(p) : files.push(p); } };
walk(OUT);
const text = files.filter((f) => /\.(ts|tsx|js|mjs|cjs|json|md|html|css|py|yml|yaml|conf|txt|example)$|Dockerfile|\.env|ignore$|rc$/.test(f));
let failed = false;
const fail = (msg) => { failed = true; console.error('GATE FAIL:', msg); };

// 1. restricted textbook content: no sentence of Unit 1's book text or exercises may appear anywhere in the package
if (existsSync('content/units/unit-001/unit.json')) {
  const u = JSON.parse(readFileSync('content/units/unit-001/unit.json', 'utf8'));
  const norm = (s) => s.toLowerCase().replace(/[‘’ʼ`´]/g, "'").replace(/[“”"]/g, '').replace(/\s+/g, ' ').trim();
  const sentences = new Set();
  const add = (s) => { for (const part of String(s).replace(/\([^)]*\)/g, ' ').split(/(?<=[.?!])\s+/)) { const n = norm(part).replace(/[.?!]+$/, ''); if (n.split(' ').length >= 4 && !/______/.test(n)) sentences.add(n); } };
  for (const sec of u.sections) for (const b of sec.book) if (b.kind !== 'table') add(b.text);
  for (const e of u.exercises) { for (const o of e.options ?? []) add(o.text); for (const i of e.items) { add(i.prompt.replace(/______/g, ' ')); for (const a of i.answerSentences ?? []) add(a); } }
  const hits = [];
  for (const f of text) { const body = norm(readFileSync(f, 'utf8')); for (const s of sentences) if (body.includes(s)) hits.push(`${relative(OUT, f)}: "${s.slice(0, 40)}…"`); }
  console.log(`restricted-content scan: ${sentences.size} textbook sentences checked against ${text.length} text files → ${hits.length} hit(s)`);
  if (hits.length) fail(`textbook text found in the package:\n  ${hits.slice(0, 12).join('\n  ')}`);
}
// 2. forbidden files
const banned = files.filter((f) => /\.(pdf|pptx|mp3|wav|bundle|zip|pem|key)$|(^|\/)\.env$|unit-001|docs\/screens|coverage-report/.test(f));
console.log(`forbidden-file scan: ${banned.length} hit(s)`);
if (banned.length) fail(`files that must not ship: ${banned.slice(0, 10).join(', ')}`);
// 3. secrets
const secret = /(sk-ant-[A-Za-z0-9_-]{10,}|sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|xox[baprs]-[A-Za-z0-9-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|AIza[0-9A-Za-z_-]{35})/;
const leaks = text.filter((f) => !f.endsWith('package-lock.json') && secret.test(readFileSync(f, 'utf8')));
console.log(`secrets scan: ${leaks.length} hit(s)`);
if (leaks.length) fail(`possible secrets in: ${leaks.join(', ')}`);
// 4. required files
const required = ['README.md', 'CLAUDE.md', 'HowToSetup.md', 'ARCHITECTURE.md', 'DEPLOYMENT.md', 'SECURITY.md', 'PRIVACY.md', 'LICENSING.md', 'LICENSE-NOTE.md', 'DESIGN.md', 'CHANGELOG.md',
  'docker-compose.yml', '.github/workflows/ci.yml',
  `${APP_DIR}/package.json`, `${APP_DIR}/package-lock.json`, `${APP_DIR}/index.html`, `${APP_DIR}/vite.config.ts`, `${APP_DIR}/tsconfig.json`,
  `${APP_DIR}/.env.example`, `${APP_DIR}/content/index.json`, `${APP_DIR}/src/main.tsx`, `${APP_DIR}/src/App.tsx`, `${APP_DIR}/public/manifest.webmanifest`,
  `${APP_DIR}/server/proxy.mjs`, `${APP_DIR}/Dockerfile`];
const missing = required.filter((f) => !existsSync(join(OUT, f)));
if (missing.length) fail(`missing required files: ${missing.join(', ')}`);
const bytes = files.reduce((n, f) => n + statSync(f).size, 0);
console.log(`${OUT}: ${files.length} files, ${(bytes / 1048576).toFixed(2)} MB`);
process.exit(failed ? 1 : 0);
