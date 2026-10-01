"""Original soundtrack for "t -> -t".

1. A forward score (MIDI, rendered with FluidSynth) for acts 1-3 (0-26 s) and the finale (42-51 s).
2. Synthesized SFX: clock ticks, sub booms, glass shatter, risers, heartbeat.
3. The rewind (28-42 s) is the act 2-3 mix itself, time-compressed (phase vocoder,
   pitch preserved) by the same 20/14 factor the visuals use, then played backwards,
   so every reversed sound lands on its reversed visual event.
"""
import os
import subprocess

import mido
import numpy as np
from scipy import signal
from scipy.io import wavfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD = os.path.join(ROOT, 'build')
SR = 48000
END = 51.0
FREEZE, REWIND, REW_END, SHATTER, MEET = 26.0, 28.0, 42.0, 20.0, 47.0
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
    def __init__(self, ch, prog, vol=100, rev=70, cho=0, pan=64):
        self.ch, self.prog, self.vol, self.rev, self.cho, self.pan = ch, prog, vol, rev, cho, pan
        self.ev = []

    def note(self, t, d, p, v=90):
        p = P(p)
        self.ev.append((t, 1, mido.Message('note_on', channel=self.ch, note=p, velocity=int(max(1, min(127, v))))))
        self.ev.append((t + d, 0, mido.Message('note_off', channel=self.ch, note=p, velocity=0)))

    def chord(self, t, d, ps, v=80):
        for p in ps:
            self.note(t, d, p, v)

    def cc(self, t, c, v):
        self.ev.append((t, 0, mido.Message('control_change', channel=self.ch, control=c, value=int(v))))


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
bass = Track(10, 32 + 11, vol=104, rev=70)   # contrabass
brass = Track(11, 57, vol=100, rev=90)        # trombone
revcym = Track(12, 119, vol=100, rev=60)
TRACKS = [organ, choir, strings, trem, horn, celesta, timp, pad, glock, drums, bass, brass, revcym]

# ---------------------------------------------------------------- act 1: singularity (0-6)
organ.chord(0.4, 5.6, ['A1', 'A2'], 46)
pad.chord(1.0, 5.0, ['A3', 'C4', 'E4'], 50)
motif = [(0, 0.5, 'E5'), (0.5, 0.5, 'A5'), (1.0, 1.0, 'C6'), (2.0, 0.5, 'B5'), (2.5, 0.5, 'A5'), (3.0, 1.4, 'E5')]
for (o, d, n) in motif:
    celesta.note(1.5 + o, d * 1.3, n, 78)

# ---------------------------------------------------------------- act 2: river of equations (6-18)
prog2 = [('A3', 'm'), ('F3', 'M'), ('C4', 'M'), ('G3', 'M'), ('A3', 'm'), ('F3', 'M')]
prog3 = [('D4', 'm'), ('E3', 'M'), ('A3', 'm'), ('E3', 'M')]


def triad(root, q):
    r = P(root)
    return [r, r + (3 if q == 'm' else 4), r + 7]


def ostinato(t0, root, q, vel, step=0.25):
    r = P(root)
    third = 3 if q == 'm' else 4
    pat = [0, 7, 12, 12 + third, 12, 7, 12, 12 + third]
    for i, iv in enumerate(pat):
        organ.note(t0 + i * step, step * 0.95, r + iv, vel + (6 if i % 4 == 0 else 0))


for b, (root, q) in enumerate(prog2):
    t0 = 6.0 + b * 2.0
    v = 66 + b * 5
    ostinato(t0, root, q, v)
    chord = triad(root, q)
    choir.chord(t0, 2.0, [c + 12 for c in chord], 52 + b * 4)
    strings.chord(t0, 2.0, [chord[0] - 12, chord[1], chord[2]], 50 + b * 5)
    bass.note(t0, 1.95, P(root) - 24, 80 + b * 4)
for (o, d, n) in motif:
    celesta.note(10.0 + o, d * 1.3, n, 70)
    celesta.note(14.0 + o, d * 1.3, n, 76)
    glock.note(14.0 + o, d, P(n) + 12, 50)

