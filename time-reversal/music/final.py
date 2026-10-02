"""Final soundtrack: the user's hook (female voice + BGM) fused with the original score.

The hook clip is in G minor at 119.05 bpm with a 4-bar cycle Gm | Eb | F | G(sus), 8 bars long.
Her line "我会找到逆转时间的公式，然后回到你身边" occupies bars 0-3 (0.18-6.4 s).

  0 s ......... her clip plays untouched from its first sample (voice = the 3 s hook)
  1.95-2.45 ... tape-rewind zip in the pause of her line (the picture rewinds to t = 0)
  6.4-8.17 .... she has finished; organ pedal, a celesta answer and a riser grow under her BGM
  8.17 ........ downbeat of her bar 4 = river reveal: the original score enters in the same key,
                tempo and chord cycle while her BGM keeps playing underneath, then dissolves
                into the black hole (low-pass + fade) as the clock gathers
  18.4-21.3 ... the swarm: grains and air converge on the clock, a sub rises; it locks with a clunk
  22.3 ........ shatter: boom, glass, shards flying past
  28.3-30.4 ... time stops: silence, tinnitus, a heartbeat
  30.4-44.5 ... rewind: the act 2-3 music (phase vocoder) and effects (tape speed-up) stems,
                reversed; effects sit above the music, a tape whirr underneath
  44.5-49.5 ... her bars 5-7 return; the score climbs Eb F Dsus D to the reunion (G major)
  49.5-59.6 ... coda G | Ebmaj7 | Cm6 | G under the crane over the hole: a crystal chime on the
                diamond, the theme in major, one last tick, the tail rings out

Music and effects are mixed on separate buses. The master is normalised to -14 LUFS
(BS.1770, one linear gain) with a true-peak limiter, so the designed dynamics survive.
Story time tv (the picture's authored time) maps to real time with R(tv) for tv >= 6.
"""
import os
import subprocess

import mido
import numpy as np
from scipy import ndimage, signal
from scipy.io import wavfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD = os.path.join(ROOT, 'build')
SR = 48000
TS = 0.2520 / 0.25
C0, BAR = 0.106, 2.016
T_R = C0 + 4 * BAR                       # 8.170: river reveal
R = lambda tv: T_R + (tv - 6.0) * TS     # story -> real time
END = R(57.0)
SHIFT = -2                               # score was written in A minor -> G minor
NOTE = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}


def P(n):
    if isinstance(n, int):
        return n
    l, r = n[0], n[1:]
    a = 0
    while r and r[0] in '#b':
        a += 1 if r[0] == '#' else -1
        r = r[1:]
    return 12 * (int(r) + 1) + NOTE[l] + a


class Track:
    """Notes are authored in story time (tv) and A minor; stored in real time and G minor."""
    def __init__(self, ch, prog, vol=100, rev=70, cho=0, pan=64):
        self.ch, self.prog, self.vol, self.rev, self.cho, self.pan = ch, prog, vol, rev, cho, pan
        self.ev = []

    def note_real(self, t, d, p, v=90, shift=True):
        p = P(p) + (SHIFT if (shift and self.ch != 9) else 0)
        self.ev.append((t, 1, mido.Message('note_on', channel=self.ch, note=p, velocity=int(max(1, min(127, v))))))
        self.ev.append((t + d, 0, mido.Message('note_off', channel=self.ch, note=p, velocity=0)))

    def note(self, tv, d, p, v=90):
        self.note_real(R(tv), d * TS, p, v)

    def chord(self, tv, d, ps, v=80):
        for p in ps:
            self.note(tv, d, p, v)


organ = Track(0, 19, vol=96, rev=110)
choir = Track(1, 52, vol=92, rev=110)
strings = Track(2, 48, vol=96, rev=100)
trem = Track(3, 44, vol=88, rev=100)
horn = Track(4, 60, vol=96, rev=100)
celesta = Track(5, 8, vol=100, rev=110)
timp = Track(6, 47, vol=110, rev=80)
pad = Track(7, 89, vol=88, rev=110)
glock = Track(8, 9, vol=80, rev=110)
drums = Track(9, 0, vol=105, rev=90)
bass = Track(10, 43, vol=104, rev=70)
brass = Track(11, 57, vol=100, rev=90)
revcym = Track(12, 119, vol=100, rev=60)
TRACKS = [organ, choir, strings, trem, horn, celesta, timp, pad, glock, drums, bass, brass, revcym]

motif = [(0, 0.5, 'E5'), (0.5, 0.5, 'A5'), (1.0, 1.0, 'C6'), (2.0, 0.5, 'B5'), (2.5, 0.5, 'A5'), (3.0, 1.4, 'E5')]


def triad(root, q):
    r = P(root)
    return [r, r + (5 if q == 'S' else 3 if q == 'm' else 4), r + 7]


def ostinato(tv0, root, q, vel, step=0.25):
    r = P(root)
    third = 5 if q == 'S' else 3 if q == 'm' else 4
    for i, iv in enumerate([0, 7, 12, 12 + third, 12, 7, 12, 12 + third]):
        organ.note(tv0 + i * step, step * 0.95, r + iv, vel + (6 if i % 4 == 0 else 0))


# ---------------------------------------------------------------- intro additions (real time, G minor)
# after "回到你身边": pedal swell, a celesta answer on her beats, everything leaning into the reveal
for k, v in enumerate(range(26, 58, 4)):
    organ.note_real(6.30 + k * 0.23, 0.25, 'G1', v, shift=False)
