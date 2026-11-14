/** Content-agnostic smoke test: works with whatever unit is first in content/index.json (used in the distributable package). */
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync('content/index.json', 'utf8'));
const unitId = manifest.units[0].id;
const unit = JSON.parse(readFileSync(`content/units/${unitId}/unit.json`, 'utf8'));

test('map loads, first explanation node plays to the end, an exercise accepts a typed answer, progress persists', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/');
  await expect(page.getByTestId('continue')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(unit.title);
  const first = unit.journey[0];
  await page.getByTestId('continue').click(); // the recommended node bobs gently, so use the stable Start button
  for (let i = 0; i < 30 && !(await page.getByTestId('node-done').count()); i++) {
    await page.getByTestId('next-btn').click();
    await page.waitForTimeout(150);
  }
  await expect(page.getByTestId('node-done')).toBeVisible();
  await page.getByTestId('done-to-map').click();
  await expect(page.getByTestId(`node-${first.id}`)).toHaveAttribute('data-done', '1');

  const ex = unit.exercises.find((e: any) => ['gapFill', 'pictureVerb', 'buildQuestion'].includes(e.type));
  if (ex) {
    await page.goto(`/#/u/${unitId}/n/ex-${ex.id}`);
    const stage = page.getByTestId('item-stage');
    for (let i = 0; i < 8; i++) {
      await page.waitForTimeout(200);
      if ((await stage.count()) && (await stage.getAttribute('data-done')) === '0') break;
      await page.getByTestId('next-btn').click();
    }
    const id = await stage.getAttribute('data-item');
    const item = ex.items.find((x: any) => x.id === id);
    if (!(await page.getByTestId('type-input').count())) await page.getByTestId('mode-toggle').click();
    await page.getByTestId('type-input').fill(item.acceptedAnswers[0]);
    await page.getByTestId('check-btn').click();
    await expect(page.getByTestId('feedback-right')).toBeVisible();
    await expect(page.getByTestId('official-card')).toContainText(item.officialAnswer.split(' / ')[0]);
  }
  await page.waitForTimeout(400);
  await page.goto('/');
  await page.reload();
  await expect(page.getByTestId(`node-${first.id}`)).toHaveAttribute('data-done', '1');
  expect(errors).toEqual([]);
});
