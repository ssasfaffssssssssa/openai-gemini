import * as THREE from 'three';
import { LENS_GLSL, T } from './timeline.js';

// A precision clock face made of ~50k particles. It condenses out of dust,
// ticks on the beat, shatters at T.SHATTER and spirals into the black hole.
// Everything is a function of tau, so the rewind reassembles it for free.

function sampleClock() {
  const pts = []; // x, y, kind, w
  let s = 777;
  const rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  const add = (x, y, kind = 0, w = 1) => pts.push(x, y, kind, w);
  // rims
  for (let i = 0; i < 9000; i++) { const a = rnd() * Math.PI * 2; const r = (rnd() < 0.55 ? 1.0 : 0.955) + (rnd() - 0.5) * 0.012; add(Math.cos(a) * r, Math.sin(a) * r, 0, 1.2); }
  for (let i = 0; i < 1800; i++) { const a = rnd() * Math.PI * 2; const r = 1.085 + (rnd() - 0.5) * 0.006; if (Math.sin(a * 120) > 0.2) add(Math.cos(a) * r, Math.sin(a) * r, 0, 0.8); }
  // minute / hour ticks
  for (let m = 0; m < 60; m++) {
    const a = Math.PI / 2 - m / 60 * Math.PI * 2;
    const hour = m % 5 === 0;
    const n = hour ? 220 : 60;
    for (let i = 0; i < n; i++) {
      const r = (hour ? 0.79 : 0.86) + rnd() * (hour ? 0.13 : 0.06);
      const w = (rnd() - 0.5) * (hour ? 0.035 : 0.012);
      add(Math.cos(a) * r - Math.sin(a) * w, Math.sin(a) * r + Math.cos(a) * w, 0, hour ? 1.3 : 0.9);
    }
  }
  // roman numerals sampled from text
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const romans = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  romans.forEach((txt, h) => {
    g.clearRect(0, 0, 256, 256);
    g.fillStyle = '#fff'; g.font = '600 120px "CMU Serif", serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(txt, 128, 128);
    const d = g.getImageData(0, 0, 256, 256).data;
    const on = [];
    for (let y = 0; y < 256; y += 2) for (let x = 0; x < 256; x += 2) if (d[(y * 256 + x) * 4 + 3] > 128) on.push([x, y]);
    const a = Math.PI / 2 - h / 12 * Math.PI * 2;
    const cx = Math.cos(a) * 0.66, cy = Math.sin(a) * 0.66;
    for (let i = 0; i < 1400; i++) {
      const [px, py] = on[Math.floor(rnd() * on.length)];
      add(cx + (px - 128) / 256 * 0.34 + (rnd() - 0.5) * 0.004, cy - (py - 128) / 256 * 0.34 + (rnd() - 0.5) * 0.004, 0, 1.0);
    }
  });
  // decorative guilloche rings
  for (let i = 0; i < 5000; i++) { const a = rnd() * Math.PI * 2; const r = 0.28 + 0.03 * Math.sin(a * 24) + (rnd() - 0.5) * 0.005; add(Math.cos(a) * r, Math.sin(a) * r, 0, 0.55); }
  for (let i = 0; i < 3500; i++) { const a = rnd() * Math.PI * 2; const r = 0.5 + 0.012 * Math.sin(a * 60); add(Math.cos(a) * r, Math.sin(a) * r, 0, 0.45); }
  // hands (along +y before rotation)
  const hand = (len, wid, n, kind, tail = 0.12) => {
    for (let i = 0; i < n; i++) {
      const y = -tail + rnd() * (len + tail);
      const taper = 1 - Math.max(0, y) / len * 0.7;
      add((rnd() - 0.5) * wid * taper, y, kind, 1.4);
    }
  };
  hand(0.46, 0.06, 3200, 1);
  hand(0.7, 0.04, 4200, 2);
  hand(0.84, 0.014, 2200, 3, 0.2);
  for (let i = 0; i < 500; i++) { const a = rnd() * Math.PI * 2, r = rnd() * 0.045; add(Math.cos(a) * r, Math.sin(a) * r, 0, 1.6); }
  // seeds
  const n = pts.length / 4;
  const seed = new Float32Array(n * 4);
  for (let i = 0; i < n * 4; i++) seed[i] = rnd();
  return { local: new Float32Array(pts), seed, n };
}

