import * as THREE from 'three';
import { P, T, clamp, lerp, smooth, ease, lensPoint, spiralIn, ringAnchors } from './timeline.js';

// "You" and "me": two lights in a binary orbit. "You" is pulled into the black hole
// in act 3; the rewind brings it back; in the finale they merge in front of the photon ring.

function glowTex() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.08, 'rgba(255,255,255,0.9)');
  gr.addColorStop(0.25, 'rgba(255,255,255,0.25)');
  gr.addColorStop(0.6, 'rgba(255,255,255,0.05)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  return t;
}

const E1 = new THREE.Vector3(1, 0, 0.25).normalize();
const E2 = new THREE.Vector3(-0.1, 1, 0.35).normalize();

function orbitCenter(tau) {
  if (tau < 6) return P.L0.clone().add(new THREE.Vector3(Math.sin(tau * 0.4) * 0.1, Math.sin(tau * 0.3) * 0.08, 0));
  const u = ease(clamp((tau - 6) / 12));
  return P.L0.clone().lerp(P.L1, u).add(new THREE.Vector3(0, Math.sin(tau * 0.5) * 0.15 * (1 - u), 0));
}
function binary(tau, rScale = 1, extraTheta = 0) {
  const C = orbitCenter(tau);
  const r = lerp(0.3, 0.5, smooth(5, 9, tau)) * rScale;
  const th = tau * 2.1 + extraTheta;
  const off = E1.clone().multiplyScalar(Math.cos(th) * r).add(E2.clone().multiplyScalar(Math.sin(th) * r * 0.75));
  return { C, A: C.clone().add(off), B: C.clone().sub(off) };
}

export function loversAt(t, tau) {
  let { C, A, B } = binary(tau);
  // "you" is captured
  const s = clamp((tau - 21) / 5.6);
  if (s > 0) {
    const B21 = binary(21).B;
    const sp = spiralIn(B21, s, 2.2, 1.15);
    B = B.clone().lerp(sp, smooth(0, 0.08, s));
    const reach = smooth(21.5, 24.5, tau);
    A = A.clone().lerp(A.clone().add(B21.clone().sub(A).normalize().multiplyScalar(1.4)), reach * 0.8);
  }
  let merge = 0;
  if (t >= T.REW_END) {
    const m = ease(clamp((t - 42.3) / 3.9));
    const close = smooth(45.2, T.MEET, t);
    const spin = Math.pow(Math.max(0, t - 42), 2) * 0.55;
    const bb = binary(tau, 1 - close, spin);
    const Cm = bb.C.clone().lerp(P.MEET, m);
    A = Cm.clone().add(bb.A.clone().sub(bb.C));
    B = Cm.clone().add(bb.B.clone().sub(bb.C));
    merge = smooth(T.MEET - 0.05, T.MEET + 0.05, t);
    // the reunited light rises across the shadow and settles on the golden ring (the "diamond")
    const k = ease(clamp((t - (T.CRANE0 + 0.25)) / (T.DIAMOND - T.CRANE0 - 0.25)));
    if (k > 0) {
      const an = ringAnchors();
      const p = A.clone().lerp(an.diamond, k).add(an.right.clone().multiplyScalar(Math.sin(Math.PI * k) * 1.4));
      A = p; B = p.clone();
    }
  }
  return { A, B, merge };
}

