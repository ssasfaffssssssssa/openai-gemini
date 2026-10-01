"""Builds the soundtrack (public-domain classical themes, arranged here) as MIDI
and exports the beat timeline that drives the animation.

Outputs:
  build/song.mid       - rendered to audio by FluidSynth (see build_audio.sh)
  build/timeline.json  - hits (ball contacts), pulses (light flashes), sections
"""
import json
import math
import os

import mido

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD = os.path.join(ROOT, "build")

NOTE_BASE = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


def P(name):
    """'C#4' -> 61, 'Bb3' -> 58."""
    letter, rest = name[0], name[1:]
    acc = 0
    while rest and rest[0] in "#b":
        acc += 1 if rest[0] == "#" else -1
        rest = rest[1:]
    return 12 * (int(rest) + 1) + NOTE_BASE[letter] + acc


class Track:
    def __init__(self, name, ch, prog, vol=100, pan=64, rev=50, cho=0):
        self.name, self.ch, self.prog = name, ch, prog
        self.vol, self.pan, self.rev, self.cho = vol, pan, rev, cho
        self.events = []  # (time_sec, order, mido.Message)

    def note(self, t, dur, pitch, vel=96):
        if isinstance(pitch, str):
            pitch = P(pitch)
        vel = max(1, min(127, int(vel)))
        self.events.append((t, 1, mido.Message("note_on", channel=self.ch, note=pitch, velocity=vel)))
        self.events.append((t + dur, 0, mido.Message("note_off", channel=self.ch, note=pitch, velocity=0)))

    def chord(self, t, dur, pitches, vel=90):
        for p in pitches:
            self.note(t, dur, p, vel)

    def bend(self, t, value):
        self.events.append((t, 1, mido.Message("pitchwheel", channel=self.ch, pitch=int(max(-8192, min(8191, value))))))

    def cc(self, t, ctrl, value):
        self.events.append((t, 0, mido.Message("control_change", channel=self.ch, control=ctrl, value=int(value))))


TRACKS = {}


def track(name, ch, prog, **kw):
    TRACKS[name] = Track(name, ch, prog, **kw)
    return TRACKS[name]


DRUM_CH = 9
organ = track("organ", 0, 19, vol=112, rev=110)
strings = track("strings", 1, 48, vol=104, rev=70)
piano = track("piano", 2, 0, vol=96, rev=55)
bass = track("bass", 3, 45, vol=110, rev=40)          # pizzicato strings
bassoon = track("bassoon", 4, 70, vol=112, rev=50)
brass = track("brass", 5, 61, vol=100, rev=60)
timp = track("timp", 6, 47, vol=118, rev=60)
glock = track("glock", 7, 9, vol=80, rev=70)
trumpet = track("trumpet", 8, 56, vol=104, rev=50)
drums = track("drums", DRUM_CH, 0, vol=110, rev=40)
piccolo = track("piccolo", 10, 72, vol=88, rev=50)
tuba = track("tuba", 11, 58, vol=112, rev=40)
whistle = track("whistle", 12, 78, vol=110, rev=60)
musicbox = track("musicbox", 13, 10, vol=104, rev=90)
phone = track("phone", 14, 124, vol=110, rev=30)
sfx = track("sfx", 15, 119, vol=96, rev=60)            # reverse cymbal

# Pitch-bend range of 12 semitones for the slide whistle.
for c, v in ((101, 0), (100, 0), (6, 12), (38, 0)):
    whistle.cc(0.0, c, v)

timeline = {"hits": [], "pulses": [], "sections": {}, "notes": []}


def hit(t, scene, kind="pad", pitch=None, strength=1.0, **extra):
    h = {"t": round(t, 5), "scene": scene, "kind": kind, "strength": strength}
    if pitch is not None:
        h["pitch"] = pitch if isinstance(pitch, int) else P(pitch)
    h.update(extra)
    timeline["hits"].append(h)


def pulse(t, scene, strength=1.0, pitch=None, group="note"):
    p = {"t": round(t, 5), "scene": scene, "strength": strength, "group": group}
    if pitch is not None:
        p["pitch"] = pitch if isinstance(pitch, int) else P(pitch)
    timeline["pulses"].append(p)


def section(name, t):
    timeline["sections"][name] = round(t, 5)


# ---------------------------------------------------------------- 0. Intro
# Bach, Toccata and Fugue in D minor, BWV 565 - the famous opening gesture.
section("intro", 0.0)
T = 0.30
for (dt, dur, n) in [(0.00, 0.11, "A5"), (0.12, 0.11, "G5"), (0.24, 1.05, "A5")]:
    organ.note(T + dt, dur, n, 112)
    organ.note(T + dt, dur, P(n) - 12, 104)
