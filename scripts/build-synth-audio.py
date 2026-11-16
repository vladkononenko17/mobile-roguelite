"""Sound made here from nothing (no samples, nothing third-party), so there is no licence to carry:

- ambience beds, one per chapter, looped quietly under the music: amb_wind (Wasteland), amb_station
  (ORION), amb_hell, amb_night (Graveyard), amb_sea (Pirate), amb_blizzard (Whiteout);
- two chapter themes: music_graveyard (organ, a tolling bell, a plucked figure in D minor) and
  music_pirate (a slow 6/8 in D minor: drum, squeezebox, a low whistle tune);
- three stings: sting_clear (a level is cleared), sting_win (the chapter is won), sting_dead.

    python3 scripts/build-synth-audio.py [id ...]      (numpy, scipy; ffmpeg on the PATH)

Loops are periodic: LFOs run whole cycles per loop, filters and reverbs are applied circularly in
the frequency domain, notes wrap around the end, so the end runs into the start with no seam.
"""
import os, subprocess, sys, tempfile
import numpy as np
from scipy.io import wavfile

SR = 44100
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public/audio")


class Loop:
    """A buffer of `seconds` that wraps around."""

    def __init__(self, seconds, seed):
        self.seconds = seconds
        self.n = int(SR * seconds)
        self.t = np.arange(self.n) / SR
        self.freqs = np.fft.rfftfreq(self.n, 1 / SR)
        self.rng = np.random.default_rng(seed)

    def lfo(self, cycles, phase=0.0):
        """A sine with a whole number of cycles in the loop, 0..1."""
        return 0.5 + 0.5 * np.sin(2 * np.pi * (cycles * self.t / self.seconds + phase))

    def noise(self, lo, hi, tilt=-1.0):
        """Noise band-limited to lo..hi Hz with a spectral tilt, circular."""
        spec = np.fft.rfft(self.rng.standard_normal(self.n))
        f = np.maximum(self.freqs, 1.0)
        gain = (f / 500.0) ** (tilt / 2) / (1 + (lo / f) ** 4) / (1 + (f / hi) ** 4)
        out = np.fft.irfft(spec * gain, self.n)
        return out / np.max(np.abs(out))

    def tone(self, hz, phase=0.0):
        hz = round(hz * self.seconds) / self.seconds  # whole cycles in the loop
        return np.sin(2 * np.pi * hz * self.t + phase)

    def reverb(self, x, seconds=4.0, wet=0.5, seed=1, dark=3500.0):
        """Convolution with decaying noise, wrapped around the loop."""
        r = np.random.default_rng(seed)
        n = min(int(seconds * SR), self.n)
        ir = r.standard_normal(n) * np.exp(-np.arange(n) / (seconds * SR / 6.9))
        ir[: int(0.012 * SR)] = 0
        spec = np.fft.rfft(ir, self.n) / (1 + (self.freqs / dark) ** 2)
        out = np.fft.irfft(np.fft.rfft(x) * spec, self.n)
        out /= np.max(np.abs(out)) + 1e-9
        return x * (1 - wet) + out * wet * (np.max(np.abs(x)) + 1e-9)

    def lowpass(self, x, hz, order=2):
        return np.fft.irfft(np.fft.rfft(x) / (1 + (self.freqs / hz) ** (2 * order)), self.n)

    def place(self, buf, sig, at):
        """Adds sig at `at` seconds, wrapping around the loop end."""
        i = int(at * SR) % self.n
        np.add.at(buf, (i + np.arange(len(sig))) % self.n, sig)

    def zeros(self):
        return np.zeros(self.n)


def env(n, attack, release):
    """Linear attack and release (s) over n samples."""
    e = np.ones(n)
    a, r = max(1, int(attack * SR)), max(1, int(release * SR))
    e[:a] *= np.linspace(0, 1, a)
    e[-r:] *= np.linspace(1, 0, r)
    return e


