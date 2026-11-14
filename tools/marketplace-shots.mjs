// Genuine product screenshots at 1920×1080 for a marketplace listing, captured from a running review build
// (VITE_TALK_INCLUDE_DRAFTS=true so the sample Talk scene is visible, labelled "Draft").
//   node tools/marketplace-shots.mjs [outDir=MARKETPLACE_MEDIA] [baseUrl=http://localhost:4173]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const out = process.argv[2] ?? 'MARKETPLACE_MEDIA';
const base = process.argv[3] ?? 'http://localhost:4173';
mkdirSync(out, { recursive: true });
const manifest = await (await fetch(`${base}/content/index.json`)).json();
const unitId = manifest.units[0].id;
const unit = await (await fetch(`${base}/content/units/${unitId}/unit.json`)).json();
const conv = await (await fetch(`${base}/content/units/${unitId}/conversation.json`)).json();
const turns = conv.scenes.flatMap((s) => s.turns);
// 1280 × 720 CSS pixels at 1.5× = 1920 × 1080 image pixels, with a comfortably large UI
const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--mute-audio'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5, permissions: ['microphone'] });
const page = await ctx.newPage();
await page.addInitScript(() => { window.__mockSpeech = { queue: [], latencies: [] }; });
const tid = (id) => page.getByTestId(id);
const go = async (r) => { await page.goto(`${base}/#/${r}`); await page.reload(); await page.waitForTimeout(800); };
const shot = async (n, name) => { await page.waitForTimeout(700); await page.screenshot({ path: `${out}/screenshot-0${n}-${name}.png` }); console.log(`screenshot-0${n}-${name}.png`); };
const grp = (name) => page.getByRole('group', { name });

// some progress first, so the dashboard is not empty
await go(`u/${unitId}/n/${unit.journey[0].id}`);
while (!(await tid('node-done').count())) { await tid('next-btn').click(); await page.waitForTimeout(150); }
await page.waitForTimeout(700); // let the progress save
await go(''); await shot(1, 'unit-map');

const formNode = unit.journey.find((n) => n.sectionKey === 'A');
await go(`u/${unitId}/n/${formNode.id}`); await tid('next-btn').click(); await page.waitForTimeout(400);
if (await tid('form-lab').count()) {
  await grp('Choose a subject').getByRole('button', { name: 'They', exact: true }).click();
  await grp('Choose the be verb').getByRole('button', { name: 'are', exact: true }).click();
  await tid('form-lab').scrollIntoViewIfNeeded();
}
await shot(2, 'interactive-explanation');

const pn = unit.exercises.find((e) => e.type === 'positiveNegative');
const item = pn.items.find((i) => !i.isExample);
await go(`u/${unitId}/n/ex-${pn.id}`); await tid('next-btn').click();
await page.locator('[data-testid=passage] [data-clue="1"]').first().click();
await tid(`pol-${item.polarity}`).click();
const be = item.tiles[1].t, ving = item.tiles[2].t;
await grp(/^be/).getByRole('button', { name: be, exact: true }).click();
await grp('-ing form').getByRole('button', { name: ving, exact: true }).click();
await tid('check-btn').click(); await tid('understand').waitFor(); await page.evaluate(() => window.scrollTo(0, 0));
await shot(3, 'exercise-feedback');

await go(`u/${unitId}/n/talk`);
await tid('allow-mic').click(); await tid('start-speaking').click(); await tid('scene-start').click();
const speak = async (t) => { await page.locator('[data-testid=talk-turn][data-mic="ready"]').waitFor(); await page.evaluate((x) => window.__mockSpeech.queue.push(x), t); await tid('mic-btn').click(); await tid('talk-verdict').waitFor(); };
const first = turns[0];
await speak(first.target.canonical.replace(/[’]/g, "'")); await shot(4, 'talk-speaking-feedback');
for (let g = 0; g < 80; g++) {
  if (await tid('talk-done').count()) break;
  if (await tid('scene-intro').count()) { await tid('scene-start').click(); continue; }
  if (await tid('scene-done').count()) { await tid('next-scene').click(); continue; }
  if (await tid('talk-verdict').count()) { await tid('talk-next').click(); await page.waitForTimeout(80); continue; }
  const id = await tid('talk-turn').getAttribute('data-turn');
  await speak(turns.find((t) => t.id === id).target.canonical.replace(/[’]/g, "'"));
}
await page.waitForTimeout(2600); await shot(5, 'talk-speaking-summary');
await tid('talk-to-complete').click(); await page.waitForTimeout(500);
while (!(await tid('complete-stage').count())) { await tid('next-btn').click(); await page.waitForTimeout(200); }
await tid('cert-name').fill('Sample Learner'); await page.waitForTimeout(2800); await shot(6, 'completion-certificate');
await go('profile'); await shot(7, 'progress-profile');
await browser.close();
