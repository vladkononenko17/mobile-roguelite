"""Original soundtrack and sound design for the «Клін Клінич» trailer.

Everything is synthesized here (no samples, no third-party audio), so the
music is ours to use. 140 BPM funk-house, 18 s:

  0.00–3.00  hook: an impact, a muted groove and a riser, a snare roll into
  3.00       the drop (beat 7): four-on-the-floor, clap, hats, funky bass, stabs
  11.14      progression lift (beat 26): brighter arpeggio
  15.00      reveal (beat 35): build
  17.14      final hit (beat 40), ringing out to 18.00

Sound effects follow the edit (edit.json): washer hiss, mower, roof taps,
splash, dish scrub, coins and the purchase, whooshes on the cuts.

  python3 audio.py          → out/trailer.wav (48 kHz stereo)
"""
import json
import os
import wave

import numpy as np
from scipy import signal

SR = 48000
DUR = 18.0
BPM = 140
BEAT = 60 / BPM
N = int(SR * DUR)
rng = np.random.default_rng(7)
HERE = os.path.dirname(os.path.abspath(__file__))
EDIT = json.load(open(os.path.join(HERE, "edit.json")))
FPS = EDIT["fps"]


def t_of(beat):
    return beat * BEAT


def env_exp(n, tau):
    return np.exp(-np.arange(n) / (tau * SR))


def place(buf, x, at, gain=1.0, pan=0.0):
    i = int(at * SR)
    if i >= N or i + len(x) <= 0:
        return
    j0 = max(0, -i)
    x = x[j0:]
    i = max(0, i)
    n = min(len(x), N - i)
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    buf[0, i:i + n] += x[:n] * gain * l * 1.4142
    buf[1, i:i + n] += x[:n] * gain * r * 1.4142


def bp(x, lo, hi, order=2):
    sos = signal.butter(order, [lo, hi], "bandpass", fs=SR, output="sos")
    return signal.sosfilt(sos, x)


def lp(x, f, order=2):
    sos = signal.butter(order, f, "lowpass", fs=SR, output="sos")
    return signal.sosfilt(sos, x)


def hp(x, f, order=2):
    sos = signal.butter(order, f, "highpass", fs=SR, output="sos")
    return signal.sosfilt(sos, x)


def noise(sec):
    return rng.uniform(-1, 1, int(sec * SR))


def note_hz(n):  # midi
    return 440 * 2 ** ((n - 69) / 12)


# ── drums ──────────────────────────────────────────────────────────────────
def kick(big=1.0):
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    f = 48 + 110 * np.exp(-t / 0.045)
    ph = 2 * np.pi * np.cumsum(f) / SR
    x = np.sin(ph) * env_exp(n, 0.16 * big)
    click = hp(noise(0.01), 2000) * np.linspace(1, 0, int(0.01 * SR)) * 0.4
    x[: len(click)] += click
    return np.tanh(x * 1.6)


def clap():
    x = np.zeros(int(0.3 * SR))
    for k, d in enumerate([0, 0.011, 0.022]):
        b = bp(noise(0.3), 900, 2600) * env_exp(int(0.3 * SR), 0.012 if k < 2 else 0.09)
        i = int(d * SR)
        x[i:] += b[: len(x) - i] * (0.6 if k < 2 else 1)
    return x * 0.9


def hat(open_=False):
    sec = 0.22 if open_ else 0.05
    x = hp(noise(sec), 7500, 4) * env_exp(int(sec * SR), 0.07 if open_ else 0.012)
    return x * (0.5 if open_ else 0.38)


def snare():
    n = int(0.25 * SR)
    t = np.arange(n) / SR
    body = np.sin(2 * np.pi * 190 * t) * env_exp(n, 0.04)
    sn = bp(noise(0.25), 1500, 7000) * env_exp(n, 0.06)
    return body * 0.5 + sn * 0.8


def crash(sec=2.2):
    x = hp(noise(sec), 4000, 2) * env_exp(int(sec * SR), 0.7)
    return x * 0.5


def impact(sec=2.0):
    n = int(sec * SR)
    t = np.arange(n) / SR
    boom = np.sin(2 * np.pi * (38 + 40 * np.exp(-t / 0.08)) * t) * env_exp(n, 0.55)
    body = lp(noise(sec), 400) * env_exp(n, 0.25) * 0.8
    return np.tanh((boom + body) * 1.5)