def bell(hz, seconds=5.0, bright=1.0):
    """A struck bell: inharmonic partials, each with its own decay."""
    tt = np.arange(int(seconds * SR)) / SR
    out = np.zeros(len(tt))
    for ratio, amp, decay in ((0.5, 0.5, 2.6), (1, 1, 1.9), (1.19, 0.5 * bright, 1.4), (2.0, 0.45 * bright, 1.0), (2.76, 0.3 * bright, 0.6), (5.4, 0.12 * bright, 0.3)):
        out += amp * np.sin(2 * np.pi * hz * ratio * tt) * np.exp(-tt / (decay * seconds / 5))
    out[: int(0.004 * SR)] *= np.linspace(0, 1, int(0.004 * SR))
    return out


def pluck(hz, seconds=2.2, rng=None):
    """A plucked string (Karplus-Strong)."""
    rng = rng or np.random.default_rng(int(hz))
    n, period = int(seconds * SR), max(2, int(round(SR / hz)))
    out = np.empty(n)
    line = rng.uniform(-1, 1, period)
    # Soften the pick.
    line = np.convolve(line, np.ones(4) / 4, mode="same")
    for i in range(0, n, period):
        m = min(period, n - i)
        out[i : i + m] = line[:m]
        line = 0.996 * 0.5 * (line + np.roll(line, 1))
    return out * env(n, 0.002, 0.3)


def reed(hz, seconds, vibrato=5.0, depth=0.004, bright=7):
    """A squeezebox / organ reed: a few odd-heavy harmonics, a little vibrato, soft edges."""
    tt = np.arange(int(seconds * SR)) / SR
    phase = 2 * np.pi * hz * (tt + depth / (2 * np.pi * vibrato) * np.sin(2 * np.pi * vibrato * tt) / 1.0)
    out = np.zeros(len(tt))
    for k in range(1, bright + 1):
        if hz * k > 6000: break
        out += np.sin(k * phase) / (k ** (1.1 if k % 2 else 1.7))
    return out * env(len(tt), 0.06, min(0.25, seconds / 3))


def drum(hz=58.0, seconds=0.9, click=0.2, seed=3):
    """A low skin drum: a falling thump and a short noise of the stick."""
    tt = np.arange(int(seconds * SR)) / SR
    body = np.sin(2 * np.pi * (hz * tt + hz * 0.6 * (1 - np.exp(-tt * 18)) / 18)) * np.exp(-tt / (seconds / 4.5))
    stick = np.random.default_rng(seed).standard_normal(len(tt)) * np.exp(-tt / 0.012) * click
    return body + stick


HZ = {n: 440.0 * 2 ** ((i - 57) / 12) for i, n in enumerate(f"{p}{o}" for o in range(0, 8) for p in ("C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"))}


def finish(x, peak_db):
    x = x - np.mean(x)
    x = np.tanh(x / np.max(np.abs(x)) * 1.15)
    return x / np.max(np.abs(x)) * 10 ** (peak_db / 20)


def write(name, x, bitrate, lufs=None):
    """Encodes x to public/audio/name; with `lufs`, at that integrated loudness (peaks kept under -1 dB)."""
    out = os.path.join(OUT, name)
    with tempfile.TemporaryDirectory() as tmp:
        wav = os.path.join(tmp, "w.wav")
        wavfile.write(wav, SR, (x * 32767).astype(np.int16))
        gain = 0.0
        if lufs is not None:
            log = subprocess.run(["ffmpeg", "-hide_banner", "-i", wav, "-af", "ebur128", "-f", "null", "-"], capture_output=True, text=True).stderr
            measured = float(log.rsplit("I:", 1)[1].split("LUFS")[0])
            gain = min(lufs - measured, -1 - 20 * np.log10(np.max(np.abs(x))))
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", wav, "-af", f"volume={gain:.2f}dB", "-ac", "1", "-codec:a", "libmp3lame", "-b:a", bitrate, out], check=True)
    print(f"{name}: {len(x) / SR:.1f} s, {os.path.getsize(out) // 1024} KB, gain {gain:+.1f} dB")


# ---------------------------------------------------------------- ambience beds (24 s loops)
def gusts(L, strength=1.0, whistle=0.0, low=(120, 600), mid=(500, 1800)):
    a = L.noise(*low, -1.5) * (0.25 + 0.75 * L.lfo(2) * L.lfo(5, 0.3))
    b = L.noise(*mid, -2.0) * (0.08 + 0.92 * L.lfo(3, 0.2) ** 2 * L.lfo(1, 0.6)) * strength
    c = L.noise(1900, 2700, 0) * whistle * L.lfo(4, 0.7) ** 4
    return 0.55 * a + 0.5 * b + c