organ.note_real(6.30, T_R - 6.30, 'G2', 44, shift=False)
pad.note_real(6.45, T_R - 6.45 + 0.4, 'G3', 46, shift=False)
pad.note_real(6.45, T_R - 6.45 + 0.4, 'D4', 42, shift=False)
for (t0, d, n) in [(6.658, 0.30, 'D5'), (6.910, 0.30, 'G5'), (7.162, 0.55, 'A#5'), (7.666, 0.45, 'A5')]:
    celesta.note_real(t0, d * 1.6, n, 64, shift=False)
revcym.note_real(T_R - 1.55, 1.6, 'C4', 100, shift=False)

# ---------------------------------------------------------------- act 2: river (tv 6-18) - her chord cycle
prog2 = [('A3', 'm'), ('F3', 'M'), ('G3', 'M'), ('A3', 'S'), ('A3', 'm'), ('F3', 'M')]   # -> Gm Eb F Gsus Gm Eb
for b, (root, q) in enumerate(prog2):
    tv0 = 6.0 + b * 2.0
    v = 82 + b * 4
    ostinato(tv0, root, q, v)
    ch = triad(root, q)
    choir.chord(tv0, 2.0, [c + 12 for c in ch], 66 + b * 3)
    strings.chord(tv0, 2.0, [ch[0] - 12, ch[1], ch[2]], 64 + b * 4)
    bass.note(tv0, 1.95, P(root) - 24, 92)
for (o, d, n) in motif:
    celesta.note(10.0 + o, d * 1.3, n, 70)
    celesta.note(14.0 + o, d * 1.3, n, 76)
    glock.note(14.0 + o, d, P(n) + 12, 50)

# ---------------------------------------------------------------- act 3: entropy (tv 18-26)
prog3 = [('D4', 'm'), ('E3', 'M'), ('A3', 'm'), ('E3', 'M')]                              # -> Cm D Gm D
for b, (root, q) in enumerate(prog3):
    tv0 = 18.0 + b * 2.0
    v = 96 + b * 6
    ostinato(tv0, root, q, v)
    ch = triad(root, q)
    trem.chord(tv0, 2.0, [ch[0], ch[1], ch[2], ch[0] + 12], 72 + b * 10)
    choir.chord(tv0, 2.0, [c + 12 for c in ch], 70 + b * 8)
    bass.note(tv0, 1.95, P(root) - 24, 100)
    strings.chord(tv0, 2.0, [ch[0] - 12, ch[0]], 80 + b * 8)
for (tv0, d, n, v) in [(18.0, 1.9, 'D5', 92), (20.0, 1.9, 'E5', 112), (22.0, 0.95, 'C5', 104), (23.0, 0.95, 'B4', 104), (24.0, 1.95, 'G#4', 116)]:
    horn.note(tv0, d, n, v)
for i in range(8):
    timp.note(18.0 + i * 0.25, 0.2, 'A2' if i % 2 else 'D2', 60 + i * 8)
for i in range(4):
    timp.note(19.0 + i * 0.25, 0.2, 'E2', 90 + i * 8)