// a four-point glint (with faint diagonals) for the diamond moment
function starTex() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  g.globalCompositeOperation = 'lighter';
  const spike = (ang, len, wid, a) => {
    g.save(); g.translate(256, 256); g.rotate(ang);
    const gr = g.createLinearGradient(0, 0, len, 0);
    gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(0.35, `rgba(255,255,255,${a * 0.35})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(0, -wid); g.lineTo(len, 0); g.lineTo(0, wid); g.closePath(); g.fill();
    g.restore();
  };
  for (let k = 0; k < 4; k++) spike(k * Math.PI / 2, 250, 5, 1.0);
  for (let k = 0; k < 4; k++) spike(Math.PI / 4 + k * Math.PI / 2, 120, 3, 0.45);
  const gr = g.createRadialGradient(256, 256, 0, 256, 256, 70);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
  return new THREE.CanvasTexture(c);
}

export function buildLovers() {
  const tex = glowTex();
  const group = new THREE.Group();
  const mk = (color, scale) => {
    const m = new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const s = new THREE.Sprite(m);
    s.scale.setScalar(scale);
    group.add(s);
    return s;
  };
  const colA = new THREE.Color(1.0, 0.86, 0.62), colB = new THREE.Color(1.0, 0.5, 0.64);
  const TRAIL = 56;
  const lights = [colA, colB].map((col) => ({
    col,
    core: mk(col.clone().multiplyScalar(6), 0.2),
    halo: mk(col.clone().multiplyScalar(0.55), 1.0),
    trail: Array.from({ length: TRAIL }, () => mk(col.clone().multiplyScalar(2.5), 0.12)),
  }));
  const star = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex(), color: new THREE.Color(1.0, 0.9, 0.8).multiplyScalar(2.6), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  star.visible = false;
  group.add(star);
  // golden reunion wave
  const rings = [0, 1, 2].map((k) => {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.75, 0.4).multiplyScalar(2.2), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const r = new THREE.Mesh(new THREE.RingGeometry(0.985, 1.0, 160), m);
    group.add(r);
    return { r, m, k };
  });

  return {
    group,
    update(t, tauOf, camera) {
      const tau = tauOf(t);
      const now = loversAt(t, tau);
      const appear = smooth(3.1, 3.55, tau);
      const cam = camera.position;
      const dmd = smooth(T.DIAMOND - 0.6, T.DIAMOND + 0.4, t);
      [now.A, now.B].forEach((p, i) => {
        const L = lights[i];
        const lp = lensPoint(p, cam);
        const pulse = 1 + 0.15 * Math.sin(t * (i ? 5.3 : 4.1));
        const mergeBoost = 1 + 1.4 * Math.exp(-Math.abs(t - T.MEET) * 3) * (t > T.MEET - 0.3 ? 1 : 0);
        L.core.position.copy(lp.p); L.halo.position.copy(lp.p);
        L.core.visible = L.halo.visible = lp.visible && appear > 0.001;
        L.core.material.opacity = appear;
        L.halo.material.opacity = appear * 0.9;
        L.core.scale.setScalar(0.16 * pulse * mergeBoost);
        L.halo.scale.setScalar(0.9 * pulse * mergeBoost * (1 - 0.45 * dmd));
        L.trail.forEach((s, k) => {
          const tk = t - (k + 1) * 0.019;
          const q = loversAt(tk, tauOf(tk));
          const lq = lensPoint(i ? q.B : q.A, cam);
          s.position.copy(lq.p);
          const f = 1 - k / L.trail.length;
          s.material.opacity = appear * f * f * 0.3;
          s.scale.setScalar(0.16 * f + 0.03);
          s.visible = lq.visible && appear > 0.001;
        });
      });
      // the diamond glint on the ring
      const dk = t - T.DIAMOND;
      const sOn = smooth(T.DIAMOND - 0.35, T.DIAMOND + 0.05, t);
      star.visible = sOn > 0.001;
      if (star.visible) {
        star.position.copy(lensPoint(now.A, cam).p);
        const flare = dk > 0 ? 1 + 1.25 * Math.exp(-dk * 2.6) : sOn;
        const tw = 0.9 + 0.1 * Math.sin(t * 4.7) * Math.sin(t * 2.3 + 1.0);
        star.scale.setScalar(4.2 * flare * tw);
        star.material.rotation = 0.05 * Math.sin(t * 0.9);
        star.material.opacity = sOn * (0.75 + 0.25 * tw);
      }
      // reunion rings face the camera
      rings.forEach(({ r, m, k }) => {
        const d = t - T.MEET - k * 0.22;
        if (d < 0 || d > 3.2) { r.visible = false; return; }
        r.visible = true;
        r.position.copy(P.MEET);
        r.lookAt(cam);
        const rad = 0.2 + Math.pow(d, 0.7) * 6.5;
        r.scale.setScalar(rad);
        m.opacity = Math.exp(-d * 1.4) * (1 - k * 0.25);
      });
    },
  };
}