def amb_wind():
    # The Wasteland: a dry wind over open ground, sand hissing along it.
    L = Loop(24, 11)
    sand = L.noise(3000, 7000, 0) * 0.07 * L.lfo(3, 0.2) ** 3
    return finish(gusts(L, 0.8) + sand, -8)


def amb_blizzard():
    # Whiteout: a harder wind that whistles.
    L = Loop(24, 12)
    return finish(gusts(L, 1.3, 0.2, low=(160, 700), mid=(600, 2200)) + L.noise(2500, 6000, 0) * 0.06 * L.lfo(2, 0.4) ** 2, -8)


def amb_station():
    # ORION: the hum of the station, air through the vents, a relay ticking somewhere.
    L = Loop(24, 13)
    hum = 0.18 * L.tone(100) + 0.3 * L.tone(150.2) * (0.6 + 0.4 * L.lfo(3)) + 0.35 * L.tone(200) * L.lfo(2, 0.3) + 0.3 * L.tone(301) * L.lfo(5, 0.1) + 0.15 * L.tone(452) * L.lfo(3, 0.5)
    air = L.noise(300, 2400, -2.5) * (0.5 + 0.5 * L.lfo(1, 0.2)) * 0.5
    ticks = L.zeros()
    tt = np.arange(int(0.05 * SR)) / SR
    tick = np.sin(2 * np.pi * 2300 * tt) * np.exp(-tt / 0.006)
    for at in (3.1, 3.4, 9.7, 15.2, 15.5, 15.8, 21.3):
        L.place(ticks, tick * 0.12, at)
    return finish(hum * 0.5 + air * 1.6 + L.reverb(ticks, 1.8, 0.6, 5), -9)


def amb_hell():
    # Hell: a deep rumble that heaves, and fire crackling.
    L = Loop(24, 14)
    rumble = L.noise(70, 260, -3) * (0.5 + 0.5 * L.lfo(2) * L.lfo(3, 0.4)) * 0.45 + 0.1 * L.tone(82) * L.lfo(1, 0.3)
    roar = L.noise(220, 1100, -2.0) * 0.9 * (0.35 + 0.65 * L.lfo(3, 0.6) ** 2)
    crackle = L.zeros()
    r = np.random.default_rng(8)
    for at in r.uniform(0, 24, 260):
        n = int(r.uniform(0.002, 0.012) * SR)
        L.place(crackle, r.standard_normal(n) * np.exp(-np.arange(n) / (n / 3)) * r.uniform(0.2, 1.0) ** 2, at)
    crackle = crackle - L.lowpass(crackle, 1200)
    return finish(rumble + roar + 0.5 * crackle, -8)


def amb_night():
    # The Graveyard: night air, crickets in bursts, the wind low in the trees.
    L = Loop(24, 15)
    air = gusts(L, 0.5, low=(100, 420), mid=(400, 1200)) * 0.8
    crickets = L.zeros()
    r = np.random.default_rng(9)
    for voice, hz in enumerate((4150, 4420, 3890)):
        at = r.uniform(0, 3)
        while at < 24:
            chirps = int(r.integers(3, 7))
            for c in range(chirps):
                tt = np.arange(int(0.045 * SR)) / SR
                pulse = np.sin(2 * np.pi * hz * tt) * np.sin(np.pi * tt / 0.045) ** 2 * (0.5 + 0.5 * np.sin(2 * np.pi * 55 * tt))
                L.place(crickets, pulse * (0.5 if voice else 0.8), at + c * 0.085)
            at += r.uniform(1.4, 4.2)
    return finish(air + 0.1 * L.reverb(crickets, 1.2, 0.35, 6, 6000), -9)