timp.note(20.0, 1.5, 'E2', 127)
brass.chord(20.0, 1.8, ['E2', 'B2', 'E3', 'G#3'], 118)
drums.note(20.0, 1.5, 49, 120)
drums.note(20.0, 1.5, 57, 110)
for i in range(16):
    timp.note(22.0 + i * 0.25, 0.2, 'A2' if (i // 2) % 2 == 0 else 'E2', 70 + i * 3)
revcym.note(24.45, 1.6, 'C4', 110)

# ---------------------------------------------------------------- finale (tv 42-57)          (authored in A; sounds in G)
# 42 F | 44 G | 46 Esus E | 47 A: reunion | 49 Fmaj7 | 51 Dm6 | 53 A: the ring ... rings out
for (tv0, d, ch, b) in [(42.0, 2.0, ['F3', 'A3', 'C4', 'G4'], 'F2'), (44.0, 2.0, ['G3', 'B3', 'D4', 'A4'], 'G2'),
                        (46.0, 0.5, ['E3', 'A3', 'B3', 'E4'], 'E2'), (46.5, 0.5, ['E3', 'G#3', 'B3', 'E4'], 'E2')]:
    choir.chord(tv0, d, [P(c) + 12 for c in ch], 74)
    strings.chord(tv0, d, ch, 76)
    pad.chord(tv0, d, ch, 64)
    bass.note(tv0, d, P(b) - 12, 78)
    organ.chord(tv0, d, [P(b), P(b) + 12], 52)
for (o, d, n) in [(0, 0.5, 'E5'), (0.5, 0.5, 'A5'), (1.0, 1.0, 'C#6'), (2.0, 0.5, 'B5'), (2.5, 0.5, 'G#5')]:
    celesta.note(44.0 + o, d * 1.3, n, 70)
revcym.note(45.45, 1.6, 'C4', 96)
# reunion
A_MAJ = ['A2', 'E3', 'A3', 'C#4', 'E4', 'A4', 'C#5']
choir.chord(47.0, 2.15, A_MAJ[2:], 94)
strings.chord(47.0, 2.15, A_MAJ, 94)
pad.chord(47.0, 2.15, A_MAJ[2:], 78)
organ.chord(47.0, 2.15, ['A1', 'A2', 'E3', 'A3'], 78)
brass.chord(47.0, 1.8, ['A2', 'E3', 'C#4'], 82)
horn.note(47.0, 2.0, 'E5', 86)
timp.note(47.0, 1.0, 'A2', 110)
drums.note(47.0, 3.0, 57, 98)
for i, n in enumerate(['A5', 'C#6', 'E6', 'A6', 'C#7', 'E7']):
    glock.note(47.0 + i * 0.08, 1.2, n, 70 - i * 4)
for (o, d, n) in [(0.5, 0.5, 'E5'), (1.0, 0.5, 'A5'), (1.5, 0.5, 'C#6')]:
    celesta.note(47.0 + o, d * 1.4, n, 68)
# the crane: bittersweet colours (bVI maj7, iv6) before the last chord
strings.chord(49.0, 2.15, ['F2', 'C3', 'A3', 'E4'], 76)
choir.chord(49.0, 2.15, ['A4', 'C5', 'E5'], 70)
pad.chord(49.0, 2.15, ['F3', 'A3', 'C4', 'E4'], 64)
bass.note(49.0, 2.0, 'F1', 72)
organ.chord(49.0, 2.15, ['F1', 'F2'], 48)
horn.note(49.0, 1.0, 'C5', 72)
horn.note(50.0, 1.0, 'A4', 68)
strings.chord(51.0, 2.15, ['D2', 'A2', 'F3', 'B3', 'D4'], 74)
choir.chord(51.0, 2.15, ['F4', 'A4', 'D5'], 68)
pad.chord(51.0, 2.15, ['D3', 'F3', 'A3', 'B3'], 62)
bass.note(51.0, 2.0, 'D2', 70)
organ.chord(51.0, 2.15, ['D1', 'D2'], 46)
horn.note(51.0, 1.5, 'F4', 68)
horn.note(52.5, 0.5, 'E4', 64)
for (tv0, d, n) in [(49.0, 1.0, 'E6'), (50.0, 0.5, 'C6'), (50.5, 0.5, 'A5'), (51.0, 0.5, 'D6'), (51.5, 0.5, 'B5'), (52.0, 1.0, 'F5')]:
    celesta.note(tv0, d * 1.4, n, 66)
for i in range(6):
    timp.note(52.25 + i * 0.125, 0.12, 'A2', 40 + i * 9)
revcym.note(51.45, 1.6, 'C4', 84)
# the ring
strings.chord(53.0, 3.3, ['A2', 'E3', 'A3', 'C#4', 'E4', 'A4'], 82)
choir.chord(53.0, 3.3, ['A4', 'C#5', 'E5'], 78)
pad.chord(53.0, 3.4, ['A3', 'C#4', 'E4', 'A4'], 70)
organ.chord(53.0, 3.4, ['A1', 'A2', 'E3'], 62)
bass.note(53.0, 3.2, 'A1', 74)
horn.note(53.0, 3.0, 'C#5', 66)
timp.note(53.0, 1.0, 'A2', 84)
celesta.note(53.0, 1.2, 'E5', 70)
for i, n in enumerate(['A6', 'C#7', 'E7']):
    glock.note(53.0 + i * 0.08, 1.4, n, 58 - i * 5)
for (tv0, d, n, v) in [(53.9, 0.5, 'E5', 60), (54.4, 0.5, 'A5', 58), (54.9, 1.3, 'C#6', 56)]:   # the theme's head, in major
    celesta.note(tv0, d * 1.5, n, v)
    glock.note(tv0, d, P(n) + 12, v - 22)

# ---------------------------------------------------------------- render the score
os.makedirs(BUILD, exist_ok=True)
mid = mido.MidiFile(type=1, ticks_per_beat=960)
meta = mido.MidiTrack(); meta.append(mido.MetaMessage('set_tempo', tempo=500000, time=0)); mid.tracks.append(meta)
for tr in TRACKS:
    mt = mido.MidiTrack()
    if tr.ch != 9:
        mt.append(mido.Message('program_change', channel=tr.ch, program=tr.prog, time=0))
    for c, v in ((7, tr.vol), (91, tr.rev), (93, tr.cho), (10, tr.pan)):
        mt.append(mido.Message('control_change', channel=tr.ch, control=c, value=v, time=0))
    last = 0
    for (t, _, m) in sorted(tr.ev, key=lambda e: (e[0], e[1])):
        tick = int(round(t * 1920))
        mt.append(m.copy(time=max(0, tick - last)))
        last = max(last, tick)
    mid.tracks.append(mt)
mid.save(os.path.join(BUILD, 'final.mid'))
subprocess.run(['fluidsynth', '-ni', '-q', '-r', str(SR), '-g', '0.6', '-o', 'synth.reverb.room-size=0.92', '-o', 'synth.reverb.level=0.75',
                '-o', 'synth.reverb.width=1.0', '-F', os.path.join(BUILD, 'final_score.wav'), '/usr/share/sounds/sf2/FluidR3_GM.sf2', os.path.join(BUILD, 'final.mid')], check=True)
_, score = wavfile.read(os.path.join(BUILD, 'final_score.wav'))
score = score.astype(np.float32) / 32768.0
N = int(END * SR) + SR
mus = np.zeros((N, 2), np.float32)       # music bus: score + her clip
sfx = np.zeros((N, 2), np.float32)       # effects bus
mus[:min(N, len(score))] += score[:N] * 1.7

# ---------------------------------------------------------------- helpers
rng = np.random.default_rng(7)
tt = lambda d: np.arange(int(d * SR)) / SR


def place(x, t, gain=1.0, pan=0.0, bus=None):
    bus = sfx if bus is None else bus
    if x.ndim == 1:
        x = np.stack([x * (1 - max(0, pan)), x * (1 + min(0, pan))], 1)
    i = int(round(t * SR))
    if i < 0:
        x = x[-i:]; i = 0
    j = min(N, i + len(x))
    if j > i:
        bus[i:j] += x[:j - i] * gain


def bp(x, lo, hi, order=2):
    b, a = signal.butter(order, [lo / (SR / 2), hi / (SR / 2)], 'band')
    return signal.lfilter(b, a, x)


def reverb(x, dur=2.2, decay=2.8, mix=0.35, tone=5000, seed=5):
    """stereo convolution with a decaying, darkening noise tail"""
    r = np.random.default_rng(seed)
    n = int(dur * SR); t = np.arange(n) / SR
    ir = r.standard_normal((n, 2)) * np.exp(-t * decay)[:, None]
    b, a = signal.butter(1, tone / (SR / 2))
    ir = signal.lfilter(b, a, ir, axis=0)
    ir /= np.sqrt((ir ** 2).sum(axis=0))
    if x.ndim == 1:
        x = np.stack([x, x], 1)
    out = np.zeros((len(x) + n - 1, 2))
    out[:len(x)] += x * (1 - mix)
    for c in range(2):
        out[:, c] += signal.fftconvolve(x[:, c], ir[:, c]) * mix * 6.0
    return out


def tick(hi=True):
    t = tt(0.09)
    click = bp(rng.standard_normal(len(t)), 1800, 7000) * np.exp(-t * 220)
    f = 3150 if hi else 2350
    ping = np.sin(2 * np.pi * f * t) * np.exp(-t * 90) + 0.5 * np.sin(2 * np.pi * f * 1.51 * t) * np.exp(-t * 140)
    body = np.sin(2 * np.pi * (700 if hi else 560) * t) * np.exp(-t * 60)
    return (click * 0.9 + ping * 0.35 + body * 0.25) * 0.5


def boom(d=3.0, f0=62, f1=32):
    t = tt(d)
    f = f1 + (f0 - f1) * np.exp(-t * 2.2)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.3)
    # second harmonic + a mid knock so the hit still reads on phone speakers
    x2 = np.sin(2 * np.pi * np.cumsum(2 * f) / SR) * np.exp(-t * 2.6) * 0.35
    return (x + x2 + bp(rng.standard_normal(len(t)), 40, 400) * np.exp(-t * 18) * 0.6) * 0.9


def shatter(d=2.2):
    t = tt(d)
    x = bp(rng.standard_normal(len(t)), 2500, 12000) * np.exp(-t * 4.5) * 0.35
    for _ in range(140):
        i = int(rng.uniform(0, 0.9) ** 2 * SR)
        seg = np.sin(2 * np.pi * rng.uniform(2200, 9500) * tt(0.25)) * np.exp(-tt(0.25) * rng.uniform(12, 40)) * rng.uniform(0.04, 0.12)
        L = min(len(seg), len(x) - i)
        x[i:i + L] += seg[:L]
    return x


def riser(d=1.6, f0=180, f1=1400):
    t = tt(d)
    f = f0 * (f1 / f0) ** (t / d)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * (t / d) ** 2 * 0.22 + bp(rng.standard_normal(len(t)), 800, 9000) * (t / d) ** 3 * 0.35


def heartbeat(strength=1.0):
    """lub (or dub): a sub thump with harmonics and a soft knock, saturated so phones can hear it"""
    t = tt(0.5)
    f = 46 + 34 * np.exp(-t * 26)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t * 11)
    harm = (0.55 * np.sin(2 * ph) + 0.3 * np.sin(3 * ph)) * np.exp(-t * 16)
    knock = bp(rng.standard_normal(len(t)), 120, 700) * np.exp(-t * 55) * 0.45
    x = (body + harm + knock) * strength * 1.4
    return np.tanh(x) / np.tanh(1.4)