pulse(T, "intro", 1.0, group="zoom")
T2 = 1.75
run = ["G5", "F5", "E5", "D5"]
for i, n in enumerate(run):
    organ.note(T2 + i * 0.1, 0.1, n, 108)
    organ.note(T2 + i * 0.1, 0.1, P(n) - 12, 100)
organ.note(T2 + 0.4, 0.55, "C#5", 112)
organ.note(T2 + 0.4, 0.55, "C#4", 104)
pulse(T2, "intro", 1.0, group="zoom")
T3 = 2.75
organ.note(T3, 0.9, "D5", 115)
organ.note(T3, 0.9, "D4", 108)
organ.note(T3, 0.9, "D3", 100)
pulse(T3, "intro", 1.0, group="zoom")
T4 = 3.75
for i, n in enumerate(["D2", "A2", "D3", "F3", "A3", "D4", "F4", "A4"]):
    organ.note(T4 + i * 0.035, 1.25 - i * 0.035, n, 112)
timp.note(T4, 1.0, "D2", 120)
drums.note(T4, 1.0, 49, 110)
pulse(T4, "intro", 1.4, group="zoom")
hit(T4, "intro", kind="launch")
section("intro_chord", T4)

# ---------------------------------------------------------------- 1. Mozart
# Eine kleine Nachtmusik K.525, I. Allegro - opening bars.
T_MOZ = 5.0
section("mozart", T_MOZ)
BEAT = 60 / 132
moz_bars = [
    # (beat offset within 4-bar phrase, length in beats, pitch)
    (0.0, 1.0, "G4"), (1.5, 0.5, "D4"), (2.0, 1.0, "G4"), (3.5, 0.5, "D4"),
    (4.0, 0.5, "G4"), (4.5, 0.5, "D4"), (5.0, 0.5, "G4"), (5.5, 0.5, "B4"), (6.0, 2.0, "D5"),
    (8.0, 1.0, "C5"), (9.5, 0.5, "A4"), (10.0, 1.0, "C5"), (11.5, 0.5, "A4"),
    (12.0, 0.5, "C5"), (12.5, 0.5, "A4"), (13.0, 0.5, "F#4"), (13.5, 0.5, "A4"), (14.0, 2.0, "D4"),
]
moz_harm = [  # per bar: chord tones, bass
    (["G3", "B3", "D4"], "G2"), (["G3", "B3", "D4"], "G2"),
    (["F#3", "A3", "C4", "D4"], "D2"), (["F#3", "A3", "C4", "D4"], "D2"),
]
for rep in range(2):
    base = T_MOZ + rep * 16 * BEAT
    for (b, l, n) in moz_bars:
        t = base + b * BEAT
        d = l * BEAT * (0.82 if l >= 1 else 0.92)
        vel = 100 if rep == 0 else 112
        strings.note(t, d, n, vel)
        strings.note(t, d, P(n) - 12, vel - 10)
        piano.note(t, d, n, vel - 6)
        if rep == 1:
            piano.note(t, d, P(n) + 12, vel - 20)
            glock.note(t, min(d, 0.3), P(n) + 12, 92)
        hit(t, "mozart", pitch=n, strength=1.0 if l >= 1 else 0.7)
        pulse(t, "mozart", 1.0 if l >= 1 else 0.6, pitch=n)
    for bar, (ch, bn) in enumerate(moz_harm):
        t = base + bar * 4 * BEAT
        if rep == 1:
            for beat in range(4):
                tt = t + beat * BEAT
                bass.note(tt, BEAT * 0.5, P(bn) + (12 if beat % 2 else 0), 104)
                pulse(tt, "mozart", 0.35, group="beat")
            for n in ch:
                strings.note(t + 2 * BEAT, 1.6 * BEAT, n, 64)
        else:
            bass.note(t, BEAT * 0.5, bn, 96)
            pulse(t, "mozart", 0.35, group="beat")
timp.note(T_MOZ + 16 * BEAT, 0.4, "G2", 100)
timp.note(T_MOZ + 30 * BEAT, 0.6, "D2", 110)
sfx.note(T_MOZ + 30 * BEAT - 0.2, 1.6, "C4", 90)  # reverse cymbal into the drop
section("mozart_end", T_MOZ + 32 * BEAT)

# Slide whistle down during the fall.
fall_start = T_MOZ + 30 * BEAT + 0.15
whistle.bend(fall_start, 8191)
whistle.note(fall_start, 1.1, "C6", 100)
for i in range(23):
    whistle.bend(fall_start + i * 0.05, 8191 - i * 16383 / 22)

