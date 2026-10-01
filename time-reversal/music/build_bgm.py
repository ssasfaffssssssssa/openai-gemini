"""Soundtrack built around the user's 16.5 s BGM (119.05 bpm, F# major / D# minor, 8 bars).

Video timeline (real seconds, visuals stretched by TS = 1.008 so that the authored 120 bpm grid
lands on the BGM grid):
  act 1      : BGM heard "from far away" (time-varying low-pass opening up) + clock ticks + celesta motif
  acts 2-3   : BGM loops seamlessly on its 8-bar period; phrase start lands on the river reveal (tv=6)
  freeze     : tape-stop of the BGM, silence, heartbeat, reversed boom swelling into the rewind
  rewind     : acts 2-3 of this mix, phase-vocoder compressed by the visual rewind factor, reversed
  finale     : BGM again from its phrase start + celesta motif and glockenspiel shimmer in F# major
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
BEAT = 0.504
BAR = 4 * BEAT
C0 = 0.106                  # first beat in the clip
LOOP = 8 * BAR              # the clip is exactly 8 bars
PHRASE = C0 + BAR           # phrase start inside the clip
END = 51.0 * TS
TV = lambda tv: tv * TS     # authored visual time -> real time
FREEZE, REWIND, REW_END, SHATTER, MEET = TV(26), TV(28), TV(42), TV(20), TV(47)

sr_in, clip = wavfile.read(os.path.join(BUILD, 'audio_in', 'user.wav'))
clip = clip.astype(np.float32) / 32768.0
assert sr_in == SR

N = int(END * SR) + SR
mix = np.zeros((N, 2), np.float32)
rng = np.random.default_rng(11)
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


def bgm_span(t0, t1, c_at_t0):
    """Clip audio for video span [t0,t1), clip position c_at_t0 at t0, looping on the 8-bar period
    with a short equal-power crossfade at each wrap."""
    n = int(round((t1 - t0) * SR))
    out = np.zeros((n, 2), np.float32)
    pos = 0
    c = c_at_t0
    xf = int(0.012 * SR)
    while pos < n:
        c = C0 + (c - C0) % LOOP
        start = int(round(c * SR))
        stop = int(round((C0 + LOOP) * SR))
        seg = clip[start:stop]
        take = min(len(seg), n - pos)
        piece = seg[:take].copy()
        if pos > 0 and take > xf:
            # crossfade with the tail that continues past the loop point
            ramp = np.sin(np.linspace(0, np.pi / 2, xf))[:, None]
            tail = clip[stop:stop + xf] if stop + xf <= len(clip) else np.zeros((xf, 2), np.float32)
            piece[:xf] = piece[:xf] * ramp + tail[:xf] * np.cos(np.linspace(0, np.pi / 2, xf))[:, None]
        out[pos:pos + take] = piece
        pos += take
        c = C0
    return out


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


def stft_filter(x, cutoff_at):
    """Time-varying low-pass: cutoff_at(t) -> Hz."""
    out = []
    for c in range(2):
        f, ts, Z = signal.stft(x[:, c], SR, nperseg=2048, noverlap=1536)
        for k, t in enumerate(ts):
            fc = cutoff_at(t)
            Z[:, k] *= 1.0 / np.sqrt(1.0 + (f / fc) ** 8)
        _, y = signal.istft(Z, SR, nperseg=2048, noverlap=1536)
        out.append(y[:len(x)])
    return np.stack(out, 1).astype(np.float32)


# ---------------------------------------------------------------- acts 1-3: BGM bed
t_reveal = TV(6)
bed = bgm_span(0.0, FREEZE + 0.8, PHRASE - t_reveal)
# act 1: the music arrives from far away, opening fully on the river reveal
cut = lambda t: 220.0 * (18000 / 220.0) ** (np.clip(t / t_reveal, 0, 1) ** 2.2)
bed = stft_filter(bed, cut)
tb = np.arange(len(bed)) / SR
fade = np.clip(tb / 2.2, 0, 1) ** 1.5 * (0.5 + 0.5 * np.clip(tb / t_reveal, 0, 1) ** 2)
bed *= fade[:, None]
freeze_i = int(FREEZE * SR)
place(bed[:freeze_i], 0.0, 0.9)

# tape-stop: the BGM spins down over 0.5 s when time freezes
ts_len = 0.5
u = np.arange(int(ts_len * SR)) / (ts_len * SR)
speed = (1 - u) ** 1.6
pos = np.cumsum(speed)
src = bed[freeze_i:freeze_i + int(ts_len * SR) + 10]
stop = np.stack([np.interp(pos, np.arange(len(src)), src[:, c]) for c in range(2)], 1)
stop *= (1 - u)[:, None] ** 0.5
place(stop, FREEZE, 0.9)

# clock ticks in act 1 (the BGM's own ticks are filtered away there)
k = 1
while k * BEAT < t_reveal - 0.01:
    place(tick(k % 2 == 0), k * BEAT, 0.5 * (1 - 0.5 * (k * BEAT / t_reveal)), pan=0.15 if k % 2 else -0.15)
    k += 1

# celesta "you & me" motif in D# minor over the intro (FluidSynth)
mid = mido.MidiFile(type=1, ticks_per_beat=960)
meta = mido.MidiTrack(); meta.append(mido.MetaMessage('set_tempo', tempo=500000, time=0)); mid.tracks.append(meta)
cel = []


def note(t, d, p, v, ch=0):
    cel.append((t, 1, mido.Message('note_on', channel=ch, note=p, velocity=v)))
    cel.append((t + d, 0, mido.Message('note_off', channel=ch, note=p, velocity=0)))


motif_minor = [(0, 0.5, 82), (0.5, 0.5, 87), (1.0, 1.0, 90), (2.0, 0.5, 89), (2.5, 0.5, 87), (3.0, 1.4, 82)]   # A#5 D#6 F#6 F6 D#6 A#5
for (o, d, p) in motif_minor:
    note(TV(1.5 + o), d * 1.3 * TS, p, 74)
motif_major = [(0, 0.5, 85), (0.5, 0.5, 90), (1.0, 1.0, 94), (2.0, 0.5, 92), (2.5, 0.5, 90)]                    # C#6 F#6 A#6 G#6 F#6
for (o, d, p) in motif_major:
    note(TV(44.0 + o), d * 1.3 * TS, p, 78)
for i, p in enumerate([78, 82, 85, 90, 94, 97]):   # F#5 A#5 C#6 F#6 A#6 C#7 shimmer at the reunion
    note(MEET + i * 0.08, 1.4, p, 70 - i * 4, ch=1)
for (o, d, p) in [(0, 0.5, 85), (0.5, 0.5, 90), (1.0, 1.8, 94)]:
    note(TV(48.6 + o), d * 1.3 * TS, p, 70)
for ch, prog in ((0, 8), (1, 9)):
    mt = mido.MidiTrack()
    mt.append(mido.Message('program_change', channel=ch, program=prog, time=0))
    mt.append(mido.Message('control_change', channel=ch, control=91, value=115, time=0))
    mt.append(mido.Message('control_change', channel=ch, control=7, value=100, time=0))
    last = 0
    for (t, _, m) in sorted([e for e in cel if e[2].channel == ch], key=lambda e: (e[0], e[1])):
        tick_ = int(round(t * 1920))
        mt.append(m.copy(time=max(0, tick_ - last)))
        last = max(last, tick_)
    mid.tracks.append(mt)
mid.save(os.path.join(BUILD, 'celesta.mid'))
subprocess.run(['fluidsynth', '-ni', '-q', '-r', str(SR), '-g', '0.7', '-o', 'synth.reverb.room-size=0.9', '-o', 'synth.reverb.level=0.8',
                '-F', os.path.join(BUILD, 'celesta.wav'), '/usr/share/sounds/sf2/FluidR3_GM.sf2', os.path.join(BUILD, 'celesta.mid')], check=True)
_, cw = wavfile.read(os.path.join(BUILD, 'celesta.wav'))
cw = cw.astype(np.float32) / 32768.0
celesta = np.zeros((N, 2), np.float32)
celesta[:min(N, len(cw))] = cw[:N]
mix[:int(FREEZE * SR)] += celesta[:int(FREEZE * SR)] * 0.55

# accents on the picture
place(boom(3.0), t_reveal, 0.65)
place(riser(1.6), t_reveal - 1.6, 0.35)
place(boom(3.5, 70, 28), SHATTER, 0.95)
place(shatter(), SHATTER, 0.75)
place(riser(1.5), FREEZE - 1.5, 0.55)
place(whoosh(0.8), FREEZE - 0.75, 0.7)

# freeze: everything stops
mix[int((FREEZE + ts_len) * SR):int(REWIND * SR)] = 0
forward = mix.copy()
t = tt(1.6)
place(np.sin(2 * np.pi * 6200 * t) * np.exp(-t * 2.2) * 0.025, FREEZE + 0.2)
for t0 in (26.6, 26.85, 27.3, 27.55):
    place(heartbeat(), TV(t0), 0.6)
rb = boom(1.3, 80, 30)[::-1]
place(rb, REWIND - len(rb) / SR, 0.8)


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


seg = forward[int(t_reveal * SR):int(FREEZE * SR)]
rew = stretch(seg, (FREEZE - t_reveal) / (REW_END - REWIND))[::-1]
need = int((REW_END - REWIND) * SR)
rew = rew[-need:] if len(rew) >= need else np.pad(rew, ((need - len(rew), 0), (0, 0)))
env = np.ones(need, np.float32)
env[:int(0.04 * SR)] = np.linspace(0, 1, int(0.04 * SR))
env[-int(0.7 * SR):] = np.linspace(1, 0.35, int(0.7 * SR))
place(rew * env[:, None], REWIND, 0.95)
t = tt(REW_END - REWIND)
place(np.sin(2 * np.pi * 38.9 * t) * 0.14 * np.minimum(1, t / 1.5), REWIND)   # D#1 sub drone
place(riser(2.2, 120, 900), REW_END - 2.2, 0.45)

# ---------------------------------------------------------------- finale: BGM from the phrase start
fin = bgm_span(REW_END, END + 0.1, PHRASE)
n = len(fin)
tf = np.arange(n) / SR
g = np.clip(tf / 0.35, 0, 1) * (1 - np.clip((tf + REW_END - (END - 1.6)) / 1.5, 0, 1)) ** 1.2
place(fin * g[:, None], REW_END, 0.85)
mix[int(REW_END * SR):] += celesta[int(REW_END * SR):] * 0.6
place(whoosh(1.4), MEET - 1.2, 0.45)
place(boom(4.0, 55, 30), MEET, 0.5)
place(tick(True), TV(50), 0.75)

# ---------------------------------------------------------------- master
mix = mix[:int(END * SR)]
out = np.tanh(mix * 1.1) / np.tanh(1.1)
out = out / max(np.max(np.abs(out)), 1e-6) * 0.95
wavfile.write(os.path.join(BUILD, 'premaster.wav'), SR, (out * 32767).astype(np.int16))
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', os.path.join(BUILD, 'premaster.wav'),
                '-af', 'loudnorm=I=-14:TP=-1.0:LRA=14', '-ar', str(SR), os.path.join(BUILD, 'music.wav')], check=True)
print('done %.2f s' % END)
