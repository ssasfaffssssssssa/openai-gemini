import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { R, HOME, PAD_DIMS, padType, padCenter, padRecede, ballState, hash } from './choreo.js';
import {
  clamp, lerp, smooth, easeOutBack, easeOutCubic, rng, lastIdx, flash, rockify, canvasTex,
  softDotTex, starTex, cloudTex, windowsTex, noise1,
} from './util.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

function std(color, o = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, ...o });
}
function phys(color, o = {}) {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.35, ...o });
}
function shadowy(obj, cast = true, recv = true) {
  obj.traverse((o) => { if (o.isMesh) { o.castShadow = cast; o.receiveShadow = recv; } });
  return obj;
}

// Visibility windows keep the per-frame cost down.
function windowed(ctx, obj, t0, t1) {
  ctx.windows.push({ obj, t0, t1 });
  ctx.scene.add(obj);
  return obj;
}

// Assign pulses to decor elements near the ball at pulse time.
function assignPulses(ctx, pulses, elems, radius, pick) {
  const lists = elems.map(() => []);
  pulses.forEach((p, i) => {
    const b = ballState(ctx.CH, p.t).p;
    const near = [];
    elems.forEach((e, j) => { if (Math.abs(e.y - b.y) < radius) near.push(j); });
    if (!near.length) return;
    const k = pick ? pick(p, i, near) : near[(p.pitch ?? i) % near.length];
    lists[k].push(p.t);
  });
  return lists;
}

// ------------------------------------------------------------------ pads
export function buildPads(ctx) {
  const { CH } = ctx;
  const pads = [];
  const keyGeo = new RoundedBoxGeometry(0.32, 0.18, 1.0, 3, 0.035);
  const goldMat = phys(0xffc861, { metalness: 1, roughness: 0.22, emissive: 0xffa024, emissiveIntensity: 0 });
  const drumShellGeo = new THREE.CylinderGeometry(0.44, 0.44, 0.3, 48, 1, true);
  const drumSkinGeo = new THREE.CircleGeometry(0.43, 48);
  const hoopGeo = new THREE.TorusGeometry(0.445, 0.03, 10, 48);
  const crystalGeo = new THREE.OctahedronGeometry(0.16, 0);

  for (const h of CH.hits) {
    const type = padType(h);
    if (!type || type === 'shoe') continue;
    const g = new THREE.Group();
    const inner = new THREE.Group();
    g.add(inner);
    const glowMats = [];
    let baseGlow = 0.5, peakGlow = 6;
    let accent = new THREE.Color(0xffffff);
    const r = rng(h.i * 13 + 5);

    if (type === 'key') {
      const m = phys(0xe9e1cf, { roughness: 0.22, clearcoat: 0.8, clearcoatRoughness: 0.1, emissive: 0xffb347, emissiveIntensity: 0 });
      const key = new THREE.Mesh(keyGeo, m);
      inner.add(key);
      const gm = goldMat.clone();
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.05, 1.04), gm);
      base.position.y = -0.11;
      inner.add(base);
      // a little black key riding at the back
      const bk = new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.1, 0.5, 2, 0.02), phys(0x111111, { roughness: 0.15, clearcoat: 1 }));
      bk.position.set(r() < 0.5 ? -0.12 : 0.12, 0.12, -0.26);
      inner.add(bk);
      glowMats.push({ m, base: 0.0, peak: 0.12 }, { m: gm, base: 0.35, peak: 2.4 });
      accent.set(0xffc060);
    } else if (type === 'rock') {
      const geo = rockify(new THREE.DodecahedronGeometry(1, 1), 0.18, 1.6, h.i);
      geo.scale(0.44, 0.19, 0.38);
      const m = std(0x3a3452, { roughness: 0.92, flatShading: true });
      inner.add(new THREE.Mesh(geo, m));
      const hue = [0.52, 0.83, 0.62][h.i % 3];
      const cm = std(new THREE.Color().setHSL(hue, 0.9, 0.55), { emissive: new THREE.Color().setHSL(hue, 1, 0.5), emissiveIntensity: 0.4, roughness: 0.2, metalness: 0.1 });
      for (let k = 0; k < 4; k++) {
        const c = new THREE.Mesh(crystalGeo, cm);
        const a = r() * Math.PI * 2;
        c.position.set(Math.cos(a) * 0.25, -0.12 - r() * 0.05, Math.sin(a) * 0.2);
        c.scale.set(0.7, 1.6 + r() * 1.2, 0.7);
        c.rotation.set(Math.PI + (r() - 0.5) * 0.6, r() * 3, (r() - 0.5) * 0.6);
        inner.add(c);
      }
      glowMats.push({ m: cm, base: 0.8, peak: 3.5 });
      accent.setHSL(hue, 1, 0.6);
    } else if (type === 'wall') {
      const hue = (0.5 + (h.i % 6) * 0.07) % 1;
      const m = phys(new THREE.Color().setHSL(hue, 0.8, 0.45), { emissive: new THREE.Color().setHSL(hue, 1, 0.5), emissiveIntensity: 0.3, roughness: 0.15, metalness: 0.2, clearcoat: 1 });
      const plate = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), m);
      plate.scale.set(0.95, 0.18, 0.95);
      inner.add(plate);
      glowMats.push({ m, base: 0.35, peak: 2.6 });
      accent.setHSL(hue, 1, 0.6);
    } else if (type === 'smash') {
      const geo = rockify(new THREE.BoxGeometry(1.24, 0.24, 1.0, 6, 2, 6), 0.05, 2.0, h.i);
      const m = std(0x40304a, { roughness: 0.9, flatShading: true, emissive: 0xff5a1a, emissiveIntensity: 0.6 });
      const slab = new THREE.Mesh(geo, m);
      inner.add(slab);
      const chunks = [];
      const cg = new THREE.DodecahedronGeometry(0.17, 0);
      for (let k = 0; k < 9; k++) {
        const c = new THREE.Mesh(cg, m);
        c.visible = false;
        const a = (k / 9) * Math.PI * 2 + r();
        c.userData.v = V(Math.cos(a) * (1.5 + r() * 2.5), 1 + r() * 3, Math.sin(a) * (1 + r() * 2));
        c.userData.w = V(r() * 9, r() * 9, r() * 9);
        c.userData.s = 0.6 + r() * 0.9;
        inner.add(c);
        chunks.push(c);
      }
      g.userData.slab = slab;
      g.userData.chunks = chunks;
      glowMats.push({ m, base: 0.5, peak: 3 });
      accent.set(0xff7a2a);
    } else if (type === 'drum') {
      const shell = new THREE.Mesh(drumShellGeo, phys([0xc8102e, 0x1f5fd1, 0xf2b705][h.i % 3], { clearcoat: 1, clearcoatRoughness: 0.05, roughness: 0.25, side: THREE.DoubleSide }));
      const skinM = phys(0xf6f1e7, { roughness: 0.5, emissive: 0xffd27a, emissiveIntensity: 0 });
      const skin = new THREE.Mesh(drumSkinGeo, skinM);
      skin.rotation.x = -Math.PI / 2;
      skin.position.y = 0.15;
      const gm = goldMat.clone();
      const h1 = new THREE.Mesh(hoopGeo, gm); h1.rotation.x = Math.PI / 2; h1.position.y = 0.15;
      const h2 = new THREE.Mesh(hoopGeo, gm); h2.rotation.x = Math.PI / 2; h2.position.y = -0.15;
      const bottom = new THREE.Mesh(drumSkinGeo, std(0x222222)); bottom.rotation.x = Math.PI / 2; bottom.position.y = -0.15;
      inner.add(shell, skin, h1, h2, bottom);
      glowMats.push({ m: skinM, base: 0.12, peak: 1.0 }, { m: gm, base: 0.25, peak: 1.8 });
      accent.set(0xffd27a);
    }
    shadowy(g, true, true);
    const c = padCenter(h, type);
    g.position.set(c.x, c.y, c.z);
    let n = V(h.n.x, h.n.y, h.n.z);
    g.quaternion.setFromUnitVectors(UP, n);
    // keys/drums keep their long axis toward the camera: twist around n so local z faces +z
    const scene = h.scene;
    ctx.scene.add(g);
    pads.push({ h, g, inner, type, glowMats, accent, base: g.position.clone(), n, scene, appear: h.t - (h.scene === 'mozart' ? 1.1 : 0.9) });
  }
  ctx.pads = pads;

  return {
    update(t) {
      for (const p of pads) {
        const dt = t - p.h.t;
        if (t < p.appear - 0.01 || dt > 6) { p.g.visible = false; continue; }
        p.g.visible = true;
        const s = easeOutBack(clamp((t - p.appear) / 0.32));
        p.g.scale.setScalar(Math.max(0.001, s));
        const dip = dt > 0 ? 0.11 * Math.exp(-dt * 14) * Math.cos(dt * 30) * p.h.strength : 0;
        p.g.position.copy(p.base).addScaledVector(p.n, -dip);
        p.g.position.z += padRecede(dt, p.type);
        if (dt > 0 && p.type !== 'wall') p.g.position.y -= 0.6 * smooth(0.1, 0.5, dt);
        const f = dt >= 0 ? Math.exp(-dt / 0.22) : 0;
        for (const gm of p.glowMats) gm.m.emissiveIntensity = (dt >= 0 ? gm.base : 0.02) + f * gm.peak * p.h.strength;
        if (p.type === 'smash') {
          const broke = dt >= 0;
          p.g.userData.slab.visible = !broke;
          for (const c of p.g.userData.chunks) {
            c.visible = broke && dt < 2.5;
            if (!c.visible) continue;
            const v = c.userData.v;
            c.position.set(v.x * dt, v.y * dt - 12 * dt * dt, v.z * dt);
            c.rotation.set(c.userData.w.x * dt, c.userData.w.y * dt, c.userData.w.z * dt);
            c.scale.setScalar(c.userData.s);
          }
        }
      }
    },
  };
}