# ---------------------------------------------------------------- 2. Grieg
# In the Hall of the Mountain King - with accelerando.
T_MK = 20.0
section("cave", T_MK)
A = [("B3", 1), ("C#4", 1), ("D4", 1), ("E4", 1), ("F#4", 1), ("D4", 1), ("F#4", 2),
     ("F4", 1), ("C#4", 1), ("F4", 2), ("E4", 1), ("C4", 1), ("E4", 2),
     ("B3", 1), ("C#4", 1), ("D4", 1), ("E4", 1), ("F#4", 1), ("D4", 1), ("F#4", 1), ("B4", 1),
     ("A4", 1), ("F#4", 1), ("D4", 1), ("F#4", 1), ("A4", 4)]
B = [("F#4", 1), ("G#4", 1), ("A#4", 1), ("B4", 1), ("C#5", 1), ("A#4", 1), ("C#5", 2),
     ("D5", 1), ("A#4", 1), ("D5", 2), ("C#5", 1), ("A#4", 1), ("C#5", 2),
     ("F#4", 1), ("G#4", 1), ("A#4", 1), ("B4", 1), ("C#5", 1), ("A#4", 1), ("C#5", 2),
     ("D5", 1), ("A#4", 1), ("D5", 2), ("C#5", 4)]
phrases = [(A, 0, "low"), (B, 0, "low"), (A, 12, "high")]
N8 = 96
E0, E1 = 0.27, 0.13
eighth_t = [T_MK]
for k in range(N8 + 8):
    e = E0 * (E1 / E0) ** (min(k, N8 - 1) / (N8 - 1))
    eighth_t.append(eighth_t[-1] + e)

k = 0
for pi, (phrase, shift, mode) in enumerate(phrases):
    pk = 0
    for (n, l) in phrase:
        t = eighth_t[k]
        d = (eighth_t[k + l] - t) * 0.8
        p = P(n) + shift
        if mode == "low":
            bassoon.note(t, d, p - 12, 100 + pi * 8)
            bass.note(t, d * 0.6, p, 92 + pi * 8)
        else:
            strings.note(t, d, p, 118)
            strings.note(t, d, p - 12, 110)
            brass.note(t, d, p - 12, 108)
            bassoon.note(t, d, p - 24, 110)
            piccolo.note(t, d, p + 12, 92)
        pulse(t, "cave", 0.6 + 0.2 * pi, pitch=p)
        if mode == "high":
            hit(t, "cave", kind="wall", pitch=p, strength=1.0)
        elif pk % 2 == 0:
            hit(t, "cave", pitch=p, strength=0.8 + 0.1 * pi)
        k += l
        pk += l
    # quarter-note accompaniment
    for q in range(16):
        kk = k - 32 + q * 2
        t = eighth_t[kk]
        root = "B1" if (phrase is A) else "F#1"
        fifth = "F#2" if (phrase is A) else "C#2"
        bass.note(t, 0.1, root if q % 2 == 0 else fifth, 100 + pi * 10)
        if pi >= 1:
            timp.note(t, 0.15, "B2" if (phrase is A) else "F#2", 90 + pi * 14)
        if pi == 2:
            drums.note(t, 0.1, 36, 112)
            if q % 2 == 1:
                drums.note(t, 0.1, 38, 100)
            if q % 4 == 0:
                drums.note(t, 0.6, 49, 110)
        pulse(t, "cave", 0.3, group="beat")

# Ending stabs.
end_k = k
stab_times = [eighth_t[end_k], eighth_t[end_k] + 0.27, eighth_t[end_k] + 0.54]
for i, t in enumerate(stab_times):
    dur = 0.18 if i < 2 else 1.3
    strings.chord(t, dur, ["B3", "D4", "F#4", "B4"], 120)
    brass.chord(t, dur, ["B2", "F#3", "B3", "D4"], 118)
    bassoon.note(t, dur, "B1", 115)
    timp.note(t, dur, "B2", 127)
    drums.note(t, dur, 49 if i < 2 else 57, 120)
    drums.note(t, 0.1, 36, 125)
    hit(t, "cave", kind="smash", pitch="B3", strength=1.2 + 0.2 * i)
    pulse(t, "cave", 1.4, group="stab")
section("cave_end", stab_times[-1])

fall2 = stab_times[-1] + 0.25
whistle.bend(fall2, 8191)
whistle.note(fall2, 1.15, "D6", 96)
for i in range(24):
    whistle.bend(fall2 + i * 0.05, 8191 - i * 16383 / 23)

