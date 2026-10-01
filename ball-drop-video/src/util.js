import * as THREE from 'three';

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const easeOutBack = (x) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
export const easeOutCubic = (x) => 1 - Math.pow(1 - clamp(x), 3);
export const easeInCubic = (x) => Math.pow(clamp(x), 3);

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Largest index i with arr[i] <= t, or -1.
export function lastIdx(arr, t) {
  let lo = 0, hi = arr.length - 1, ans = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (arr[m] <= t) { ans = m; lo = m + 1; } else hi = m - 1;
  }
  return ans;
}

export function flash(times, t, decay) {
  const i = lastIdx(times, t);
  return i < 0 ? 0 : Math.exp(-(t - times[i]) / decay);
}

// Smooth 1D value noise (deterministic).
export function noise1(x) {
  const i = Math.floor(x), f = x - i;
  const h = (n) => { const s = Math.sin(n * 91.345 + 47.853) * 43758.5453; return s - Math.floor(s); };
  const u = f * f * (3 - 2 * f);
  return lerp(h(i), h(i + 1), u) * 2 - 1;
}

export function noise3(x, y, z) {
  return (noise1(x * 1.0 + y * 7.13 + z * 3.71) + noise1(y * 1.3 - z * 5.1 + 11.2) + noise1(z * 1.1 + x * 2.9 - 4.4)) / 3;
}

// Displace a geometry's vertices with noise (rocky look). Merges duplicate vertices first.
export function rockify(geo, amp, freq, seed = 1) {
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = noise3(v.x * freq + seed, v.y * freq - seed, v.z * freq + seed * 2);
    const n2 = noise3(v.x * freq * 2.7 + seed, v.y * freq * 2.7, v.z * freq * 2.7 - seed);
    const d = v.clone().normalize();
    v.addScaledVector(d, (n + n2 * 0.4) * amp);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

export function canvasTex(w, h, draw, opts = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = opts.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  if (opts.repeat) { tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(...opts.repeat); }
  return tex;
}

export const softDotTex = () => canvasTex(128, 128, (g, w) => {
  const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,255,255,0.65)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, w);
});

export const starTex = () => canvasTex(256, 256, (g, w) => {
  g.translate(w / 2, w / 2);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, w * 0.18);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, w * 0.18, 0, 7); g.fill();
  g.fillStyle = 'white';
  for (let k = 0; k < 4; k++) {
    g.rotate(Math.PI / 2);
    g.beginPath(); g.moveTo(0, -w * 0.035); g.lineTo(w * 0.48, 0); g.lineTo(0, w * 0.035); g.fill();
  }
});

export const cloudTex = () => canvasTex(256, 256, (g, w) => {
  const r = rng(7);
  for (let i = 0; i < 26; i++) {
    const x = w * (0.2 + r() * 0.6), y = w * (0.35 + r() * 0.3), rad = w * (0.08 + r() * 0.16);
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  }
});

export const windowsTex = (seed, lit = 0.45, warm = true) => canvasTex(256, 512, (g, w, h) => {
  const r = rng(seed);
  g.fillStyle = '#1a1c28'; g.fillRect(0, 0, w, h);
  const cols = 8, rows = 24;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const on = r() < lit;
    const c = on ? (warm ? `hsl(${35 + r() * 15},90%,${55 + r() * 20}%)` : `hsl(${190 + r() * 30},70%,${60 + r() * 15}%)`) : `hsl(225,20%,${10 + r() * 8}%)`;
    g.fillStyle = c;
    g.fillRect(x * w / cols + 6, y * h / rows + 5, w / cols - 12, h / rows - 10);
  }
});
