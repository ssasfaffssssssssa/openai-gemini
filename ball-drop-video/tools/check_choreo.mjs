import fs from 'fs';
import { buildChoreo, ballState, R, PAD_DIMS, padType, quatFromUp, rotateInv, padCenter, padRecede } from '../src/choreo.js';
const tl = JSON.parse(fs.readFileSync(new URL('../build/timeline.json', import.meta.url)));
const ch = buildChoreo(tl);
const by = {};
for (const h of ch.hits) { (by[h.scene] ||= []).push(h); }
for (const [s, hs] of Object.entries(by)) {
  const ys = hs.map(h => h.p.y), xs = hs.map(h => h.p.x);
  console.log(s.padEnd(7), 'n', hs.length, 'y', Math.max(...ys).toFixed(1), Math.min(...ys).toFixed(1), 'x', Math.min(...xs).toFixed(2), Math.max(...xs).toFixed(2));
}
const pads = [];
for (const h of ch.hits) { const ty = padType(h); if (!ty || !PAD_DIMS[ty]) continue; pads.push({ h, ty, c: padCenter(h, ty), q: quatFromUp(h.n), d: PAD_DIMS[ty] }); }
const hitsBy = new Map();
for (const pd of pads) {
  for (let t = Math.max(3.8, pd.h.t - 6); t < pd.h.t + 6; t += 0.005) {
    if (Math.abs(pd.h.t - t) < 0.06) continue;
    const b = ballState(ch, t); if (b.hidden) continue;
    if (pd.ty === 'smash' && t > pd.h.t) continue;
    const zc = pd.c.z + padRecede(t - pd.h.t, pd.ty);
    const l = rotateInv(pd.q, { x: b.p.x - pd.c.x, y: b.p.y - pd.c.y, z: b.p.z - zc });
    const cx = Math.max(-pd.d[0], Math.min(pd.d[0], l.x)), cy = Math.max(-pd.d[1], Math.min(pd.d[1], l.y)), cz = Math.max(-pd.d[2], Math.min(pd.d[2], l.z));
    const dist = Math.hypot(l.x - cx, l.y - cy, l.z - cz);
    if (dist < R * 0.92) { const k = pd.h.i; if (!hitsBy.has(k)) hitsBy.set(k, { pd, t, dist }); }
  }
}
for (const [k, v] of hitsBy) console.log('collide pad', k, v.pd.h.scene, v.pd.ty, 'pad t', v.pd.h.t.toFixed(2), 'ball t', v.t.toFixed(2), 'pen', (R - v.dist).toFixed(2));
console.log('pads colliding:', hitsBy.size, 'of', pads.length);
