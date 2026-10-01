import * as THREE from 'three';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { createBlackHole, createBHComposite } from './blackhole.js';
import { buildAtlas, buildRiver } from './river.js';
import { buildClock } from './clock.js';
import { buildLovers } from './lovers.js';
import { WriteOn } from './hero.js';
import { T, P, tauAt, mode, cameraAt, camByTau, clamp, lerp, smooth, ease, spiralIn } from './timeline.js';

const qs = new URLSearchParams(location.search);
const W = +(qs.get('w') || 1920), H = +(qs.get('h') || 1080);
const PX = Math.min(W, H) / 1080;
const SCOPE = 2.39;                                   // cinema letterbox
const BAR_PX = Math.max(0, (H - W / SCOPE) / 2);
const BH_SCALE = +(qs.get('bh') || 0.6);

const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.autoClear = false;
document.body.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(50, W / H, 0.1, 400);
const scene = new THREE.Scene();

// ---------------------------------------------------------------- render targets & passes
const mainRT = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: +(qs.get('msaa') || 0) });
const bh = createBlackHole(renderer, Math.round(W * BH_SCALE), Math.round(H * BH_SCALE));
const comp = createBHComposite(bh.rt.texture);
scene.add(comp.quad);
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.55, 0.6, 1.0);

const fsGeo = new THREE.PlaneGeometry(2, 2);
const fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
function fsPass(frag, uniforms) {
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: frag, depthTest: false, depthWrite: false });
  const mesh = new THREE.Mesh(fsGeo, mat);
  mesh.frustumCulled = false;
  const sc = new THREE.Scene(); sc.add(mesh);
  return { mat, run(target) { renderer.setRenderTarget(target); renderer.clear(); renderer.render(sc, fsCam); } };
}
const qW = Math.round(W / 4), qH = Math.round(H / 4);
const brightRT = new THREE.WebGLRenderTarget(qW, qH, { type: THREE.HalfFloatType });
const streakA = brightRT.clone(), streakB = brightRT.clone();
const brightPass = fsPass(`uniform sampler2D t; varying vec2 vUv; void main(){ vec3 c = texture2D(t, vUv).rgb; float l = max(c.r, max(c.g, c.b)); gl_FragColor = vec4(c * smoothstep(2.5, 7.0, l), 1.0); }`, { t: { value: mainRT.texture } });
const streakPass = fsPass(`uniform sampler2D t; uniform float step; uniform vec2 px; varying vec2 vUv;
  void main(){ vec3 s = vec3(0.0); float wsum = 0.0;
    for (int i = -7; i <= 7; i++) { float w = exp(-float(i*i) / 18.0); s += texture2D(t, vUv + vec2(float(i) * step * px.x, 0.0)).rgb * w; wsum += w; }
    gl_FragColor = vec4(s / wsum, 1.0); }`, { t: { value: null }, step: { value: 1 }, px: { value: new THREE.Vector2(1 / qW, 1 / qH) } });