# ---------------------------------------------------------------- act 3: entropy (18-26)
for b, (root, q) in enumerate(prog3):
    t0 = 18.0 + b * 2.0
    v = 96 + b * 6
    ostinato(t0, root, q, v)
    chord = triad(root, q)
    trem.chord(t0, 2.0, [chord[0], chord[1], chord[2], chord[0] + 12], 72 + b * 10)
    choir.chord(t0, 2.0, [c + 12 for c in chord], 70 + b * 8)
    bass.note(t0, 1.95, P(root) - 24, 100)
    strings.chord(t0, 2.0, [chord[0] - 12, chord[0]], 80 + b * 8)
horn.note(18.0, 1.9, 'D5', 92)
horn.note(20.0, 1.9, 'E5', 112)
horn.note(22.0, 0.95, 'C5', 104)
horn.note(23.0, 0.95, 'B4', 104)
horn.note(24.0, 1.95, 'G#4', 116)
for i in range(8):  # timpani crescendo into the shatter
    timp.note(18.0 + i * 0.25, 0.2, 'A2' if i % 2 else 'D2', 60 + i * 8)
for i in range(4):
    timp.note(18.0 + 1.0 + i * 0.25, 0.2, 'E2', 90 + i * 8)
# the shatter
timp.note(SHATTER, 1.5, 'E2', 127)
brass.chord(SHATTER, 1.8, ['E2', 'B2', 'E3', 'G#3'], 118)
drums.note(SHATTER, 1.5, 49, 120)
drums.note(SHATTER, 1.5, 57, 110)
for i in range(16):
    timp.note(22.0 + i * 0.25, 0.2, 'A2' if (i // 2) % 2 == 0 else 'E2', 70 + i * 3)
revcym.note(24.45, 1.6, 'C4', 110)

# ---------------------------------------------------------------- act 6: the formula (42-51)
prog6 = [(42.0, 2.0, ['F3', 'A3', 'C4', 'G4'], 'F2'), (44.0, 2.0, ['G3', 'B3', 'D4', 'A4'], 'G2'),
         (46.0, 0.5, ['E3', 'A3', 'B3', 'E4'], 'E2'), (46.5, 0.5, ['E3', 'G#3', 'B3', 'E4'], 'E2')]
for (t0, d, ch, b) in prog6:
    choir.chord(t0, d, [P(c) + 12 for c in ch], 80)
    strings.chord(t0, d, ch, 82)
    pad.chord(t0, d, ch, 70)
    bass.note(t0, d, P(b) - 12, 78)
    organ.chord(t0, d, [P(b), P(b) + 12], 52)
for (o, d, n) in [(0, 0.5, 'E5'), (0.5, 0.5, 'A5'), (1.0, 1.0, 'C#6'), (2.0, 0.5, 'B5'), (2.5, 0.5, 'G#5')]:
    celesta.note(44.0 + o, d * 1.3, n, 80)
revcym.note(45.45, 1.6, 'C4', 96)
A_MAJ = ['A2', 'E3', 'A3', 'C#4', 'E4', 'A4', 'C#5']
choir.chord(MEET, 4.0, A_MAJ[2:], 96)
strings.chord(MEET, 4.0, A_MAJ, 96)
pad.chord(MEET, 4.0, A_MAJ[2:], 80)
organ.chord(MEET, 4.0, ['A1', 'A2', 'E3', 'A3'], 80)
brass.chord(MEET, 2.0, ['A2', 'E3', 'C#4'], 84)
horn.note(MEET, 3.0, 'E5', 88)
timp.note(MEET, 1.0, 'A2', 112)
drums.note(MEET, 3.0, 57, 100)
for i, n in enumerate(['A5', 'C#6', 'E6', 'A6', 'C#7', 'E7']):
    glock.note(MEET + i * 0.08, 1.2, n, 70 - i * 4)
for (o, d, n) in [(0, 0.5, 'E5'), (0.5, 0.5, 'A5'), (1.0, 1.6, 'C#6')]:
    celesta.note(48.6 + o, d * 1.3, n, 72)

# ---------------------------------------------------------------- MIDI export / render
os.makedirs(BUILD, exist_ok=True)
mid = mido.MidiFile(type=1, ticks_per_beat=960)
meta = mido.MidiTrack(); meta.append(mido.MetaMessage('set_tempo', tempo=500000, time=0)); mid.tracks.append(meta)
TPS = 1920
for tr in TRACKS:
    mt = mido.MidiTrack()
    if tr.ch != 9:
        mt.append(mido.Message('program_change', channel=tr.ch, program=tr.prog, time=0))
    for c, v in ((7, tr.vol), (91, tr.rev), (93, tr.cho), (10, tr.pan)):
        mt.append(mido.Message('control_change', channel=tr.ch, control=c, value=v, time=0))
    last = 0
    for (t, _, m) in sorted(tr.ev, key=lambda e: (e[0], e[1])):
        tick = int(round(t * TPS))
        mt.append(m.copy(time=max(0, tick - last)))
        last = max(last, tick)
    mid.tracks.append(mt)
mid.save(os.path.join(BUILD, 'score.mid'))
subprocess.run(['fluidsynth', '-ni', '-q', '-r', str(SR), '-g', '0.6', '-o', 'synth.reverb.room-size=0.92', '-o', 'synth.reverb.level=0.75',
                '-o', 'synth.reverb.width=1.0', '-F', os.path.join(BUILD, 'score.wav'), '/usr/share/sounds/sf2/FluidR3_GM.sf2', os.path.join(BUILD, 'score.mid')], check=True)
sr, score = wavfile.read(os.path.join(BUILD, 'score.wav'))
score = score.astype(np.float32) / 32768.0
N = int(END * SR) + SR
mix = np.zeros((N, 2), np.float32)
mix[:min(N, len(score))] += score[:N]

# ---------------------------------------------------------------- SFX
rng = np.random.default_rng(7)
tt = lambda d: np.arange(int(d * SR)) / SR


def place(x, t, gain=1.0, pan=0.0):
    if x.ndim == 1:
        x = np.stack([x * (1 - max(0, pan)), x * (1 + min(0, pan))], 1)
    i = int(t * SR)
    j = min(N, i + len(x))
    if j > i:
        mix[i:j] += x[:j - i] * gain


def bp(x, lo, hi, order=2):
    b, a = signal.butter(order, [lo / (SR / 2), hi / (SR / 2)], 'band')
    return signal.lfilter(b, a, x)


def tick(hi=True):
    t = tt(0.09)
    n = rng.standard_normal(len(t))
    click = bp(n, 1800, 7000) * np.exp(-t * 220)
    f = 3150 if hi else 2350
    ping = np.sin(2 * np.pi * f * t) * np.exp(-t * 90) + 0.5 * np.sin(2 * np.pi * f * 1.51 * t) * np.exp(-t * 140)
    body = np.sin(2 * np.pi * (700 if hi else 560) * t) * np.exp(-t * 60)
    return (click * 0.9 + ping * 0.35 + body * 0.25) * 0.5


def boom(d=3.0, f0=62, f1=32):
    t = tt(d)
    f = f1 + (f0 - f1) * np.exp(-t * 2.2)
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(ph) * np.exp(-t * 1.3)
    thump = bp(rng.standard_normal(len(t)), 40, 400) * np.exp(-t * 18) * 0.6
    return (x + thump) * 0.9


def shatter(d=2.2):
    t = tt(d)
    x = bp(rng.standard_normal(len(t)), 2500, 12000) * np.exp(-t * 4.5) * 0.35
    for _ in range(140):
        t0 = rng.uniform(0, 0.9) ** 2
        f = rng.uniform(2200, 9500)
        i = int(t0 * SR)
        L = int(0.25 * SR)
        seg = np.sin(2 * np.pi * f * tt(0.25)) * np.exp(-tt(0.25) * rng.uniform(12, 40)) * rng.uniform(0.04, 0.12)
        x[i:i + L] += seg[:len(x) - i] if i + L > len(x) else seg
    return x


def riser(d=1.6, f0=180, f1=1400):
    t = tt(d)
    f = f0 * (f1 / f0) ** (t / d)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * (t / d) ** 2 * 0.25
    n = bp(rng.standard_normal(len(t)), 800, 9000) * (t / d) ** 3 * 0.35
    return s + n


def heartbeat():
    t = tt(0.35)
    f = 48 + 30 * np.exp(-t * 30)
    lub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 14)
    return lub * 0.9


def whoosh(d=0.9):
    t = tt(d)
    env = np.sin(np.pi * t / d) ** 2
    out = np.zeros(len(t))
    n = rng.standard_normal(len(t))
    for k in range(6):
        lo = 300 * 2 ** k
        out += bp(n, lo, lo * 1.8) * np.clip(1 - abs(t / d - k / 6) * 3, 0, 1)
    return out * env * 0.45


# ticks on every beat (acts 1-3)
for k in range(1, int(FREEZE / 0.5)):
    t0 = k * 0.5
    g = 0.55 if t0 < 6 else (0.32 if t0 < 18 else 0.5)
    place(tick(k % 2 == 0), t0, g, pan=0.15 if k % 2 else -0.15)
place(boom(3.0), 6.0, 0.75)
place(boom(3.5, 70, 28), SHATTER, 1.0)
place(shatter(), SHATTER, 0.9)
place(riser(1.5), FREEZE - 1.5, 0.7)
place(whoosh(0.8), FREEZE - 0.75, 0.8)

# time stops: hard cut of everything before the freeze
cut = int(FREEZE * SR)
fade = int(0.03 * SR)
mix[cut - fade:cut] *= np.linspace(1, 0, fade)[:, None]
mix[cut:int(REWIND * SR)] = 0
forward = mix.copy()   # what the rewind will be made of

# freeze: tinnitus ring, heartbeat, reversed boom swelling into the rewind
t = tt(1.8)
place(np.sin(2 * np.pi * 6200 * t) * np.exp(-t * 2.2) * 0.03, FREEZE)
for t0 in (26.55, 26.8, 27.25, 27.5):
    place(heartbeat(), t0, 0.55)
rb = boom(1.4, 80, 30)[::-1]
place(rb, REWIND - len(rb) / SR, 0.8)


# ---------------------------------------------------------------- the rewind: act 2-3 backwards
def stretch(x, rate, n_fft=2048, hop=512):
    out = []
    for c in range(x.shape[1]):
        f, ts, Z = signal.stft(x[:, c], SR, nperseg=n_fft, noverlap=n_fft - hop)
        steps = np.arange(0, Z.shape[1] - 1, rate)
        phase = np.angle(Z[:, 0])
        omega = 2 * np.pi * hop * np.arange(Z.shape[0]) / n_fft
        Y = np.zeros((Z.shape[0], len(steps)), complex)
        for i, s in enumerate(steps):
            k = int(s); fr = s - k
            mag = (1 - fr) * np.abs(Z[:, k]) + fr * np.abs(Z[:, k + 1])
            Y[:, i] = mag * np.exp(1j * phase)
            dphi = np.angle(Z[:, k + 1]) - np.angle(Z[:, k]) - omega
            dphi -= 2 * np.pi * np.round(dphi / (2 * np.pi))
            phase += omega + dphi
        _, y = signal.istft(Y, SR, nperseg=n_fft, noverlap=n_fft - hop)
        out.append(y)
    L = min(len(o) for o in out)
    return np.stack([o[:L] for o in out], 1).astype(np.float32)


seg = forward[int(6.0 * SR):int(FREEZE * SR)]
rew = stretch(seg, (FREEZE - 6.0) / (REW_END - REWIND))[::-1]
need = int((REW_END - REWIND) * SR)
rew = rew[-need:] if len(rew) >= need else np.pad(rew, ((need - len(rew), 0), (0, 0)))
env = np.ones(need, np.float32)
env[:int(0.05 * SR)] = np.linspace(0, 1, int(0.05 * SR))
env[-int(0.8 * SR):] = np.linspace(1, 0, int(0.8 * SR))
place(rew * env[:, None], REWIND, 0.95)
# sub drone + riser under the rewind
t = tt(REW_END - REWIND)
drone = np.sin(2 * np.pi * 36.7 * t) * 0.18 * np.minimum(1, t / 1.5)
place(drone, REWIND)
place(riser(2.2, 120, 900), REW_END - 2.2, 0.55)

# finale: whoosh into the reunion, a last tick
place(whoosh(1.4), MEET - 1.2, 0.5)
place(boom(4.0, 55, 30), MEET, 0.55)
place(tick(True), 50.0, 0.6)

# ---------------------------------------------------------------- master
mix = mix[:int(END * SR)]
out = np.tanh(mix * 1.2) / np.tanh(1.2)
peak = np.max(np.abs(out))
out = out / max(peak, 1e-6) * 0.95
wavfile.write(os.path.join(BUILD, 'premaster.wav'), SR, (out * 32767).astype(np.int16))
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', os.path.join(BUILD, 'premaster.wav'),
                '-af', 'loudnorm=I=-14:TP=-1.0:LRA=14', '-ar', str(SR), os.path.join(BUILD, 'music.wav')], check=True)
print('done', END, 's')