def amb_sea():
    # The Pirate coast: surf running up the beach and drawing back, timbers creaking.
    L = Loop(24, 16)
    # Three waves in the loop: a quick rise, a long hissing fall.
    phase = (L.t / 8.0) % 1.0
    swell = np.where(phase < 0.22, (phase / 0.22) ** 2, np.exp(-(phase - 0.22) * 4.2))
    surf = L.noise(250, 4500, -1.8) * (0.12 + 0.88 * swell) + L.noise(3000, 8000, 0) * 0.12 * swell ** 2
    deep = L.noise(50, 220, -3) * 0.5 * (0.4 + 0.6 * np.roll(swell, int(0.4 * SR)))
    creak = L.zeros()
    for at, hz in ((5.2, 310), (13.6, 265), (20.9, 340)):
        tt = np.arange(int(0.55 * SR)) / SR
        c = np.sign(np.sin(2 * np.pi * (hz + 40 * tt) * tt)) * np.sin(2 * np.pi * 23 * tt) ** 2 * env(len(tt), 0.05, 0.2)
        L.place(creak, c, at)
    creak = L.lowpass(creak, 1500) - L.lowpass(creak, 250)
    return finish(surf + deep + 0.08 * L.reverb(creak, 1.5, 0.5, 7), -8)


# ---------------------------------------------------------------- chapter themes (64 s loops)
def music_graveyard():
    """Graveyard: 16 bars of 4 s. An organ holds Dm - Bb - Gm - A; a bell tolls every other bar;
    a plucked figure walks the chord; a low drum keeps a slow pulse; wind underneath."""
    L = Loop(64, 21)
    bar = 4.0
    chords = [("D2", "D3", "F3", "A3"), ("Bb1", "Bb2", "D3", "F3"), ("G1", "G2", "Bb2", "D3"), ("A1", "A2", "C#3", "E3")]
    organ, plucks, bells, drums = L.zeros(), L.zeros(), L.zeros(), L.zeros()
    figures = [("D4", "F4", "A4", "F4", "D4", "A3"), ("D4", "F4", "Bb4", "F4", "D4", "Bb3"), ("D4", "G4", "Bb4", "G4", "D4", "Bb3"), ("C#4", "E4", "A4", "E4", "C#4", "A3")]
    rng = np.random.default_rng(4)
    for b in range(16):
        c = b % 4
        for i, note in enumerate(chords[c]):
            L.place(organ, reed(HZ[note], bar + 0.25, vibrato=4.2, depth=0.002, bright=5) * (0.3 if i == 0 else 0.6), b * bar)
        # The figure plays in the middle eight bars and the last four, thinner at first.
        if 4 <= b < 12 or b >= 14:
            for i, note in enumerate(figures[c]):
                if b < 8 and i % 2: continue
                L.place(plucks, pluck(HZ[note], 2.4, rng) * (0.8 if i == 0 else 0.55), b * bar + i * bar / 6)
        if b % 2 == 0:
            L.place(bells, bell(HZ["D4"] if b % 8 else HZ["A3"], 6.0, 0.8) * (0.9 if b % 8 == 0 else 0.6), b * bar)
        for beat in (0, 2.0, 2.5) if b >= 4 else (0,):
            L.place(drums, drum(52, 1.1, 0.12) * (1.0 if beat == 0 else 0.5), b * bar + beat)
    # A high voice far away: one long line over the second half.
    choir = L.zeros()
    for at, note, length in ((32, "A4", 7.5), (40, "Bb4", 3.5), (44, "A4", 3.8), (48, "F4", 7.5), (56, "E4", 7.6)):
        L.place(choir, reed(HZ[note], length, vibrato=5.2, depth=0.006, bright=3) * 0.6, at)
    wind = gusts(L, 0.6, low=(110, 480), mid=(450, 1300))
    mix = (0.4 * L.reverb(L.lowpass(organ, 1800), 4.5, 0.55, 2) + 1.0 * L.reverb(plucks, 3.5, 0.45, 3) + 0.7 * L.reverb(bells, 6.5, 0.6, 4)
           + 0.22 * L.reverb(drums, 3.0, 0.35, 5, 900) + 0.6 * L.reverb(L.lowpass(choir, 2200), 6.0, 0.75, 6) + 0.25 * wind)
    return finish(mix, -9.5)


