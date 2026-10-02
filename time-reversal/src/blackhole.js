import * as THREE from 'three';

// Schwarzschild black hole (rs = 1) ray-marched per pixel.
// Output: rgb = HDR radiance, a = view depth of the first opaque hit (sky: 1e4).
export const BH = { rs: 1, rIn: 2.6, rOut: 15 };

const frag = /* glsl */ `
precision highp float;
uniform vec3 camPos;
uniform vec3 camRight;
uniform vec3 camUp;
uniform vec3 camFwd;
uniform float tanHalf;
uniform float aspect;
uniform float tau;
uniform float diskGain;
uniform float starGain;
uniform float glow;
uniform float holeGain;
uniform float diskOuter;
uniform vec2 res;
varying vec2 vUv;

float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float h31(vec3 p){ p = fract(p*0.3183099 + .1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(h21(i), h21(i+vec2(1,0)), u.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), u.x), u.y);
}
float fbm(vec2 p){ float a = 0.5, s = 0.0; for(int i=0;i<5;i++){ s += a*vnoise(p); p = p*2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }
float vnoise3(vec3 p){
  vec3 i = floor(p), f = fract(p); vec3 u = f*f*(3.0-2.0*f);
  float n000=h31(i), n100=h31(i+vec3(1,0,0)), n010=h31(i+vec3(0,1,0)), n110=h31(i+vec3(1,1,0));
  float n001=h31(i+vec3(0,0,1)), n101=h31(i+vec3(1,0,1)), n011=h31(i+vec3(0,1,1)), n111=h31(i+vec3(1,1,1));
  return mix(mix(mix(n000,n100,u.x), mix(n010,n110,u.x), u.y), mix(mix(n001,n101,u.x), mix(n011,n111,u.x), u.y), u.z);
}

vec3 sky(vec3 d){
  vec3 col = vec3(0.0);
  // two layers of stars
  for (int L = 0; L < 2; L++) {
    float sc = L == 0 ? 160.0 : 420.0;
    vec3 q = d * sc;
    vec3 c = floor(q);
    float h = h31(c);
    float thr = L == 0 ? 0.985 : 0.992;
    if (h > thr) {
      vec3 sp = c + 0.5 + 0.35*(vec3(h31(c+1.3), h31(c+2.7), h31(c+5.1)) - 0.5);
      float dd = length(q - sp);
      float b = pow(max(0.0, 1.0 - dd*2.6), 8.0) * (L == 0 ? 6.0 : 2.5) * (0.4 + 2.0*(h-thr)/(1.0-thr));
      float tint = h31(c+9.1);
      vec3 sc3 = tint < 0.3 ? vec3(0.75, 0.85, 1.0) : tint > 0.85 ? vec3(1.0, 0.8, 0.6) : vec3(1.0);
      col += sc3 * b;
    }
  }
  // milky band + nebula
  vec3 bandN = normalize(vec3(0.35, 0.9, -0.25));
  float band = exp(-pow(dot(d, bandN), 2.0) * 9.0);
  float neb = vnoise3(d*3.0) * 0.6 + vnoise3(d*7.0) * 0.4;
  col += band * (0.002 + 0.012*neb*neb) * vec3(0.45, 0.55, 1.0);
  col += pow(neb, 4.0) * 0.006 * vec3(0.8, 0.35, 0.9);
  return col * starGain;
}

vec3 blackbody(float t){ // t in [0,1] cool->hot, art-directed amber palette
  vec3 c1 = vec3(0.35, 0.05, 0.01);
  vec3 c2 = vec3(1.0, 0.42, 0.08);
  vec3 c3 = vec3(1.0, 0.78, 0.45);
  vec3 c4 = vec3(1.0, 0.97, 0.9);
  if (t < 0.33) return mix(c1, c2, t/0.33);
  if (t < 0.7) return mix(c2, c3, (t-0.33)/0.37);
  return mix(c3, c4, (t-0.7)/0.3);
}

vec2 diskTex(float lr, float ang){
  vec2 q = vec2(lr * 6.0, ang * 3.0 / 3.14159);
  return vec2(fbm(vec2(q.x * 2.2, q.y * 0.9)), fbm(vec2(q.x * 9.0, ang * 1.5)));
}

vec4 disk(vec3 p, vec3 rayDir){
  float r = length(p.xz);
  if (r < ${BH.rIn.toFixed(2)} || r > ${BH.rOut.toFixed(2)}) return vec4(0.0);
  float phi = atan(p.z, p.x);
  float omega = 1.6 * pow(r, -1.5);
  float ang = phi + omega * tau * 6.0;
  vec2 ns = diskTex(log(r), ang);
  // atan wraps at phi = +-pi: blend with the neighbouring period so the texture has no seam
  float ws = smoothstep(2.55, 3.14159, abs(phi)) * 0.5;
  if (ws > 0.0) ns = mix(ns, diskTex(log(r), ang - sign(phi) * 6.28318), ws);
  float n = ns.x, streak = ns.y;
  float dens = pow(smoothstep(0.15, 0.75, n), 1.6) * (0.25 + 1.2*pow(streak, 2.0));
  float edge = smoothstep(${BH.rIn.toFixed(2)}, ${BH.rIn.toFixed(2)} + 0.5, r) * (1.0 - smoothstep(diskOuter * 0.55, diskOuter, r));
  float temp = pow(${BH.rIn.toFixed(2)} / r, 0.9);
  // orbital motion -> doppler beaming
  vec3 vdir = normalize(vec3(-p.z, 0.0, p.x));
  float v = clamp(sqrt(0.5 / max(r - 1.0, 0.1)), 0.0, 0.62);
  float gam = 1.0 / sqrt(1.0 - v*v);
  float cosT = dot(vdir, -rayDir);
  float g = 1.0 / (gam * (1.0 - v * cosT));
  g *= sqrt(max(0.0, 1.0 - 1.0 / r)); // gravitational redshift
  float boost = pow(g, 3.0);
  vec3 col = blackbody(clamp(temp * 0.85 * g, 0.0, 1.0)) * (1.6 * temp * temp + 0.15) * boost * diskGain;
  col *= 0.15 + 1.9 * dens;
  float a = clamp(edge * (0.2 + 0.85 * dens), 0.0, 1.0);
  return vec4(col * edge, a);
}

vec4 trace(vec3 dir){
  vec3 pos = camPos;
  vec3 vel = dir;
  vec3 h = cross(pos, vel);
  float h2 = dot(h, h);
  vec4 sum = vec4(0.0);
  float depth = 1e4;
  bool captured = false;
  float minR = 1e9;
  for (int i = 0; i < 160; i++) {
    float r2 = dot(pos, pos);
    float r = sqrt(r2);
    minR = min(minR, r);
    if (r < 1.0) { captured = true; break; }
    if (r > 80.0 && dot(pos, vel) > 0.0) break;
    float dt = clamp(0.12 * r - 0.05, 0.04, 3.0);
    vec3 prev = pos;
    vec3 a = -1.5 * h2 * pos / (r2 * r2 * r);
    vel += a * dt;
    pos += vel * dt;
    if (prev.y * pos.y < 0.0) {
      vec3 hp = mix(prev, pos, prev.y / (prev.y - pos.y));
      vec4 d = disk(hp, normalize(vel));
      if (d.a > 0.0) {
        sum.rgb += (1.0 - sum.a) * d.rgb * d.a;
        if (sum.a < 0.6 && sum.a + (1.0 - sum.a) * d.a >= 0.6) depth = dot(hp - camPos, camFwd);
        sum.a += (1.0 - sum.a) * d.a;
        if (sum.a > 0.985) break;
      }
    }
  }
  vec3 bg = vec3(0.0);
  if (!captured) {
    bg = sky(normalize(vel));
  } else if (depth > 9e3) {
    depth = max(0.1, dot(-camPos, camFwd) - 1.0);
  }
  // soft glow hugging the photon sphere
  float ring = exp(-pow((minR - 1.5) * 3.2, 2.0)) * glow;
  vec3 col = sum.rgb + (1.0 - sum.a) * bg + ring * vec3(1.0, 0.72, 0.42) * (captured ? 0.0 : 1.0);
  // before it is revealed the hole is invisible: plain, unlensed starfield
  if (holeGain < 0.999) { col = mix(sky(dir), col, holeGain); depth = mix(1e4, depth, step(0.5, holeGain)); }
  return vec4(col, depth);
}

vec3 rayDir(vec2 ndc){ return normalize(camFwd + camRight * ndc.x * tanHalf * aspect + camUp * ndc.y * tanHalf); }

void main(){
  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 dir = rayDir(ndc);
  // rays whose impact parameter is near the critical one (b = 3*sqrt(3)/2) form the shadow edge and
  // the photon ring: the only hard edges in the image. Those pixels get 4 rotated-grid samples.
  float b = length(cross(camPos, dir));
  vec4 o;
  if (abs(b - 2.598) < 0.32) {
    vec2 px = 2.0 / res;
    o = vec4(0.0, 0.0, 0.0, 1e9);
    for (int k = 0; k < 4; k++) {
      vec2 off = k == 0 ? vec2(0.125, 0.375) : k == 1 ? vec2(-0.375, 0.125) : k == 2 ? vec2(-0.125, -0.375) : vec2(0.375, -0.125);
      vec4 s = trace(rayDir(ndc + off * px));
      o.rgb += s.rgb * 0.25;
      o.a = min(o.a, s.a);
    }
  } else {
    o = trace(dir);
  }
  gl_FragColor = o;
}
`;

