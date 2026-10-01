// Deterministic offline render: headless Chromium draws each frame at an exact
// timestamp, raw pixels are piped into ffmpeg, then the soundtrack is muxed in.
//   node render.mjs --w 1080 --h 1920 --fps 30 --workers 2 --out build/ball-drop.mp4
import { chromium } from 'playwright-core';
import { spawn, execFileSync } from 'child_process';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { serve } from './tools/server.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? a.concat([[v.slice(2), arr[i + 1]]]) : a), []));
const W = +(args.w || 1080), H = +(args.h || 1920), FPS = +(args.fps || 30);
const WORKERS = +(args.workers || 1);
const OUT = args.out || 'build/t-minus-t.mp4';
const BH = args.bh || '0.6';
const CRF = args.crf || '17';
const ROOT = path.dirname(new URL(import.meta.url).pathname);
const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const DURATION = 51 * (0.2520 / 0.25);
const total = Math.ceil(DURATION * FPS);
const startAt = Date.now();
fs.mkdirSync(path.join(ROOT, 'build/segments'), { recursive: true });

async function worker(id, f0, f1) {
  const seg = path.join(ROOT, `build/segments/seg${id}.mp4`);
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-',
    '-vf', 'vflip', '-c:v', 'libx264', '-preset', 'medium', '-crf', CRF, '-pix_fmt', 'yuv420p', seg], { stdio: ['pipe', 'inherit', 'inherit'] });
  const port = 8200 + id;
  let done = 0;
  // frame sink: the page POSTs raw RGBA buffers here
  const sink = http.createServer((q, s) => {
    const chunks = [];
    q.on('data', (d) => chunks.push(d));
    q.on('end', () => {
      const buf = Buffer.concat(chunks);
      const ok = ff.stdin.write(buf);
      done++;
      s.setHeader('Access-Control-Allow-Origin', '*');
      if (ok) s.end('ok'); else ff.stdin.once('drain', () => s.end('ok'));
    });
  });
  await new Promise((r) => sink.listen(port + 100, r));
  const srv = await serve(ROOT, port);
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-web-security'] });
  const page = await browser.newPage({ viewport: { width: Math.min(W, 1080), height: Math.min(H, 1920) } });
  page.on('pageerror', (e) => console.log(`[w${id}] pageerror`, e.message));
  await page.goto(`http://localhost:${port}/src/index.html?w=${W}&h=${H}&bh=${BH}`);
  await page.waitForFunction('window.ready || window.setupError', null, { timeout: 180000 });
  const err = await page.evaluate('window.setupError');
  if (err) throw new Error(err);
  const timer = setInterval(() => {
    const el = (Date.now() - startAt) / 1000;
    console.log(`[w${id}] ${done}/${f1 - f0} frames, ${(el / Math.max(1, done)).toFixed(2)} s/frame`);
  }, 60000);
  await page.evaluate(async ({ f0, f1, fps, sinkPort }) => {
    let pending = null;
    // warm up the echo-trail feedback buffer so segments join seamlessly
    for (let f = Math.max(0, f0 - 8); f < f0; f++) await window.renderFrame(f / fps);
    for (let f = f0; f < f1; f++) {
      await window.renderFrame(f / fps);
      const buf = window.readFrame();
      if (pending) await pending;
      pending = fetch(`http://localhost:${sinkPort}/frame`, { method: 'POST', body: buf });
    }
    if (pending) await pending;
  }, { f0, f1, fps: FPS, sinkPort: port + 100 });
  clearInterval(timer);
  await browser.close();
  srv.close(); sink.close();
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  console.log(`[w${id}] finished ${f1 - f0} frames`);
  return seg;
}

const per = Math.ceil(total / WORKERS);
const segs = await Promise.all(Array.from({ length: WORKERS }, (_, i) => worker(i, i * per, Math.min(total, (i + 1) * per))));
const list = path.join(ROOT, 'build/segments/list.txt');
fs.writeFileSync(list, segs.map((s) => `file '${s}'`).join('\n'));
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-i', path.join(ROOT, 'build/music.wav'),
  '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', path.join(ROOT, OUT)]);
console.log(`done: ${OUT} (${total} frames, ${((Date.now() - startAt) / 60000).toFixed(1)} min)`);
