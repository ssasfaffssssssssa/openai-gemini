// Real time t -> scene time tau, camera path, shared helpers.
// Every visual is a pure function of (t, tau), so the rewind is literally tau running backwards.
import * as THREE from 'three';

export const T = {
  FREEZE: 26, REWIND: 28, REW_END: 42, END: 57,
  SHATTER: 20, MEET: 47,
  // finale: crane up over the hole until its disk reads as a golden ring, the reunited light
  // settles on it like a diamond, the title is written inside the shadow, one last tick
  CRANE0: 48.4, CRANE1: 53.4, DIAMOND: 53.0, TITLE: 53.45, LAST_TICK: 55.6, FADE0: 55.6,
  REW_SPEED: 20 / 14, // scene seconds per real second while rewinding
};

export function tauAt(t) {
  if (t < T.FREEZE) return t;
  if (t < T.REWIND) return T.FREEZE;
  if (t < T.REW_END) return T.FREEZE - (t - T.REWIND) * T.REW_SPEED;
  return 6 + (t - T.REW_END) * 0.35;
}
export function mode(t) {
  if (t < T.FREEZE) return 'play';
  if (t < T.REWIND) return 'freeze';
  if (t < T.REW_END) return 'rewind';
  return 'play';
}

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, u) => a + (b - a) * u;
export const smooth = (a, b, x) => { const u = clamp((x - a) / (b - a)); return u * u * (3 - 2 * u); };
export const ease = (u) => { u = clamp(u); return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; };
export const easeOut = (u) => 1 - Math.pow(1 - clamp(u), 3);

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------- places
export const P = {
  T_POS: V(9.0, 4.0, 22.0),          // the hand-written "t"
  L0: V(9.75, 4.45, 21.3),           // the two lights in act 1
  L1: V(6.4, 3.1, 13.6),             // the two lights near the clock
  CLOCK: V(7.0, 3.6, 11.2),
  CLOCK_R: 2.7,
  MEET_CAM: V(11.0, 5.4, 30.0),
};
P.MEET = P.MEET_CAM.clone().multiplyScalar(0.42);   // lovers meet right in front of the black hole