def whoosh(d=0.9):
    t = tt(d)
    env = np.sin(np.pi * t / d) ** 2
    n = rng.standard_normal(len(t))
    out = np.zeros(len(t))
    for k in range(6):
        lo = 300 * 2 ** k
        out += bp(n, lo, lo * 1.8) * np.clip(1 - abs(t / d - k / 6) * 3, 0, 1)
    return out * env * 0.45


def flyby(d=0.55, f0=2400, f1=700, direction=1):
    """something passing the camera: band-passed noise with a falling centre (doppler) and a pan sweep"""
    t = tt(d); u = t / d
    n = rng.standard_normal(len(t))
    lo, hi = bp(n, f1 * 0.7, f1 * 1.6), bp(n, f0 * 0.7, min(f0 * 1.6, 20000))
    x = hi * (1 - u) + lo * u
    x *= np.exp(-((u - 0.45) / 0.22) ** 2) * 0.5
    pan = np.clip(direction * (u * 2 - 1) * 1.2, -1, 1)
    return np.stack([x * (1 - np.maximum(0, pan)), x * (1 + np.minimum(0, pan))], 1)


def tape_zip(d=0.5):
    """fast tape rewind: rising chirpy noise with flutter"""
    t = tt(d)
    f = 400 * (6.0 ** (t / d))
    flutter = 1 + 0.15 * np.sin(2 * np.pi * 38 * t)
    tone = np.sin(2 * np.pi * np.cumsum(f * flutter) / SR) * 0.12
    noise = bp(rng.standard_normal(len(t)), 1500, 9000) * 0.25
    env = np.sin(np.pi * np.clip(t / d, 0, 1)) ** 0.7
    return (tone + noise) * env


