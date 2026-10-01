import { chromium } from 'playwright-core';
import path from 'path'; import { serve } from '../tools/server.mjs';
const root = path.resolve('.');
const srv = await serve(root, 8131);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const [w, h, extra] of [[648, 1152, '&lx=3.5'], [648, 1152, '&cx=3.5&cy=1.2&cz=16&lx=1.2&ly=0.2']]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  p.on('pageerror', (e) => console.log('err', e.message)); p.on('console', (m) => { if (m.type() === 'error') console.log(m.text().slice(0, 400)); });
  await p.goto(`http://localhost:8131/bench/bh.html?w=${w}&h=${h}${extra}`); await p.waitForFunction('window.ready');
  await p.evaluate('go(1)');
  console.log(w, h, extra, 'ms/frame', (await p.evaluate('go(3)')).toFixed(0));
  await p.locator('canvas').screenshot({ path: `bench/bh_${w}${extra.includes('cz') ? '_close' : ''}.png` });
  await p.close();
}
await b.close(); srv.close();