def music_pirate():
    """Pirate coast: 32 bars of 6/8, 2 s each. A drum on 1 and 4, a squeezebox on Dm - C - Bb - A,
    a low whistle with a rolling minor tune (it rests every other phrase), surf underneath."""
    L = Loop(64, 22)
    bar, eighth = 2.0, 2.0 / 6
    chords = [("D2", "A2", "D3", "F3"), ("C2", "G2", "C3", "E3"), ("Bb1", "F2", "Bb2", "D3"), ("A1", "E2", "A2", "C#3")]
    # Two eight-bar phrases of (eighths from the bar start, note, eighths long); bars 2 s.
    tune_a = [[(0, "D4", 2), (2, "E4", 1), (3, "F4", 2), (5, "A4", 1)], [(0, "G4", 3), (3, "E4", 2), (5, "C4", 1)],
              [(0, "D4", 2), (2, "F4", 1), (3, "Bb4", 2), (5, "A4", 1)], [(0, "A4", 3), (3, "E4", 3)],
              [(0, "D4", 2), (2, "E4", 1), (3, "F4", 2), (5, "A4", 1)], [(0, "G4", 2), (2, "A4", 1), (3, "G4", 2), (5, "E4", 1)],
              [(0, "F4", 2), (2, "E4", 1), (3, "D4", 2), (5, "C#4", 1)], [(0, "D4", 6)]]
    tune_b = [[(0, "A4", 3), (3, "F4", 2), (5, "A4", 1)], [(0, "G4", 3), (3, "E4", 3)],
              [(0, "F4", 2), (2, "G4", 1), (3, "F4", 2), (5, "D4", 1)], [(0, "E4", 3), (3, "C#4", 3)],
              [(0, "A4", 3), (3, "F4", 2), (5, "A4", 1)], [(0, "C5", 2), (2, "Bb4", 1), (3, "A4", 2), (5, "G4", 1)],
              [(0, "F4", 2), (2, "E4", 1), (3, "D4", 2), (5, "C#4", 1)], [(0, "D4", 6)]]
    box, whistle, drums, bass = L.zeros(), L.zeros(), L.zeros(), L.zeros()
    for b in range(32):
        # Chords change every two bars, except the last two bars of a phrase (Bb, A one bar each).
        step = b % 8
        c = (0, 0, 1, 1, 0, 0, 2, 3)[step]
        root, *upper = chords[c]
        L.place(bass, reed(HZ[root], bar * 0.9, vibrato=0.1, depth=0, bright=3), b * bar)
        # The squeezebox pushes on 1 and pulls on 4 (silent in the first four bars).
        if b >= 4:
            for at, length in ((0, 2.6 * eighth), (3 * eighth, 2.6 * eighth)):
                for note in upper:
                    L.place(box, reed(HZ[note], length, vibrato=5.5, depth=0.003, bright=8) * 0.5, b * bar + at)
        L.place(drums, drum(60, 0.8, 0.25), b * bar)
        L.place(drums, drum(74, 0.5, 0.2) * 0.55, b * bar + 3 * eighth)
        if b % 2 == 1: L.place(drums, drum(74, 0.4, 0.2) * 0.35, b * bar + 5 * eighth)
        # The tune: phrase A (bars 8-15), B (16-23), A again an octave down, softly (24-31).
        phrase = tune_a[step] if 8 <= b < 16 or b >= 24 else tune_b[step] if 16 <= b < 24 else None
        if phrase:
            down = 0.5 if b >= 24 else 1.0
            for at, note, length in phrase:
                tt = np.arange(int(length * eighth * SR)) / SR
                hz = HZ[note] * 2 * down
                v = np.sin(2 * np.pi * hz * tt + 0.012 * np.sin(2 * np.pi * 5.5 * tt) * hz / 5.5) + 0.18 * np.sin(4 * np.pi * hz * tt)
                breath = np.random.default_rng(int(hz) + b).standard_normal(len(tt)) * 0.05
                L.place(whistle, (v + breath) * env(len(tt), 0.04, 0.08) * (0.7 if down < 1 else 1.0), b * bar + at * eighth)
    phase = (L.t / 8.0) % 1.0
    swell = np.where(phase < 0.22, (phase / 0.22) ** 2, np.exp(-(phase - 0.22) * 4.2))
    surf = L.noise(250, 4000, -1.8) * (0.1 + 0.9 * swell)
    mix = (0.16 * L.lowpass(bass, 500) + 0.5 * L.reverb(L.lowpass(box, 2600), 2.5, 0.35, 2) + 0.75 * L.reverb(L.lowpass(whistle, 3200), 4.5, 0.55, 3)
           + 0.3 * L.reverb(drums, 2.2, 0.3, 4, 1200) + 0.22 * surf)
    return finish(mix, -9.5)