# ---------------------------------------------------------------- 3. Offenbach
# Galop infernal ("Can-can") from Orpheus in the Underworld.
T_CC = round(stab_times[-1] + 1.55, 4)
section("cancan", T_CC)
Q = 0.375
E8 = Q / 2
cc_mel = [
    [("C5", 4)],
    [("D5", 1), ("F5", 1), ("E5", 1), ("D5", 1)],
    [("G5", 2), ("G5", 2)],
    [("G5", 1), ("A5", 1), ("E5", 1), ("F5", 1)],
    [("D5", 2), ("D5", 2)],
    [("D5", 1), ("F5", 1), ("E5", 1), ("D5", 1)],
    [("C5", 1), ("C6", 1), ("B5", 1), ("A5", 1)],
    [("G5", 1), ("F5", 1), ("E5", 1), ("D5", 1)],
]
cc_mel = cc_mel + cc_mel[:6] + [
    [("C5", 1), ("G5", 1), ("D5", 1), ("E5", 1)],
]
cc_harm = ["C", "G7", "C", "C", "G", "G7", "C", "G7"] * 2
CH = {"C": (["E4", "G4", "C5"], "C2", "G2"), "G": (["D4", "G4", "B4"], "G1", "D2"),
      "G7": (["D4", "F4", "B4"], "G1", "D2")}
for bar, notes in enumerate(cc_mel):
    t0 = T_CC + bar * 2 * Q
    pos = 0
    for (n, l) in notes:
        t = t0 + pos * E8
        d = l * E8 * 0.85
        trumpet.note(t, d, n, 112)
        strings.note(t, d, n, 104)
        piccolo.note(t, d, P(n) + 12, 88)
        if pos % 2 == 0:
            hit(t, "cancan", kind="drum", pitch=n, strength=1.0 if l >= 2 else 0.85)
        pulse(t, "cancan", 0.8, pitch=n)
        pos += l
    ch, root, fifth = CH[cc_harm[bar]]
    tuba.note(t0, E8 * 0.8, root, 115)
    tuba.note(t0 + 2 * E8, E8 * 0.8, fifth, 108)
    for off in (1, 3):
        brass.chord(t0 + off * E8, E8 * 0.6, ch, 92)
        drums.note(t0 + off * E8, 0.08, 38, 92)
    drums.note(t0, 0.1, 36, 110)
    drums.note(t0 + 2 * E8, 0.1, 36, 100)
    if bar % 8 == 0:
        drums.note(t0, 0.8, 49, 112)
    for e in range(4):
        pulse(t0 + e * E8, "cancan", 0.4, group="chase")

# Final stinger: the big kick.
T_KICK = T_CC + len(cc_mel) * 2 * Q
trumpet.note(T_KICK, 0.35, "C6", 124)
strings.chord(T_KICK, 0.35, ["C4", "E4", "G4", "C5"], 120)
brass.chord(T_KICK, 0.35, ["C3", "G3", "C4", "E4"], 120)
tuba.note(T_KICK, 0.35, "C1", 125)
timp.note(T_KICK, 0.35, "C2", 127)
drums.note(T_KICK, 0.9, 49, 127)
drums.note(T_KICK, 0.9, 57, 120)
drums.note(T_KICK, 0.1, 36, 127)
hit(T_KICK, "cancan", kind="kick", pitch="C6", strength=1.6)
pulse(T_KICK, "cancan", 1.6, group="stab")
section("kick", T_KICK)

drums.note(T_KICK + 1.1, 0.8, 81, 120)  # 'ding' when the ball becomes a star

# Slide whistle up, then down while flying.
t = T_KICK + 0.05
whistle.bend(t, -8191)
whistle.note(t, 2.0, "G5", 104)
for i in range(16):
    whistle.bend(t + i * 0.04, -8191 + i * 16383 / 15)
for i in range(30):
    whistle.bend(t + 0.7 + i * 0.045, 8191 - i * 16383 / 29)

