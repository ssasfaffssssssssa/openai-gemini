import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildChoreo, ballState, R, G } from './choreo.js';
import { clamp, lerp, smooth, easeOutBack, easeOutCubic, lastIdx, flash, softDotTex, starTex, noise1, rng } from './util.js';
import { buildPads, buildCity, buildCave, buildCancan, buildHome } from './scenes.js';

const qs = new URLSearchParams(location.search);
const W = +(qs.get('w') || 1080), H = +(qs.get('h') || 1920);
const PX = W / 1080; // HUD scale

const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(W, H);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.fog = new THREE.FogExp2(0x000000, 0.01);

const camera = new THREE.PerspectiveCamera(42, W / H, 0.05, 900);

// ------------------------------------------------------------------ palettes
const C = (h) => new THREE.Color(h);
const PAL = {
  intro: { top: C(0x1c2266), mid: C(0xc0507a), bot: C(0xff8a3a), fog: C(0x9a5070), fogD: 0.0065, hemiS: C(0xffc8a0), hemiG: C(0x3a2040), hemi: 0.55, key: C(0xffb070), keyI: 2.0, rim: C(0xff6a30), rimI: 3.0, env: 0.4, bloom: 0.4, exp: 0.9, stars: 0.0, trail: C(0xffc070) },
  mozart: { top: C(0x24348a), mid: C(0xa8507e), bot: C(0xff9a50), fog: C(0x7a4068), fogD: 0.0035, hemiS: C(0xffe2c8), hemiG: C(0x4a3a6a), hemi: 0.6, key: C(0xffe2c0), keyI: 2.0, rim: C(0xff8a50), rimI: 2.2, env: 0.5, bloom: 0.5, exp: 0.9, stars: 0.0, trail: C(0xffd27a) },
  cave: { top: C(0x05040c), mid: C(0x0e0820), bot: C(0x1c0c3c), fog: C(0x0c0820), fogD: 0.04, hemiS: C(0x7a6aff), hemiG: C(0x120820), hemi: 0.45, key: C(0xc0b0ff), keyI: 1.4, rim: C(0x30e0ff), rimI: 2.2, env: 0.3, bloom: 0.6, exp: 1.05, stars: 0.0, trail: C(0x5ae8ff) },
  cancan: { top: C(0x16000a), mid: C(0x3a0416), bot: C(0x6a0a26), fog: C(0x2a0410), fogD: 0.02, hemiS: C(0xffb0b8), hemiG: C(0x2a0010), hemi: 0.45, key: C(0xffe2b0), keyI: 1.8, rim: C(0xff4a8a), rimI: 2.0, env: 0.4, bloom: 0.55, exp: 1.0, stars: 0.0, trail: C(0xff7ab0) },
  night: { top: C(0x060a1a), mid: C(0x0c1430), bot: C(0x18224a), fog: C(0x0a0f22), fogD: 0.012, hemiS: C(0x8090ff), hemiG: C(0x302018), hemi: 0.5, key: C(0xa8bcff), keyI: 1.1, rim: C(0x6a8cff), rimI: 1.2, env: 0.35, bloom: 0.5, exp: 1.05, stars: 1.0, trail: C(0xffe2a0) },
  morning: { top: C(0x8ec5ff), mid: C(0xc8e0ff), bot: C(0xffe2b8), fog: C(0xe8dccc), fogD: 0.004, hemiS: C(0xfff4e0), hemiG: C(0x806040), hemi: 0.4, key: C(0xffe0b0), keyI: 1.3, rim: C(0xffd090), rimI: 0.8, env: 0.3, bloom: 0.35, exp: 0.85, stars: 0.0, trail: C(0xffe2a0) },
};
function mixPal(a, b, u) {
  const o = {};
  for (const k in a) o[k] = a[k].isColor ? a[k].clone().lerp(b[k], u) : lerp(a[k], b[k], u);
  return o;
}

// ------------------------------------------------------------------ background
const bgMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { top: { value: C(0) }, mid: { value: C(0) }, bot: { value: C(0) }, stars: { value: 0 } },
  vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bot; uniform float stars; varying vec3 vDir;
    float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453); }
    void main(){ float y = vDir.y; vec3 c = y > 0.0 ? mix(mid, top, smoothstep(0.0, 0.6, y)) : mix(mid, bot, smoothstep(0.0, 0.5, -y));
      vec3 q = floor(vDir * 420.0); float s = step(0.9975, h(q)) * stars * smoothstep(-0.1, 0.4, y);
      gl_FragColor = vec4(c + s * vec3(1.0), 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
});
const bg = new THREE.Mesh(new THREE.SphereGeometry(500, 48, 24), bgMat);
bg.frustumCulled = false;
scene.add(bg);

// ------------------------------------------------------------------ lights
const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xffffff, 2);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -8; key.shadow.camera.right = 8; key.shadow.camera.top = 8; key.shadow.camera.bottom = -8;
key.shadow.camera.near = 0.5; key.shadow.camera.far = 40;
key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02; key.shadow.radius = 3;
scene.add(key, key.target);
const rim = new THREE.DirectionalLight(0xffffff, 1);
scene.add(rim, rim.target);
const hitLights = [0, 1, 2].map(() => { const l = new THREE.PointLight(0xffffff, 0, 0, 2); scene.add(l); return l; });

