import * as THREE from 'three';
import { LENS_GLSL } from './timeline.js';

// Rasterize MathJax SVGs into a texture atlas.
export async function buildAtlas(entries, rowH = 84, size = 4096) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const g = c.getContext('2d');
  const rects = [];
  let x = 8, y = 8;
  for (const e of entries) {
    const vb = e.vb;
    let h = rowH, w = Math.round(rowH * vb[2] / vb[3]);
    if (w > 1400) { w = 1400; h = Math.round(1400 * vb[3] / vb[2]); }
    if (x + w + 8 > size) { x = 8; y += rowH + 12; }
    const img = await svgImage(e.svg, w, h);
    g.drawImage(img, x, y + (rowH - h) / 2, w, h);
    rects.push({ u0: x / size, v0: 1 - (y + rowH) / size, u1: (x + w) / size, v1: 1 - y / size, aspect: w / rowH });
    x += w + 16;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 8;
  return { tex, rects };
}

export function svgImage(svg, w, h) {
  let s = svg;
  if (!/xmlns=/.test(s)) s = s.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  s = s.replace(/<svg([^>]*?)\swidth="[^"]*"/, '<svg$1').replace(/<svg([^>]*?)\sheight="[^"]*"/, '<svg$1');
  s = s.replace('<svg', `<svg width="${w}" height="${h}"`);
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
  return img.decode().then(() => img);
}

const VERT = /* glsl */ `
${LENS_GLSL}
uniform float tau;
uniform float uOpacity;
uniform float uConv;
uniform float uFlash;
uniform float uBeat;
uniform vec3 uFormPos, uFormRight, uFormUp;
attribute vec4 aRect;
attribute vec4 aLane;   // v, w, u0, speed jitter
attribute vec4 aSeed;   // aspect, rnd, rnd, rnd
varying vec2 vUv;
varying float vAlpha;
varying vec3 vCol;

vec3 riverPos(float u, vec4 lane, out float R, out float R0) {
  vec3 S = vec3(19.0 + 4.0 * lane.y, 15.5 * lane.x, -6.0 + 9.0 * lane.y);
  R0 = length(S.xz);
  float phi0 = atan(S.z, S.x);
  float e = 1.0 - pow(1.0 - u, 2.3);
  R = mix(R0, 1.9, e);
  float y = S.y * pow(1.0 - u, 1.6) + sin(u * 9.0 + lane.y * 5.0) * 0.25 * (1.0 - u);
  float phi = phi0 + 2.3 * (sqrt(R0 / R) - 1.0);
  return vec3(R * cos(phi), y, R * sin(phi));
}

void main() {
  float u = fract(aLane.z + tau * 0.043 * aLane.w);
  float R, R0;
  vec3 c = riverPos(u, aLane, R, R0);
  float R2, R02;
  vec3 c2 = riverPos(min(u + 0.004, 0.999), aLane, R2, R02);
  vec3 tang = normalize(c2 - c + 1e-5);
  float near = 1.0 - smoothstep(2.4, 6.0, R);
  float hgt = 0.24 * pow(R / R0, 0.5) * (0.75 + 0.5 * aSeed.y);
  float wid = hgt * aSeed.x * (1.0 + 2.6 * near);
  hgt *= 1.0 - 0.55 * near;
  // converge into the final formula
  float k = clamp((uConv - aSeed.z * 1.1) / 1.4, 0.0, 1.0);
  k = k * k * (3.0 - 2.0 * k);
  vec3 target = uFormPos + uFormRight * (aSeed.w - 0.5) * 6.0 + uFormUp * (aSeed.y - 0.5) * 1.0;
  c = mix(c, target, k);
  vec3 view = normalize(cameraPosition - c);
  vec3 X = normalize(tang - view * dot(tang, view));
  if (k > 0.0) X = normalize(mix(X, uFormRight, k));
  vec3 Y = normalize(cross(view, X));
  // keep the text upright on screen (scrolls like a ticker instead of turning upside down)
  vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  if (dot(Y, camUp) < 0.0) { X = -X; Y = -Y; }
  float sc = 1.0 - 0.85 * k;
  vec3 wp = c + X * position.x * wid * sc + Y * position.y * hgt * sc;
  float vis;
  vec3 lp = lensP(wp, vis);
  gl_Position = projectionMatrix * viewMatrix * vec4(lp, 1.0);
  if (uSign < 0.0 && vis < 0.001) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  vUv = mix(aRect.xy, aRect.zw, uv);
  float fadeIn = smoothstep(0.0, 0.07, u);
  float swallow = smoothstep(1.95, 2.9, R);
  float dist = length(cameraPosition - c);
  float fog = exp(-dist * 0.018) * smoothstep(1.5, 5.0, dist);
  vAlpha = uOpacity * fadeIn * swallow * vis * fog * (1.0 - k * k) * (0.3 + 0.5 * aSeed.w) * (1.0 - 0.55 * near);
  float heat = smoothstep(0.55, 0.95, near + u * 0.35);
  vec3 cold = vec3(0.78, 0.86, 1.0);
  vec3 hot = vec3(1.0, 0.62, 0.28);
  vCol = mix(cold, hot, heat) * (0.62 + 0.9 * heat + uBeat * 0.35 + uFlash * 2.0);
}`;

