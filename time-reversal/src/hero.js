import * as THREE from 'three';
import { svgImage } from './river.js';

// Hand-written reveal of a MathJax equation: each glyph outline is traced with a
// growing stroke (pathLength=1 dash), then its fill fades in. Drawn to a canvas texture.
export class WriteOn {
  constructor(entry, pxH = 300, color = new THREE.Color(1, 1, 1), worldH = 1) {
    this.vb = entry.vb;
    this.pxH = pxH;
    this.pxW = Math.round(pxH * this.vb[2] / this.vb[3]);
    let k = 0;
    this.tpl = entry.svg.replace(/<(path|rect)\b/g, (m, tag) => `<${tag} data-k="${k++}"`);
    this.n = k;
    const pad = Math.round(pxH * 0.25);
    this.pad = pad;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.pxW + pad * 2;
    this.canvas.height = pxH + pad * 2;
    this.g = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.NoColorSpace;
    this.mat = new THREE.MeshBasicMaterial({ map: this.tex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide });
    const aspect = this.canvas.width / this.canvas.height;
    const h = worldH * this.canvas.height / pxH;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(h * aspect, h), this.mat);
    this.mesh.frustumCulled = false;
    this.last = -1;
  }

  async draw(p) {
    p = Math.min(1, Math.max(0, p));
    const q = Math.round(p * 400) / 400;
    if (q === this.last) return;
    this.last = q;
    const N = this.n;
    const sw = Math.max(14, this.vb[3] * 0.022);
    const svg = this.tpl.replace(/<(path|rect) data-k="(\d+)"/g, (m, tag, ks) => {
      const k = +ks;
      const pk = Math.min(1, Math.max(0, q * (N + 1.2) - k));
      const fill = Math.min(1, Math.max(0, (pk - 0.55) / 0.45));
      if (tag === 'rect') return `<rect fill-opacity="${pk}"`;
      return `<path stroke="#ffffff" stroke-width="${sw}" stroke-linecap="round" pathLength="1" stroke-dasharray="${pk.toFixed(4)} 2" stroke-opacity="${(pk > 0 ? 1 - 0.65 * fill : 0).toFixed(3)}" fill-opacity="${fill.toFixed(3)}"`;
    });
    const img = await svgImage(svg, this.pxW, this.pxH);
    const g = this.g;
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    g.drawImage(img, this.pad, this.pad, this.pxW, this.pxH);
    this.tex.needsUpdate = true;
  }
}