# ── tonal ──────────────────────────────────────────────────────────────────
def saw(f, sec, detune=0.0):
    t = np.arange(int(sec * SR)) / SR
    out = signal.sawtooth(2 * np.pi * f * t)
    if detune:
        out = 0.5 * out + 0.5 * signal.sawtooth(2 * np.pi * f * (1 + detune) * t + 1.3)
    return out


def bass_note(m, sec):
    f = note_hz(m)
    n = int(sec * SR)
    t = np.arange(n) / SR
    x = 0.6 * signal.square(2 * np.pi * f * t, 0.42) + 0.6 * np.sin(2 * np.pi * f * t)
    # a quick filter "pluck": bright attack closing down
    a = lp(x, 900) * np.minimum(1, t / 0.004) * env_exp(n, 0.18)
    return np.tanh(a * 1.4) * 0.55


def stab(chord, sec=0.16, bright=2600):
    x = sum(saw(note_hz(m), sec, 0.006) for m in chord) / len(chord)
    n = len(x)
    x = lp(x, bright) * np.minimum(1, np.arange(n) / (0.003 * SR)) * env_exp(n, 0.07)
    return x * 0.5


def pluck(m, sec=0.18):
    f = note_hz(m)
    n = int(sec * SR)
    t = np.arange(n) / SR
    x = (signal.square(2 * np.pi * f * t, 0.3) * 0.5 + np.sin(2 * np.pi * 2 * f * t) * 0.3) * env_exp(n, 0.06)
    return lp(x, 4000) * 0.35


def riser(sec, f0=300, f1=6000):
    n = int(sec * SR)
    x = noise(sec)
    out = np.zeros(n)
    seg = int(0.02 * SR)
    for i in range(0, n, seg):
        k = i / n
        f = f0 * (f1 / f0) ** k
        out[i:i + seg] = bp(x[i:i + seg + 400], f * 0.7, min(f * 1.4, SR / 2 - 100))[:len(out[i:i + seg])]
    return out * np.linspace(0.05, 1, n) ** 2 * 0.5


def whoosh(sec=0.3, up=True):
    n = int(sec * SR)
    x = noise(sec)
    out = np.zeros(n)
    seg = int(0.01 * SR)
    for i in range(0, n, seg):
        k = i / n if up else 1 - i / n
        f = 500 * (8 ** k)
        out[i:i + seg] = bp(x[i:i + seg + 300], f * 0.6, f * 1.6)[:len(out[i:i + seg])]
    shape = np.sin(np.linspace(0, np.pi, n)) ** 1.5
    return out * shape * 0.5


# ── the song ───────────────────────────────────────────────────────────────
music = np.zeros((2, N))
E = 40  # E2
EM7 = [64, 67, 71, 74]   # E G B D
A9 = [61, 64, 67, 71]    # C# E G B over A
C7 = [64, 67, 71, 72]
B7 = [63, 66, 69, 71]
prog = [EM7, A9, EM7, B7]
bassline = [  # (beat offset in a bar of 4, midi, length in beats)
    (0, E, 0.4), (0.75, E + 12, 0.2), (1.5, E, 0.25), (2, E + 3, 0.4), (2.75, E + 5, 0.2), (3.25, E + 7, 0.25), (3.5, E + 10, 0.4),
]
roots = [0, 5, 0, -1]  # E, A, E, B(−1 → D#… use B below) per bar

# hook (beats 0–7): impact, muted groove, riser, snare roll
place(music, impact(2.4), 0.0, 0.9)
place(music, crash(1.6), 0.0, 0.35)
for b in np.arange(1, 7, 0.5):
    place(music, hat(), t_of(b), 0.5, 0.3)
for b in [1, 2.5, 3, 4.5, 5]:
    place(music, pluck(E + 24 + (3 if b % 2 else 0)), t_of(b), 0.8, -0.3)
for b in [2, 4]:
    place(music, kick(0.7), t_of(b), 0.5)