const frameA = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType });
const frameB = frameA.clone();
let writeRT = frameA, readRT = frameB;
const finalPass = fsPass(/* glsl */ `
  uniform sampler2D tMain, tStreak, tPrev;
  uniform float exposure, streakAmt, vig, grain, ca, glitch, freeze, rewind, trail, fade, flash, time, warm, lbox;
  uniform vec2 res;
  uniform vec4 shock;
  varying vec2 vUv;
  float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + time * 7.13) * 43758.5453); }
  vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
  void main(){
    vec2 uv = vUv;
    // reunion shockwave
    vec2 sd = (uv - shock.xy) * vec2(res.x / res.y, 1.0);
    float sr = length(sd);
    float ring = exp(-pow((sr - shock.z) * 22.0, 2.0)) * shock.w;
    uv -= normalize(sd + 1e-6) * ring * 0.018 / vec2(res.x / res.y, 1.0);
    // freeze glitch: slit-scan + rgb split
    float row = floor(uv.y * 120.0);
    float jit = (h(vec2(row, floor(time * 30.0))) - 0.5) * glitch * 0.03 * step(0.6, h(vec2(row * 1.7, floor(time * 15.0))));
    uv.x += jit;
    vec2 d = uv - 0.5;
    float r2 = dot(d * vec2(res.x / res.y, 1.0), d * vec2(res.x / res.y, 1.0));
    vec2 off = d * (ca * (1.0 + 4.0 * r2) + glitch * 0.012);
    vec3 c = vec3(texture2D(tMain, uv + off).r, texture2D(tMain, uv).g, texture2D(tMain, uv - off).b);
    c += texture2D(tStreak, uv).rgb * streakAmt * vec3(0.55, 0.7, 1.0);
    c *= exposure;
    c = aces(c);
    c = pow(c, vec3(1.0 / 2.2));
    // grades
    float l = dot(c, vec3(0.299, 0.587, 0.114));
    c = mix(c, vec3(l) * vec3(0.85, 0.95, 1.12), freeze * 0.75);
    c = mix(c, mix(vec3(l), c, 0.7) * vec3(0.9, 0.98, 1.08), rewind * 0.6);
    c = mix(c, c * vec3(1.06, 0.98, 0.9), warm);
    c += ring * vec3(1.0, 0.8, 0.5) * 0.18;
    vec3 prev = texture2D(tPrev, vUv).rgb;
    c = max(c, prev * trail);
    c *= 1.0 - vig * smoothstep(0.12, 0.85, r2);
    c += (h(vUv * res) - 0.5) * grain;
    c = mix(c, vec3(1.0), flash);
    c *= 1.0 - fade;
    c *= smoothstep(lbox + 0.0012, lbox - 0.0012, abs(vUv.y - 0.5));
    gl_FragColor = vec4(c, 1.0);
  }`, {
  tMain: { value: mainRT.texture }, tStreak: { value: streakB.texture }, tPrev: { value: frameB.texture },
  exposure: { value: 1 }, streakAmt: { value: 0.16 }, vig: { value: 0.55 }, grain: { value: 0.02 }, ca: { value: 0.0018 }, glitch: { value: 0 },
  freeze: { value: 0 }, rewind: { value: 0 }, trail: { value: 0 }, fade: { value: 0 }, flash: { value: 0 }, time: { value: 0 }, warm: { value: 0 },
  res: { value: new THREE.Vector2(W, H) }, shock: { value: new THREE.Vector4(0.5, 0.5, 0, 0) }, lbox: { value: qs.get('nolb') ? 0.6 : 0.5 - BAR_PX / H },
});
const copyPass = fsPass('uniform sampler2D t; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(t, vUv).rgb, 1.0); }', { t: { value: null } });