# ---------------------------------------------------------------- stings (one-shots)
def one_shot(seconds, seed=1):
    return Loop(seconds, seed)


def sting_clear():
    # A level cleared: two bell notes rising a fifth over a low thump.
    L = one_shot(2.6)
    x = L.zeros()
    L.place(x, drum(55, 0.9, 0.1) * 0.8, 0)
    L.place(x, bell(HZ["D5"], 2.2, 0.7) * 0.7, 0.02)
    L.place(x, bell(HZ["A5"], 2.2, 0.7) * 0.8, 0.26)
    return finish(x * env(L.n, 0.001, 0.5), -3)


def sting_win():
    # The chapter won: the minor key opens to D major, bells up the chord, a held organ.
    L = one_shot(5.5)
    x = L.zeros()
    for note in ("D3", "A3", "D4", "F#4"):
        L.place(x, reed(HZ[note], 4.6, vibrato=4.5, depth=0.003, bright=5) * 0.3, 0.05)
    for i, note in enumerate(("D5", "F#5", "A5", "D6")):
        L.place(x, bell(HZ[note], 3.6, 0.8) * (0.55 + 0.1 * i), 0.1 + i * 0.22)
    L.place(x, drum(50, 1.2, 0.1), 0)
    L.place(x, drum(50, 1.2, 0.1) * 0.7, 0.98)
    return finish(x * env(L.n, 0.001, 1.2), -3)


def sting_dead():
    # The hero is down: a low bell, a minor second grinding under it, falling.
    L = one_shot(4.5)
    tt = L.t
    fall = 2 ** (-tt / 9)
    low = np.sin(2 * np.pi * np.cumsum(HZ["D2"] * fall) / SR) + 0.8 * np.sin(2 * np.pi * np.cumsum(HZ["Eb2"] * fall) / SR) + 0.5 * np.sin(2 * np.pi * np.cumsum(HZ["D3"] * fall) / SR)
    x = low * np.exp(-tt / 1.6) * 0.6
    L.place(x, bell(HZ["D3"], 4.2, 0.5) * 0.9, 0)
    L.place(x, drum(44, 1.6, 0.15), 0)
    return finish(x * env(L.n, 0.001, 1.0), -3)


BUILD = {
    "amb_wind": (amb_wind, "amb_wind-0.mp3", "40k", -24), "amb_blizzard": (amb_blizzard, "amb_blizzard-0.mp3", "40k", -24),
    "amb_station": (amb_station, "amb_station-0.mp3", "40k", -24), "amb_hell": (amb_hell, "amb_hell-0.mp3", "40k", -24),
    "amb_night": (amb_night, "amb_night-0.mp3", "48k", -24), "amb_sea": (amb_sea, "amb_sea-0.mp3", "40k", -24),
    "music_graveyard": (music_graveyard, "music_graveyard.mp3", "64k", -21), "music_pirate": (music_pirate, "music_pirate.mp3", "64k", -21),
    "sting_clear": (sting_clear, "sting_clear-0.mp3", "56k", None), "sting_win": (sting_win, "sting_win-0.mp3", "56k", None), "sting_dead": (sting_dead, "sting_dead-0.mp3", "56k", None),
}

if __name__ == "__main__":
    import json
    ids = sys.argv[1:] or list(BUILD)
    for i in ids:
        make, name, bitrate, lufs = BUILD[i]
        write(name, make(), bitrate, lufs)
    # Listed in sounds.json, which the game reads to know what exists.
    path = os.path.join(OUT, "sounds.json")
    counts = json.load(open(path))
    for i in ids: counts[i] = 1
    json.dump(counts, open(path, "w"), separators=(",", ":"))
