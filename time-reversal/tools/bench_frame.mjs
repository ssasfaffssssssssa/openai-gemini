import { fileURLToPath } from 'url';
import { chromium } from 'playwright-core'; import path from 'path'; import { serve } from './server.mjs';
const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const srv = await serve(root, 8140);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
await p.goto(`http://localhost:8140/src/index.html?w=1080&h=1920&bh=${process.argv[2] || 0.6}`);
await p.waitForFunction('window.ready || window.setupError', null, { timeout: 180000 });
for (const t of [10, 15, 21, 30, 47]) {
  const t0 = Date.now();
  await p.evaluate(async (tt) => { await window.renderFrame(tt); window.readFrame(); }, t);
  console.log('t', t, Date.now() - t0, 'ms');
}
await b.close(); srv.close();