const FRAG = /* glsl */ `
uniform sampler2D map;
varying vec2 vUv;
varying float vAlpha;
varying vec3 vCol;
void main() {
  float a = texture2D(map, vUv).a * vAlpha;
  if (a < 0.003) discard;
  gl_FragColor = vec4(vCol * a, a);
}`;

export function buildRiver(atlas, count = 15000) {
  const base = new THREE.PlaneGeometry(1, 1, 8, 2);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = base.index;
  geo.setAttribute('position', base.getAttribute('position'));
  geo.setAttribute('uv', base.getAttribute('uv'));
  const rect = new Float32Array(count * 4), lane = new Float32Array(count * 4), seed = new Float32Array(count * 4);
  let s = 12345;
  const rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  for (let i = 0; i < count; i++) {
    const r = atlas.rects[i % atlas.rects.length];
    rect.set([r.u0, r.v0, r.u1, r.v1], i * 4);
    const v = (rnd() * 2 - 1) * Math.pow(rnd(), 0.35) * (rnd() < 0.5 ? 1 : 1);
    lane.set([v, rnd() * 2 - 1, rnd(), 0.8 + rnd() * 0.45], i * 4);
    seed.set([r.aspect, rnd(), rnd(), rnd()], i * 4);
  }
  geo.setAttribute('aRect', new THREE.InstancedBufferAttribute(rect, 4));
  geo.setAttribute('aLane', new THREE.InstancedBufferAttribute(lane, 4));
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 4));
  geo.instanceCount = count;
  const mk = (sign) => new THREE.ShaderMaterial({
    uniforms: {
      map: { value: atlas.tex }, tau: { value: 0 }, uOpacity: { value: 1 }, uConv: { value: 0 }, uFlash: { value: 0 }, uBeat: { value: 0 },
      uSign: { value: sign }, uFormPos: { value: new THREE.Vector3() }, uFormRight: { value: new THREE.Vector3(1, 0, 0) }, uFormUp: { value: new THREE.Vector3(0, 1, 0) },
    },
    vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthWrite: false, depthTest: true,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  const primary = new THREE.Mesh(geo, mk(1));
  const secondary = new THREE.Mesh(geo, mk(-1));
  primary.frustumCulled = secondary.frustumCulled = false;
  const group = new THREE.Group();
  group.add(primary, secondary);
  return {
    group,
    set(key, value) {
      for (const m of [primary.material, secondary.material]) {
        if (m.uniforms[key].value?.copy) m.uniforms[key].value.copy(value); else m.uniforms[key].value = value;
      }
    },
  };
}
