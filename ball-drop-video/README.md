# 球球下班记: a beat-synced 3D falling-ball animation (three.js)

A 70-second vertical (1080×1920) beat-synced animation built entirely with three.js and rendered offline in headless Chromium.
An orange ball with googly eyes jumps off an office rooftop at 18:00 on Friday. It falls through four scenes, one per classical piece, landing on an object on every beat and lighting it up:

| Scene | Music (public-domain compositions, arranged and synthesized here) |
|---|---|
| Rooftop intro | Bach: Toccata and Fugue in D minor (opening) |
| Sunset sky with floating piano keys | Mozart: *Eine kleine Nachtmusik* |
| Crystal cave (accelerating, ping-pong shaft) | Grieg: *In the Hall of the Mountain King* |
| Cabaret, drums, chorus line, giant kick | Offenbach: *Galop infernal* (Can-can) |
| Bedroom finale | Beethoven: Symphony No. 5 → Brahms' *Lullaby* → Monday phone call |

## How it works

- `music/score.py` holds the arrangement. It writes `build/song.mid` and `build/timeline.json`, which lists every ball contact ("hit"), light pulse and section boundary in seconds.
- `music/build_audio.sh` renders the MIDI file with FluidSynth (FluidR3 GM soundfont), then compresses and normalizes the result to `build/music.wav`.
- `src/choreo.js` solves the ball path. For each pair of consecutive hits it computes the ballistic arc that connects them exactly in Δt under gravity. It places each pad along the bounce normal, `normalize(v_out − v_in)`, so every bounce is physically consistent. `tools/check_choreo.mjs` verifies that the path never passes through a pad.
- `src/scenes.js` and `src/main.js` contain the scenes, ball rig (squash and stretch, eyes, expressions), camera, captions and post-processing (bloom, ACES tone mapping, vignette, grain, chromatic aberration). Every frame is a pure function of time, so rendering is deterministic.
- `render.mjs` renders frames in parallel headless Chromium workers, pipes the raw pixels to ffmpeg (H.264), then muxes in the audio.

## Build

```sh
npm install
pip install mido numpy pillow       # plus: apt install fluidsynth fluid-soundfont-gm ffmpeg
./music/build_audio.sh
node tools/check_choreo.mjs         # optional sanity check
node tools/stills.mjs 540 960 7 30 47   # optional: preview stills in build/stills
node render.mjs --w 1080 --h 1920 --fps 30 --workers 3 --out build/ball-drop.mp4
```