// ------------------------------------------------------------------ intro + city
export function buildCity(ctx) {
  const { S } = ctx;
  const grp = new THREE.Group();
  // our skyscraper
  const facadeTex = windowsTex(3, 0.5);
  facadeTex.wrapS = facadeTex.wrapT = THREE.RepeatWrapping;
  facadeTex.repeat.set(2, 7);
  const facade = new THREE.Mesh(new THREE.BoxGeometry(7, 52, 7), std(0x30344a, { roughness: 0.35, metalness: 0.4, emissive: 0xffffff, emissiveMap: facadeTex, emissiveIntensity: 1.1 }));
  facade.position.set(-5.5, -26.3, -0.5);
  grp.add(facade);
  const roofM = std(0x6a6560, { roughness: 0.85 });
  const roof = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.3, 7.2), roofM);
  roof.position.set(-5.5, -0.15, -0.5);
  grp.add(roof);
  const parM = std(0x8a847c, { roughness: 0.8 });
  const par1 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.38, 7.2), parM); par1.position.set(-2.0, 0.19, -0.5);
  const par2 = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.38, 0.16), parM); par2.position.set(-5.5, 0.19, -4.0);
  grp.add(par1, par2);
  // rooftop props
  const acM = std(0x9aa4b0, { roughness: 0.45, metalness: 0.5 });
  for (const [x, z] of [[-4.6, -2.6], [-6.4, -1.0]]) {
    const ac = new THREE.Mesh(new RoundedBoxGeometry(1.1, 0.75, 0.8, 2, 0.05), acM);
    ac.position.set(x, 0.375, z);
    const fan = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 24), std(0x333333));
    fan.position.set(x, 0.76, z);
    grp.add(ac, fan);
  }
  const tank = new THREE.Group();
  const tankBody = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 1.3, 24), std(0x8a5a3c, { roughness: 0.8 }));
  tankBody.position.y = 1.85;
  const tankTop = new THREE.Mesh(new THREE.ConeGeometry(0.85, 0.5, 24), std(0x5a3a28));
  tankTop.position.y = 2.75;
  tank.add(tankBody, tankTop);
  for (let k = 0; k < 4; k++) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2), std(0x444444, { metalness: 0.7 }));
    leg.position.set(Math.cos(k * 1.57 + 0.78) * 0.55, 0.6, Math.sin(k * 1.57 + 0.78) * 0.55);
    tank.add(leg);
  }
  tank.position.set(-7.6, 0, -3.0);
  grp.add(tank);
  // antenna with blinking light
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 3.2), std(0x777777, { metalness: 0.8 }));
  ant.position.set(-8.3, 1.6, -0.5);
  const blinkM = std(0xff2020, { emissive: 0xff1010, emissiveIntensity: 3 });
  const blink = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8), blinkM);
  blink.position.set(-8.3, 3.25, -0.5);
  grp.add(ant, blink);
  // LED billboard clock
  let clockText = '';
  const clockCanvas = document.createElement('canvas');
  clockCanvas.width = 512; clockCanvas.height = 256;
  const clockTex = new THREE.CanvasTexture(clockCanvas);
  clockTex.colorSpace = THREE.SRGBColorSpace;
  const drawClock = (txt, col) => {
    if (txt + col === clockText) return;
    clockText = txt + col;
    const g = clockCanvas.getContext('2d');
    g.fillStyle = '#07080c'; g.fillRect(0, 0, 512, 256);
    g.fillStyle = 'rgba(255,255,255,0.04)';
    for (let x = 0; x < 512; x += 8) for (let y = 0; y < 256; y += 8) g.fillRect(x, y, 5, 5);
    g.font = 'bold 168px "DejaVu Sans Mono", monospace';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = col; g.shadowBlur = 28;
    g.fillStyle = col; g.fillText(txt, 256, 136);
    clockTex.needsUpdate = true;
  };
  drawClock('17:59', '#ff3b2f');
  const boardM = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: clockTex, emissiveIntensity: 2.2, roughness: 0.3 });
  const board = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), boardM);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.5, 0.15), std(0x222428, { metalness: 0.6, roughness: 0.4 }));
  const bg = new THREE.Group();
  frame.position.z = -0.09;
  bg.add(frame, board);
  for (const x of [-0.9, 0.9]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6), std(0x333333, { metalness: 0.8 }));
    pole.position.set(x, -1.4, -0.1);
    bg.add(pole);
  }
  bg.position.set(-4.4, 2.2, -2.4);
  bg.rotation.y = 0.25;
  grp.add(bg);
  shadowy(grp, true, true);
  board.castShadow = false;

  // skyline
  const sky = new THREE.Group();
  const r = rng(42);
  const texs = [windowsTex(11, 0.35), windowsTex(12, 0.55), windowsTex(13, 0.25, false), windowsTex(14, 0.45)];
  for (let i = 0; i < 90; i++) {
    const w = 3 + r() * 6, d = 3 + r() * 6;
    const top = -38 + r() * 40;
    const h = top + 52;
    let x = (r() < 0.5 ? -1 : 1) * (6 + r() * 50);
    const z = -14 - r() * 90;
    if (x < 0 && x > -14 && z > -20) x -= 10;
    const tex = texs[i % 4].clone();
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(Math.max(1, Math.round(w / 3)), Math.max(1, Math.round(h / 7)));
    tex.needsUpdate = true;
    const m = std(new THREE.Color().setHSL(0.65, 0.15, 0.12 + r() * 0.1), { roughness: 0.4, metalness: 0.4, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.9 });
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, -52 + h / 2, z);
    sky.add(b);
  }
  // sun glow
  const sunM = new THREE.SpriteMaterial({ map: softDotTex(), color: 0xffb070, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
  const sun = new THREE.Sprite(sunM);
  sun.scale.set(90, 90, 1);
  sun.position.set(25, -18, -160);
  sky.add(sun);
  // clouds
  const ct = cloudTex();
  const clouds = [];
  for (let i = 0; i < 30; i++) {
    const m = new THREE.SpriteMaterial({ map: ct, color: new THREE.Color().setHSL(0.93 + r() * 0.1, 0.55, 0.62), transparent: true, opacity: 0.18 + r() * 0.22, depthWrite: false });
    const s = new THREE.Sprite(m);
    const sc = 5 + r() * 9;
    s.scale.set(sc * 1.6, sc, 1);
    s.position.set((r() - 0.5) * 40, -4 - r() * 46, -16 - r() * 30);
    sky.add(s);
    clouds.push(s);
  }
  // ground with a hole (crossed on the way to the cave)
  const crossY = -53;
  let tc = S.mozart_end - 0.9;
  for (let t = S.mozart_end - 1.2; t < S.cave; t += 0.005) if (ballState(ctx.CH, t).p.y < crossY) { tc = t; break; }
  const hole = ballState(ctx.CH, tc).p;
  const ground = makeSlabWithHole(400, 3.0, 2.3, hole.x, hole.z,
    std(0x3d3d42, { roughness: 0.9 }), std(0x2a2232, { roughness: 1 }));
  ground.position.y = crossY + 1.5;
  // street markings / grass ring around the hole for scale
  const grass = new THREE.Mesh(new THREE.RingGeometry(2.3, 5.5, 48), std(0x3f7a35, { roughness: 1 }));
  grass.rotation.x = -Math.PI / 2;
  grass.position.set(hole.x, crossY + 1.52, hole.z);
  sky.add(ground, grass);
  shadowy(sky, false, true);

  windowed(ctx, grp, -1, S.mozart + 9);
  windowed(ctx, sky, -1, S.cave + 0.6);

  // Mozart decor: golden music notes + sparkle dust
  const notes = new THREE.Group();
  const noteEls = [];
  const goldM = phys(0xffcc66, { metalness: 1, roughness: 0.2, emissive: 0xffa030, emissiveIntensity: 0 });
  const headGeo = new THREE.SphereGeometry(0.22, 24, 16);
  const stemGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.9, 8);
  const flagGeo = new THREE.TorusGeometry(0.22, 0.04, 8, 16, Math.PI * 0.8);
  const nr = rng(77);
  for (let i = 0; i < 30; i++) {
    const m = goldM.clone();
    const n = new THREE.Group();
    const head = new THREE.Mesh(headGeo, m); head.scale.set(1.25, 0.85, 0.85); head.rotation.z = 0.35;
    const stem = new THREE.Mesh(stemGeo, m); stem.position.set(0.24, 0.45, 0);
    const flag = new THREE.Mesh(flagGeo, m); flag.position.set(0.44, 0.75, 0); flag.rotation.z = -Math.PI * 0.15;
    n.add(head, stem, flag);
    if (i % 3 === 0) { // beamed pair
      const h2 = head.clone(); h2.position.x = 0.7; const s2 = stem.clone(); s2.position.x = 0.94;
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.1, 0.06), m); beam.position.set(0.59, 0.88, 0);
      n.remove(flag); n.add(h2, s2, beam);
    }
    const side = i % 2 ? 1 : -1;
    n.position.set(side * (2.0 + nr() * 2.2), -9 - i * 1.3 - nr() * 0.8, -1.5 - nr() * 3.5);
    n.rotation.set(0, (nr() - 0.5) * 0.8, (nr() - 0.5) * 0.6);
    n.scale.setScalar(0.8 + nr() * 0.5);
    n.userData.phase = nr() * 6;
    n.userData.y0 = n.position.y;
    notes.add(n);
    noteEls.push({ obj: n, m, y: n.position.y });
  }
  shadowy(notes, true, false);
  windowed(ctx, notes, S.mozart - 2, S.mozart_end + 1.5);
  const notePulses = ctx.TL.pulses.filter((p) => p.scene === 'mozart' && p.group === 'note');
  const noteTimes = assignPulses(ctx, notePulses, noteEls, 5);

  return {
    update(t) {
      blinkM.emissiveIntensity = (Math.sin(t * 4) > 0.3 ? 4 : 0.2);
      if (t < S.intro_chord) drawClock('17:59', '#ff3b2f');
      else drawClock('18:00', (Math.floor((t - S.intro_chord) * 6) % 2 === 0) ? '#5dff7a' : '#ffe14d');
      boardM.emissiveIntensity = t >= S.intro_chord ? 2.0 + 2.0 * Math.exp(-(t - S.intro_chord) / 0.3) : 2.0;
      for (let i = 0; i < clouds.length; i++) clouds[i].position.x += Math.sin(t * 0.1 + i) * 0.0;
      noteEls.forEach((e, i) => {
        const o = e.obj;
        o.position.y = o.userData.y0 + Math.sin(t * 1.3 + o.userData.phase) * 0.15;
        o.rotation.y = Math.sin(t * 0.7 + o.userData.phase) * 0.5;
        const f = flash(noteTimes[i], t, 0.3);
        e.m.emissiveIntensity = 0.1 + f * 1.6;
        const s = 1 + f * 0.25;
        o.scale.setScalar((0.8 + (i % 5) * 0.1) * s);
      });
    },
  };
}

