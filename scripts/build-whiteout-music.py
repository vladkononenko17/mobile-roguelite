"""Whiteout's music, synthesised here (no samples, nothing third-party): a 64-second seamless loop of
wind, a low drone with a slow dissonant swell, sparse glassy bell notes in D minor and a distant
boom, in a long reverb. Writes public/audio/music_whiteout.mp3.

    python3 scripts/build-whiteout-music.py        (numpy, scipy; ffmpeg on the PATH)

Everything is periodic over the loop (LFO rates are whole cycles per loop; filters and the reverb
are applied circularly in the frequency domain), so the end runs into the start with no seam.
"""
import os, subprocess, sys, tempfile
import numpy as np
from scipy.io import wavfile

SR, SECONDS, SEED = 44100, 64, 1906
N = SR * SECONDS
rng = np.random.default_rng(SEED)
t = np.arange(N) / SR
freqs = np.fft.rfftfreq(N, 1 / SR)

def lfo(cycles, phase=0.0):
    """A sine with a whole number of cycles in the loop, 0..1."""
    return 0.5 + 0.5 * np.sin(2 * np.pi * (cycles * t / SECONDS + phase))

def shaped_noise(lo, hi, tilt=-1.0):
    """Noise band-limited to lo..hi Hz with a spectral tilt (dB-ish per octave), circular."""
    spec = np.fft.rfft(rng.standard_normal(N))
    f = np.maximum(freqs, 1.0)
    gain = (f / 500.0) ** (tilt / 2)
    gain *= 1 / (1 + (lo / f) ** 4) * 1 / (1 + (f / hi) ** 4)
    out = np.fft.irfft(spec * gain, N)
    return out / np.max(np.abs(out))

def circular_reverb(x, seconds=5.5, wet=0.5, seed=1):
    """Convolution with decaying noise, wrapped around the loop."""
    r = np.random.default_rng(seed)
    n = int(seconds * SR)
    ir = r.standard_normal(n) * np.exp(-np.arange(n) / (seconds * SR / 6.9))
    ir[: int(0.012 * SR)] = 0
    # Darker tail.
    spec = np.fft.rfft(ir, N) / (1 + (freqs / 3500.0) ** 2)
    out = np.fft.irfft(np.fft.rfft(x) * spec, N)
    out /= np.max(np.abs(out)) + 1e-9
    return x * (1 - wet) + out * wet * np.max(np.abs(x))

def place(buf, sig, at):
    """Adds sig at `at` seconds, wrapping around the loop end."""
    i = int(at * SR) % N
    idx = (i + np.arange(len(sig))) % N
    np.add.at(buf, idx, sig)

# ---- wind: two bands whose loudness gusts, different in each ear
def wind(seed_phase):
    low = shaped_noise(140, 620, -1.5) * (0.25 + 0.75 * lfo(3, seed_phase) * lfo(7, seed_phase * 1.7))
    mid = shaped_noise(520, 1700, -2.0) * (0.08 + 0.92 * lfo(5, 0.3 + seed_phase) ** 2 * lfo(2, seed_phase * 0.6))
    whistle = shaped_noise(1900, 2600, 0) * 0.16 * lfo(4, 0.7 + seed_phase) ** 4
    return 0.55 * low + 0.5 * mid + whistle
wind_l, wind_r = wind(0.0), wind(0.21)

# ---- drone: D1 / D2 with slow beating, a fifth, and a minor second that swells in and out
def tone(hz, phase=0.0):
    hz = round(hz * SECONDS) / SECONDS  # whole cycles in the loop
    return np.sin(2 * np.pi * hz * t + phase)
D1, D2, D3, A3, EB3 = 36.71, 73.42, 146.83, 220.0, 155.56
# Most of the weight sits at D2 / D3 and up, where a phone's speaker can still play it.
drone = 0.22 * tone(D1) + 0.4 * tone(D2) * (0.6 + 0.4 * lfo(2)) + 0.3 * tone(D2 * 1.004, 1.0) * (0.5 + 0.5 * lfo(3, 0.4))
drone += 0.42 * tone(D3) * (0.45 + 0.55 * lfo(2, 0.3)) + 0.3 * tone(D3 * 1.003, 2.0) * lfo(3, 0.15)
drone += 0.2 * tone(A3) * lfo(1, 0.25) + 0.24 * tone(EB3) * lfo(2, 0.5) ** 3
# A cold minor pad far above it (D4 F4 A4, each a detuned pair), breathing slowly.
pad = np.zeros(N)
for hz, cycles, phase in ((293.66, 2, 0.0), (349.23, 3, 0.35), (440.0, 1, 0.6), (587.33, 2, 0.8)):
    pad += (tone(hz) + tone(hz * 1.0035, 1.3)) * lfo(cycles, phase) ** 2
