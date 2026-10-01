# 《t → −t｜逆时公式》

A 51-second vertical (1080×1920) motion design piece built entirely with JavaScript and three.js, inspired by the image of a black hole swallowing a river of physics equations.

**Concept:** halfway through, time in the film actually runs backwards. Every visual is a pure function of scene time `tau`, and `src/timeline.js` maps real time to `tau` (forward → freeze → rewind → forward). The rewind is not a reversed video: the same functions are evaluated with decreasing `tau`. The soundtrack in that section is the act 2–3 mix, time-compressed by the same factor and played backwards, so every reversed sound lands on its reversed visual event.

| Part | Technique |
|---|---|
| Black hole | Per-pixel Schwarzschild null-geodesic ray marching (`src/blackhole.js`): accretion disk with Doppler beaming and gravitational redshift, photon ring, lensed starfield. Rendered at reduced resolution, then composited with depth so geometry is correctly occluded by the disk and the horizon |
| Equation river | 73 real LaTeX equations typeset offline with MathJax (`tools/typeset.mjs`) into a texture atlas, drawn as 10k instanced glyphs flowing along an analytic spiral. A weak-field lens (`LENS_GLSL`) displaces vertices to the primary image and draws a second image, producing Einstein-ring arcs of equations |
| Particle clock | ~50k particles (dial, Roman numerals, hands). Ticks on the beat, shatters, spirals into the horizon (`src/clock.js`) |
| You & me | Two lights in a binary orbit; one is captured, the rewind returns it, and they reunite in front of the photon ring (`src/lovers.js`) |
| Hand-written equations | MathJax glyph outlines traced with `pathLength` dashes, then filled (`src/hero.js`) |
| Post | Bloom, anamorphic streaks, ACES, chromatic aberration, freeze glitch (slit-scan and RGB split), rewind echo trails, reunion shockwave, grain, vignette |
| Sound | `music/build.py`: FluidSynth score (organ ostinato, choir, strings, celesta motif), numpy SFX, phase-vocoder rewind |

## Build
```sh
npm install && pip install mido numpy scipy pillow   # plus fluidsynth, fluid-soundfont-gm, ffmpeg, fonts-noto-cjk, fonts-cmu
node tools/typeset.mjs
python3 music/build.py
node tools/stills.mjs 540 960 10 24 47.2            # preview stills
node render.mjs --w 1080 --h 1920 --fps 30 --workers 3 --out build/t-minus-t.mp4
```