// ------------------------------------------------------------------ ball
const ballRoot = new THREE.Group();
const squash = new THREE.Group();
const orient = new THREE.Group();
ballRoot.add(squash); squash.add(orient);
scene.add(ballRoot);
const ballMat = new THREE.MeshPhysicalMaterial({ color: 0xffa21f, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.08, sheen: 0.3, sheenColor: new THREE.Color(0xffe0a0) });
const body = new THREE.Mesh(new THREE.SphereGeometry(R, 96, 64), ballMat);
body.castShadow = true;
orient.add(body);
const eyeWhite = new THREE.MeshPhysicalMaterial({ color: 0xe8e8ec, roughness: 0.25, clearcoat: 0.6 });
const pupilMat = new THREE.MeshPhysicalMaterial({ color: 0x0a0a12, roughness: 0.1, clearcoat: 1 });
const darkMat = new THREE.MeshStandardMaterial({ color: 0x3a0a10, roughness: 0.6 });
const browMat = new THREE.MeshStandardMaterial({ color: 0x5a2a08, roughness: 0.7 });
const eyes = [-1, 1].map((s) => {
  const g = new THREE.Group();
  const d = new THREE.Vector3(s * 0.34, 0.28, 0.9).normalize().multiplyScalar(R * 0.9);
  g.position.copy(d);
  g.lookAt(d.clone().multiplyScalar(2));
  const white = new THREE.Mesh(new THREE.SphereGeometry(0.105, 32, 24), eyeWhite);
  white.scale.z = 0.8;
  const pupilG = new THREE.Group();
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.052, 24, 16), pupilMat);
  pupil.scale.z = 0.45;
  const hl = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  hl.position.set(0.018, 0.02, 0.025);
  pupilG.add(pupil, hl);
  pupilG.position.z = 0.078;
  // eyelid (ball-colored cap) for blinking/sleeping
  const lid = new THREE.Mesh(new THREE.SphereGeometry(0.112, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), ballMat);
    lid.scale.z = 0.85;
  g.add(white, pupilG, lid);
  orient.add(g);
  const brow = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.1, 4, 8), browMat);
  brow.rotation.z = Math.PI / 2;
  const bg2 = new THREE.Group();
  const bd = new THREE.Vector3(s * 0.33, 0.62, 0.72).normalize().multiplyScalar(R * 1.0);
  bg2.position.copy(bd);
  bg2.lookAt(bd.clone().multiplyScalar(2));
  bg2.add(brow);
  orient.add(bg2);
  return { g, pupilG, lid, brow: bg2, s };
});
const smile = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.017, 10, 32, Math.PI), darkMat);
smile.rotation.z = Math.PI;
const mouthO = new THREE.Mesh(new THREE.SphereGeometry(0.06, 24, 16), darkMat);
const mouthG = new THREE.Group();
const md = new THREE.Vector3(0, -0.2, 1).normalize().multiplyScalar(R * 0.97);
mouthG.position.copy(md);
mouthG.lookAt(md.clone().multiplyScalar(2));
mouthG.add(smile, mouthO);
orient.add(mouthG);
const cheekMat = new THREE.MeshBasicMaterial({ color: 0xff5a4a, transparent: true, opacity: 0.35, depthWrite: false });
[-1, 1].forEach((s) => {
  const c = new THREE.Mesh(new THREE.CircleGeometry(0.045, 20), cheekMat);
  const d = new THREE.Vector3(s * 0.62, -0.05, 0.78).normalize().multiplyScalar(R * 1.003);
  c.position.copy(d); c.lookAt(d.clone().multiplyScalar(2));
  orient.add(c);
});
const sweatMat = new THREE.MeshPhysicalMaterial({ color: 0x9fe0ff, roughness: 0.05, transparent: true, opacity: 0.85, clearcoat: 1 });
const sweat = new THREE.Group();
{
  const d1 = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), sweatMat);
  const d2 = new THREE.Mesh(new THREE.ConeGeometry(0.033, 0.06, 16), sweatMat);
  d2.position.y = 0.045;
  sweat.add(d1, d2);
  sweat.position.set(0.27, 0.16, 0.12);
  orient.add(sweat);
}

// ------------------------------------------------------------------ trail + sparks
const TRAIL_N = 30;
const trailGeo = new THREE.BufferGeometry();
trailGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array((TRAIL_N + 1) * 2 * 3), 3));
trailGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array((TRAIL_N + 1) * 2 * 3), 3));
{
  const idx = [];
  for (let i = 0; i < TRAIL_N; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  trailGeo.setIndex(idx);
}
const trail = new THREE.Mesh(trailGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, toneMapped: false }));
trail.frustumCulled = false;
scene.add(trail);