// ---------------------------------------------------------------- camera keys (by tau)
const KEYS_LAND = [   // landscape (16:9, scope letterbox) framings; fov is vertical
  [0.0, V(9.35, 4.15, 26.0), V(9.35, 4.12, 22.0), 30],
  [4.1, V(9.35, 4.15, 25.45), V(9.35, 4.12, 22.0), 30],
  [6.4, V(8.6, 4.6, 31.5), V(6.3, 3.0, 17.0), 34],
  [9.5, V(6.2, 3.0, 37.0), V(2.8, 0.5, 0.0), 30],
  [13.0, V(4.4, 2.0, 27.5), V(1.8, 0.3, 0.0), 30],
  [16.2, V(2.6, 1.15, 15.0), V(0.5, 0.1, 0.0), 34],
  // one continuous pull-back through the swarm that becomes the clock; it locks as the camera settles
  [19.0, V(0.8, 4.0, 25.6), V(3.5, 3.3, 5.6), 36],
  [20.0, V(1.4, 3.9, 23.9), V(3.8, 3.3, 6.0), 35],
  [22.0, V(8.2, 3.6, 25.5), V(3.6, 1.9, 3.5), 32],
  [26.0, V(5.6, 2.4, 19.5), V(2.0, 0.6, 2.0), 34],
];
const KEYS_PORT = [   // portrait (9:16) framings
  [0.0, V(9.3, 4.05, 26.6), V(9.3, 4.0, 22.0), 46],
  [4.1, V(9.32, 4.1, 25.7), V(9.32, 4.02, 22.0), 46],
  [6.4, V(8.6, 4.8, 31.5), V(6.6, 3.0, 17.0), 48],
  [9.5, V(5.6, 3.2, 33.0), V(3.6, 0.6, 0.0), 50],
  [13.0, V(4.2, 2.3, 26.5), V(2.4, 0.3, 0.0), 50],
  [16.2, V(2.8, 1.25, 15.5), V(0.7, 0.1, 0.0), 52],
  [19.0, V(8.6, 4.4, 27.0), V(6.2, 2.6, 8.0), 50],
  [20.0, V(8.3, 4.3, 25.6), V(6.0, 2.6, 8.0), 49],
  [22.0, V(7.8, 3.3, 24.5), V(3.6, 1.3, 3.5), 50],
  [26.0, V(5.6, 2.5, 20.0), V(2.0, 0.6, 2.0), 50],
];
let KEYS = KEYS_LAND;
let FOV_END = 30;
// final "ring" framing, in spherical coordinates around the hole (degrees, distance)
const RING_LAND = { az: 9, el: 58, d: 40 };
const RING_PORT = { az: 9, el: 58, d: 37 };
let RING = RING_LAND;
export function setPortrait(portrait) {
  KEYS = portrait ? KEYS_PORT : KEYS_LAND;
  FOV_END = portrait ? 44 : 30;
  RING = portrait ? RING_PORT : RING_LAND;
  P.CLOCK_R = portrait ? 3.1 : 2.7;
}
const D2R = Math.PI / 180;
const toSph = (p) => { const d = p.length(); return { az: Math.atan2(p.x, p.z) / D2R, el: Math.asin(p.y / d) / D2R, d }; };
const fromSph = (s) => V(Math.cos(s.el * D2R) * Math.sin(s.az * D2R), Math.sin(s.el * D2R), Math.cos(s.el * D2R) * Math.cos(s.az * D2R)).multiplyScalar(s.d);
// the ring camera at time t (after the crane): a slow push-in on the final image
function ringCam(t) {
  return { ...RING, d: RING.d * (1 - 0.085 * smooth(T.CRANE1 - 0.6, T.END, t)) };
}
// world-space anchors on the final image: the top of the golden ring (the "diamond") and the
// centre of the shadow (the title). Both sit just in front of the hole so they never parallax off it.
export function ringAnchors() {
  const pos = fromSph(RING);
  const fwd = pos.clone().negate().normalize();
  const right = fwd.clone().cross(V(0, 1, 0)).normalize();
  const up = right.clone().cross(fwd);
  const d = RING.d * 0.88;
  return {
    diamond: pos.clone().add(fwd.clone().add(up.clone().multiplyScalar(0.104)).normalize().multiplyScalar(d)),
    title: pos.clone().add(fwd.clone().multiplyScalar(d)),
    scale: d / RING.d,          // world size at the anchor per unit of size at the hole
    fwd, right, up,
  };
}
function catmull(p0, p1, p2, p3, u) {
  const u2 = u * u, u3 = u2 * u;
  return p1.clone().multiplyScalar(2)
    .add(p2.clone().sub(p0).multiplyScalar(u))
    .add(p0.clone().multiplyScalar(2).sub(p1.clone().multiplyScalar(5)).add(p2.clone().multiplyScalar(4)).sub(p3).multiplyScalar(u2))
    .add(p1.clone().multiplyScalar(3).sub(p0).sub(p2.clone().multiplyScalar(3)).add(p3).multiplyScalar(u3))
    .multiplyScalar(0.5);
}
export function camByTau(tau) {
  const k = KEYS;
  if (tau <= k[0][0]) return { pos: k[0][1].clone(), look: k[0][2].clone(), fov: k[0][3] };
  if (tau >= k[k.length - 1][0]) { const e = k[k.length - 1]; return { pos: e[1].clone(), look: e[2].clone(), fov: e[3] }; }
  let i = 0;
  while (tau > k[i + 1][0]) i++;
  const a = k[Math.max(0, i - 1)], b = k[i], c = k[i + 1], d = k[Math.min(k.length - 1, i + 2)];
  const u = ease((tau - b[0]) / (c[0] - b[0]));
  return { pos: catmull(a[1], b[1], c[1], d[1], u), look: catmull(a[2], b[2], c[2], d[2], u), fov: lerp(b[3], c[3], u) };
}