def gather(d):
    """the swarm converging: glassy grains growing denser, higher and narrower, over a rising air swell"""
    n = int(d * SR)
    out = np.zeros((n, 2))
    for tg in np.sort(d * rng.random(1400) ** 0.5):
        u = tg / d
        L = int(0.035 * SR)
        k = np.arange(L) / SR
        g = np.sin(2 * np.pi * rng.uniform(1700, 3600) * (1 + 0.9 * u) * k) * np.exp(-k * rng.uniform(70, 150))
        amp = (0.006 + 0.03 * u ** 2.2) * rng.uniform(0.5, 1.0)
        pan = rng.uniform(-1, 1) * (1 - 0.75 * u)
        i = int(tg * SR); j = min(n, i + L)
        out[i:j, 0] += g[:j - i] * amp * (1 - max(0, pan))
        out[i:j, 1] += g[:j - i] * amp * (1 + min(0, pan))
    t = np.arange(n) / SR; u = t / d
    air = rng.standard_normal((n, 2))
    air = lowpass_sweep(air, lambda tm: 500.0 * (14.0 ** min(1.0, tm / d) ** 1.6)) * (u ** 2.4)[:, None] * 0.16
    sub = np.sin(2 * np.pi * np.cumsum(30 + 26 * u ** 1.5) / SR) * u ** 2 * 0.35
    out += air + np.stack([sub, sub], 1)
    out[-int(0.004 * SR):] *= np.linspace(1, 0, int(0.004 * SR))[:, None]     # cut dead on the lock
    return out


def clunk():
    """the clock locking: a heavy mechanical hit with a struck-metal ring"""
    t = tt(2.6)
    thump = np.sin(2 * np.pi * np.cumsum(40 + 44 * np.exp(-t * 28)) / SR) * np.exp(-t * 7.5)
    metal = sum(a * np.sin(2 * np.pi * f * t + rng.uniform(0, 6.28)) * np.exp(-t * dc)
                for f, a, dc in [(196.0, 0.5, 2.0), (523.3, 0.36, 2.8), (1187.0, 0.27, 4.2), (2213.0, 0.18, 6.0), (3320.0, 0.11, 8.5), (4870.0, 0.07, 12.0)])
    click = bp(rng.standard_normal(len(t)), 2000, 9000) * np.exp(-t * 300) * 0.9
    knock = bp(rng.standard_normal(len(t)), 150, 900) * np.exp(-t * 40) * 0.7
    return thump * 1.0 + metal * 0.5 + click + knock


def glint_bells(d=0.55):
    """a run of tiny bells travelling round the bezel with the glint (XII -> III -> VI -> IX)"""
    n = int(d * SR)
    out = np.zeros((n + int(0.6 * SR), 2))
    for k in range(18):
        u = k / 17
        L = int(0.5 * SR)
        x = tt(0.5)
        f = 2600 * 2 ** (u * 0.9)
        b = (np.sin(2 * np.pi * f * x) + 0.4 * np.sin(2 * np.pi * f * 2.76 * x)) * np.exp(-x * 9) * 0.045
        pan = np.sin(2 * np.pi * u)
        i = int(u * d * SR)
        out[i:i + L, 0] += b * (1 - max(0, pan))
        out[i:i + L, 1] += b * (1 + min(0, pan))
    return out


def sigh(d):
    """'you' pulled away into the hole: a pure tone sliding down a minor third, fading"""
    t = tt(d); u = t / d
    f = 880 * 2 ** (-u * 0.25 - 0.75 * u ** 2) * (1 + 0.004 * np.sin(2 * np.pi * 5.2 * t))
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = (np.sin(ph) + 0.25 * np.sin(2 * ph)) * np.sin(np.pi * np.clip(u * 1.6, 0, 1)) ** 2 * (1 - u) ** 0.6
    return x * 0.06


def tape_whirr(d):
    """the rewind underneath: spooling tape, fluttering"""
    t = tt(d); u = t / d
    n = rng.standard_normal(len(t))
    band = bp(n, 900, 3200) * (1 + 0.5 * np.sin(2 * np.pi * 11.0 * t)) * 0.05
    motor = np.sin(2 * np.pi * np.cumsum(118 + 6 * np.sin(2 * np.pi * 0.7 * t)) / SR) * 0.03
    env = np.minimum(1, t / 0.3) * np.minimum(1, (d - t) / 0.8)
    x = (band + motor) * env
    return np.stack([x, np.roll(x, 240)], 1)


def spin_up(d=0.55):
    """the transport reversing: a motor spinning up"""
    t = tt(d); u = t / d
    f = 40 + 520 * u ** 1.6
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.25 + bp(rng.standard_normal(len(t)), 400, 4000) * u * 0.12
    return x * np.sin(np.pi * np.clip(u * 1.15, 0, 1)) ** 0.5


def crystal(d=4.5):
    """the diamond: struck glass in G (G6 D7 G7 B7), slightly detuned pairs beating, a soft bloom under it"""
    t = tt(d)
    out = np.zeros((len(t), 2))
    for f, a, dc in [(1568.0, 0.5, 1.0), (2349.3, 0.36, 1.4), (3136.0, 0.24, 1.9), (3951.1, 0.16, 2.4), (6272.0, 0.06, 4.0)]:
        for c, det in ((0, 0.9993), (1, 1.0007)):
            out[:, c] += a * np.sin(2 * np.pi * f * det * t + rng.uniform(0, 6.28)) * np.exp(-t * dc)
    att = np.minimum(1, t / 0.004)
    bloom = np.sin(2 * np.pi * 98.0 * t) * np.sin(np.pi * np.clip(t / 1.6, 0, 1)) ** 2 * 0.25
    return out * att[:, None] * 0.11 + np.stack([bloom, bloom], 1)


