# 《t → −t｜逆时公式》

A 53.5-second widescreen (1920×1080, 2.39:1 letterbox) motion design piece built entirely with JavaScript and three.js, inspired by the image of a black hole swallowing a river of physics equations.

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

## Final cut (with the user's hook audio)
- The opening uses the provided hook clip untouched. It holds a female voice saying 「我会找到逆转时间的公式，然后回到你身边」 over a G-minor BGM at 119.05 bpm (Gm–E♭–F–Gsus).
- Speech recognition (sherpa-onnx SenseVoice) timed each character. The subtitles appear character by character, the picture flash-forwards during the first sentence and tape-rewinds to t = 0 in the pause.
- The river reveal lands on bar 4 of the BGM, right after the line ends. `music/final.py` transposes the original score to G minor and follows the BGM's chord cycle, so both play together before the BGM dissolves into the black hole. Its bars 5–7 return under the finale.
- `tools/cover.py` builds the cover from a clean frame (`?nohud=1&nolb=1`).

## Build
```sh
npm install && pip install mido numpy scipy pillow   # plus fluidsynth, fluid-soundfont-gm, ffmpeg, fonts-noto-cjk, fonts-cmu
node tools/typeset.mjs
python3 music/final.py          # needs build/audio_in/user.wav (the hook clip)
node tools/stills.mjs 540 960 10 24 47.2            # preview stills
node render.mjs --w 1920 --h 1080 --fps 30 --workers 3 --out build/t-minus-t.mp4
```

## 在自己电脑上渲染（有独立显卡会快很多）
1. 安装：Node.js 18+、Python 3、ffmpeg、FluidSynth 和 GM 音色库（FluidR3_GM.sf2）、Google Chrome，以及字体 Noto Serif CJK SC 和 CMU Serif（Computer Modern）。
2. 拉取代码：`git clone -b claude/vigilant-heisenberg-k3dp1r https://github.com/ssasfaffssssssssa/openai-gemini`，然后 `cd openai-gemini/time-reversal`。
3. 安装依赖：`npm install`，再运行 `pip install mido numpy scipy pillow`。
4. 把开头那段女声音频转成 48kHz 的 WAV：`ffmpeg -i 你的音频.mp3 -ar 48000 build/audio_in/user.wav`。
5. 生成素材和配乐：`node tools/typeset.mjs`，然后 `python3 music/final.py`（音色库路径不同的话，改 `music/final.py` 里的 FluidR3_GM.sf2 路径）。
6. 用显卡渲染：`node render.mjs --w 1920 --h 1080 --fps 30 --workers 1 --gpu --out build/final.mp4`

渲染结果是确定的：同一份代码、同样的字体，在哪台电脑上渲染出来都一样，只是速度不同。