export function cameraAt(t) {
  const tau = tauAt(t);
  let c = camByTau(tau);
  if (t >= T.FREEZE && t < T.REWIND) {
    // bullet time: orbit around the frozen swarm and come back
    const u = (t - T.FREEZE) / (T.REWIND - T.FREEZE);
    const s = Math.sin(Math.PI * ease(u));
    const focus = V(2.8, 1.1, 5.0);
    const off = c.pos.clone().sub(focus);
    off.applyAxisAngle(V(0, 1, 0), -0.75 * s);
    off.multiplyScalar(1 + 0.45 * s);
    off.y += 2.5 * s;
    c = { pos: focus.clone().add(off), look: c.look.clone().lerp(focus, s * 0.6), fov: c.fov + 6 * s };
  }
  if (t >= T.REW_END) {
    const u = ease((t - T.REW_END) / 3.2);
    const look = P.MEET.clone().add(V(0, 0.9, 0));
    const pos = P.MEET_CAM.clone().lerp(P.MEET, smooth(44, 50, t) * 0.24);
    c = { pos: c.pos.lerp(pos, u), look: c.look.lerp(look, u), fov: lerp(c.fov, FOV_END, u) };
    // the crane: rise over the hole on a sphere around it, the disk opens into a ring
    const k = ease(clamp((t - T.CRANE0) / (T.CRANE1 - T.CRANE0)));
    if (k > 0) {
      const s0 = toSph(c.pos), s1 = ringCam(t);
      c.pos = fromSph({ az: lerp(s0.az, s1.az, k), el: lerp(s0.el, s1.el, k), d: lerp(s0.d, s1.d, k) });
      c.look = c.look.lerp(V(0, 0, 0), Math.min(1, k * 1.15));
    }
  }
  // impacts: the clock locking (tau 19) and shattering (tau 20) shake the camera; keyed by tau, so the
  // rewind plays them backwards too
  const sh = 0.045 * (tau > 19 ? Math.exp(-(tau - 19) * 9) : 0) + 0.11 * (tau > 20 ? Math.exp(-(tau - 20) * 6) : 0);
  if (sh > 1e-4) {
    c.pos.add(V(Math.sin(tau * 71.3), Math.sin(tau * 53.7 + 1.3), Math.sin(tau * 61.1 + 2.1)).multiplyScalar(sh));
    c.look.add(V(Math.sin(tau * 47.9 + 0.4), Math.sin(tau * 66.2 + 2.2), 0).multiplyScalar(sh * 0.6));
  }
  // gentle handheld float (settles on the final image)
  const still = 1 - 0.8 * smooth(T.CRANE1 - 1.0, T.CRANE1 + 0.6, t);
  c.pos.x += (Math.sin(t * 0.7) * 0.05 + Math.sin(t * 1.9) * 0.015) * still;
  c.pos.y += Math.sin(t * 0.53 + 1) * 0.04 * still;
  return c;
}

// ---------------------------------------------------------------- weak-field lens (CPU twin of the GLSL chunk)
export function lensPoint(p, cam, sign = 1) {
  const n = cam.clone().negate();
  const Dl = n.length(); n.divideScalar(Dl);
  const cp = p.clone().sub(cam);
  const Ds = cp.dot(n);
  const bvec = cp.clone().sub(n.clone().multiplyScalar(Ds));
  const b = bvec.length();
  const behind = smooth(Dl * 0.92, Dl * 1.08, Ds);
  const beta = b / Math.max(Ds, 1e-3);
  const thE2 = 2 * Math.max(Ds - Dl, 0) / (Dl * Math.max(Ds, 1e-3));
  const disc = Math.sqrt(beta * beta + 4 * thE2);
  const th = sign > 0 ? 0.5 * (beta + disc) : 0.5 * (beta - disc);
  const dir = b > 1e-6 ? bvec.divideScalar(b) : V(0, 1, 0);
  const np = cam.clone().add(n.multiplyScalar(Ds)).add(dir.multiplyScalar(th * Ds));
  const out = p.clone().lerp(np, behind);
  const shadow = Math.abs(th) * Dl < 2.75 && behind > 0.5;
  return { p: out, visible: !shadow, behind };
}

// GLSL version used by every lensed shader (camera = cameraPosition, hole at origin).
export const LENS_GLSL = /* glsl */ `
uniform float uSign;
vec3 lensP(vec3 P, out float vis) {
  vec3 C = cameraPosition;
  vec3 n = -C; float Dl = length(n); n /= Dl;
  vec3 CP = P - C; float Ds = dot(CP, n);
  vec3 bv = CP - n * Ds; float b = length(bv);
  float behind = smoothstep(Dl * 0.92, Dl * 1.08, Ds);
  float beta = b / max(Ds, 1e-3);
  float thE2 = 2.0 * max(Ds - Dl, 0.0) / (Dl * max(Ds, 1e-3));
  float disc = sqrt(beta * beta + 4.0 * thE2);
  float th = uSign > 0.0 ? 0.5 * (beta + disc) : 0.5 * (beta - disc);
  vec3 dir = b > 1e-6 ? bv / b : vec3(0.0, 1.0, 0.0);
  vec3 np = C + n * Ds + dir * (th * Ds);
  float shadow = step(abs(th) * Dl, 2.75) * step(0.5, behind);
  vis = (1.0 - shadow) * (uSign > 0.0 ? 1.0 : behind * 0.55);
  return mix(P, np, behind);
}`;

// ---------------------------------------------------------------- spiral infall used by particles / lights
export function spiralIn(p0, s, turns = 2.4, rEnd = 1.0) {
  const R0 = Math.hypot(p0.x, p0.z);
  const phi0 = Math.atan2(p0.z, p0.x);
  const R = lerp(R0, rEnd, Math.pow(clamp(s), 1.25));
  const phi = phi0 + turns * (Math.sqrt(R0 / Math.max(R, 0.3)) - 1);
  return V(R * Math.cos(phi), p0.y * Math.pow(1 - clamp(s), 1.8), R * Math.sin(phi));
}