// ---------------------------------------------------------------- HUD (captions + timecode)
const hud = new THREE.Scene();
const hudCam = new THREE.OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, -10, 10);
const SERIF = '"Noto Serif CJK SC", "Noto Serif CJK", serif';
function charMesh(ch, size, color, glow, weight = 600) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  g.font = `${weight} ${size}px ${SERIF}`;
  const w = Math.ceil(g.measureText(ch).width) + size;
  c.width = w; c.height = Math.ceil(size * 2);
  g.font = `${weight} ${size}px ${SERIF}`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = 'rgba(0,0,0,0.85)'; g.shadowBlur = size * 0.35;
  g.fillStyle = color;
  g.fillText(ch, w / 2, c.height / 2);
  g.shadowColor = glow; g.shadowBlur = size * 0.45;
  g.fillStyle = color;
  g.fillText(ch, w / 2, c.height / 2);
  g.shadowBlur = 0;
  g.fillText(ch, w / 2, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w * PX, c.height * PX), m);
  return { mesh, m, adv: (g.measureText(ch).width) };
}
function caption(text, t0, t1, yPx, opts = {}) {
  const size = opts.size || 54;
  const spacing = opts.spacing ?? 8;
  const chars = [...text].map((ch) => charMesh(ch, size, opts.color || '#f6f1ea', opts.glow || 'rgba(255,200,140,0.55)', opts.weight));
  const total = chars.reduce((s, c) => s + c.adv + spacing, -spacing);
  let x = -total / 2;
  chars.forEach((c) => { c.x = (x + c.adv / 2) * PX; x += c.adv + spacing; hud.add(c.mesh); });
  return { chars, t0, t1, y: yPx * PX, stagger: opts.stagger ?? 0.07, clock: opts.clock || 'story', times: opts.times, zip: opts.zip };
}
// y positions (px from centre): subtitles live in the lower letterbox bar, poetry inside the picture
const Y_SUB = -H / 2 + BAR_PX / 2;
const Y_POEM = -H / 2 + BAR_PX + 74;
const SUB = { size: 42, spacing: 6, clock: 'real', glow: 'rgba(255,220,190,0.35)', weight: 500 };
// her line, character by character, timed by speech recognition of the hook audio
const captions = [
  caption('我会找到逆转时间的公式', 0.14, 99, Y_SUB / PX, { ...SUB, times: [0.14, 0.32, 0.50, 0.62, 0.74, 0.92, 1.10, 1.22, 1.34, 1.52, 1.64], zip: [1.95, 2.40] }),
  caption('然后回到你身边', 3.38, 7.8, Y_SUB / PX, { ...SUB, times: [3.38, 3.56, 5.30, 5.48, 5.66, 5.78, 5.96] }),
  caption('宇宙写下的每一条定律', 9.3, 12.6, Y_SUB / PX, { size: 46 }),
  caption('都指向同一个方向', 12.9, 16.1, Y_SUB / PX, { size: 46 }),
  caption('熵增：时间只能向前', 21.3, 25.3, Y_SUB / PX, { size: 46 }),
  caption('除非——', 28.5, 30.3, Y_SUB / PX, { size: 50 }),
  caption('把 t 换成 −t', 30.5, 33.8, Y_SUB / PX, { size: 50 }),
  caption('我找到了逆转时间的公式', 45.6, 48.15, Y_SUB / PX, { size: 50, stagger: 0.08 }),
  caption('然后，回到了你身边', 48.3, 50.7, Y_SUB / PX, { size: 50, color: '#ffd9d2', glow: 'rgba(255,140,160,0.75)', stagger: 0.12 }),
];
function updateCaptions(t, TR) {
  for (const cp of captions) {
    const now = cp.clock === 'real' ? TR : t;
    const live = cp.clock === 'real' || TR >= T_R;   // story captions never show during the hook
    const out = 1 - smooth(cp.t1 - 0.6, cp.t1, now);
    const n = cp.chars.length;
    cp.chars.forEach((c, i) => {
      const s = cp.times ? cp.times[i] - 0.04 : cp.t0 + i * cp.stagger;
      const dur = cp.times ? 0.22 : 0.55;
      let a = smooth(s, s + dur, now) * out;
      if (cp.zip) { const z = cp.zip[0] + (n - 1 - i) / n * (cp.zip[1] - cp.zip[0]); a *= 1 - smooth(z, z + 0.06, now); }
      a *= live ? 1 : 0;
      c.mesh.visible = a > 0.001;
      c.m.opacity = a;
      const rise = cp.times ? 6 : 16;
      c.mesh.position.set(c.x, cp.y + (1 - smooth(s, s + dur + 0.15, now)) * -rise * PX, 0);
      c.mesh.scale.setScalar(1 + (1 - smooth(s, s + dur + 0.15, now)) * 0.06);
    });
  }
}
// timecode
const tcCanvas = document.createElement('canvas'); tcCanvas.width = 560; tcCanvas.height = 90;
const tcTex = new THREE.CanvasTexture(tcCanvas); tcTex.colorSpace = THREE.NoColorSpace;
const tcMat = new THREE.MeshBasicMaterial({ map: tcTex, transparent: true, depthTest: false, toneMapped: false });
const tcMesh = new THREE.Mesh(new THREE.PlaneGeometry(560 * PX * 0.78, 90 * PX * 0.78), tcMat);
tcMesh.position.set(-W / 2 + (64 + 280 * 0.78) * PX, H / 2 - Math.max(BAR_PX / 2, 70 * PX), 0);
hud.add(tcMesh);
function updateTimecode(t, tau, TR, zip) {
  const g = tcCanvas.getContext('2d');
  g.clearRect(0, 0, 560, 90);
  const md = zip ? 'rewind' : mode(t);
  g.fillStyle = 'rgba(240,236,228,0.85)';
  g.font = '34px "CMU Typewriter Text", "DejaVu Sans Mono", monospace';
  g.textBaseline = 'middle';
  g.fillText(`t = ${tau >= 0 ? '+' : '−'}${Math.abs(tau).toFixed(2).padStart(5, '0')} s`, 70, 45);
  // transport icon
  g.beginPath();
  if (md === 'freeze') { if (Math.floor(t * 3) % 2 === 0) { g.fillRect(16, 28, 9, 34); g.fillRect(33, 28, 9, 34); } }
  else if (md === 'rewind') { g.moveTo(30, 28); g.lineTo(14, 45); g.lineTo(30, 62); g.closePath(); g.moveTo(48, 28); g.lineTo(32, 45); g.lineTo(48, 62); g.closePath(); g.fill(); }
  else { g.moveTo(18, 28); g.lineTo(42, 45); g.lineTo(18, 62); g.closePath(); g.fill(); }
  g.fillStyle = 'rgba(240,236,228,0.35)';
  g.fillRect(70, 72, 420, 2);
  g.fillStyle = 'rgba(255,200,150,0.9)';
  g.fillRect(70, 72, 420 * clamp(TR / END_REAL), 2);
  tcTex.needsUpdate = true;
  tcMat.opacity = smooth(0.1, 0.6, TR) * (1 - smooth(END_REAL - 1.6, END_REAL - 0.6, TR)) * 0.8;
}

