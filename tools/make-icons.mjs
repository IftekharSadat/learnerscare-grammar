// Renders public/icons/icon.svg to the PNG sizes the web manifest needs (uses the pre-installed Chromium).
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const svg = readFileSync('public/icons/icon.svg', 'utf8');
const b = await chromium.launch();
for (const [name, size, pad] of [['icon-192', 192, 0], ['icon-512', 512, 0], ['icon-maskable-512', 512, 0.12]]) {
  const p = await b.newPage({ viewport: { width: size, height: size } });
  await p.setContent(`<body style="margin:0;background:#14184A;display:grid;place-items:center;height:100vh"><div style="width:${size * (1 - 2 * pad)}px;height:${size * (1 - 2 * pad)}px">${svg}</div></body>`);
  await p.screenshot({ path: `public/icons/${name}.png` });
  await p.close();
}
await b.close();
console.log('icons written');
