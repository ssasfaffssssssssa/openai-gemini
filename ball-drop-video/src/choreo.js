// Beat choreography: turns the music timeline into a ballistic ball path that
// touches a pad exactly on every hit. Pure JS (no three.js) so it runs in node too.

export const G = 24;      // gravity, units/s^2
export const R = 0.32;    // ball radius

const vec = (x = 0, y = 0, z = 0) => ({ x, y, z });
const add = (a, b) => vec(a.x + b.x, a.y + b.y, a.z + b.z);
const sub = (a, b) => vec(a.x - b.x, a.y - b.y, a.z - b.z);
const mul = (a, s) => vec(a.x * s, a.y * s, a.z * s);
const len = (a) => Math.hypot(a.x, a.y, a.z);
const norm = (a) => { const l = len(a) || 1; return mul(a, 1 / l); };

export function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// Bedroom layout (local coordinates, floor at y=0). Shared with the scene builder.
export const HOME = {
  shelfY: 2.45,
  items: [ // top surface heights of things on the shelf
    { x: -1.15, top: 2.45 + 0.42, kind: 'clock' },
    { x: -0.78, top: 2.45 + 0.30, kind: 'books' },
    { x: -0.42, top: 2.45 + 0.36, kind: 'mug' },
  ],
  floorHit: vec(-0.85, R, 0.35),
  footboard: { x: -0.32, top: 0.98 },
  bedTop: 0.8,
  pillow: { x: 1.55, top: 0.9 },
  bedZ: -0.55,
};

export function buildChoreo(tl) {
  const S = tl.sections;
  const hits = tl.hits.map((h, i) => ({ ...h, i }));

  // Bedroom origin: far away from the cabaret, reached through a camera cut.
  let homeOrigin = null;

  let prev = null;
  let side = 1;
  let fCount = 0, gCount = 0;
  for (const h of hits) {
    const t0 = prev ? prev.t + (prev.hold || 0) : 0;
    const dt = h.t - t0;
    const newScene = !prev || prev.scene !== h.scene;
    const stepY = (k) => prev.p.y - k * G * dt * dt;
    const pz = (amp) => (h.i % 2 ? -amp : amp);

    if (h.kind === 'launch') {
      h.p = vec(-2.6, R, 0);
      h.hold = 0;
    } else if (h.scene === 'mozart') {
      const k = newScene ? 0.3 : 0.2;
      h.p = vec((h.pitch - 67) * 0.27 - 0.2, stepY(k), pz(0.18));
    } else if (h.scene === 'cave') {
      if (h.kind === 'wall') {
        const W = 1.25;
        side = prev.p.x > 0 ? -1 : 1;
        h.p = vec(side * (W - R), prev.p.y - 0.42, 0);
      } else if (h.kind === 'smash') {
        h.p = vec(0, prev.p.y - (prev.kind === 'smash' ? 0.95 : 1.4), 0);
      } else {
        side = -side;
        const k = newScene ? 0.42 : 0.2;
        h.p = vec(side * (0.45 + ((h.pitch % 7) / 7) * 1.05), stepY(k), pz(0.25));
      }
    } else if (h.scene === 'cancan') {
      if (h.kind === 'kick') {
        h.p = vec(0.1, stepY(0.2), 0);
      } else {
        side = -side;
        const k = newScene ? 0.42 : 0.2;
        h.p = vec(side * (0.5 + ((h.pitch % 5) / 5) * 0.35), stepY(k), pz(0.2));
      }
    } else if (h.scene === 'home') {
      if (!homeOrigin) {
        const kick = hits.find((x) => x.kind === 'kick');
        homeOrigin = add(kick.p, vec(16, -42, 0));
      }
      const O = homeOrigin;
      const Z = HOME.bedZ;
      if (h.pitch === 67) { // G G G on the shelf items
        const it = HOME.items[gCount++];
        h.p = add(O, vec(it.x, it.top + R, -1.55));
      } else if (h.pitch === 63) { // Eb: slam onto the rug, hold through the fermata
        h.p = add(O, HOME.floorHit);
      } else if (h.pitch === 65) { // F F F across the bed
        const xs = [HOME.footboard.x, 0.42, 1.0];
        const ys = [HOME.footboard.top, HOME.bedTop, HOME.bedTop];
        h.p = add(O, vec(xs[fCount], ys[fCount] + R, Z));
        fCount++;
      } else { // D: lands on the pillow, stays there
        h.p = add(O, vec(HOME.pillow.x, HOME.pillow.top + R - 0.06, Z));
      }
    }
    prev = h;
  }

  // Holds (ball resting) for the Eb fermata and the final landing.
  const eb = hits.find((h) => h.scene === 'home' && h.pitch === 63);
  const f1 = hits.find((h) => h.scene === 'home' && h.pitch === 65);
  eb.hold = f1.t - 0.5 - eb.t;
  const last = hits[hits.length - 1];
  last.hold = tl.duration - last.t + 1;

  // Kick: ball flies away (camera cut), then re-enters above the bedroom.
  const kick = hits.find((h) => h.kind === 'kick');
  const homeFirst = hits.find((h) => h.scene === 'home');
  const tAway = kick.t + 1.45;
  const away = { t: tAway, kind: 'away', scene: 'cancan', p: add(kick.p, vec(3.5, 13, -30)), virtual: true };
  const warp = { t: homeFirst.t - 0.55, kind: 'warp', scene: 'home', p: add(homeFirst.p, vec(-0.5, 3.5, 0.3)), virtual: true };
  away.hold = warp.t - away.t;
  away.hidden = true;
  const all = [];
  for (const h of hits) {
    if (h === homeFirst) all.push(away, warp);
    all.push(h);
  }

  // Segments.
  const segs = [];
  segs.push({ t0: -1, t1: all[0].t, p0: all[0].p, hold: true });
  for (let i = 0; i < all.length; i++) {
    const a = all[i];
    const ts = a.t + (a.hold || 0);
    if (a.hold) segs.push({ t0: a.t, t1: ts, p0: a.p, hold: true, hidden: !!a.hidden });
    const b = all[i + 1];
    if (!b) break;
    if (b.t - ts <= 1e-6) continue;
    const T = b.t - ts;
    const v0 = vec((b.p.x - a.p.x) / T, (b.p.y - a.p.y) / T + 0.5 * G * T, (b.p.z - a.p.z) / T);
    segs.push({ t0: ts, t1: b.t, p0: a.p, v0, from: a, to: b });
  }

  // Normals + incoming/outgoing velocity per hit.
  for (const h of hits) {
    const segIn = segs.find((s) => s.to === h);
    const segOut = segs.find((s) => s.from === h && !s.hold);
    const vin = segIn ? vec(segIn.v0.x, segIn.v0.y - G * (segIn.t1 - segIn.t0), segIn.v0.z) : vec();
    const vout = segOut && Math.abs(segOut.t0 - h.t) < 1e-6 ? segOut.v0 : vec();
    h.vin = vin;
    h.vout = vout;
    let n = sub(vout, vin);
    if (len(n) < 1e-3) n = vec(0, 1, 0);
    h.n = norm(n);
    h.speed = len(vin);
  }

  return { hits, all, segs, homeOrigin, G, R, tAway, warpT: warp.t };
}

