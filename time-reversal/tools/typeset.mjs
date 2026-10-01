// Typeset physics equations to standalone SVG with MathJax (offline).
import { mathjax } from 'mathjax-full/js/mathjax.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { SVG } from 'mathjax-full/js/output/svg.js';
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages.js';
import fs from 'fs';

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const doc = mathjax.document('', { InputJax: new TeX({ packages: AllPackages }), OutputJax: new SVG({ fontCache: 'none' }) });

const RIVER = String.raw`
\nabla \cdot \mathbf{E} = \frac{\rho}{\varepsilon_0}
\nabla \cdot \mathbf{B} = 0
\nabla \times \mathbf{E} = -\frac{\partial \mathbf{B}}{\partial t}
\nabla \times \mathbf{B} = \mu_0 \mathbf{J} + \mu_0 \varepsilon_0 \frac{\partial \mathbf{E}}{\partial t}
i\hbar \frac{\partial \psi}{\partial t} = -\frac{\hbar^2}{2m}\nabla^2 \psi + V\psi
R_{\mu\nu} - \frac{1}{2} g_{\mu\nu} R + \Lambda g_{\mu\nu} = \frac{8\pi G}{c^4} T_{\mu\nu}
E = mc^2
E^2 = (pc)^2 + (m c^2)^2
ds^2 = -\left(1-\frac{2GM}{rc^2}\right)c^2dt^2 + \frac{dr^2}{1-\frac{2GM}{rc^2}} + r^2 d\Omega^2
S = -k_B \sum_i p_i \ln p_i
S = k_B \ln W
\frac{dS}{dt} \geq 0
\rho\left(\frac{\partial \mathbf{v}}{\partial t} + \mathbf{v}\cdot\nabla\mathbf{v}\right) = -\nabla p + \mu \nabla^2 \mathbf{v} + \mathbf{f}
\frac{\partial \rho}{\partial t} + \nabla \cdot (\rho \mathbf{v}) = 0
f(x) = \frac{a_0}{2} + \sum_{n=1}^{\infty}\left(a_n \cos nx + b_n \sin nx\right)
\hat{f}(\xi) = \int_{-\infty}^{\infty} f(x)\, e^{-2\pi i x \xi}\, dx
\frac{d}{dt}\frac{\partial L}{\partial \dot{q}_i} - \frac{\partial L}{\partial q_i} = 0
S = \int_{t_1}^{t_2} L(q, \dot q, t)\, dt
\delta S = 0
H = \sum_i p_i \dot{q}_i - L
\dot{q} = \frac{\partial H}{\partial p}, \quad \dot{p} = -\frac{\partial H}{\partial q}
\Delta x \, \Delta p \geq \frac{\hbar}{2}
\Delta E \, \Delta t \geq \frac{\hbar}{2}
\frac{\partial^2 u}{\partial t^2} = c^2 \nabla^2 u
\frac{\partial u}{\partial t} = \alpha \nabla^2 u
e^{i\pi} + 1 = 0
\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}
\oint_C \mathbf{B}\cdot d\boldsymbol{\ell} = \mu_0 I_{\text{enc}}
\oint_{\partial V} \mathbf{E}\cdot d\mathbf{A} = \frac{Q}{\varepsilon_0}
F = G\frac{m_1 m_2}{r^2}
\mathbf{F} = m\mathbf{a}
F = \frac{dp}{dt}
(i\gamma^\mu \partial_\mu - m)\psi = 0
\mathcal{L} = -\frac{1}{4}F_{\mu\nu}F^{\mu\nu} + \bar\psi(i\gamma^\mu D_\mu - m)\psi
\langle \hat{A} \rangle = \langle \psi | \hat{A} | \psi \rangle
[\hat{x}, \hat{p}] = i\hbar
Z = \sum_i e^{-E_i / k_B T}
F = -k_B T \ln Z
PV = nk_BT
dU = T\,dS - P\,dV
\eta = 1 - \frac{T_C}{T_H}
\lambda = \frac{h}{p}
E = h\nu
\gamma = \frac{1}{\sqrt{1 - v^2/c^2}}
t' = \gamma\left(t - \frac{vx}{c^2}\right)
r_s = \frac{2GM}{c^2}
T_H = \frac{\hbar c^3}{8\pi G M k_B}
S_{BH} = \frac{k_B c^3 A}{4 G \hbar}
\frac{dN}{dt} = -\lambda N
\nabla^2 \phi = 4\pi G \rho
\psi(x,t) = A e^{i(kx - \omega t)}
\hat{H}|\psi\rangle = E|\psi\rangle
\rho(t) = e^{-iHt/\hbar}\,\rho(0)\,e^{iHt/\hbar}
\frac{\partial f}{\partial t} + \mathbf{v}\cdot\nabla f = \left(\frac{\partial f}{\partial t}\right)_{\text{coll}}
\mathcal{T}: t \mapsto -t
\Theta = \mathcal{C}\mathcal{P}\mathcal{T}
\sum_{n=1}^{\infty} \frac{1}{n^2} = \frac{\pi^2}{6}
\zeta(s) = \sum_{n=1}^{\infty} n^{-s}
\frac{d^2x^\mu}{d\tau^2} + \Gamma^\mu_{\alpha\beta}\frac{dx^\alpha}{d\tau}\frac{dx^\beta}{d\tau} = 0
\Gamma^\lambda_{\mu\nu} = \frac{1}{2}g^{\lambda\sigma}(\partial_\mu g_{\sigma\nu} + \partial_\nu g_{\sigma\mu} - \partial_\sigma g_{\mu\nu})
u'' + u = \frac{3GM}{c^2} u^2
\mathbf{S} = \frac{1}{\mu_0}\mathbf{E}\times\mathbf{B}
\nabla \times \mathbf{A} = \mathbf{B}
\Box A^\mu = \mu_0 J^\mu
G_{\mu\nu} = 8\pi T_{\mu\nu}
\frac{d^2 x}{dt^2} + \omega^2 x = 0
x(t) = A\cos(\omega t + \varphi)
P(A|B) = \frac{P(B|A)P(A)}{P(B)}
H = -\sum_i p(x_i)\log_2 p(x_i)
\nabla_\mu T^{\mu\nu} = 0
|\psi\rangle = \alpha|0\rangle + \beta|1\rangle
H^2 = \frac{8\pi G}{3}\rho - \frac{kc^2}{a^2}
\frac{\ddot{a}}{a} = -\frac{4\pi G}{3}\left(\rho + \frac{3p}{c^2}\right)
`.trim().split('\n').map((s) => s.trim()).filter(Boolean);

const HERO = {
  t: String.raw`t`,
  flip: String.raw`t \;\rightarrow\; -t`,
  entropy: String.raw`S = k_B \ln W`,
  final: String.raw`\psi(x,t) \;\longrightarrow\; \psi^{*}(x,-t)`,
};

function svgOf(tex) {
  const node = doc.convert(tex, { display: true });
  let svg = adaptor.innerHTML(node);
  svg = svg.replace(/currentColor/g, '#ffffff');
  const vb = /viewBox="([-\d.\s]+)"/.exec(svg)[1].split(/\s+/).map(Number);
  return { tex, svg, vb };
}
const out = { river: RIVER.map(svgOf), hero: Object.fromEntries(Object.entries(HERO).map(([k, v]) => [k, svgOf(v)])) };
fs.mkdirSync('build', { recursive: true });
fs.writeFileSync('build/equations.json', JSON.stringify(out));
console.log('river', out.river.length, 'hero', Object.keys(out.hero).length, 'bytes', JSON.stringify(out).length);