place(music, riser(t_of(7) - t_of(3.5)), t_of(3.5), 0.8)
for k, b in enumerate(np.concatenate([np.arange(5, 6, 0.25), np.arange(6, 6.9, 0.125)])):
    place(music, snare(), t_of(b), 0.25 + 0.5 * (b - 5) / 2)

# groove (beats 7–35), with a lift at 26
for b in range(7, 35):
    bar = int((b - 7) // 4)
    beat_in = (b - 7) % 4
    place(music, kick(), t_of(b), 0.95)
    if beat_in in (1, 3):
        place(music, clap(), t_of(b), 0.55)
    place(music, hat(True), t_of(b + 0.5), 0.45, 0.25)
    for s in (0.25, 0.75):
        place(music, hat(), t_of(b + s), 0.35, -0.25)
for bar in range(7):
    b0 = 7 + bar * 4
    root = [0, 5, 0, 7][bar % 4]
    for off, m, ln in bassline:
        if b0 + off < 35:
            place(music, bass_note(m + root, ln * BEAT), t_of(b0 + off), 0.9)
    ch = [m + root for m in EM7] if root in (0,) else ([m for m in A9] if root == 5 else [m for m in B7])
    for off in (0.5, 1.75, 2.5, 3.75):
        if b0 + off < 35:
            place(music, stab(ch, bright=2600 if b0 < 26 else 4200), t_of(b0 + off), 0.75, 0.2 if off % 1 else -0.2)
# section accents
for b in (16, 26):
    place(music, crash(1.4), t_of(b), 0.35)
    place(music, impact(0.8), t_of(b), 0.25)
# progression lift: a bright 16th arpeggio
arp = [76, 79, 83, 86, 83, 79]
for k, b in enumerate(np.arange(26, 35, 0.25)):
    place(music, pluck(arp[k % len(arp)], 0.12), t_of(b), 0.55, 0.4 * np.sin(k))

# reveal (beats 35–42): build, then the final hit on beat 40
for b in range(35, 39):
    place(music, kick(0.8), t_of(b), 0.7)
    place(music, hat(True), t_of(b + 0.5), 0.35)
place(music, riser(t_of(40) - t_of(35), 400, 9000), t_of(35), 0.9)
for b in np.arange(38, 39.9, 0.25):
    place(music, snare(), t_of(b), 0.3 + 0.4 * (b - 38) / 2)
final = t_of(40)
place(music, impact(DUR - final + 0.2), final, 1.1)
place(music, kick(1.6), final, 1.0)
place(music, crash(DUR - final + 0.2), final, 0.6)
for m in [E, E + 12] + [m - 12 for m in EM7] + EM7:
    tone = saw(note_hz(m), DUR - final, 0.004)
    n = len(tone)
    tone = lp(tone, 3000) * np.minimum(1, np.arange(n) / (0.005 * SR)) * env_exp(n, 0.7)
    place(music, tone, final, 0.09)

# ── sound effects following the edit ──────────────────────────────────────
sfx = np.zeros((2, N))
cuts = {c["shot"]: c for c in EDIT["cuts"]}


def span(name):
    c = cuts[name]
    return c["at"] / FPS, (c["at"] + c["len"]) / FPS


def hiss(sec, bright=1.0):
    n = int(sec * SR)
    x = bp(noise(sec), 1200 * bright, 9000) + 0.3 * lp(noise(sec), 400)
    mod = 1 + 0.15 * np.sin(2 * np.pi * 7 * np.arange(n) / SR)
    fade = np.minimum(1, np.minimum(np.arange(n), n - np.arange(n)) / (0.03 * SR))
    return x * mod * fade * 0.35


def engine(sec):
    n = int(sec * SR)
    t = np.arange(n) / SR
    f = 46 + 3 * np.sin(2 * np.pi * 1.3 * t)
    x = signal.sawtooth(2 * np.pi * np.cumsum(f) / SR) * 0.6 + lp(noise(sec), 300) * 0.5
    fade = np.minimum(1, np.minimum(np.arange(n), n - np.arange(n)) / (0.04 * SR))
    return lp(x, 1600) * fade * 0.5


def tap():
    n = int(0.08 * SR)
    return (bp(noise(0.08), 1800, 4500) * env_exp(n, 0.012) + np.sin(2 * np.pi * 320 * np.arange(n) / SR) * env_exp(n, 0.02) * 0.4) * 0.8


def coin(at, gain=0.5):
    for k, f in enumerate([1320, 1760]):
        n = int(0.25 * SR)
        t = np.arange(n) / SR
        x = signal.square(2 * np.pi * f * t) * env_exp(n, 0.06) * 0.25
        place(sfx, lp(x, 6000), at + k * 0.07, gain)


def chime(at, gain=0.45):
    for k, m in enumerate([79, 83, 88]):
        n = int(0.6 * SR)
        t = np.arange(n) / SR
        x = signal.sawtooth(2 * np.pi * note_hz(m) * t, 0.5) * env_exp(n, 0.25)
        place(sfx, x * 0.3, at + k * 0.08, gain)


def splash(sec=0.4):
    n = int(sec * SR)
    return bp(noise(sec), 600, 3500) * env_exp(n, 0.12) * 0.6


def click():
    n = int(0.03 * SR)
    return signal.square(2 * np.pi * 900 * np.arange(n) / SR) * env_exp(n, 0.008) * 0.2


s0, s1 = span("b1_wash"); place(sfx, hiss(s1 - s0), s0, 0.55, 0.15)
s0, s1 = span("b2_drive"); place(sfx, hiss(s1 - s0, 0.8), s0, 0.55, 0.15)
s0, s1 = span("b3_timelapse"); place(sfx, hiss(s1 - s0, 1.4), s0, 0.4, 0.15)
s0, s1 = span("c1_mow"); place(sfx, engine(s1 - s0), s0, 0.6)
s0, s1 = span("c2_roof")
for k in range(4):
    place(sfx, tap(), s0 + 0.25 + k * 0.17, 0.7)
coin(s1 - 0.25, 0.35)
s0, s1 = span("c3_pool"); place(sfx, splash(), s0 + 0.15, 0.6); place(sfx, splash(0.3), s0 + 0.6, 0.4)
s0, s1 = span("c4_dishes")
place(sfx, lp(noise(s1 - s0), 1800) * 0.25, s0, 0.5)  # the tap running
for k in range(6):
    place(sfx, bp(noise(0.09), 2500, 7000) * env_exp(int(0.09 * SR), 0.03) * 0.5, s0 + 0.08 + k * 0.16, 0.5, 0.2)
s0, s1 = span("d1_done"); place(sfx, hiss(26 / FPS), s0, 0.5, 0.15)
chime(s0 + 26 / FPS, 0.5)
coin(s0 + 26 / FPS + 0.15, 0.45)
s0, s1 = span("d2_shop")
place(sfx, click(), s0 + 0.02, 0.8)
place(sfx, click(), s0 + 13 / FPS, 0.8)
for k, m in enumerate([72, 76, 84]):  # purchase
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    place(sfx, signal.sawtooth(2 * np.pi * note_hz(m) * t, 0.5) * env_exp(n, 0.12) * 0.3, s0 + 13 / FPS + k * 0.07, 0.6)
coin(s0 + 13 / FPS + 0.05, 0.4)
s0, s1 = span("d3_pro"); place(sfx, hiss(s1 - s0, 0.7), s0, 0.7, 0.15)
# whooshes into the cuts
for c in EDIT["cuts"][1:]:
    place(sfx, whoosh(0.28), c["at"] / FPS - 0.2, 0.22, rng.uniform(-0.5, 0.5))
place(sfx, whoosh(0.5), t_of(40) - 0.45, 0.35)

# ── mix ────────────────────────────────────────────────────────────────────
mix = music * 0.8 + sfx * 0.9
# gentle bus compression (soft knee) and a limiter
peak = np.max(np.abs(mix))
mix = np.tanh(mix / max(peak, 1e-6) * 1.6) / np.tanh(1.6)
mix *= 0.92
fade = np.ones(N)
fade[-int(0.02 * SR):] = np.linspace(1, 0, int(0.02 * SR))  # no click at the very end
mix *= fade
os.makedirs(os.path.join(HERE, "out"), exist_ok=True)
out = os.path.join(HERE, "out", "trailer.wav")
pcm = (np.clip(mix.T, -1, 1) * 32767).astype("<i2")
with wave.open(out, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print("wrote", out, f"{DUR:.2f}s")