def air_rise(d):
    """soft wind as the camera cranes up"""
    n = int(d * SR); u = np.arange(n) / n
    x = rng.standard_normal((n, 2))
    x = lowpass_sweep(x, lambda tm: 300.0 * (8.0 ** min(1.0, tm / d)))
    return x * (np.sin(np.pi * u) ** 1.5)[:, None] * 0.07


def sparkles(d=1.2, count=60):
    n = int(d * SR)
    out = np.zeros((n + int(0.5 * SR), 2))
    for tg in d * rng.random(count) ** 1.8:
        x = tt(0.4)
        b = np.sin(2 * np.pi * rng.uniform(2500, 7000) * x) * np.exp(-x * rng.uniform(10, 25)) * rng.uniform(0.01, 0.035)
        pan = rng.uniform(-0.9, 0.9)
        i = int(tg * SR)
        out[i:i + len(x), 0] += b * (1 - max(0, pan))
        out[i:i + len(x), 1] += b * (1 + min(0, pan))
    return out


def lowpass_sweep(x, cutoff_at):
    out = []
    for c in range(2):
        f, ts, Z = signal.stft(x[:, c], SR, nperseg=2048, noverlap=1536)
        for k, t in enumerate(ts):
            Z[:, k] *= 1.0 / np.sqrt(1.0 + (f / cutoff_at(t)) ** 8)
        _, y = signal.istft(Z, SR, nperseg=2048, noverlap=1536)
        out.append(y[:len(x)])
    return np.stack(out, 1).astype(np.float32)


# ---------------------------------------------------------------- her clip: intro + continuing BGM
_, clip = wavfile.read(os.path.join(BUILD, 'audio_in', 'user.wav'))
clip = clip.astype(np.float32) / 32768.0
LOOP_A, LOOP_B = C0 + 4 * BAR, C0 + 8 * BAR          # bars 4-7: instrumental, same chord cycle


def her_audio(c_start, dur):
    """clip from c_start, wrapping bars 4-7 seamlessly (crossfade into what follows the loop end)"""
    n = int(round(dur * SR))
    out = np.zeros((n, 2), np.float32)
    pos, c = 0, c_start
    xf = int(0.015 * SR)
    first = True
    while pos < n:
        a = int(round(c * SR)); b = int(round(LOOP_B * SR))
        piece = clip[a:b].copy()
        take = min(len(piece), n - pos)
        piece = piece[:take]
        if not first and take > xf:
            tail = clip[b:b + xf]
            piece[:xf] = piece[:xf] * np.sin(np.linspace(0, np.pi / 2, xf))[:, None] + tail * np.cos(np.linspace(0, np.pi / 2, xf))[:, None]
        out[pos:pos + take] = piece
        pos += take
        c = LOOP_A
        first = False
    return out


her_end = R(18.4)
her = her_audio(0.0, her_end)
th = np.arange(len(her)) / SR
g = np.ones(len(her), np.float32)
g *= np.where((th > 1.9) & (th < 2.6), 1 - 0.3 * np.sin(np.pi * np.clip((th - 1.9) / 0.7, 0, 1)), 1)   # duck under the zip
g *= np.where(th < T_R, 1.0, 1.0 - 0.15 * np.clip(th - T_R, 0, 1) - 0.35 * np.clip((th - T_R - BAR) / BAR, 0, 1))
g *= 1 - np.clip((th - R(16.0)) / (her_end - R(16.0)), 0, 1) ** 1.3
her *= g[:, None]
her = lowpass_sweep(her, lambda t: 18000.0 if t < R(16.0) else 18000.0 * (240 / 18000.0) ** min(1, (t - R(16.0)) / (her_end - R(16.0))))
place(her, 0.0, 0.7, bus=mus)

# intro accents
place(tape_zip(0.5), 1.95, 0.55)
place(riser(1.6, 160, 1300), T_R - 1.6, 0.4)
place(boom(3.0), T_R, 0.75)

# ---------------------------------------------------------------- acts 2-3: the clock, entropy
for k in range(13, int(26.0 / 0.5)):
    tv = k * 0.5
    if tv == 19.0:
        continue                                   # the lock replaces this tick
    gain = 0.30 if tv < 16 else 0.34 if tv < 19 else 0.52
    place(tick(k % 2 == 0), R(tv), gain, pan=0.15 if k % 2 else -0.15)
place(reverb(gather(R(19.0) - R(16.25)), 1.6, 3.5, 0.25), R(16.25), 1.0)
place(reverb(clunk(), 2.4, 2.4, 0.4), R(19.0), 0.62)
place(glint_bells(0.55 * TS), R(19.0), 1.0)
place(boom(3.5, 70, 28), R(20), 0.95)
place(shatter(), R(20), 0.85)
for (dt, f0, dirn, gn) in [(0.12, 2600, 1, 0.55), (0.3, 2100, -1, 0.45), (0.55, 3000, 1, 0.35)]:
    place(flyby(0.55, f0, 650, dirn), R(20) + dt, gn)