const VERT = /* glsl */ `
${LENS_GLSL}
uniform float tau;
uniform vec3 cPos, cRight, cUp, cFwd;
uniform float cRad;
uniform float aHour, aMin, aSec;
uniform float shatterT;
uniform float pxScale;
uniform float uBeat;
attribute vec4 aLocal;
attribute vec4 aSeed;
varying vec3 vCol;
varying float vAlpha;

vec2 rot(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }

void main() {
  vec2 lp = aLocal.xy;
  float kind = aLocal.z;
  if (kind > 0.5 && kind < 1.5) lp = rot(lp, aHour);
  else if (kind > 1.5 && kind < 2.5) lp = rot(lp, aMin);
  else if (kind > 2.5) lp = rot(lp, aSec);
  vec3 home = cPos + cRight * lp.x * cRad + cUp * lp.y * cRad + cFwd * (aSeed.z - 0.5) * 0.08;
  // condense from dust
  float fs = smoothstep(16.2 + aSeed.x * 1.6, 17.4 + aSeed.x * 1.6, tau);
  vec3 dust = cPos + (aSeed.xyz - 0.5) * vec3(22.0, 16.0, 14.0) + cFwd * 3.0;
  float fe = 1.0 - pow(1.0 - fs, 3.0);
  vec3 p = mix(dust, home, fe);
  // shatter + spiral infall
  vec2 crack = rot(vec2(0.0, 0.84), aSec);
  float d0 = shatterT + length(lp - crack) * 0.32 + aSeed.w * 0.35;
  float dur = 3.4 + aSeed.y * 3.0;
  float s = clamp((tau - d0) / dur, 0.0, 1.0);
  float heat = 0.0;
  float swallow = 1.0;
  if (tau > d0) {
    float since = tau - d0;
    vec3 kdir = normalize(cRight * (lp.x - crack.x) + cUp * (lp.y - crack.y) + cFwd * (aSeed.z - 0.5) * 0.5 + 1e-4);
    vec3 kick = kdir * (1.2 + 1.6 * aSeed.y) * (1.0 - exp(-since * 2.5)) * (1.0 - s);
    vec3 h0 = home + kick;
    float R0 = length(h0.xz);
    float phi0 = atan(h0.z, h0.x);
    float R = mix(R0, 1.0, pow(s, 1.25));
    float phi = phi0 + 2.4 * (sqrt(R0 / max(R, 0.3)) - 1.0);
    vec3 sp = vec3(R * cos(phi), h0.y * pow(1.0 - s, 1.8), R * sin(phi));
    p = mix(home, sp, smoothstep(0.0, 0.08, s)) + kick * (1.0 - smoothstep(0.0, 0.08, s));
    heat = smoothstep(0.25, 0.9, s);
    swallow = smoothstep(2.0, 3.4, R);
  }
  float vis;
  vec3 lp3 = lensP(p, vis);
  vec4 mv = viewMatrix * vec4(lp3, 1.0);
  gl_Position = projectionMatrix * mv;
  if (uSign < 0.0 && vis < 0.001) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  float size = (0.9 + aLocal.w) * pxScale / -mv.z;
  gl_PointSize = clamp(size, 1.0, 6.0);
  vec3 cool = kind > 2.5 ? vec3(1.0, 0.55, 0.62) : vec3(1.0, 0.92, 0.8);
  vec3 hot = vec3(1.0, 0.55, 0.22);
  vCol = mix(cool, hot, heat) * (0.42 + 0.25 * heat + uBeat * (kind > 2.5 ? 0.8 : 0.12));
  float appear = smoothstep(0.0, 0.25, fs) ;
  vAlpha = appear * swallow * vis * (0.35 + 0.4 * aSeed.z) * clamp(2.4 / size, 0.25, 1.0) * smoothstep(4.0, 9.0, -mv.z) * (1.0 - 0.45 * heat);
}`;

const FRAG = /* glsl */ `
varying vec3 vCol;
varying float vAlpha;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = dot(d, d) * 4.0;
  float a = exp(-r * 3.0) * vAlpha;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vCol * a, a);
}`;

export function buildClock(H) {
  const { local, seed, n } = sampleClock();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute('aLocal', new THREE.BufferAttribute(local, 4));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const mk = (sign) => new THREE.ShaderMaterial({
    uniforms: {
      tau: { value: 0 }, uSign: { value: sign }, cPos: { value: new THREE.Vector3() }, cRight: { value: new THREE.Vector3() }, cUp: { value: new THREE.Vector3() }, cFwd: { value: new THREE.Vector3() },
      cRad: { value: 3 }, aHour: { value: 0 }, aMin: { value: 0 }, aSec: { value: 0 }, shatterT: { value: T.SHATTER }, pxScale: { value: H * 1.6 }, uBeat: { value: 0 },
    },
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  const a = new THREE.Points(geo, mk(1));
  const b = new THREE.Points(geo, mk(-1));
  a.frustumCulled = b.frustumCulled = false;
  const group = new THREE.Group();
  group.add(a, b);
  return {
    group, count: n,
    update(tau, basis, beat) {
      // ticking: one tick per beat (0.5 s), springy settle
      const t0 = 16.0;
      const k = Math.max(0, tau - t0) / 0.5;
      const n = Math.floor(k), f = k - n;
      const settle = 1 - Math.exp(-f * 22) * Math.cos(f * 40);
      const ticks = n + settle;
      const sec = -(42 + ticks) * Math.PI / 30;
      const min = -(8 + (42 + ticks) / 60) * Math.PI / 30;
      const hour = -(10 + (8 + (42 + ticks) / 60) / 60) * Math.PI / 6;
      for (const m of [a.material, b.material]) {
        const u = m.uniforms;
        u.tau.value = tau;
        u.cPos.value.copy(basis.pos); u.cRight.value.copy(basis.right); u.cUp.value.copy(basis.up); u.cFwd.value.copy(basis.fwd);
        u.cRad.value = basis.radius;
        u.aSec.value = sec; u.aMin.value = min; u.aHour.value = hour;
        u.uBeat.value = beat;
      }
      group.visible = tau > 16.0;
    },
  };
}
