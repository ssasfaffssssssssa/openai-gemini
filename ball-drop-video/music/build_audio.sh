#!/bin/sh
# Render build/song.mid with FluidSynth (FluidR3 GM soundfont) and master it.
set -e
cd "$(dirname "$0")/.."
python3 music/score.py
SF2=${SF2:-/usr/share/sounds/sf2/FluidR3_GM.sf2}
fluidsynth -ni -q -r 48000 -g 0.7 -o synth.reverb.room-size=0.75 -o synth.reverb.level=0.6 \
  -F build/raw.wav "$SF2" build/song.mid
ffmpeg -y -loglevel error -i build/raw.wav \
  -af "acompressor=threshold=-18dB:ratio=3:attack=5:release=120,loudnorm=I=-14:TP=-1.0:LRA=11,atrim=0:$(python3 -c "import json;print(json.load(open('build/timeline.json'))['duration'])")" \
  -ar 48000 build/music.wav
echo "audio: build/music.wav"