const SPARK_MAX = 600;
const sparkGeo = new THREE.BufferGeometry();
sparkGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(SPARK_MAX * 3), 3));
sparkGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(SPARK_MAX * 3), 3));
const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ size: 0.09, map: softDotTex(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
sparks.frustumCulled = false;
scene.add(sparks);

const starSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex(), color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
scene.add(starSprite);

// ------------------------------------------------------------------ post
const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.6, 0.5, 1.05);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const finalPass = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, fade: { value: 0 }, flashAmt: { value: 0 }, vig: { value: 0.35 }, grain: { value: 0.035 }, ca: { value: 0.0015 }, res: { value: new THREE.Vector2(W, H) } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float time, fade, flashAmt, vig, grain, ca; uniform vec2 res; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + time*13.17)*43758.5453); }
    void main(){
      vec2 d = vUv - 0.5;
      float r2 = dot(d*vec2(res.x/res.y,1.0), d*vec2(res.x/res.y,1.0));
      vec2 off = d * ca * (1.0 + r2*4.0);
      vec3 c = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      c *= 1.0 - vig * smoothstep(0.08, 0.55, r2);
      c += (h(vUv*res) - 0.5) * grain;
      c = mix(c, vec3(1.0), flashAmt);
      c *= 1.0 - fade;
      gl_FragColor = vec4(c, 1.0);
    }`,
});
composer.addPass(finalPass);

// ------------------------------------------------------------------ HUD captions
const hud = new THREE.Scene();
const hudCam = new THREE.OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, -10, 10);
const FONT = '"WenQuanYi Zen Hei", "Noto Sans CJK SC", sans-serif';
function textCanvas(lines) {
  // lines: [{text, size, fill, stroke, sw, spacing}]
  const pad = 40;
  const meas = document.createElement('canvas').getContext('2d');
  let w = 0, h = 0;
  for (const l of lines) {
    meas.font = `bold ${l.size}px ${FONT}`;
    const tw = meas.measureText(l.text).width + (l.spacing || 0) * l.text.length;
    w = Math.max(w, tw); h += l.size * 1.25;
  }
  const c = document.createElement('canvas');
  c.width = Math.ceil(w + pad * 2); c.height = Math.ceil(h + pad * 2);
  const g = c.getContext('2d');
  let y = pad;
  for (const l of lines) {
    g.font = `bold ${l.size}px ${FONT}`;
    g.textAlign = 'center'; g.textBaseline = 'top';
    if ('letterSpacing' in g) g.letterSpacing = `${l.spacing || 0}px`;
    g.lineJoin = 'round';
    const x = c.width / 2;
    if (l.shadow) { g.shadowColor = l.shadow; g.shadowBlur = 24; g.shadowOffsetY = 6; }
    if (l.stroke) { g.strokeStyle = l.stroke; g.lineWidth = l.sw; g.strokeText(l.text, x, y); }
    g.shadowColor = 'transparent';
    g.fillStyle = l.fill;
    if (l.grad) {
      const gr = g.createLinearGradient(0, y, 0, y + l.size);
      gr.addColorStop(0, l.grad[0]); gr.addColorStop(1, l.grad[1]);
      g.fillStyle = gr;
    }
    g.fillText(l.text, x, y);
    y += l.size * 1.25;
  }
  return c;
}
function makeCaption(def) {
  let lines;
  if (def.style === 'title') {
    lines = [
      { text: def.sub, size: 44, fill: '#ffd98a', spacing: 10, stroke: 'rgba(0,0,0,0.55)', sw: 8 },
      { text: def.text, size: 76, fill: '#ffffff', stroke: 'rgba(10,6,20,0.85)', sw: 12, shadow: 'rgba(0,0,0,0.6)' },
    ];
  } else if (def.style === 'big') {
    lines = [{ text: def.text, size: def.size || 112, fill: '#ffe14d', grad: def.grad || ['#fff7b0', '#ffb81f'], stroke: '#1b0f2a', sw: 20, shadow: 'rgba(0,0,0,0.65)' }];
    if (def.sub) lines.push({ text: def.sub, size: 54, fill: '#ffffff', stroke: '#1b0f2a', sw: 12 });
  } else {
    lines = [{ text: def.text, size: def.size || 72, fill: '#ffffff', stroke: '#1b0f2a', sw: 14, shadow: 'rgba(0,0,0,0.6)' }];
  }
  const c = textCanvas(lines);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(c.width * PX, c.height * PX), m);
  mesh.visible = false;
  hud.add(mesh);
  return { ...def, mesh, m };
}

// ------------------------------------------------------------------ state
let TL, CH, S, ctx, updaters, captions, camPath, lookPath, homeApi, tCut, tPanic;

function paletteAt(t) {
  const segs = [
    [0, 'intro'], [S.intro_chord + 0.1, 'intro'], [S.mozart + 0.2, 'mozart'],
    [S.mozart_end - 0.9, 'mozart'], [S.cave - 0.15, 'cave'],
    [S.cave_end + 0.35, 'cave'], [S.cancan - 0.1, 'cancan'],
    [tCut - 0.001, 'cancan'], [tCut, 'night'],
    [S.phone - 0.05, 'night'], [S.phone + 0.5, 'morning'],
  ];
  for (let i = segs.length - 1; i >= 0; i--) {
    if (t >= segs[i][0]) {
      const a = segs[i], b = segs[i + 1];
      if (!b) return PAL[a[1]];
      const u = smooth(a[0], b[0], t);
      return a[1] === b[1] ? PAL[a[1]] : mixPal(PAL[a[1]], PAL[b[1]], u);
    }
  }
  return PAL.intro;
}

function followParams(t) {
  // distance / height offsets of the follow camera per section
  let dist = 8.6, up = 1.2, look = -1.1;
  if (t > S.cave - 0.5) { dist = lerp(8.6, 7.6, smooth(S.cave - 0.5, S.cave + 1, t)); }
  if (t > tPanic - 1) { dist = lerp(dist, 6.6, smooth(tPanic - 1, tPanic + 0.3, t)); look = lerp(look, -0.7, smooth(tPanic - 1, tPanic, t)); }
  if (t > S.cave_end - 0.2) { dist = lerp(dist, 9.0, smooth(S.cave_end - 0.2, S.cave_end + 0.6, t)); }
  if (t > S.cancan - 0.5) { dist = lerp(dist, 8.4, smooth(S.cancan - 0.5, S.cancan + 0.5, t)); }
  return { dist, up, look };
}

function precomputePaths() {
  const dt = 1 / 120;
  const n = Math.ceil((TL.duration + 2) / dt);
  camPath = new Float32Array(n * 3);
  lookPath = new Float32Array(n * 2);
  let p = { ...ballState(CH, 0).p }, v = { x: 0, y: 0, z: 0 };
  let lp = { x: 0, y: 0 }, lv = { x: 0, y: 0 };
  let last = p;
  for (let i = 0; i < n; i++) {
    const t = i * dt;
    const bs = ballState(CH, t + 0.12);
    const tgt = bs.hidden ? last : bs.p;
    last = tgt;
    const w = t > tPanic - 0.5 && t < S.cave_end ? 7.5 : 5.2;
    if (Math.abs(t - tCut) < dt / 2 || Math.abs(t - CH.warpT) < dt / 2) { p = { ...tgt }; v = { x: 0, y: 0, z: 0 }; }
    for (const k of ['x', 'y', 'z']) {
      const a = w * w * (tgt[k] - p[k]) - 2 * w * v[k];
      v[k] += a * dt; p[k] += v[k] * dt;
    }
    camPath[i * 3] = p.x; camPath[i * 3 + 1] = p.y; camPath[i * 3 + 2] = p.z;
    // pupils follow velocity with lag
    const bv = ballState(CH, t).v;
    const lt = { x: clamp(bv.x * 0.012, -0.03, 0.03), y: clamp(bv.y * 0.006, -0.03, 0.03) };
    const lw = 14;
    for (const k of ['x', 'y']) { const a = lw * lw * (lt[k] - lp[k]) - 2 * lw * lv[k]; lv[k] += a * dt; lp[k] += lv[k] * dt; }
    lookPath[i * 2] = lp.x; lookPath[i * 2 + 1] = lp.y;
  }
}
function sampleCam(t) {
  const f = clamp(t * 120, 0, camPath.length / 3 - 2);
  const i = Math.floor(f), u = f - i;
  return new THREE.Vector3(
    lerp(camPath[i * 3], camPath[i * 3 + 3], u),
    lerp(camPath[i * 3 + 1], camPath[i * 3 + 4], u),
    lerp(camPath[i * 3 + 2], camPath[i * 3 + 5], u));
}
function sampleLook(t) {
  const f = clamp(t * 120, 0, lookPath.length / 2 - 2);
  const i = Math.floor(f), u = f - i;
  return [lerp(lookPath[i * 2], lookPath[i * 2 + 2], u), lerp(lookPath[i * 2 + 1], lookPath[i * 2 + 3], u)];
}

function followCam(t) {
  const s = sampleCam(t);
  const fp = followParams(t);
  const pos = new THREE.Vector3(s.x * 0.55, s.y + fp.up, s.z + fp.dist);
  const look = new THREE.Vector3(s.x * 0.75, s.y + fp.look, s.z);
  return { pos, look, fov: 42 };
}

function introCam(t) {
  const b = new THREE.Vector3(-2.6, R, 0);
  const shots = [
    [0.0, new THREE.Vector3(1.6, 2.2, 7.6), new THREE.Vector3(-3.4, 1.1, -1.0), 40],
    [0.3, b.clone().add(new THREE.Vector3(1.0, 0.45, 3.3)), b.clone().add(new THREE.Vector3(-0.25, 0.2, 0)), 40],
    [1.75, b.clone().add(new THREE.Vector3(0.5, 0.24, 2.1)), b.clone().add(new THREE.Vector3(-0.08, 0.1, 0)), 40],
    [2.75, b.clone().add(new THREE.Vector3(0.08, 0.12, 1.3)), b.clone().add(new THREE.Vector3(0.0, 0.06, 0)), 38],
  ];
  let i = shots.length - 1;
  while (i > 0 && t < shots[i][0]) i--;
  const cur = shots[i], prev = shots[Math.max(0, i - 1)];
  const u = i === 0 ? 1 : easeOutCubic((t - cur[0]) / 0.09);
  const creep = (t - cur[0]) * 0.04;
  const pos = prev[1].clone().lerp(cur[1], u);
  const look = prev[2].clone().lerp(cur[2], u);
  pos.lerp(look, Math.min(0.3, creep));
  return { pos, look, fov: cur[3] };
}

function camAt(t) {
  let c;
  if (t < S.intro_chord) c = introCam(t);
  else if (t < tCut) {
    const f = followCam(Math.min(t, S.kick));
    if (t < S.mozart + 0.2) {
      const wide = { pos: new THREE.Vector3(0.9, 1.4, 8.4), look: new THREE.Vector3(-1.3, -0.6, 0) };
      const u = smooth(S.intro_chord + 0.25, S.mozart + 0.15, t);
      c = { pos: wide.pos.lerp(f.pos, u), look: wide.look.lerp(f.look, u), fov: 42 };
    } else c = f;
    if (t > S.kick) {
      const bp = ballState(CH, Math.min(t, CH.tAway - 0.01)).p;
      const u = smooth(S.kick, S.kick + 0.6, t);
      c.look = c.look.clone().lerp(new THREE.Vector3(bp.x, bp.y, bp.z), u * 0.75);
      c.pos = c.pos.clone().add(new THREE.Vector3(0, -1.2 * u, 0.8 * u));
    }
  } else {
    const O = CH.homeOrigin;
    const land = S.land;
    const base = new THREE.Vector3(O.x + 0.3, O.y + 2.0, O.z + 6.6);
    const look = new THREE.Vector3(O.x + 0.3, O.y + 1.65, O.z - 1);
    const push1 = smooth(tCut, land, t) * 0.08;
    const pil = new THREE.Vector3(O.x + 1.4, O.y + 1.0, O.z - 0.5);
    const push2 = easeOutCubic(clamp((t - land - 0.4) / 5.5)) * 0.55;
    const pos = base.clone().lerp(look, push1);
    pos.lerp(pil.clone().add(new THREE.Vector3(-0.1, 0.55, 2.2)), push2);
    const lk = look.clone().lerp(pil, push2);
    // shock zoom
    const z = easeOutCubic(clamp((t - S.shock) / 0.12));
    const ballP = ballRoot.position;
    if (z > 0) {
      pos.lerp(ballP.clone().add(new THREE.Vector3(0.05, 0.15, 1.25)), z * 0.85);
      lk.lerp(ballP, z);
    }
    c = { pos, look: lk, fov: 50 };
  }
  // impact shake
  const hi = lastIdx(hitTimes, t);
  if (hi >= 0) {
    const h = CH.hits[hi];
    const dt = t - h.t;
    const amp = (h.kind === 'smash' || h.kind === 'kick' || h.kind === 'big' ? 0.09 : 0.025) * h.strength * Math.exp(-dt / 0.09);
    c.pos.x += Math.sin(dt * 71 + hi) * amp;
    c.pos.y += Math.cos(dt * 63 + hi * 2) * amp;
  }
  if (t >= S.shock) {
    const amp = 0.05 * Math.exp(-(t - S.shock) / 0.25);
    c.pos.x += Math.sin(t * 80) * amp; c.pos.y += Math.cos(t * 70) * amp;
  }
  return c;
}
let hitTimes = [];

// expression state
function exprAt(t) {
  const e = { eye: 1, pupil: 1, mouth: 'smile', mouthS: 1, browA: 0, browY: 0, sweat: 0, closed: 0 };
  if (t < S.intro_chord) {
    if (t >= 0.3) { e.eye = 1.12; e.mouth = 'smile'; e.mouthS = 0.7; }
    if (t >= 1.75) { e.eye = 1.25; e.browY = 0.02; e.mouthS = 0.4; }
    if (t >= 2.75) { e.eye = 1.3; e.pupil = 0.62; e.mouth = 'o'; e.mouthS = 0.45; e.browY = 0.035; e.browA = -0.25; }
    // blink
    if (t > 1.0 && t < 1.12) e.closed = 1 - Math.abs(t - 1.06) / 0.06;
  } else if (t < S.mozart) {
    e.eye = 1.3; e.mouth = 'o'; e.mouthS = 1.25; e.browY = 0.04;
  } else if (t < S.cave - 0.6) {
    e.mouth = 'smile'; e.mouthS = 1.1;
    const bt = (t - S.mozart) % 3.1; if (bt < 0.1) e.closed = 1 - Math.abs(bt - 0.05) / 0.05;
  } else if (t < S.cave_end + 0.3) {
    e.mouth = 'o'; e.mouthS = 0.6; e.browA = 0.35; e.eye = 1.15;
    const p = smooth(tPanic - 3, tPanic, t);
    e.eye = lerp(1.15, 1.45, p); e.pupil = lerp(1, 0.6, p); e.mouthS = lerp(0.6, 1.35, p);
    e.sweat = smooth(S.cave + 4, S.cave + 6, t);
  } else if (t < S.kick) {
    e.mouth = 'smile'; e.mouthS = 1.25; e.browY = 0.015;
    if (t < S.cancan + 0.4) { e.mouth = 'o'; e.eye = 1.3; }
  } else if (t < S.land) {
    e.mouth = 'o'; e.mouthS = 1.3; e.eye = 1.5; e.pupil = 0.55; e.browY = 0.04;
    if (t > CH.warpT) { e.eye = 1.35; e.mouthS = 1.1; }
  } else if (t < S.shock) {
    e.mouth = 'smile'; e.mouthS = 0.9;
    e.closed = smooth(S.land + 0.9, S.land + 1.4, t);
    if (t > S.phone) e.browA = 0.2 * Math.sin((t - S.phone) * 20);
  } else {
    e.eye = 1.5; e.pupil = 0.5; e.mouth = 'o'; e.mouthS = 1.5; e.browY = 0.06; e.closed = 0;
  }
  return e;
}

// ------------------------------------------------------------------ setup
async function setup() {
  TL = await (await fetch('../build/timeline.json')).json();
  S = TL.sections;
  CH = buildChoreo(TL);
  tCut = CH.tAway;
  tPanic = CH.hits.find((h) => h.kind === 'wall').t;
  hitTimes = CH.hits.map((h) => h.t);
  await document.fonts.load(`bold 40px ${FONT}`).catch(() => {});
  ctx = { scene, CH, TL, S, windows: [], tCut };
  const pads = buildPads(ctx);
  const city = buildCity(ctx);
  const cave = buildCave(ctx);
  const cancan = buildCancan(ctx);
  homeApi = buildHome(ctx);
  updaters = [pads, city, cave, cancan, homeApi];
  precomputePaths();

  const capDefs = [
    { t0: 0.3, t1: 1.7, style: 'big', text: '周五 17:59', size: 120, y: 0.38 },
    { t0: 1.75, t1: 2.7, style: 'mid', text: '还有最后一分钟……', y: 0.38 },
    { t0: 2.75, t1: 3.7, style: 'mid', text: '（深呼吸）', y: 0.38 },
    { t0: S.intro_chord, t1: S.mozart + 0.3, style: 'big', text: '18:00 下班！！', size: 128, y: 0.38, shake: 1 },
    { t0: S.mozart + 0.35, t1: S.mozart + 4.6, style: 'title', sub: '第 一 站', text: '莫扎特《弦乐小夜曲》', y: -0.33 },
    { t0: S.mozart + 7.3, t1: S.mozart + 10.8, style: 'mid', text: '优雅，永不过时 ♪', y: 0.38 },
    { t0: S.cave + 0.2, t1: S.cave + 4.5, style: 'title', sub: '第 二 站', text: '格里格《山魔王的大厅》', y: -0.33 },
    { t0: S.cave + 8.6, t1: tPanic - 0.2, style: 'mid', text: '等等……怎么越来越快？', y: 0.38 },
    { t0: tPanic, t1: S.cave_end + 0.8, style: 'big', text: '救——命——啊！', size: 120, y: 0.38, shake: 1 },
    { t0: S.cancan + 0.2, t1: S.cancan + 4.4, style: 'title', sub: '第 三 站', text: '奥芬巴赫《康康舞曲》', y: -0.33 },
    { t0: S.kick, t1: tCut, style: 'big', text: '被踢出群聊！', size: 124, y: 0.38, shake: 1 },
    { t0: tCut + 0.05, t1: S.home + 3.0, style: 'title', sub: '终 点 站', text: '贝多芬《命运交响曲》', y: -0.36 },
    { t0: S.land + 0.25, t1: S.lullaby + 1.6, style: 'big', text: '到家！躺平！', size: 120, y: 0.38 },
    { t0: S.lullaby + 2.2, t1: S.phone - 0.15, style: 'mid', text: '周末愉快～', y: 0.38 },
    { t0: S.phone, t1: S.shock - 0.05, style: 'big', text: '周一 08:59', sub: '来电：老板', size: 120, y: 0.38, grad: ['#ffffff', '#9fd8ff'] },
    { t0: S.shock, t1: S.end + 1, style: 'big', text: '命运来电：该上班了', size: 96, y: 0.382, shake: 1 },
  ];
  captions = capDefs.map(makeCaption);
  window.ready = true;
}

// ------------------------------------------------------------------ frame
const tmpQ = new THREE.Quaternion(), tmpQ2 = new THREE.Quaternion(), tmpM = new THREE.Matrix4();
const UPV = new THREE.Vector3(0, 1, 0);

function updateBall(t, cam) {
  const st = ballState(CH, t);
  ballRoot.visible = !st.hidden;
  ballRoot.position.set(st.p.x, st.p.y, st.p.z);
  const v = new THREE.Vector3(st.v.x, st.v.y, st.v.z);
  const speed = v.length();
  // idle bob while resting on the roof
  if (t < S.intro_chord) ballRoot.position.y += Math.abs(Math.sin(t * 5.2)) * 0.0;
  // sleep breathing / shock jump
  if (t > S.land + 1.5 && t < S.shock) ballRoot.position.y += Math.sin(t * 2.4) * 0.008;
  if (t >= S.shock) ballRoot.position.y += Math.max(0, Math.sin(clamp((t - S.shock) / 0.4) * Math.PI)) * 0.35;

  // squash & stretch
  const hi = lastIdx(hitTimes, t + 0.02);
  let axis = UPV.clone(), sq = 0;
  if (hi >= 0) {
    const h = CH.hits[hi];
    const dt = t - h.t;
    if (dt > -0.02) {
      const amp = h.kind === 'land' ? 0.3 : 0.26 * Math.min(1.4, h.strength);
      sq = dt < 0 ? 0 : amp * Math.exp(-dt * 16) * Math.cos(dt * 34);
      axis.set(h.n.x, h.n.y, h.n.z);
    }
  }
  let sAxis = 1 - sq, sPerp = 1 + sq * 0.55;
  if (Math.abs(sq) < 0.03 && speed > 2) {
    axis.copy(v).normalize();
    const k = Math.min(0.16, speed * 0.006);
    sAxis = 1 + k; sPerp = 1 - k * 0.45;
  }
  tmpQ.setFromUnitVectors(UPV, axis);
  squash.quaternion.copy(tmpQ);
  squash.scale.set(sPerp, sAxis, sPerp);

  // face toward the camera, leaning into the motion
  const toCam = cam.pos.clone().sub(ballRoot.position).normalize();
  const lean = v.clone().multiplyScalar(0.025);
  lean.clampLength(0, 0.6);
  const dir = toCam.clone().add(lean).normalize();
  tmpM.lookAt(dir, new THREE.Vector3(), UPV);
  tmpQ2.setFromRotationMatrix(tmpM);
  // wobble & spin
  let roll = clamp(-st.v.x * 0.03, -0.35, 0.35) + noise1(t * 1.7) * 0.06;
  if (t > S.kick && t < tCut) roll += (t - S.kick) * 14;
  tmpQ2.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll));
  orient.quaternion.copy(tmpQ.clone().invert().multiply(tmpQ2));

  // expression
  const e = exprAt(t);
  const [lx, ly] = sampleLook(t);
  let jx = 0, jy = 0;
  if (t > tPanic - 1 && t < S.cave_end) { jx = noise1(t * 30) * 0.012; jy = noise1(t * 27 + 4) * 0.012; }
  eyes.forEach((ey) => {
    ey.g.scale.setScalar(e.eye);
    ey.pupilG.scale.setScalar(e.pupil);
    ey.pupilG.position.set(clamp(lx + jx, -0.035, 0.035), clamp(ly + jy, -0.035, 0.035), 0.078);
    // lid: rotate cap down to cover the eye
    ey.lid.visible = e.closed > 0.02;
    ey.lid.rotation.x = Math.PI / 2 - (1 - e.closed) * 1.6;
    ey.brow.position.y = (ey.brow.userData.y0 ??= ey.brow.position.y) + e.browY;
    ey.brow.rotation.z = ey.s * e.browA;
  });
  smile.visible = e.mouth === 'smile';
  mouthO.visible = e.mouth === 'o';
  smile.scale.setScalar(e.mouthS);
  mouthO.scale.set(0.8 * e.mouthS, 1.0 * e.mouthS, 0.5);
  sweat.visible = e.sweat > 0.01;
  sweat.scale.setScalar(e.sweat);
  sweat.position.y = 0.16 - ((t * 0.8) % 1) * 0.06;
  return { st, speed, v };
}

function updateTrail(t, cam, pal) {
  const pos = trailGeo.attributes.position, col = trailGeo.attributes.color;
  const st = ballState(CH, t);
  const show = !st.hidden && t > S.intro_chord && Math.hypot(st.v.x, st.v.y, st.v.z) > 3;
  trail.visible = show;
  if (!show) return;
  let prev = null;
  for (let k = 0; k <= TRAIL_N; k++) {
    const tk = t - k * 0.007;
    const s = ballState(CH, tk);
    const p = new THREE.Vector3(s.p.x, s.p.y, s.p.z);
    const nxt = ballState(CH, tk - 0.004).p;
    const tan = p.clone().sub(new THREE.Vector3(nxt.x, nxt.y, nxt.z)).normalize();
    const view = cam.pos.clone().sub(p).normalize();
    const side = tan.clone().cross(view).normalize();
    const w = R * 0.8 * Math.pow(1 - k / TRAIL_N, 1.3);
    pos.setXYZ(k * 2, p.x + side.x * w, p.y + side.y * w, p.z + side.z * w - 0.05);
    pos.setXYZ(k * 2 + 1, p.x - side.x * w, p.y - side.y * w, p.z - side.z * w - 0.05);
    const a = 0.55 * Math.pow(1 - k / TRAIL_N, 1.6) * (s.seg === st.seg || !s.seg.hold ? 1 : 0);
    col.setXYZ(k * 2, pal.trail.r * a, pal.trail.g * a, pal.trail.b * a);
    col.setXYZ(k * 2 + 1, pal.trail.r * a, pal.trail.g * a, pal.trail.b * a);
  }
  pos.needsUpdate = true; col.needsUpdate = true;
}

function updateSparks(t) {
  const pos = sparkGeo.attributes.position, col = sparkGeo.attributes.color;
  let n = 0;
  const hi = lastIdx(hitTimes, t);
  for (let i = hi; i >= 0 && n < SPARK_MAX; i--) {
    const h = CH.hits[i];
    const dt = t - h.t;
    if (dt > 0.9) break;
    const pad = ctx.pads.find((p) => p.h === h);
    const c = pad ? pad.accent : new THREE.Color(0xffe0a0);
    const r = rng(h.i * 31 + 7);
    const cnt = h.kind === 'smash' || h.kind === 'kick' || h.kind === 'land' ? 40 : h.kind === 'wall' ? 8 : 20;
    for (let k = 0; k < cnt && n < SPARK_MAX; k++) {
      const sp = 2 + r() * 4;
      const a = r() * Math.PI * 2;
      const vx = h.n.x * sp + Math.cos(a) * (1 + r() * 2.5);
      const vy = h.n.y * sp + (r() - 0.3) * 2;
      const vz = h.n.z * sp + Math.sin(a) * (1 + r() * 2.5);
      const drag = (1 - Math.exp(-dt * 3)) / 3;
      const life = 0.5 + r() * 0.4;
      const fade = Math.max(0, 1 - dt / life);
      pos.setXYZ(n, h.p.x - h.n.x * R + vx * drag, h.p.y - h.n.y * R + vy * drag - 4 * dt * dt, h.p.z - h.n.z * R + vz * drag);
      const b = fade * fade * 1.3;
      col.setXYZ(n, c.r * b, c.g * b, c.b * b);
      n++;
    }
  }
  for (let k = n; k < SPARK_MAX; k++) { pos.setXYZ(k, 0, -9999, 0); col.setXYZ(k, 0, 0, 0); }
  pos.needsUpdate = true; col.needsUpdate = true;
  sparkGeo.setDrawRange(0, Math.max(1, n));
}

function updateHitLights(t) {
  const hi = lastIdx(hitTimes, t);
  let used = 0;
  for (let i = hi; i >= 0 && used < hitLights.length; i--) {
    const h = CH.hits[i];
    const dt = t - h.t;
    if (dt > 1.0) break;
    const pad = ctx.pads.find((p) => p.h === h);
    if (!pad) continue;
    const L = hitLights[used++];
    L.color.copy(pad.accent);
    const gap = i > 0 ? Math.min(1, (h.t - CH.hits[i - 1].t) / 0.35) : 1;
    L.intensity = (5 * h.strength * Math.exp(-dt / 0.2) + 0.8 * Math.exp(-dt / 0.8)) * (0.35 + 0.65 * gap);
    L.position.set(h.p.x - h.n.x * 0.75, h.p.y - h.n.y * 0.75, h.p.z - h.n.z * 0.75 - 0.3);
  }
  for (let k = used; k < hitLights.length; k++) hitLights[k].intensity = 0;
}

function updateCaptions(t) {
  for (const c of captions) {
    const on = t >= c.t0 && t < c.t1;
    c.mesh.visible = on;
    if (!on) continue;
    const a = t - c.t0, b = c.t1 - t;
    const pop = c.style === 'title' ? easeOutCubic(a / 0.35) : easeOutBack(clamp(a / 0.22));
    const out = clamp(b / 0.18);
    c.m.opacity = Math.min(clamp(a / 0.08), out);
    let x = 0, y = c.y * H, s = c.style === 'title' ? 1 : Math.max(0.01, pop);
    if (c.style === 'title') x = (1 - pop) * -120 * PX;
    if (c.shake) { x += noise1(t * 25) * 7 * PX; y += noise1(t * 23 + 9) * 7 * PX; c.mesh.rotation.z = noise1(t * 9) * 0.03; }
    else c.mesh.rotation.z = c.style === 'big' ? Math.sin(a * 3) * 0.02 : 0;
    c.mesh.position.set(x, y, 0);
    c.mesh.scale.setScalar(s * (c.style === 'big' ? 1 + 0.03 * Math.sin(a * 6) : 1));
  }
}

function renderFrame(t) {
  const pal = paletteAt(t);
  const cam = camAt(t);
  camera.position.copy(cam.pos);
  camera.lookAt(cam.look);
  if (camera.fov !== cam.fov) { camera.fov = cam.fov; camera.updateProjectionMatrix(); }
  for (const w of ctx.windows) w.obj.visible = t >= w.t0 && t <= w.t1;
  const bs = updateBall(t, cam);

  bgMat.uniforms.top.value.copy(pal.top);
  bgMat.uniforms.mid.value.copy(pal.mid);
  bgMat.uniforms.bot.value.copy(pal.bot);
  bgMat.uniforms.stars.value = pal.stars;
  bg.position.copy(camera.position);
  scene.fog.color.copy(pal.fog);
  scene.fog.density = pal.fogD;
  hemi.color.copy(pal.hemiS); hemi.groundColor.copy(pal.hemiG); hemi.intensity = pal.hemi;
  scene.environmentIntensity = pal.env;
  const focus = t >= tCut ? new THREE.Vector3(CH.homeOrigin.x + 0.4, CH.homeOrigin.y + 1, CH.homeOrigin.z - 0.5) : cam.look.clone();
  key.color.copy(pal.key); key.intensity = pal.keyI;
  if (t >= tCut) {
    const morning = smooth(S.phone - 0.05, S.phone + 0.5, t);
    key.position.copy(focus).add(new THREE.Vector3(lerp(-1.5, -3, morning), 6, lerp(-6, 5, morning)));
    key.intensity += homeApi.lightning(t) * 6;
  } else key.position.copy(focus).add(new THREE.Vector3(4, 7, 6));
  key.target.position.copy(focus);
  rim.color.copy(pal.rim); rim.intensity = pal.rimI;
  rim.position.copy(focus).add(new THREE.Vector3(-3, 4, -8));
  rim.target.position.copy(focus);
  renderer.toneMappingExposure = pal.exp;
  bloom.strength = pal.bloom;

  for (const u of updaters) u.update(t, camera);
  updateTrail(t, cam, pal);
  updateSparks(t);
  updateHitLights(t);
  // kick star twinkle
  const tw = t - (S.kick + 1.1);
  starSprite.visible = tw > -0.05 && tw < 0.35;
  if (starSprite.visible) {
    const bp = ballState(CH, Math.min(t, tCut - 0.01)).p;
    starSprite.position.set(bp.x, bp.y, bp.z);
    const s = Math.sin(clamp((tw + 0.05) / 0.4) * Math.PI) * 4.5;
    starSprite.scale.set(s, s, 1);
    starSprite.material.rotation = tw * 3;
  }

  // global flashes and fades
  let fl = 0;
  fl += 0.55 * flash([S.intro_chord], t, 0.12);
  fl += 0.4 * flash([S.kick], t, 0.1);
  if (t >= tCut) fl += 0.35 * homeApi.lightning(t);
  fl += 0.6 * flash([S.shock], t, 0.1);
  if (Math.abs(t - tCut) < 0.06) fl += 0.6 * (1 - Math.abs(t - tCut) / 0.06);
  const fadeIn = 1 - smooth(0, 0.35, t);
  const fadeOut = smooth(S.end - 0.6, S.end, t);
  finalPass.uniforms.flashAmt.value = clamp(fl, 0, 0.9);
  finalPass.uniforms.fade.value = Math.max(fadeIn, fadeOut);
  finalPass.uniforms.time.value = t;

  updateCaptions(t);
  composer.render();
  renderer.autoClear = false;
  renderer.render(hud, hudCam);
  renderer.autoClear = true;
}

window.renderFrame = (t) => { renderFrame(t); return true; };
window.readFrame = () => {
  const gl = renderer.getContext();
  const buf = new Uint8Array(W * H * 4);
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  return buf;
};
window.getDuration = () => TL.duration;
setup().catch((e) => { console.error('setup failed', e.stack || e); window.setupError = String(e.stack || e); });