function makeSlabWithHole(size, thick, holeR, hx, hz, topMat, sideMat) {
  const shape = new THREE.Shape();
  shape.moveTo(-size / 2, -size / 2); shape.lineTo(size / 2, -size / 2); shape.lineTo(size / 2, size / 2); shape.lineTo(-size / 2, size / 2);
  const hole = new THREE.Path();
  hole.absarc(hx, -hz, holeR, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thick, bevelEnabled: false, curveSegments: 48 });
  geo.rotateX(-Math.PI / 2); // extrusion now along +y, shape y -> -z
  geo.translate(0, -thick, 0);
  const m = new THREE.Mesh(geo, [topMat, sideMat]);
  topMat.side = THREE.DoubleSide;
  sideMat.side = THREE.DoubleSide;
  return m;
}

// ------------------------------------------------------------------ cave
export function buildCave(ctx) {
  const { S, CH } = ctx;
  const g = new THREE.Group();
  const caveHits = CH.hits.filter((h) => h.scene === 'cave');
  const yTop = -53, yBot = -121;
  const rockM = std(0x2c2640, { roughness: 0.95, flatShading: true });
  const mkWall = (w, h, d, seed) => {
    const geo = new THREE.BoxGeometry(w, h, d, Math.ceil(w * 2), Math.ceil(h * 1.2), Math.ceil(d * 2));
    const pos = geo.attributes.position;
    const nrm = geo.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const n = noise1(x * 0.9 + y * 0.7 + seed) * 0.6 + noise1(y * 2.1 - z * 1.7 + seed * 3) * 0.3 + noise1(x * 3.1 + z * 2.3 + y * 0.4) * 0.15;
      pos.setXYZ(i, x + nrm.getX(i) * n * 0.6, y + nrm.getY(i) * n * 0.6, z + nrm.getZ(i) * n * 0.6);
    }
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, rockM);
  };
  const hgt = yTop - yBot;
  const L = mkWall(6, hgt, 12, 1); L.position.set(-6.5, (yTop + yBot) / 2, -1);
  const Rw = mkWall(6, hgt, 12, 2); Rw.position.set(6.5, (yTop + yBot) / 2, -1);
  const B = mkWall(18, hgt, 3, 3); B.position.set(0, (yTop + yBot) / 2, -7);
  g.add(L, Rw, B);
  // narrow shaft for the frantic ping-pong part
  const walls = caveHits.filter((h) => h.kind === 'wall');
  const wy0 = walls[0].p.y + 1.6, wy1 = walls[walls.length - 1].p.y - 1.0;
  const sh = wy0 - wy1;
  const NL = mkWall(2.6, sh, 3.6, 7); NL.position.set(-(1.33 + 1.3), (wy0 + wy1) / 2, -0.4);
  const NR = mkWall(2.6, sh, 3.6, 8); NR.position.set(1.33 + 1.3, (wy0 + wy1) / 2, -0.4);
  g.add(NL, NR);
  // stalactites
  const stM = std(0x3a3150, { roughness: 0.9, flatShading: true });
  const sr = rng(5);
  for (let i = 0; i < 40; i++) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.2 + sr() * 0.5, 1 + sr() * 3, 6), stM);
    const side = i % 2 ? 1 : -1;
    c.position.set(side * (2.6 + sr() * 1.4), yTop - 2 - sr() * (hgt - 8), -2.5 - sr() * 3);
    c.rotation.z = Math.PI + side * 0.3;
    if (Math.abs(c.position.y - (wy0 + wy1) / 2) < sh / 2 + 1) continue;
    g.add(c);
  }
  // crystal clusters
  const clusters = [];
  const cgeo = new THREE.OctahedronGeometry(0.22, 0);
  for (let i = 0; i < 64; i++) {
    const hue = [0.5, 0.55, 0.8, 0.88, 0.62][i % 5];
    const m = std(new THREE.Color().setHSL(hue, 0.9, 0.5), { emissive: new THREE.Color().setHSL(hue, 1, 0.5), emissiveIntensity: 0.6, roughness: 0.15, metalness: 0.2 });
    const cl = new THREE.Group();
    const n = 3 + Math.floor(sr() * 4);
    for (let k = 0; k < n; k++) {
      const c = new THREE.Mesh(cgeo, m);
      c.scale.set(0.8, 2.2 + sr() * 2.2, 0.8);
      c.rotation.set((sr() - 0.5) * 1.2, sr() * 3, (sr() - 0.5) * 1.2);
      c.position.set((sr() - 0.5) * 0.4, 0, (sr() - 0.5) * 0.4);
      cl.add(c);
    }
    const y = yTop - 3 - (i / 64) * (hgt - 6) - sr() * 1.5;
    const inShaft = y < wy0 && y > wy1;
    let pos;
    if (inShaft) pos = V((i % 2 ? 1 : -1) * 1.38, y, -0.5 + (sr() - 0.5) * 2.2);
    else if (i % 3 === 0) pos = V((sr() - 0.5) * 6, y, -5.4);
    else pos = V((i % 2 ? 1 : -1) * 3.35, y, -2.5 + sr() * 3);
    cl.position.copy(pos);
    cl.lookAt(V(0, y, 2));
    cl.rotateX(Math.PI / 2);
    cl.scale.setScalar(inShaft ? 0.7 : 1 + sr() * 0.8);
    g.add(cl);
    clusters.push({ obj: cl, m, y, hue });
  }
  // troll eyes in the dark
  const eyes = [];
  const eyeGeo = new THREE.SphereGeometry(0.1, 12, 8);
  for (let i = 0; i < 18; i++) {
    const m = std(0x000000, { emissive: 0xd8ff3a, emissiveIntensity: 3 });
    const pair = new THREE.Group();
    const e1 = new THREE.Mesh(eyeGeo, m); e1.position.x = -0.17;
    const e2 = new THREE.Mesh(eyeGeo, m); e2.position.x = 0.17;
    pair.add(e1, e2);
    const y = yTop - 6 - (i / 18) * (hgt - 14) - sr() * 2;
    if (y < wy0 + 1 && y > wy1 - 1) continue;
    pair.position.set((sr() - 0.5) * 7, y, -5.3);
    pair.scale.setScalar(0.8 + sr() * 0.6);
    pair.userData.seed = sr() * 10;
    g.add(pair);
    eyes.push({ obj: pair, m, y, open: S.cave + 1.0 + i * 0.9 });
  }
  // dust
  const dustGeo = new THREE.BufferGeometry();
  const dp = [];
  for (let i = 0; i < 500; i++) dp.push((sr() - 0.5) * 7, yTop - sr() * hgt, -4 + sr() * 6);
  dustGeo.setAttribute('position', new THREE.Float32BufferAttribute(dp, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ size: 0.05, map: softDotTex(), color: 0x8fdcff, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
  g.add(dust);
  // floor of the cave = ceiling of the cabaret, with a hole
  const cancanFirst = CH.hits.find((h) => h.scene === 'cancan');
  const crossY = -118;
  let tc = S.cave_end;
  for (let t = S.cave_end; t < S.cancan; t += 0.005) if (ballState(CH, t).p.y < crossY) { tc = t; break; }
  const hp = ballState(CH, tc).p;
  const floor = makeSlabWithHole(60, 2.5, 2.2, hp.x, hp.z, std(0x2c2640, { roughness: 0.95 }), std(0x4a0a18, { roughness: 0.8 }));
  floor.position.y = crossY + 1.25;
  g.add(floor);
  shadowy(g, false, true);
  windowed(ctx, g, S.mozart_end - 1.2, S.cancan + 0.6);

  const all = ctx.TL.pulses.filter((p) => p.scene === 'cave');
  const ctimes = assignPulses(ctx, all, clusters, 6, (p, i, near) => near[(p.pitch ?? 0) * 7 % near.length]);
  const beatTimes = ctx.TL.pulses.filter((p) => p.scene === 'cave' && p.group === 'beat').map((p) => p.t);
  const stabTimes = ctx.TL.pulses.filter((p) => p.scene === 'cave' && p.group === 'stab').map((p) => p.t);

  return {
    update(t) {
      const stab = flash(stabTimes, t, 0.25);
      clusters.forEach((c, i) => {
        const f = flash(ctimes[i], t, 0.18);
        c.m.emissiveIntensity = 0.45 + f * 2.6 + stab * 2;
      });
      eyes.forEach((e, i) => {
        const op = smooth(e.open, e.open + 0.25, t);
        const bi = lastIdx(beatTimes, t);
        let blink = 1;
        if (bi >= 0 && (bi + i) % 5 === 0) blink = smooth(0, 0.08, t - beatTimes[bi] - 0.08) || 0.08;
        e.obj.scale.y = Math.max(0.02, op * blink) * e.obj.scale.x;
        e.m.emissiveIntensity = 2.0 + stab * 2;
        e.obj.position.x += Math.sin(t * 2 + e.obj.userData.seed) * 0.0;
      });
      dust.rotation.y = t * 0.02;
    },
  };
}

// ------------------------------------------------------------------ cabaret
export function buildCancan(ctx) {
  const { S, CH } = ctx;
  const back = new THREE.Group(); // follows the camera vertically (backdrop)
  const r = rng(9);
  // velvet curtain with folds
  const curtainGeo = new THREE.PlaneGeometry(26, 70, 260, 4);
  const cp = curtainGeo.attributes.position;
  for (let i = 0; i < cp.count; i++) {
    const x = cp.getX(i);
    cp.setZ(i, Math.sin(x * 4.2) * 0.22 + Math.sin(x * 1.3) * 0.15);
  }
  curtainGeo.computeVertexNormals();
  const velvet = phys(0x7d0a1c, { roughness: 0.7, sheen: 1, sheenColor: new THREE.Color(0xff5a7a), sheenRoughness: 0.4 });
  const curtain = new THREE.Mesh(curtainGeo, velvet);
  curtain.position.set(0, 18, -7);
  back.add(curtain);
  for (const s of [-1, 1]) {
    const sg = new THREE.PlaneGeometry(3.2, 70, 60, 4);
    const p = sg.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, Math.sin(x * 5) * 0.2); }
    sg.computeVertexNormals();
    const side = new THREE.Mesh(sg, velvet);
    side.position.set(s * 3.6, 18, -1.6);
    side.rotation.y = -s * 0.35;
    back.add(side);
  }
  // marquee frame of bulbs
  const bulbs = [];
  const bulbGeo = new THREE.SphereGeometry(0.075, 12, 8);
  const FW = 5.2, FH = 8.2, FY = 0.9;
  const perim = [];
  const nB = 52;
  for (let k = 0; k < nB; k++) {
    const u = (k / nB) * 2 * (FW + FH);
    let x, y;
    if (u < FW) { x = -FW / 2 + u; y = FH / 2; }
    else if (u < FW + FH) { x = FW / 2; y = FH / 2 - (u - FW); }
    else if (u < 2 * FW + FH) { x = FW / 2 - (u - FW - FH); y = -FH / 2; }
    else { x = -FW / 2; y = -FH / 2 + (u - 2 * FW - FH); }
    perim.push([x, y]);
  }
  for (let k = 0; k < nB; k++) {
    const m = std(0xfff2c0, { emissive: 0xffc860, emissiveIntensity: 0.3 });
    const b = new THREE.Mesh(bulbGeo, m);
    b.position.set(perim[k][0], perim[k][1] + FY, -4.2);
    back.add(b);
    bulbs.push(m);
  }
  const frameM = phys(0xd4a63a, { metalness: 1, roughness: 0.3 });
  for (const [w, h, x, y] of [[FW + 0.4, 0.12, 0, FH / 2], [FW + 0.4, 0.12, 0, -FH / 2], [0.12, FH, -FW / 2, 0], [0.12, FH, FW / 2, 0]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.1), frameM);
    b.position.set(x, y + FY, -4.3);
    back.add(b);
  }
  // chorus line of legs
  const legs = [];
  const skin = phys(0xf2c4a2, { roughness: 0.45, sheen: 0.4 });
  const shoeM = phys(0xd0102a, { clearcoat: 1, roughness: 0.2 });
  const skirtM = phys(0x1a1a22, { roughness: 0.8, side: THREE.DoubleSide });
  const mkLeg = (L, rad, footX = false) => {
    const pivot = new THREE.Group();
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(rad, L, 6, 16), skin);
    leg.position.y = -L / 2;
    const garter = new THREE.Mesh(new THREE.TorusGeometry(rad * 1.05, rad * 0.22, 8, 20), shoeM);
    garter.rotation.x = Math.PI / 2; garter.position.y = -L * 0.18;
    const shoe = new THREE.Mesh(new RoundedBoxGeometry(rad * 2.1, rad * 1.1, rad * 3.6, 2, rad * 0.4), shoeM);
    shoe.position.set(0, -L - rad * 0.6, rad * 0.9);
    const heel = new THREE.Mesh(new THREE.CylinderGeometry(rad * 0.15, rad * 0.25, rad * 1.6), shoeM);
    heel.position.set(0, -L - rad * 1.4, -rad * 0.4);
    if (footX) {
      shoe.rotation.y = Math.PI / 2; shoe.position.set(rad * 0.9, -L - rad * 0.6, 0);
      heel.position.set(-rad * 0.4, -L - rad * 1.4, 0);
    }
    pivot.add(leg, garter, shoe, heel);
    return { pivot, shoe };
  };
  for (let i = 0; i < 8; i++) {
    const { pivot } = mkLeg(1.6, 0.17);
    const hip = new THREE.Group();
    hip.position.set(-3.15 + i * 0.9, -4.6, -5.6);
    const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.7, 24, 1, true), skirtM);
    skirt.position.y = 0.1;
    const skirtR = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.55, 24, 1, true), phys(0xe0183a, { roughness: 0.7, side: THREE.DoubleSide }));
    skirtR.position.y = 0.3;
    hip.add(pivot, skirt, skirtR);
    back.add(hip);
    legs.push(pivot);
  }
  // spotlight beams
  const beamTex = canvasTex(64, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  const beams = [];
  for (const s of [-1, 1]) {
    const bm = new THREE.MeshBasicMaterial({ color: 0xfff0d0, map: beamTex, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1.6, 12, 32, 1, true), bm);
    cone.geometry.translate(0, -6, 0);
    cone.geometry.rotateX(Math.PI); // apex at origin, opening downward... flip back
    cone.geometry.rotateX(Math.PI);
    const piv = new THREE.Group();
    piv.position.set(s * 3.2, 6, -2.5);
    piv.add(cone);
    back.add(piv);
    beams.push({ piv, bm, s });
  }
  shadowy(back, false, true);
  windowed(ctx, back, S.cave_end + 0.2, S.kick + 1.46);

  // the giant leg that kicks the ball out
  const kick = CH.hits.find((h) => h.kind === 'kick');
  const giant = new THREE.Group();
  const { pivot: gl, shoe: gshoe } = mkLeg(3.0, 0.36, true);
  giant.add(gl);
  const gskirt = new THREE.Mesh(new THREE.ConeGeometry(1.2, 1.2, 32, 1, true), skirtM);
  gskirt.position.y = 0.25;
  giant.add(gskirt);
  const thC = 0.95; // leg angle (from straight down, rotating toward +x... see update)
  const Lfull = 3.0 + 0.36 * 1.2 + 0.2;
  // contact: the shoe toe is at ball - n*(R+0.2)
  const contact = V(kick.p.x - kick.n.x * (R + 0.18), kick.p.y - kick.n.y * (R + 0.18), 0);
  // leg direction at contact: angle a from -Y rotating counter-clockwise about z
  const aC = Math.PI * 0.82;
  const dirC = V(Math.sin(aC), -Math.cos(aC), 0);
  giant.position.copy(contact).addScaledVector(dirC, -Lfull);
  giant.position.z = kick.p.z - 0.2;
  shadowy(giant, true, true);
  windowed(ctx, giant, S.cancan + 2, S.kick + 1.46);

  // confetti after the kick
  const confN = 220;
  const confGeo = new THREE.PlaneGeometry(0.07, 0.12);
  const confM = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.5, emissive: 0xffffff, emissiveIntensity: 0.25, vertexColors: false });
  const conf = new THREE.InstancedMesh(confGeo, confM, confN);
  const cdat = [];
  for (let i = 0; i < confN; i++) {
    const c = new THREE.Color().setHSL(r(), 0.9, 0.55);
    conf.setColorAt(i, c);
    cdat.push({ v: V((r() - 0.5) * 9, 4 + r() * 8, (r() - 0.5) * 4), w: V(r() * 12, r() * 12, r() * 12), d: r() * 0.15 });
  }
  conf.frustumCulled = false;
  windowed(ctx, conf, S.kick - 0.01, S.kick + 1.46);

  const chase = ctx.TL.pulses.filter((p) => p.scene === 'cancan' && p.group === 'chase').map((p) => p.t);
  const stabT = ctx.TL.pulses.filter((p) => p.scene === 'cancan' && p.group === 'stab').map((p) => p.t);
  const beatT = ctx.TL.hits.filter((h) => h.scene === 'cancan').map((h) => h.t);
  const dummy = new THREE.Object3D();

  return {
    update(t, cam) {
      back.position.y = cam.position.y - 0.6;
      back.position.x = cam.position.x * 0.7;
      const ci = lastIdx(chase, t);
      const stab = flash(stabT, t, 0.35);
      bulbs.forEach((m, k) => {
        const on = ci >= 0 && (k + ci) % 4 === 0 ? 1 : 0;
        const f = ci >= 0 ? Math.exp(-(t - chase[Math.max(ci, 0)]) / 0.25) : 0;
        m.emissiveIntensity = 0.25 + on * (1.2 + 1.5 * f) + stab * 2.5;
      });
      const bi = lastIdx(beatT, t);
      legs.forEach((p, i) => {
        let a = 0;
        if (bi >= 0) {
          const dt = t - beatT[bi];
          const active = (bi + i) % 2 === 0;
          const k = Math.sin(clamp(dt / 0.3) * Math.PI);
          a = active ? k * 1.9 : k * 0.15;
        }
        p.rotation.x = -a; // kick toward the camera
      });
      beams.forEach((b) => {
        b.piv.rotation.z = b.s * (0.35 + Math.sin(t * 1.6 + b.s) * 0.35);
        b.bm.opacity = 0.06 + stab * 0.12;
      });
      // giant kick
      const k0 = kick.t;
      let a;
      if (t < k0 - 0.38) a = 0.15 + Math.sin(t * 3) * 0.04;
      else if (t < k0) { const u = (t - (k0 - 0.38)) / 0.38; a = lerp(0.15, aC, u * u * u); }
      else { const u = clamp((t - k0) / 0.35); a = aC + 0.9 * easeOutCubic(u); }
      gl.rotation.z = a;
      // confetti
      const dt = t - S.kick;
      if (dt >= 0) {
        const kp = kick.p;
        for (let i = 0; i < confN; i++) {
          const c = cdat[i];
          const tt = Math.max(0, dt - c.d);
          const drag = 1 - Math.exp(-tt * 2.2);
          dummy.position.set(kp.x + c.v.x * drag / 2.2, kp.y + c.v.y * drag / 2.2 - 2.2 * tt * tt, kp.z + c.v.z * drag / 2.2);
          dummy.rotation.set(c.w.x * tt, c.w.y * tt, c.w.z * tt);
          dummy.scale.setScalar(tt > 0 ? 1.4 : 0.001);
          dummy.updateMatrix();
          conf.setMatrixAt(i, dummy.matrix);
        }
        conf.instanceMatrix.needsUpdate = true;
      }
    },
  };
}