place(reverb(sigh(R(24.6) - R(21.2)), 2.0, 2.6, 0.45), R(21.2), 1.0)
place(riser(1.5), R(26) - 1.5, 0.6)
place(whoosh(0.8), R(26) - 0.75, 0.75)

# ---------------------------------------------------------------- time stops: hard cut, silence, a heartbeat
cut = int(R(26) * SR)
fade = int(0.03 * SR)
for bus in (mus, sfx):
    bus[cut - fade:cut] *= np.linspace(1, 0, fade)[:, None]
fwd_mus, fwd_sfx = mus[int(R(6) * SR):cut].copy(), sfx[int(R(6) * SR):cut].copy()
for bus in (mus, sfx):
    bus[cut:int(R(42) * SR)] = 0
t = tt(1.8)
place(np.sin(2 * np.pi * 6200 * t) * np.exp(-t * 2.2) * 0.03 + np.sin(2 * np.pi * 6236 * t) * np.exp(-t * 2.6) * 0.02, R(26))
for tv, s_ in ((26.55, 1.0), (26.8, 0.7), (27.25, 1.0), (27.5, 0.7)):
    place(heartbeat(s_), R(tv), 0.8)
rb = boom(1.4, 80, 30)[::-1]
place(rb, R(28) - len(rb) / SR, 0.8)


# ---------------------------------------------------------------- rewind: the act 2-3 stems, backwards
def stretch(x, rate, n_fft=2048, hop=512):
    out = []
    for c in range(x.shape[1]):
        f, ts_, Z = signal.stft(x[:, c], SR, nperseg=n_fft, noverlap=n_fft - hop)
        steps = np.arange(0, Z.shape[1] - 1, rate)
        phase = np.angle(Z[:, 0])
        omega = 2 * np.pi * hop * np.arange(Z.shape[0]) / n_fft
        Y = np.zeros((Z.shape[0], len(steps)), complex)
        for i, s in enumerate(steps):
            k = int(s); fr = s - k
            Y[:, i] = ((1 - fr) * np.abs(Z[:, k]) + fr * np.abs(Z[:, k + 1])) * np.exp(1j * phase)
            dphi = np.angle(Z[:, k + 1]) - np.angle(Z[:, k]) - omega
            dphi -= 2 * np.pi * np.round(dphi / (2 * np.pi))
            phase += omega + dphi
        _, y = signal.istft(Y, SR, nperseg=n_fft, noverlap=n_fft - hop)
        out.append(y)
    L = min(len(o) for o in out)
    return np.stack([o[:L] for o in out], 1).astype(np.float32)


need = int((R(42) - R(28)) * SR)


def fit(x):
    return x[-need:] if len(x) >= need else np.pad(x, ((need - len(x), 0), (0, 0)))


env = np.ones(need, np.float32)
env[:int(0.05 * SR)] = np.linspace(0, 1, int(0.05 * SR))
env[-int(0.8 * SR):] = np.linspace(1, 0, int(0.8 * SR))
rate = (R(26) - R(6)) / (R(42) - R(28))                                  # 20/14: same compression as the picture
rew_mus = fit(stretch(fwd_mus, rate)[::-1])                                  # music keeps its pitch
rew_sfx = fit(signal.resample_poly(fwd_sfx, 7, 10, axis=0).astype(np.float32)[::-1])   # effects: tape speed-up
place(rew_mus * env[:, None], R(28), 1.0, bus=mus)
place(rew_sfx * env[:, None], R(28), 1.6)
t = tt(R(42) - R(28))
drone = (np.sin(2 * np.pi * 49.0 * t) + 0.3 * np.sin(2 * np.pi * 98.0 * t)) * 0.14 * np.minimum(1, t / 1.5) * np.minimum(1, (t[-1] - t) / 0.8)
place(drone, R(28), bus=mus)
place(spin_up(0.55), R(28) - 0.05, 0.9)
place(tape_whirr(R(42) - R(28)), R(28), 1.0)
place(riser(2.2, 120, 900), R(42) - 2.2, 0.5)

# ---------------------------------------------------------------- finale: her bars 5-7 return; the reunion; the ring
fin = her_audio(C0 + 5 * BAR, 3 * BAR + 0.6)
tf = np.arange(len(fin)) / SR
gf = np.clip(tf / 0.3, 0, 1) * (1 - np.clip((tf - (3 * BAR - 1.2)) / 1.2, 0, 1))
place(fin * gf[:, None], R(42), 0.55, bus=mus)
place(whoosh(1.4), R(47) - 1.2, 0.5)
place(boom(4.0, 55, 30), R(47), 0.55)
place(sparkles(1.2, 70), R(47) + 0.05, 1.0)
place(air_rise(R(53.0) - R(48.4)), R(48.4), 1.0)
place(reverb(crystal(4.5), 3.0, 1.6, 0.4), R(53.0), 0.55)
place(sparkles(1.1, 26), R(53.45), 0.5)                                    # the title being written in light
place(reverb(tick(True), 2.6, 2.2, 0.5), R(55.8), 0.75)                    # time moves on

# ---------------------------------------------------------------- mix: automation + buses
tN = np.arange(N) / SR


def duck(at, db, hold, rel):
    d = 1 - 10 ** (db / 20)
    x = np.clip((tN - at) / 0.02, 0, 1) * np.where(tN < at + hold, 1.0, np.exp(-(tN - at - hold) / rel))
    return 1 - d * x