drone = 0.5 * drone + 0.09 * pad

# ---- bells: glassy notes (inharmonic partials), sparse, quiet, far away
def bell(hz, seconds=5.0, bright=1.0):
    n = int(seconds * SR)
    tt = np.arange(n) / SR
    out = np.zeros(n)
    for ratio, amp, decay in ((1, 1, 1.6), (2.76, 0.42 * bright, 0.7), (5.4, 0.2 * bright, 0.35), (8.93, 0.08 * bright, 0.18)):
        out += amp * np.sin(2 * np.pi * hz * ratio * tt) * np.exp(-tt / decay)
    out[: int(0.004 * SR)] *= np.linspace(0, 1, int(0.004 * SR))
    return out
NOTES = {"D5": 587.33, "F5": 698.46, "A5": 880.0, "C6": 1046.5, "E5": 659.26, "D6": 1174.66, "Bb5": 932.33, "A4": 440.0}
# (time s, note, level, pan -1..1): a slow falling figure, answered late in the loop.
SCORE = [(4.0, "A5", 0.9, -0.4), (7.5, "F5", 0.7, 0.3), (12.0, "D5", 0.8, -0.1), (20.5, "E5", 0.5, 0.5), (23.0, "D5", 0.6, 0.2),
         (33.0, "Bb5", 0.8, -0.5), (36.5, "A5", 0.6, 0.1), (41.0, "F5", 0.7, 0.4), (46.0, "D6", 0.35, -0.3), (52.5, "A4", 0.8, 0.0), (58.0, "D5", 0.5, 0.35)]
bells_l, bells_r = np.zeros(N), np.zeros(N)
for at, note, level, pan in SCORE:
    b = bell(NOTES[note]) * level
    place(bells_l, b * np.sqrt(0.5 * (1 - pan)), at)
    place(bells_r, b * np.sqrt(0.5 * (1 + pan)), at + 0.011)

# ---- distant booms: a low thud with a noise tail, twice in the loop
def boom():
    n = int(3.5 * SR)
    tt = np.arange(n) / SR
    body = np.sin(2 * np.pi * (48 * tt - 9 * (1 - np.exp(-tt * 6)) / 6)) * np.exp(-tt / 0.9)
    rumble = rng.standard_normal(n) * np.exp(-tt / 0.5) * 0.25
    rumble = np.convolve(rumble, np.ones(200) / 200, mode="same")
    return body + rumble * 6
booms = np.zeros(N)
place(booms, boom() * 0.9, 16.0)
place(booms, boom() * 0.6, 48.5)

# ---- mix
left = 1.25 * wind_l + drone + 1.1 * circular_reverb(bells_l, 6.5, 0.7, 2) + 0.4 * circular_reverb(booms, 5.0, 0.6, 3)
right = 1.25 * wind_r + drone + 1.1 * circular_reverb(bells_r, 6.5, 0.7, 4) + 0.4 * circular_reverb(booms, 5.0, 0.6, 5)
mix = np.stack([left, right], axis=1)
mix = np.tanh(mix / np.max(np.abs(mix)) * 1.15)  # gentle limiting
mix = mix / np.max(np.abs(mix)) * 10 ** (-9.5 / 20)  # about -20.5 LUFS, like the other chapters' loops

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = os.path.join(root, "public/audio/music_whiteout.mp3")
with tempfile.TemporaryDirectory() as tmp:
    wav = os.path.join(tmp, "w.wav")
    wavfile.write(wav, SR, (mix * 32767).astype(np.int16))
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", wav, "-codec:a", "libmp3lame", "-b:a", "80k", out], check=True)
print(out, os.path.getsize(out), "bytes; seam jump:", float(np.max(np.abs(mix[0] - mix[-1]))))