// ---------------------------------------------------------------- scene content
let river, clock, lovers, heroT, heroS, heroFlip, heroFinal, clockBasis, finalBasis;

async function setup() {
  const eq = await (await fetch('../build/equations.json')).json();
  await document.fonts.load(`600 60px ${SERIF}`).catch(() => {});
  await document.fonts.load('600 60px "CMU Serif"').catch(() => {});
  await document.fonts.load('34px "CMU Typewriter Text"').catch(() => {});
  const atlas = await buildAtlas(eq.river);
  river = buildRiver(atlas, +(qs.get('glyphs') || 12000));
  scene.add(river.group);
  clock = buildClock(H);
  scene.add(clock.group);
  lovers = buildLovers();
  scene.add(lovers.group);
  heroT = new WriteOn(eq.hero.t, 360, new THREE.Color(1.5, 1.25, 1.0), 0.72, 0.3);
  heroS = new WriteOn(eq.hero.entropy, 240, new THREE.Color(1.5, 1.0, 0.55), 0.8);
  heroFlip = new WriteOn(eq.hero.flip, 260, new THREE.Color(1.2, 1.35, 1.7), 0.9);
  heroFinal = new WriteOn(eq.hero.final, 300, new THREE.Color(1.5, 1.3, 1.0), 0.74);
  for (const h of [heroT, heroS, heroFlip, heroFinal]) scene.add(h.mesh);
  // fixed orientations
  const camC = camByTau(19).pos;
  const fwd = camC.clone().sub(P.CLOCK).normalize();
  const right = new THREE.Vector3(0, 1, 0).cross(fwd).normalize();
  const up = fwd.clone().cross(right).normalize();
  clockBasis = { pos: P.CLOCK, right, up, fwd, radius: P.CLOCK_R };
  const fc = cameraAt(47);
  const ff = fc.pos.clone().sub(fc.look).normalize();
  const fr = new THREE.Vector3(0, 1, 0).cross(ff).normalize();
  const fu = ff.clone().cross(fr).normalize();
  finalBasis = { pos: P.MEET.clone().add(fu.clone().multiplyScalar(2.55)), right: fr, up: fu, fwd: ff, cam: fc };
  await heroT.draw(0); await heroS.draw(0); await heroFlip.draw(1); await heroFinal.draw(0);
  window.ready = true;
}

function beatPulse(tau) {
  const d = Math.abs(tau - Math.round(tau * 2) / 2);
  return Math.exp(-d * 14);
}

function faceCamera(mesh, pos) {
  mesh.position.copy(pos);
  mesh.quaternion.copy(camera.quaternion);
}

