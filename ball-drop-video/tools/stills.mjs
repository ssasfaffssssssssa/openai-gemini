// Render selected timestamps to PNG for inspection: node tools/stills.mjs 540 960 1.0 5.5 ...
import { chromium } from 'playwright-core';
import fs from 'fs'; import { execSync } from 'child_process'; import path from 'path';
import { serve } from './server.mjs';
const [w, h, ...ts] = process.argv.slice(2);
const root = path.resolve(new URL('..', import.meta.url).pathname);
const srv = await serve(root, 8124);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('page:', m.text()); });
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto(`http://localhost:8124/src/index.html?w=${w}&h=${h}`);
await page.waitForFunction('window.ready || window.setupError', null, { timeout: 120000 });
const err = await page.evaluate('window.setupError'); if (err) { console.log(err); process.exit(1); }
fs.mkdirSync(path.join(root, 'build/stills'), { recursive: true });
for (const t of ts) {
  const t0 = Date.now();
  await page.evaluate((tt) => window.renderFrame(tt), +t);
  const out = path.join(root, `build/stills/t${(+t).toFixed(2)}.png`);
  const b64 = await page.evaluate(() => { const b = window.readFrame(); let s = ''; for (let i = 0; i < b.length; i += 32768) s += String.fromCharCode.apply(null, b.subarray(i, i + 32768)); return btoa(s); });
  const raw = path.join(root, 'build/stills/tmp.rgba');
  fs.writeFileSync(raw, Buffer.from(b64, 'base64'));
  execSync(`python3 -c "from PIL import Image;im=Image.frombytes('RGBA',(${w},${h}),open('${raw}','rb').read()).transpose(Image.FLIP_TOP_BOTTOM).convert('RGB');im.save('${out}')"`);
  console.log(out, Date.now() - t0, 'ms');
}
await browser.close(); srv.close();