// ------------------------------------------------------------------ bedroom
export function buildHome(ctx) {
  const { S, CH } = ctx;
  const O = CH.homeOrigin;
  const room = new THREE.Group();
  room.position.set(O.x, O.y, O.z);
  // floor
  const woodTex = canvasTex(512, 512, (g, w, h) => {
    const r = rng(3);
    for (let i = 0; i < 8; i++) {
      g.fillStyle = `hsl(${26 + r() * 6},${45 + r() * 10}%,${30 + r() * 8}%)`;
      g.fillRect(0, i * h / 8, w, h / 8);
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, i * h / 8, w, 3);
      for (let k = 0; k < 30; k++) { g.fillStyle = `rgba(0,0,0,${r() * 0.08})`; g.fillRect(r() * w, i * h / 8 + r() * h / 8, r() * 120, 2); }
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(r() * w, i * h / 8, 3, h / 8);
    }
  }, { repeat: [3, 3] });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 8), std(0xffffff, { map: woodTex, roughness: 0.45 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = 1.5;
  room.add(floor);
  // walls
  const paperTex = canvasTex(256, 256, (g, w) => {
    g.fillStyle = '#3d4f7a'; g.fillRect(0, 0, w, w);
    g.fillStyle = 'rgba(255,240,200,0.18)';
    const r = rng(8);
    for (let i = 0; i < 18; i++) { g.beginPath(); g.arc(r() * w, r() * w, 2 + r() * 3, 0, 7); g.fill(); }
    g.fillStyle = 'rgba(255,255,255,0.05)';
    for (let x = 0; x < w; x += 32) g.fillRect(x, 0, 12, w);
  }, { repeat: [5, 3] });
  const wallM = std(0xffffff, { map: paperTex, roughness: 0.85 });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(10, 6), wallM);
  back.position.set(0, 3, -2.0);
  const left = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), wallM);
  left.position.set(-2.7, 3, 1); left.rotation.y = Math.PI / 2;
  const right = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), wallM);
  right.position.set(3.0, 3, 1); right.rotation.y = -Math.PI / 2;
  const skirting = new THREE.Mesh(new THREE.BoxGeometry(10, 0.16, 0.04), std(0xf0ebe0));
  skirting.position.set(0, 0.08, -1.98);
  room.add(back, left, right, skirting);
  // window
  const mkWinTex = (night) => canvasTex(512, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    if (night) { gr.addColorStop(0, '#0a1030'); gr.addColorStop(1, '#2a3570'); } else { gr.addColorStop(0, '#7fc0ff'); gr.addColorStop(1, '#ffe2b8'); }
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const r = rng(night ? 2 : 4);
    if (night) {
      for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.7})`; g.fillRect(r() * w, r() * h * 0.7, 2, 2); }
      g.fillStyle = '#fff6d8'; g.shadowColor = '#fff6d8'; g.shadowBlur = 40;
      g.beginPath(); g.arc(w * 0.7, h * 0.28, 50, 0, 7); g.fill();
      g.shadowBlur = 0; g.fillStyle = '#0a1030'; g.beginPath(); g.arc(w * 0.7 + 22, h * 0.28 - 10, 46, 0, 7); g.fill();
    } else {
      g.fillStyle = '#fff3c0'; g.shadowColor = '#fff3c0'; g.shadowBlur = 60;
      g.beginPath(); g.arc(w * 0.3, h * 0.3, 55, 0, 7); g.fill(); g.shadowBlur = 0;
    }
    for (let i = 0; i < 14; i++) {
      const bw = 30 + r() * 50, bh = 80 + r() * 160;
      const x = i * 38 - 10;
      g.fillStyle = night ? '#0b0e1c' : '#8aa0c0';
      g.fillRect(x, h - bh, bw, bh);
      for (let k = 0; k < 10; k++) { g.fillStyle = night ? (r() < 0.5 ? '#ffd27a' : '#151a30') : '#c8d8f0'; g.fillRect(x + 5 + (k % 3) * 9, h - bh + 8 + Math.floor(k / 3) * 16, 5, 7); }
    }
  });
  const winNight = mkWinTex(true), winDay = mkWinTex(false);
  const winM = new THREE.MeshBasicMaterial({ map: winNight, toneMapped: false });
  const winGlass = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), winM);
  winGlass.position.set(1.05, 2.75, -1.99);
  const wfM = std(0xf4efe6, { roughness: 0.5 });
  const win = new THREE.Group();
  for (const [w, h, x, y] of [[1.66, 0.09, 1.05, 3.53], [1.66, 0.09, 1.05, 1.97], [0.09, 1.66, 0.26, 2.75], [0.09, 1.66, 1.84, 2.75], [0.05, 1.5, 1.05, 2.75], [1.5, 0.05, 1.05, 2.75], [1.9, 0.08, 1.05, 1.9]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w > 1.8 ? 0.25 : 0.08), wfM);
    b.position.set(x, y, -1.95);
    win.add(b);
  }
  room.add(winGlass, win);
  // calendar
  const mkCal = (txt, sub) => canvasTex(256, 320, (g, w, h) => {
    g.fillStyle = '#fbfaf5'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#d6283a'; g.fillRect(0, 0, w, 78);
    g.fillStyle = '#fff'; g.font = 'bold 44px "WenQuanYi Zen Hei"'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(sub, w / 2, 40);
    g.fillStyle = '#222'; g.font = 'bold 120px "WenQuanYi Zen Hei"'; g.fillText(txt, w / 2, 190);
  });
  const calFri = mkCal('五', '星期'), calMon = mkCal('一', '星期');
  const calM = std(0xffffff, { map: calFri, roughness: 0.8 });
  const cal = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.62), calM);
  cal.position.set(-1.6, 1.55, -1.98);
  room.add(cal);
  // shelf + items
  const shelfM = std(0x8b5a35, { roughness: 0.55 });
  const shelf = new THREE.Mesh(new RoundedBoxGeometry(1.5, 0.08, 0.5, 2, 0.02), shelfM);
  shelf.position.set(-0.8, HOME.shelfY - 0.04, -1.72);
  room.add(shelf);
  for (const x of [-1.35, -0.25]) {
    const br = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.35), std(0x333333, { metalness: 0.7 }));
    br.position.set(x, HOME.shelfY - 0.22, -1.8);
    room.add(br);
  }
  const itemGlow = [];
  const [ic, ib, im] = HOME.items;
  { // alarm clock
    const m = phys(0x2fb3a0, { clearcoat: 1, roughness: 0.2, emissive: 0x2fffd0, emissiveIntensity: 0 });
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.14, 32), m);
    c.rotation.x = Math.PI / 2; c.position.set(ic.x, HOME.shelfY + 0.21, -1.55);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.17, 32), std(0xffffff, { emissive: 0xfff3c0, emissiveIntensity: 0.3 }));
    face.position.set(ic.x, HOME.shelfY + 0.21, -1.479);
    const bells = [-1, 1].map((s) => { const b = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 8, 0, 7, 0, 1.6), phys(0xd8d8d8, { metalness: 1, roughness: 0.2 })); b.position.set(ic.x + s * 0.13, ic.top - 0.06, -1.55); b.rotation.z = -s * 0.5; return b; });
    room.add(c, face, ...bells);
    itemGlow.push({ ms: [m, face.material], base: [0, 0.3], peak: [2.5, 3] });
  }
  { // books
    const ms = [];
    const cols = [0xc23b3b, 0x3b6ac2, 0xe0b23a, 0x3aa86b];
    for (let k = 0; k < 4; k++) {
      const m = std(cols[k], { roughness: 0.6, emissive: cols[k], emissiveIntensity: 0 });
      const hgt = 0.3 - k * 0.012;
      const b = new THREE.Mesh(new RoundedBoxGeometry(0.42 - k * 0.03, 0.075, 0.32, 2, 0.01), m);
      b.position.set(ib.x, HOME.shelfY + 0.0375 + k * 0.075, -1.6);
      b.rotation.y = (k - 1.5) * 0.08;
      room.add(b);
      ms.push(m);
    }
    itemGlow.push({ ms, base: ms.map(() => 0), peak: ms.map(() => 2) });
  }
  { // mug
    const m = phys(0xf5f0e6, { clearcoat: 1, roughness: 0.2, emissive: 0xffc070, emissiveIntensity: 0 });
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.12, 0.36, 32), m);
    mug.position.set(im.x, HOME.shelfY + 0.18, -1.6);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.022, 8, 16), m);
    handle.position.set(im.x + 0.16, HOME.shelfY + 0.19, -1.6);
    room.add(mug, handle);
    itemGlow.push({ ms: [m], base: [0], peak: [3] });
  }
  // rug
  const rugTex = canvasTex(512, 512, (g, w) => {
    const cols = ['#c84b4b', '#f2d27a', '#3b6ac2', '#f2efe6', '#c84b4b', '#f2d27a'];
    for (let i = 0; i < cols.length; i++) { g.fillStyle = cols[i]; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - i * 38, 0, 7); g.fill(); }
  });
  const rugM = std(0xffffff, { map: rugTex, roughness: 0.95, transparent: true, emissive: 0xffffff, emissiveMap: rugTex, emissiveIntensity: 0 });
  const rug = new THREE.Mesh(new THREE.CircleGeometry(0.95, 64), rugM);
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(HOME.floorHit.x, 0.006, HOME.floorHit.z);
  room.add(rug);
  // bed
  const Z = HOME.bedZ;
  const woodM = std(0x9a6438, { roughness: 0.5 });
  const frame = new THREE.Mesh(new RoundedBoxGeometry(2.3, 0.3, 1.25, 2, 0.04), woodM);
  frame.position.set(0.8, 0.32, Z);
  const legsG = [[-0.3, -0.05], [-0.3, -1.05], [1.9, -0.05], [1.9, -1.05]].map(([x, z]) => { const l = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.2, 0.1), woodM); l.position.set(x, 0.1, z); return l; });
  const mattress = new THREE.Mesh(new RoundedBoxGeometry(2.2, 0.26, 1.18, 3, 0.08), phys(0xf6f3ee, { roughness: 0.8 }));
  mattress.position.set(0.82, 0.58, Z);
  const foot = new THREE.Mesh(new RoundedBoxGeometry(0.1, HOME.footboard.top, 1.3, 2, 0.04), woodM);
  foot.position.set(HOME.footboard.x, HOME.footboard.top / 2, Z);
  const head = new THREE.Mesh(new RoundedBoxGeometry(0.12, 1.55, 1.3, 2, 0.05), woodM);
  head.position.set(1.98, 0.78, Z);
  const pillow = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.2, 0.85, 4, 0.09), phys(0xffffff, { roughness: 0.9, sheen: 0.5 }));
  pillow.position.set(HOME.pillow.x, HOME.pillow.top - 0.1, Z);
  const quiltTex = canvasTex(256, 256, (g, w) => {
    g.fillStyle = '#e8a33c'; g.fillRect(0, 0, w, w);
    g.fillStyle = '#f2c46a';
    for (let x = 0; x < w; x += 64) for (let y = 0; y < w; y += 64) if (((x + y) / 64) % 2 === 0) g.fillRect(x, y, 64, 64);
    g.strokeStyle = 'rgba(120,60,20,0.35)'; g.lineWidth = 3;
    for (let x = 0; x <= w; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, w); g.stroke(); g.beginPath(); g.moveTo(0, x); g.lineTo(w, x); g.stroke(); }
  }, { repeat: [2, 2] });
  const blanketM = phys(0xffffff, { map: quiltTex, roughness: 0.85, sheen: 0.6, sheenColor: new THREE.Color(0xffe0b0) });
  const blanketPivot = new THREE.Group();
  blanketPivot.position.set(-0.28, HOME.bedTop - 0.04, Z);
  const blanket = new THREE.Mesh(new RoundedBoxGeometry(1.4, 0.08, 1.32, 3, 0.035), blanketM);
  blanket.position.x = 0.7;
  blanketPivot.add(blanket);
  room.add(frame, ...legsG, mattress, foot, head, pillow, blanketPivot);
  // fairy lights along the headboard
  const fairy = [];
  for (let k = 0; k < 9; k++) {
    const m = std(0xfff2c0, { emissive: new THREE.Color().setHSL(k / 9, 0.8, 0.6), emissiveIntensity: 0.2 });
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), m);
    b.position.set(1.93, 1.5 - Math.sin((k / 8) * Math.PI) * 0.12, Z - 0.6 + k * 0.15);
    room.add(b);
    fairy.push(m);
  }
  // phone on the bed
  const phoneM = phys(0x111111, { clearcoat: 1, roughness: 0.2 });
  const phone = new THREE.Group();
  const pb = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.03, 0.38, 2, 0.02), phoneM);
  const screenM = std(0x000000, { emissive: 0x4ad6ff, emissiveIntensity: 0 });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.34), screenM);
  screen.rotation.x = -Math.PI / 2; screen.position.y = 0.017;
  phone.add(pb, screen);
  phone.position.set(1.0, HOME.bedTop + 0.02, Z + 0.4);
  phone.rotation.y = 0.4;
  room.add(phone);
  const rings = [];
  for (let k = 0; k < 3; k++) {
    const m = new THREE.MeshBasicMaterial({ color: 0x7fe8ff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.012, 8, 40), m);
    ring.rotation.x = Math.PI / 2;
    ring.position.copy(phone.position);
    room.add(ring);
    rings.push({ ring, m, k });
  }
  // pendant lamp
  const lampShadeM = phys(0xf2c46a, { roughness: 0.5, side: THREE.DoubleSide, emissive: 0xffb050, emissiveIntensity: 0.4 });
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.3, 32, 1, true), lampShadeM);
  shade.position.set(0.25, 4.05, -0.9);
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 2), std(0x222222));
  cord.position.set(0.25, 5.2, -0.9);
  const bulbM = std(0xffffff, { emissive: 0xffd28a, emissiveIntensity: 4 });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8), bulbM);
  bulb.position.set(0.25, 3.92, -0.9);
  room.add(shade, cord, bulb);
  const lamp = new THREE.PointLight(0xffc27a, 6, 0, 2);
  lamp.position.set(0.25, 3.7, -0.7);
  room.add(lamp);
  const winLight = new THREE.PointLight(0x9fb8ff, 0, 0, 2);
  winLight.position.set(1.05, 2.7, -1.3);
  room.add(winLight);
  // Zzz
  const zTex = canvasTex(256, 256, (g, w) => {
    g.font = 'bold 200px "WenQuanYi Zen Hei"'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 18; g.strokeStyle = '#1b2350'; g.strokeText('Z', w / 2, w / 2 + 10);
    g.fillStyle = '#cfe0ff'; g.fillText('Z', w / 2, w / 2 + 10);
  });
  const zs = [];
  for (let k = 0; k < 3; k++) {
    const sm = new THREE.SpriteMaterial({ map: zTex, transparent: true, opacity: 0, depthWrite: false });
    const s = new THREE.Sprite(sm);
    room.add(s);
    zs.push({ s, sm, k });
  }
  shadowy(room, true, true);
  winGlass.castShadow = false; back.castShadow = false; floor.castShadow = false;
  windowed(ctx, room, ctx.tCut, 999);

  const hitsHome = CH.hits.filter((h) => h.scene === 'home');
  const gT = hitsHome.filter((h) => h.pitch === 67).map((h) => h.t);
  const ebT = hitsHome.find((h) => h.pitch === 63).t;
  const fT = hitsHome.filter((h) => h.pitch === 65).map((h) => h.t);
  const landT = S.land;

  return {
    room, lamp,
    lightning(t) { // 0..1
      const d = t - ebT;
      if (d < 0) return 0;
      return Math.exp(-d / 0.12) + 0.6 * Math.exp(-Math.max(0, d - 0.25) / 0.1) * (d > 0.25 ? 1 : 0);
    },
    update(t) {
      itemGlow.forEach((it, i) => {
        const f = t >= gT[i] ? Math.exp(-(t - gT[i]) / 0.25) : 0;
        it.ms.forEach((m, k) => { m.emissiveIntensity = (t >= gT[i] ? 0.2 : 0) * (it.peak[k] > 0 ? 0.3 : 0) + it.base[k] + f * it.peak[k]; });
      });
      rugM.emissiveIntensity = t >= ebT ? 0.6 * Math.exp(-(t - ebT) / 0.4) : 0;
      fairy.forEach((m, k) => {
        let v = 0.15;
        fT.forEach((ft, j) => { if (t >= ft && k % 3 === j) v = Math.max(v, 0.8 + 4 * Math.exp(-(t - ft) / 0.25)); });
        if (t >= landT) v = 1.2 + 4 * Math.exp(-(t - landT) / 0.3) + 0.3 * Math.sin(t * 3 + k);
        m.emissiveIntensity = v;
      });
      const light = this.lightning(t);
      winM.color.setScalar((t >= S.phone ? 0.75 : 1) + light * 3);
      winLight.intensity = light * 25 + (t > S.phone ? 6 * smooth(S.phone, S.phone + 0.6, t) : 0);
      // lamp: flickers on the fate notes, dims for sleep, bright in the morning
      let li = 6;
      const fateAll = [...gT, ebT, ...fT, landT];
      const fi = lastIdx(fateAll, t);
      if (fi >= 0) li += 10 * Math.exp(-(t - fateAll[fi]) / 0.15);
      li *= 1 - 0.75 * smooth(landT + 1.0, landT + 2.5, t);
      li *= 1 - smooth(S.phone - 0.2, S.phone + 0.3, t);
      lamp.intensity = li;
      bulbM.emissiveIntensity = li * 0.25;
      lampShadeM.emissiveIntensity = li * 0.04;
      // window: night -> morning on Monday
      winM.map = t >= S.phone ? winDay : winNight;
      calM.map = t >= S.phone ? calMon : calFri;
      // blanket tuck-in after landing
      const tuck = easeOutCubic(clamp((t - (landT + 0.9)) / 0.7));
      blanketPivot.scale.x = 1 + tuck * 0.55;
      blanket.position.y = tuck * 0.04;
      // phone ringing
      const ringing = t >= S.phone && t < S.phone + 2.7;
      phone.position.x = 1.0 + (ringing ? Math.sin(t * 90) * 0.012 : 0);
      phone.rotation.y = 0.4 + (ringing ? Math.sin(t * 70) * 0.06 : 0);
      screenM.emissiveIntensity = ringing ? 1.2 + Math.sin(t * 12) * 0.6 : 0;
      rings.forEach(({ ring, m, k }) => {
        if (!ringing) { m.opacity = 0; return; }
        const u = ((t - S.phone) * 1.6 + k / 3) % 1;
        ring.scale.setScalar(1 + u * 3);
        ring.position.y = HOME.bedTop + 0.05 + u * 0.4;
        m.opacity = (1 - u) * 0.9;
      });
      // Zzz while asleep
      zs.forEach(({ s, sm, k }) => {
        const t0 = landT + 2.2 + k * 0.8;
        if (t < t0 || t > S.phone) { sm.opacity = 0; return; }
        const u = ((t - t0) / 2.4) % 1;
        s.position.set(HOME.pillow.x - 0.1 + u * 0.5 + Math.sin(u * 6) * 0.08, HOME.pillow.top + 0.55 + u * 1.3, Z + 0.2);
        s.scale.setScalar(0.18 + u * 0.3);
        sm.opacity = Math.sin(u * Math.PI) * clamp((S.phone - t) / 0.2);
        sm.rotation = -0.2 + Math.sin(u * 4) * 0.2;
      });
    },
  };
}