// ---------------------------------------------------------------- real time -> story time
// The story is authored at 120 bpm; the hook audio runs at 119.05 bpm, so after the intro the
// picture is stretched by TS and every beat and bar lands on the music.
export const TS = 0.2520 / 0.25;
const C0 = 0.106, BAR = 2.016;
export const T_R = C0 + 4 * BAR;              // river reveal = bar 4 of the hook audio (after her line)
const HOOK_A = 1.95, HOOK_B = 2.45;           // flash-forward, then a tape-rewind zip to t = 0
const INTRO = [[HOOK_B, 0.62], [2.65, 0.8], [4.6, 2.9], [5.34, 3.2], [6.4, 4.1], [T_R, 6.0]];
export const END_REAL = T_R + (T.END - 6) * TS;
function storyAt(x) {
  if (x < HOOK_A) return 14.6 + x * 0.88;
  if (x < HOOK_B) return lerp(14.6 + HOOK_A * 0.88, 0.62, ease((x - HOOK_A) / (HOOK_B - HOOK_A)));
  if (x < T_R) {
    for (let i = 0; i < INTRO.length - 1; i++) {
      const [a0, b0] = INTRO[i], [a1, b1] = INTRO[i + 1];
      if (x <= a1) return lerp(b0, b1, (x - a0) / (a1 - a0));
    }
  }
  return 6 + (x - T_R) / TS;
}
async function renderFrame(tReal) {
  const TR = tReal;
  const t = storyAt(TR);
  const zipEnv = smooth(HOOK_A - 0.04, HOOK_A + 0.08, TR) * (1 - smooth(HOOK_B - 0.1, HOOK_B, TR));
  const tau = tauAt(t);
  const md = mode(t);
  const c = cameraAt(t);
  camera.position.copy(c.pos);
  camera.lookAt(c.look);
  camera.fov = c.fov;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();

  // black hole
  const bu = bh.mat.uniforms;
  bu.diskGain.value = smooth(4.4, 6.1, tau);
  bu.holeGain.value = smooth(3.7, 5.4, tau);
  bu.starGain.value = 0.35 + 0.65 * smooth(0.6, 3.0, tau);
  bu.glow.value = 0.35 + 0.6 * Math.exp(-Math.abs(t - T.MEET) * 1.2) * (t > T.MEET - 0.2 ? 1 : 0);
  if (t >= T.REW_END) { bu.diskGain.value = Math.max(bu.diskGain.value, smooth(42, 43.5, t)); bu.starGain.value = 1; }
  bh.render(camera, tau);
  comp.mat.uniforms.near.value = camera.near;
  comp.mat.uniforms.far.value = camera.far;

  const beat = beatPulse(tau) * (tau > 6 ? 1 : 0.5);
  // equation river
  river.set('tau', tau);
  river.set('uOpacity', Math.max(smooth(5.75, 6.35, tau) * (1 - 0.45 * smooth(16.8, 18.0, tau)), smooth(42, 43.2, t)));
  river.set('uConv', t > 42.4 ? (t - 42.4) * 0.9 : 0);
  river.set('uFlash', t > T.MEET ? Math.exp(-(t - T.MEET) * 2.5) : 0);
  river.set('uBeat', beat);
  river.set('uFormPos', finalBasis.pos); river.set('uFormRight', finalBasis.right); river.set('uFormUp', finalBasis.up);
  // clock
  clock.update(tau, clockBasis, beat);
  // lovers
  lovers.update(t, tauAt, camera);

  // hero: hand-written "t"
  {
    const p = smooth(0.8, 2.9, tau);
    const fly = ease(clamp((tau - 4.6) / 3.0));
    const pos = P.T_POS.clone().lerp(new THREE.Vector3(19.5, 3.0, -4.5), fly);
    faceCamera(heroT.mesh, pos);
    heroT.mesh.scale.setScalar(1 - fly * 0.85);
    heroT.mat.opacity = 1 - smooth(6.4, 7.6, tau);
    heroT.mesh.visible = tau < 7.6 && tau > 0.6;
    if (heroT.mesh.visible) await heroT.draw(p);
  }
  // hero: entropy
  {
    const p = smooth(20.7, 22.2, tau);
    const base = P.CLOCK.clone().add(clockBasis.fwd.clone().multiplyScalar(1.2)).add(clockBasis.up.clone().multiplyScalar(0.15));
    const s = clamp((tau - 23.0) / 3.0);
    const pos = s > 0 ? base.clone().lerp(spiralIn(base, s, 2.0, 1.4), smooth(0, 0.1, s)) : base;
    faceCamera(heroS.mesh, pos);
    heroS.mesh.scale.setScalar(1 - 0.8 * s);
    heroS.mat.opacity = 1 - smooth(0.7, 1.0, s);
    heroS.mesh.visible = tau > 20.6 && s < 1;
    if (heroS.mesh.visible) await heroS.draw(p);
  }
  // hero: t -> -t flies out of the river into the lens
  {
    const u = clamp((tau - 24.4) / 1.6);
    const end = camByTau(26);
    const fwdE = end.look.clone().sub(end.pos).normalize();
    const target = end.pos.clone().add(fwdE.multiplyScalar(0.45));
    const pos = new THREE.Vector3(2.0, 0.8, 2.6).lerp(target, Math.pow(u, 2.4));
    faceCamera(heroFlip.mesh, pos);
    heroFlip.mesh.scale.setScalar(0.6 + u * 0.6);
    heroFlip.mat.opacity = smooth(0, 0.12, u) * (1 - smooth(25.6, 25.97, tau));
    heroFlip.mesh.visible = tau > 24.4 && tau < 25.985 && md !== 'freeze';
  }
  // hero: the final formula
  {
    const p = smooth(43.8, 46.6, t);
    heroFinal.mesh.position.copy(finalBasis.pos);
    heroFinal.mesh.quaternion.copy(camera.quaternion);
    heroFinal.mat.opacity = smooth(43.5, 44.0, t) * (1 + 0.6 * Math.exp(-Math.max(0, t - T.MEET) * 2) * (t > T.MEET ? 1 : 0));
    heroFinal.mesh.visible = t > 43.5;
    if (heroFinal.mesh.visible) await heroFinal.draw(p);
  }

  // ---- render
  renderer.setRenderTarget(mainRT);
  renderer.setClearColor(0x000000, 1);
  renderer.clear();
  renderer.render(scene, camera);
  bloom.strength = 0.55 + 0.12 * (t > T.MEET ? Math.exp(-(t - T.MEET) * 1.5) : 0) + 0.35 * (TR > T_R ? Math.exp(-(TR - T_R) * 2.5) : 0);
  bloom.render(renderer, null, mainRT, 0, false);
  brightPass.run(brightRT);
  streakPass.mat.uniforms.t.value = brightRT.texture; streakPass.mat.uniforms.step.value = 2.0; streakPass.run(streakA);
  streakPass.mat.uniforms.t.value = streakA.texture; streakPass.mat.uniforms.step.value = 7.0; streakPass.run(streakB);

  const f = finalPass.mat.uniforms;
  f.time.value = TR;
  const freezeIn = smooth(T.FREEZE - 0.02, T.FREEZE + 0.15, t) * (1 - smooth(T.REWIND - 0.15, T.REWIND + 0.1, t));
  f.freeze.value = freezeIn;
  f.glitch.value = 1.2 * Math.exp(-Math.abs(t - T.FREEZE) * 9) + 0.12 * freezeIn + 1.0 * Math.exp(-Math.abs(t - T.REWIND) * 8) + 0.7 * zipEnv;
  f.rewind.value = Math.max(smooth(T.REWIND, T.REWIND + 0.4, t) * (1 - smooth(T.REW_END - 0.6, T.REW_END, t)), zipEnv);
  f.trail.value = Math.max(0.72 * f.rewind.value, 0.85 * zipEnv);
  const rv = TR - T_R;
  f.flash.value = 0.22 * (rv >= 0 ? Math.exp(-rv * 7) : 0) + 0.85 * Math.exp(-Math.max(0, t - T.FREEZE) * 10) * (t >= T.FREEZE ? 1 : 0) + 0.05 * Math.exp(-Math.max(0, t - T.MEET) * 6) * (t >= T.MEET ? 1 : 0);
  const dip = Math.exp(-Math.pow((TR - HOOK_B) / 0.07, 2));
  f.fade.value = Math.max(1 - smooth(0.0, 0.22, TR), smooth(END_REAL - 0.9, END_REAL - 0.05, TR), 0.92 * dip);
  f.warm.value = smooth(42, 44, t) * 0.8;
  f.exposure.value = 1.0;
  // shockwave at the reunion
  const sp = P.MEET.clone().project(camera);
  const dm = t - T.MEET;
  f.shock.value.set(sp.x * 0.5 + 0.5, sp.y * 0.5 + 0.5, dm > 0 ? dm * 0.55 : 0, dm > 0 ? Math.exp(-dm * 1.6) : 0);
  f.tPrev.value = readRT.texture;
  finalPass.run(writeRT);
  copyPass.mat.uniforms.t.value = writeRT.texture;
  copyPass.run(null);
  [writeRT, readRT] = [readRT, writeRT];

  updateCaptions(t, TR);
  updateTimecode(t, tau, TR, zipEnv > 0.5);
  renderer.setRenderTarget(null);
  if (!qs.get('nohud')) renderer.render(hud, hudCam);
  return true;
}
window.renderFrame = renderFrame;
window.readFrame = () => {
  const gl = renderer.getContext();
  const buf = new Uint8Array(W * H * 4);
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  return buf;
};
window.getDuration = () => END_REAL;
setup().catch((e) => { console.error('setup failed', e.stack || e); window.setupError = String(e.stack || e); });