# ---------------------------------------------------------------- 4. Beethoven
# Symphony No. 5 in C minor - "Fate knocks at the door".
T_B5 = round(T_KICK + 2.55, 4)
section("home", T_B5)
E5_ = 0.2
fate = [
    (1, "G4", 1, False), (2, "G4", 1, False), (3, "G4", 1, False), (4, "Eb4", 9, True),
    (14, "F4", 1, False), (15, "F4", 1, False), (16, "F4", 1, False), (17, "D4", 14, True),
]
for (pos, n, l, long) in fate:
    t = T_B5 + pos * E5_
    d = l * E5_ * (0.95 if long else 0.75)
    for sh in (-24, -12, 0):
        strings.note(t, d, P(n) + sh, 124 if long else 116)
    brass.note(t, d, P(n) - 12, 118)
    bassoon.note(t, d, P(n) - 24, 112)
    if long:
        timp.note(t, 0.15, "C2" if n == "Eb4" else "G1", 127)
        for r in range(int(d / 0.06)):
            timp.note(t + 0.15 + r * 0.06, 0.06, "C2" if n == "Eb4" else "G1", 70 + r)
        drums.note(t, 1.5, 49, 120)
    hit(t, "home", kind="land" if n == "D4" else ("big" if long else "pad"), pitch=n,
        strength=1.5 if long else 1.0)
    pulse(t, "home", 1.5 if long else 0.9, pitch=n, group="fate")
T_LAND = T_B5 + 17 * E5_
section("land", T_LAND)

# Brahms lullaby on a music box while the ball falls asleep.
T_LUL = T_LAND + 2.6
section("lullaby", T_LUL)
LB = 0.42
lull = [(0, 0.5, "E5"), (0.5, 0.5, "E5"), (1, 2, "G5"), (3, 0.5, "E5"), (3.5, 0.5, "E5"), (4, 2, "G5"),
        (6, 0.5, "E5"), (6.5, 0.5, "G5"), (7, 1, "C6"), (8, 1.5, "B5"), (9.5, 0.5, "A5"), (10, 1, "A5"),
        (11, 1, "G5")]
for (b, l, n) in lull:
    musicbox.note(T_LUL + b * LB, l * LB * 1.4, n, 100)
    pulse(T_LUL + b * LB, "home", 0.25, pitch=n, group="lullaby")
for (b, ch) in [(0, ["C4", "G4"]), (3, ["C4", "G4"]), (6, ["C4", "E4"]), (9, ["F3", "C4"]), (11, ["G3", "D4"])]:
    musicbox.chord(T_LUL + b * LB, 3 * LB, ch, 70)

# Monday: the phone rings.
T_PHONE = T_LUL + 12 * LB + 1.0
section("phone", T_PHONE)
phone.note(T_PHONE, 2.6, "C5", 120)
pulse(T_PHONE, "home", 1.2, group="phone")
T_SHOCK = T_PHONE + 1.5
strings.chord(T_SHOCK, 0.5, ["C4", "Eb4", "Gb4", "A4"], 120)  # diminished "shock" stab
brass.chord(T_SHOCK, 0.5, ["C3", "Gb3", "A3"], 118)
timp.note(T_SHOCK, 0.4, "C2", 127)
drums.note(T_SHOCK, 0.6, 57, 120)
pulse(T_SHOCK, "home", 1.5, group="shock")
section("shock", T_SHOCK)
T_END = T_SHOCK + 2.6
section("end", T_END)

# ---------------------------------------------------------------- export
os.makedirs(BUILD, exist_ok=True)
mid = mido.MidiFile(type=1, ticks_per_beat=960)
TPS = 1920  # ticks per second at 120 bpm
meta = mido.MidiTrack()
meta.append(mido.MetaMessage("set_tempo", tempo=500000, time=0))
mid.tracks.append(meta)
for tr in TRACKS.values():
    mt = mido.MidiTrack()
    mt.append(mido.MetaMessage("track_name", name=tr.name, time=0))
    if tr.ch != DRUM_CH:
        mt.append(mido.Message("program_change", channel=tr.ch, program=tr.prog, time=0))
    for c, v in ((7, tr.vol), (10, tr.pan), (91, tr.rev), (93, tr.cho)):
        mt.append(mido.Message("control_change", channel=tr.ch, control=c, value=v, time=0))
    ev = sorted(tr.events, key=lambda e: (e[0], e[1]))
    last = 0
    for (t, _, msg) in ev:
        tick = int(round(t * TPS))
        mt.append(msg.copy(time=max(0, tick - last)))
        last = max(last, tick)
    mid.tracks.append(mt)
mid.save(os.path.join(BUILD, "song.mid"))

timeline["hits"].sort(key=lambda h: h["t"])
timeline["pulses"].sort(key=lambda p: p["t"])
timeline["duration"] = round(T_END, 4)
with open(os.path.join(BUILD, "timeline.json"), "w") as f:
    json.dump(timeline, f, indent=1)

print("duration %.2fs, hits %d, pulses %d" % (T_END, len(timeline["hits"]), len(timeline["pulses"])))
for k_, v in timeline["sections"].items():
    print("  %-12s %7.3f" % (k_, v))