export function segAt(ch, t) {
  const segs = ch.segs;
  // binary search
  let lo = 0, hi = segs.length - 1;
  if (t <= segs[0].t0) return segs[0];
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (segs[mid].t0 <= t) lo = mid; else hi = mid - 1;
  }
  return segs[lo];
}

export function ballState(ch, t) {
  const s = segAt(ch, t);
  if (s.hold || t >= s.t1 && !s.v0) return { p: s.p0, v: vec(), hidden: !!s.hidden, seg: s };
  const tau = Math.min(Math.max(t - s.t0, 0), s.t1 - s.t0);
  const p = vec(s.p0.x + s.v0.x * tau, s.p0.y + s.v0.y * tau - 0.5 * G * tau * tau, s.p0.z + s.v0.z * tau);
  const v = vec(s.v0.x, s.v0.y - G * tau, s.v0.z);
  return { p, v, hidden: false, seg: s };
}

// Pad dimensions (half extents in the pad frame, whose +Y is the bounce normal).
export const PAD_DIMS = {
  key: [0.16, 0.09, 0.5],
  rock: [0.4, 0.15, 0.34],
  wall: [0.42, 0.08, 0.42],
  smash: [0.62, 0.12, 0.5],
  drum: [0.44, 0.17, 0.44],
};

export function padType(h) {
  if (h.scene === 'mozart') return 'key';
  if (h.scene === 'cave') return h.kind === 'wall' ? 'wall' : h.kind === 'smash' ? 'smash' : 'rock';
  if (h.scene === 'cancan') return h.kind === 'kick' ? 'shoe' : 'drum';
  return null;
}

// Quaternion rotating +Y onto n (same convention as THREE.Quaternion.setFromUnitVectors).
export function quatFromUp(n) {
  const r = n.y + 1;
  if (r < 1e-6) return [1, 0, 0, 0];
  const q = [n.z, 0, -n.x, r]; // x,y,z,w for cross((0,1,0), n) = (n.z, 0, -n.x)
  const l = Math.hypot(...q);
  return q.map((v) => v / l);
}

export function rotateInv(q, v) {
  // rotate v by conjugate of q
  const [x, y, z, w] = [-q[0], -q[1], -q[2], q[3]];
  const ix = w * v.x + y * v.z - z * v.y;
  const iy = w * v.y + z * v.x - x * v.z;
  const iz = w * v.z + x * v.y - y * v.x;
  const iw = -x * v.x - y * v.y - z * v.z;
  return {
    x: ix * w + iw * -x + iy * -z - iz * -y,
    y: iy * w + iw * -y + iz * -x - ix * -z,
    z: iz * w + iw * -z + ix * -y - iy * -x,
  };
}

export function padCenter(h, type) {
  const d = PAD_DIMS[type];
  const off = R + (d ? d[1] : 0.1);
  return { x: h.p.x - h.n.x * off, y: h.p.y - h.n.y * off, z: h.p.z - h.n.z * off };
}

// After being hit, pads recede into the background (and stay lit), which keeps
// the ball's later path clear. Returns z offset for time since the hit.
export function padRecede(dt, type) {
  if (type === 'wall' || type === 'shoe' || dt <= 0.05) return 0;
  const x = Math.min(1, (dt - 0.05) / 0.32);
  const e = x * x * (3 - 2 * x);
  return -2.2 * e;
}