export function createBlackHole(renderer, w, h) {
  const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.FloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      camPos: { value: new THREE.Vector3() }, camRight: { value: new THREE.Vector3() }, camUp: { value: new THREE.Vector3() }, camFwd: { value: new THREE.Vector3() },
      tanHalf: { value: 0.4 }, aspect: { value: w / h }, tau: { value: 0 }, diskGain: { value: 1 }, starGain: { value: 1 }, glow: { value: 0.35 }, holeGain: { value: 1 }, diskOuter: { value: BH.rOut }, res: { value: new THREE.Vector2(w, h) },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: frag,
    depthTest: false, depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(quad);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const m = new THREE.Matrix4();
  return {
    rt, mat,
    render(camera, tau) {
      camera.updateMatrixWorld();
      m.copy(camera.matrixWorld);
      const u = mat.uniforms;
      u.camPos.value.setFromMatrixPosition(m);
      u.camRight.value.setFromMatrixColumn(m, 0).normalize();
      u.camUp.value.setFromMatrixColumn(m, 1).normalize();
      u.camFwd.value.setFromMatrixColumn(m, 2).normalize().negate();
      u.tanHalf.value = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
      u.aspect.value = camera.aspect;
      u.tau.value = tau;
      renderer.setRenderTarget(rt);
      renderer.render(scene, cam);
      renderer.setRenderTarget(null);
    },
  };
}

// Full-resolution composite that writes the black hole color + depth into the main buffer,
// so ordinary geometry is correctly occluded by the disk / event horizon.
export function createBHComposite(bhTexture) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { tBH: { value: bhTexture }, near: { value: 0.1 }, far: { value: 1000 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform sampler2D tBH; uniform float near, far; varying vec2 vUv;
      void main(){
        vec4 s = texture2D(tBH, vUv);
        float z = clamp(s.a, near * 1.01, far * 0.99);
        // perspective depth from view distance
        float ndcZ = (far + near) / (far - near) - (2.0 * far * near) / ((far - near) * z);
        gl_FragDepth = ndcZ * 0.5 + 0.5;
        gl_FragColor = vec4(s.rgb, 1.0);
      }`,
    depthTest: false, depthWrite: true, toneMapped: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  quad.renderOrder = -1000;
  return { quad, mat };
}
