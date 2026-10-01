"""Final soundtrack: the user's hook (female voice + BGM) fused with the original score.

The hook clip is in G minor at 119.05 bpm with a 4-bar cycle Gm | Eb | F | G(sus), 8 bars long.
Her line "我会找到逆转时间的公式，然后回到你身边" occupies bars 0-3 (0.18-6.4 s).

  0 s ......... her clip plays untouched from its first sample (voice = the 3 s hook)
  1.95-2.45 ... tape-rewind zip in the pause of her line (the picture rewinds to t = 0)
  6.4-8.17 .... she has finished; organ pedal, a celesta answer and a riser grow under her BGM
  8.17 ........ downbeat of her bar 4 = river reveal: the original score enters in the same key,
                tempo and chord cycle (Gm Eb F Gsus) while her BGM keeps playing underneath,
                then dissolves into the black hole (low-pass + fade) before the clock
  later ....... original score (act 3, freeze, phase-vocoder rewind of this very mix)
  finale ...... her bars 5-7 (Eb F G) return under the orchestral G-major reunion

Story time tv (the picture's authored time) maps to real time with R(tv) for tv >= 6.
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
TS = 0.2520 / 0.25
C0, BAR = 0.106, 2.016
T_R = C0 + 4 * BAR                       # 8.170: river reveal
R = lambda tv: T_R + (tv - 6.0) * TS     # story -> real time
END = R(51.0)
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

# ---------------------------------------------------------------- finale (tv 42-51)                  -> Eb F Dsus D | G major
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
A_MAJ = ['A2', 'E3', 'A3', 'C#4', 'E4', 'A4', 'C#5']
choir.chord(47.0, 4.0, A_MAJ[2:], 96)
strings.chord(47.0, 4.0, A_MAJ, 96)
pad.chord(47.0, 4.0, A_MAJ[2:], 80)
organ.chord(47.0, 4.0, ['A1', 'A2', 'E3', 'A3'], 80)
brass.chord(47.0, 2.0, ['A2', 'E3', 'C#4'], 84)
horn.note(47.0, 3.0, 'E5', 88)
timp.note(47.0, 1.0, 'A2', 112)
drums.note(47.0, 3.0, 57, 100)
for i, n in enumerate(['A5', 'C#6', 'E6', 'A6', 'C#7', 'E7']):
    glock.note(47.0 + i * 0.08, 1.2, n, 70 - i * 4)
for (o, d, n) in [(0, 0.5, 'E5'), (0.5, 0.5, 'A5'), (1.0, 1.6, 'C#6')]:
    celesta.note(48.6 + o, d * 1.3, n, 72)

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
mix = np.zeros((N, 2), np.float32)
mix[:min(N, len(score))] += score[:N] * 1.7

# ---------------------------------------------------------------- helpers
rng = np.random.default_rng(7)
tt = lambda d: np.arange(int(d * SR)) / SR


def place(x, t, gain=1.0, pan=0.0):
    if x.ndim == 1:
        x = np.stack([x * (1 - max(0, pan)), x * (1 + min(0, pan))], 1)
    i = int(round(t * SR))
    if i < 0:
        x = x[-i:]; i = 0
    j = min(N, i + len(x))
    if j > i:
        mix[i:j] += x[:j - i] * gain


def bp(x, lo, hi, order=2):
    b, a = signal.butter(order, [lo / (SR / 2), hi / (SR / 2)], 'band')
    return signal.lfilter(b, a, x)


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
    return (x + bp(rng.standard_normal(len(t)), 40, 400) * np.exp(-t * 18) * 0.6) * 0.9


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


def heartbeat():
    t = tt(0.35)
    f = 48 + 30 * np.exp(-t * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 14) * 0.9


def whoosh(d=0.9):
    t = tt(d)
    env = np.sin(np.pi * t / d) ** 2
    n = rng.standard_normal(len(t))
    out = np.zeros(len(t))
    for k in range(6):
        lo = 300 * 2 ** k
        out += bp(n, lo, lo * 1.8) * np.clip(1 - abs(t / d - k / 6) * 3, 0, 1)
    return out * env * 0.45


def tape_zip(d=0.5):
    """fast tape rewind: rising chirpy noise with flutter"""
    t = tt(d)
    f = 400 * (6.0 ** (t / d))
    flutter = 1 + 0.15 * np.sin(2 * np.pi * 38 * t)
    tone = np.sin(2 * np.pi * np.cumsum(f * flutter) / SR) * 0.12
    noise = bp(rng.standard_normal(len(t)), 1500, 9000) * 0.25
    env = np.sin(np.pi * np.clip(t / d, 0, 1)) ** 0.7
    return (tone + noise) * env


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
after = np.clip((th - T_R) / BAR, 0, 1)
g *= np.where(th < T_R, 1.0, 1.0 - 0.15 * np.clip(th - T_R, 0, 1) - 0.35 * np.clip((th - T_R - BAR) / BAR, 0, 1))
g *= 1 - np.clip((th - R(16.0)) / (her_end - R(16.0)), 0, 1) ** 1.3
her *= g[:, None]
her = lowpass_sweep(her, lambda t: 18000.0 if t < R(16.0) else 18000.0 * (240 / 18000.0) ** min(1, (t - R(16.0)) / (her_end - R(16.0))))
place(her, 0.0, 0.7)

# intro accents
place(tape_zip(0.5), 1.95, 0.55)
place(riser(1.6, 160, 1300), T_R - 1.6, 0.4)
place(boom(3.0), T_R, 0.75)

# ---------------------------------------------------------------- story SFX (as in the original version)
for k in range(13, int(26.0 / 0.5)):
    tv = k * 0.5
    place(tick(k % 2 == 0), R(tv), 0.30 if tv < 18 else 0.48, pan=0.15 if k % 2 else -0.15)
place(boom(3.5, 70, 28), R(20), 0.95)
place(shatter(), R(20), 0.85)
place(riser(1.5), R(26) - 1.5, 0.6)
place(whoosh(0.8), R(26) - 0.75, 0.75)

cut = int(R(26) * SR)
fade = int(0.03 * SR)
mix[cut - fade:cut] *= np.linspace(1, 0, fade)[:, None]
mix[cut:int(R(28) * SR)] = 0
forward = mix.copy()
t = tt(1.8)
place(np.sin(2 * np.pi * 6200 * t) * np.exp(-t * 2.2) * 0.03, R(26))
for tv in (26.55, 26.8, 27.25, 27.5):
    place(heartbeat(), R(tv), 0.55)
rb = boom(1.4, 80, 30)[::-1]
place(rb, R(28) - len(rb) / SR, 0.8)


# ---------------------------------------------------------------- rewind: the act 2-3 mix, backwards
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


seg = forward[int(R(6) * SR):int(R(26) * SR)]
rew = stretch(seg, (R(26) - R(6)) / (R(42) - R(28)))[::-1]
need = int((R(42) - R(28)) * SR)
rew = rew[-need:] if len(rew) >= need else np.pad(rew, ((need - len(rew), 0), (0, 0)))
env = np.ones(need, np.float32)
env[:int(0.05 * SR)] = np.linspace(0, 1, int(0.05 * SR))
env[-int(0.8 * SR):] = np.linspace(1, 0, int(0.8 * SR))
place(rew * env[:, None], R(28), 1.35)
t = tt(R(42) - R(28))
place(np.sin(2 * np.pi * 49.0 * t) * 0.16 * np.minimum(1, t / 1.5), R(28))     # G1 sub drone
place(riser(2.2, 120, 900), R(42) - 2.2, 0.5)

# ---------------------------------------------------------------- finale: her bars 5-7 return under the reunion
fin = her_audio(C0 + 5 * BAR, 3 * BAR + 0.6)
tf = np.arange(len(fin)) / SR
gf = np.clip(tf / 0.3, 0, 1) * (1 - np.clip((tf - (3 * BAR - 1.2)) / 1.2, 0, 1))
place(fin * gf[:, None], R(42), 0.55)
place(whoosh(1.4), R(47) - 1.2, 0.5)
place(boom(4.0, 55, 30), R(47), 0.55)
place(tick(True), R(50), 0.6)

# ---------------------------------------------------------------- master
mix = mix[:int(END * SR)]
out = np.tanh(mix * 1.15) / np.tanh(1.15)
out = out / max(np.max(np.abs(out)), 1e-6) * 0.95
wavfile.write(os.path.join(BUILD, 'premaster.wav'), SR, (out * 32767).astype(np.int16))
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', os.path.join(BUILD, 'premaster.wav'),
                '-af', 'loudnorm=I=-14:TP=-1.0:LRA=14', '-ar', str(SR), os.path.join(BUILD, 'music.wav')], check=True)
print('done %.3f s (reveal at %.3f s)' % (END, T_R))