gm = np.ones(N)
gm *= 1 - 0.18 * np.clip((tN - R(17.4)) / (R(19.0) - R(17.4)), 0, 1) * (1 - np.clip((tN - R(19.0)) / 0.9, 0, 1))
gm *= duck(R(19.0), -4.0, 0.15, 0.7)
gm *= duck(R(20.0), -5.0, 0.3, 1.0)
gm *= duck(R(47.0), -2.0, 0.2, 0.8)
gm *= duck(R(53.0), -3.0, 0.3, 1.0)
tail = np.clip((tN - R(56.25)) / (END - R(56.25)), 0, 1)
gm *= np.cos(tail * np.pi / 2) ** 2
gs = np.cos(np.clip((tN - R(56.6)) / (END - R(56.6)), 0, 1) * np.pi / 2) ** 2
mix = mus * gm[:, None] + sfx * gs[:, None]
mix = mix[:int(END * SR)]


# ---------------------------------------------------------------- master: BS.1770 loudness, true-peak limiter
def kweight(x):
    b1, a1 = [1.53512485958697, -2.69169618940638, 1.19839281085285], [1.0, -1.69065929318241, 0.73248077421585]
    b2, a2 = [1.0, -2.0, 1.0], [1.0, -1.99004745483398, 0.99007225036621]
    return signal.lfilter(b2, a2, signal.lfilter(b1, a1, x, axis=0), axis=0)


def lufs(x):
    y = kweight(x)
    blk, hop = int(0.4 * SR), int(0.1 * SR)
    ms = np.array([np.mean(y[i:i + blk] ** 2, axis=0).sum() for i in range(0, len(y) - blk, hop)])
    L = -0.691 + 10 * np.log10(ms + 1e-12)
    g1 = ms[L > -70]
    rel = -0.691 + 10 * np.log10(g1.mean()) - 10
    return -0.691 + 10 * np.log10(ms[(L > -70) & (L > rel)].mean())


def limit(x, ceiling_db=-1.0, release=0.09):
    thr = 10 ** (ceiling_db / 20)
    os_ = signal.resample_poly(x, 4, 1, axis=0)
    pk = np.abs(os_).max(axis=1)
    pk = pk[:len(x) * 4].reshape(-1, 4).max(axis=1)
    att = 1 - np.minimum(1.0, thr / np.maximum(pk, 1e-9))
    att = ndimage.maximum_filter1d(att, int(0.004 * SR) * 2 + 1)             # look-ahead
    k = np.exp(-1.0 / (release * SR))
    att = np.maximum(att, signal.lfilter([1 - k], [1, -k], att))           # smooth release
    return x * (1 - att)[:, None]


def short_term(x, win=3.0, hop=0.1):
    p = (kweight(x) ** 2).sum(axis=1)
    c = np.concatenate([[0.0], np.cumsum(p)])
    centres = np.arange(0, len(x), int(hop * SR))
    lo = np.clip(centres - int(win * SR) // 2, 0, len(x)); hi = np.clip(centres + int(win * SR) // 2, 0, len(x))
    return centres / SR, -0.691 + 10 * np.log10((c[hi] - c[lo]) / np.maximum(hi - lo, 1) + 1e-12)


# a slow, designed level ride (3 s loudness, ~0.6 s smoothing): the hook keeps the level it always had,
# the story builds to act 3, the rewind and the reunion keep their weight. Impacts inside a section
# are untouched; the freeze and the tail are held at the gain of the part before them.
SECTIONS = [(0.0, 8.0, -14.0, -14.0), (8.0, 18.0, -13.5, -13.5), (18.0, 21.2, -13.5, -12.0), (21.2, 28.2, -11.0, -11.0),
            (28.2, 30.5, None, None), (30.5, 44.3, -12.5, -12.5), (44.3, 49.3, -13.0, -12.0), (49.3, 53.0, -11.5, -13.0),
            (53.0, 56.0, -13.0, -13.0), (56.0, 99.0, None, None)]
ts_, st_ = short_term(mix)
gdb = np.zeros(len(ts_))
held = 0.0
for k, tm in enumerate(ts_):
    for (a0, a1, l0, l1) in SECTIONS:
        if a0 <= tm < a1:
            if l0 is None:
                gdb[k] = held
            else:
                gdb[k] = held = np.clip(l0 + (l1 - l0) * (tm - a0) / (a1 - a0) - st_[k], -6.0, 8.0)
            break
gdb = ndimage.gaussian_filter1d(gdb, 6.0)
out = mix * (10 ** (np.interp(np.arange(len(mix)) / SR, ts_, gdb) / 20))[:, None]
out = np.tanh(out / np.max(np.abs(out)) * 0.9 * 0.9) / np.tanh(0.9)
hook = slice(int(0.2 * SR), int(6.4 * SR))
for _ in range(3):
    out = out * 10 ** ((-14.0 - lufs(out[hook])) / 20)                     # her hook sits at -14 LUFS
    out = limit(out)
wavfile.write(os.path.join(BUILD, 'premaster.wav'), SR, (np.clip(mix / max(np.max(np.abs(mix)), 1e-6), -1, 1) * 0.9 * 32767).astype(np.int16))
wavfile.write(os.path.join(BUILD, 'music.wav'), SR, (np.clip(out, -1, 1) * 32767).astype(np.int16))
print('done %.3f s (reveal at %.3f s), %.2f LUFS integrated, hook %.2f LUFS, peak %.2f dBFS' % (END, T_R, lufs(out), lufs(out[hook]), 20 * np.log10(np.max(np.abs(out)))))
