// Release checks against a running production preview (default build: approved Talk turns only).
//   node tools/verify-release.mjs [baseUrl=http://localhost:4173] [unitId=unit-001]
// Checks: real installability (Chrome DevTools Protocol), service worker, 360 px layout overflow on key routes,
// and the Talk level in Type mode through every shipped scene to the summary + unlocked completion.
import { chromium } from 'playwright';
const base = process.argv[2] ?? 'http://localhost:4173';
const unitId = process.argv[3] ?? 'unit-001';
const out = [];
const log = (name, ok, detail = '') => { out.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`); };
const browser = await chromium.launch();

// 1. installability + service worker
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(base + '/');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  const cdp = await ctx.newCDPSession(page);
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
  const manifest = await cdp.send('Page.getAppManifest');
  const errs = installabilityErrors.map((e) => e.errorId);
  log('PWA installability (Page.getInstallabilityErrors)', errs.length === 0, errs.join(', ') || 'no errors');
  log('Web app manifest parses', !manifest.errors?.length && !!manifest.url, manifest.url ?? '');
  const sw = await page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.active);
  log('Service worker active and controlling', sw);
  const precache = await page.evaluate(async () => (await caches.keys()).join(', '));
  log('Caches present', /workbox-precache/.test(precache), precache);
  await ctx.close();
}

// 2. 360 px layout
{
  const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, hasTouch: true });
  const page = await ctx.newPage();
  const unit = await (await fetch(`${base}/content/units/${unitId}/unit.json`)).json();
  const routes = ['', 'profile', ...unit.journey.map((n) => `u/${unitId}/n/${n.id}`), `u/${unitId}/n/talk`];
  const bad = [];
  for (const r of routes) {
    await page.goto(`${base}/#/${r}`); await page.reload(); await page.waitForTimeout(500);
    for (let i = 0; i < 3; i++) {
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (overflow > 1) bad.push(`${r} (step ${i}): ${overflow}px`);
      const next = page.getByTestId('next-btn');
      if (!(await next.count()) || !(await next.isEnabled())) break;
      await next.click(); await page.waitForTimeout(250);
    }
  }
  log(`No horizontal overflow at 360 px on ${routes.length} routes`, bad.length === 0, bad.join('; '));
  await ctx.close();
}

// 3. Talk, production content, Type mode
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const res = await fetch(`${base}/content/units/${unitId}/conversation.json`);
  if (!res.ok) log('Talk level present', false, 'no conversation.json');
  else {
    const conv = await res.json();
    const shipped = conv.scenes.map((s) => ({ ...s, turns: s.turns.filter((t) => t.status === 'approved') })).filter((s) => s.turns.length);
    const turns = shipped.flatMap((s) => s.turns);
    await page.goto(`${base}/#/u/${unitId}/n/complete`); await page.reload();
    const seen = (id) => page.getByTestId(id).waitFor({ timeout: 8000 }).then(() => true, () => false);
    if (turns.length) log('Completion is gated on Talk when Talk content ships', await seen('talk-gate'));
    else log('No Talk content ships (all turns await approval): completion is not gated', !(await seen('talk-gate')));
    if (turns.length) {
      await page.getByTestId('gate-to-talk').click();
      await page.getByTestId('use-type').click();
      let played = 0;
      for (let g = 0; g < 200; g++) {
        if (await page.getByTestId('talk-done').count()) break;
        if (await page.getByTestId('scene-intro').count()) { await page.getByTestId('scene-start').click(); continue; }
        if (await page.getByTestId('scene-done').count()) { await page.getByTestId('next-scene').click(); continue; }
        const id = await page.getByTestId('talk-turn').getAttribute('data-turn');
        const t = turns.find((x) => x.id === id);
        await page.getByTestId('talk-input').fill(t.target.canonical);
        await page.getByTestId('talk-send').click();
        await page.getByTestId('talk-next').click(); played++;
        await page.waitForTimeout(60);
      }
      log('Talk (Type mode) plays every shipped turn to the summary', played === turns.length && (await page.getByTestId('speaking-summary').isVisible()), `${played}/${turns.length} turns in ${shipped.length} scene(s)`);
      const withheld = conv.scenes.flatMap((s) => s.turns).length - turns.length;
      log('Unapproved Talk content is withheld and disclosed', withheld === 0 || (await page.getByTestId('talk-withheld').isVisible()), `${withheld} turn(s) withheld`);
      log('No draft turn rendered', (await page.getByTestId('draft-tag').count()) === 0);
      await page.getByTestId('talk-to-complete').click(); await page.waitForTimeout(400);
      log('Completion unlocked after Talk', (await page.getByTestId('talk-gate').count()) === 0);
      await page.goto(`${base}/#/u/${unitId}/n/talk`); await page.reload();
      log('Finished Talk can be replayed', await page.getByTestId('talk-preflight').waitFor({ timeout: 8000 }).then(() => true, () => false));
    }
  }
  log('No page errors during Talk', errors.length === 0, errors.join(' | '));
  await ctx.close();
}
await browser.close();
const failed = out.filter((o) => !o.ok);
console.log(`\n${out.length - failed.length}/${out.length} checks passed`);
process.exit(failed.length ? 1 : 0);
