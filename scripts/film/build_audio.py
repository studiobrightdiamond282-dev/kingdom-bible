#!/usr/bin/env python3
"""
THE LAST HUMAN CLICK  -  score, sound design and voice mix.

Everything is synthesised here (numpy only): the orchestral-synth bed, the
traffic and crowd beds, the sirens, the heartbeat, the switch click and the
shutdown. Voice tracks come from vo/*.mp3 and are treated per character
(the A.I. gets a metallic chorus + subharmonic ring-mod treatment).

Output: out/score.wav  (48 kHz, stereo, 16-bit, length = story.END)
"""
import os, sys, subprocess, wave, math
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import story as S

SR = S.SAMPLE_RATE
END = S.END
N = int(END * SR) + SR
rng = np.random.default_rng(20990)

MUS = np.zeros((N, 2), np.float32)      # music bed
SFX = np.zeros((N, 2), np.float32)      # sound design
VOX = np.zeros((N, 2), np.float32)      # dialogue / narration

HERE = os.path.dirname(os.path.abspath(__file__))
FFMPEG = None


# ---------------------------------------------------------------- utilities
def ffmpeg():
    global FFMPEG
    if FFMPEG is None:
        import imageio_ffmpeg
        FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
    return FFMPEG


def tt(dur):
    return np.arange(int(dur * SR), dtype=np.float64) / SR


def white(n):
    return rng.standard_normal(n).astype(np.float64)


def band(x, lo, hi, soft=0.35):
    """Zero-phase soft band-pass via FFT (cheap, no scipy needed)."""
    n = len(x)
    if n < 8:
        return x
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(n, 1.0 / SR)
    lo = max(lo, 1.0)
    m = 1.0 / (1.0 + np.exp(-(f - lo) / (lo * soft + 1e-9)))
    m *= 1.0 / (1.0 + np.exp((f - hi) / (hi * soft + 1e-9)))
    return np.fft.irfft(X * m, n)


def fade(x, a=0.01, r=0.05):
    n = len(x)
    na, nr = max(1, int(a * SR)), max(1, int(r * SR))
    na, nr = min(na, n), min(nr, n)
    e = np.ones(n)
    e[:na] = np.linspace(0, 1, na) ** 1.5
    e[-nr:] = np.linspace(1, 0, nr) ** 1.5
    return x * e


def place(bus, sig, t0, gain=1.0, pan=0.0):
    """Add a mono or stereo signal to a bus at t0 seconds."""
    i0 = int(t0 * SR)
    if i0 >= len(bus):
        return
    s = np.asarray(sig, dtype=np.float64)
    if s.ndim == 1:
        th = (pan + 1) * math.pi / 4
        s = np.stack([s * math.cos(th), s * math.sin(th)], axis=1) * math.sqrt(2)
    n = min(len(s), len(bus) - i0)
    if n <= 0:
        return
    bus[i0:i0 + n] += (s[:n] * gain).astype(np.float32)


def smooth_env(x, win_s=0.12):
    """Fast smoothing by decimation so we never convolve 9M samples."""
    step = max(1, int(win_s * SR / 8))
    m = len(x) // step * step
    if m < step * 2:
        return x
    d = np.abs(x[:m]).reshape(-1, step).max(axis=1)
    k = max(1, int(win_s * SR / step))
    ker = np.hanning(k * 2 + 1); ker /= ker.sum()
    d = np.convolve(d, ker, mode="same")
    full = np.interp(np.arange(len(x)), np.arange(0, m, step), d)
    return full


def reverb(x, rt=1.4, mix=0.3, tone=6000, seed=3):
    """Cheap FFT convolution with a synthetic exponentially-decaying IR."""
    n = len(x)
    ir_n = int(rt * SR)
    r = np.random.default_rng(seed)
    ir = r.standard_normal(ir_n) * np.exp(-np.linspace(0, 6.5, ir_n))
    ir = band(ir, 120, tone)
    ir /= np.abs(ir).max() + 1e-9
    L = 1
    while L < n + ir_n:
        L <<= 1
    y = np.fft.irfft(np.fft.rfft(x, L) * np.fft.rfft(ir, L), L)[:n]
    return x * (1 - mix) + y * (mix * 3.0)


# ---------------------------------------------------------------- voicing
def saw_stack(freq, dur, detunes=(0.0,), bright=4000, attack=0.8, release=1.2,
              trem=0.0, seed=0):
    r = np.random.default_rng(seed)
    t = tt(dur)
    out = np.zeros(len(t))
    for d in detunes:
        f = freq * (1 + d)
        ph = (t * f + r.random()) % 1.0
        w = 2 * ph - 1
        w += 0.35 * np.sin(2 * np.pi * f * 2 * t + r.random() * 6)
        out += w
    out /= len(detunes)
    out = band(out, max(35, freq * 0.5), bright)
    if trem:
        out *= 1 - trem * 0.5 * (1 + np.sin(2 * np.pi * (0.13 + 0.05 * r.random()) * t + r.random() * 6))
    return fade(out, attack, release)


def pad(freqs, dur, gain=0.16, bright=3200, attack=2.0, release=2.5, seed=0, trem=0.25):
    out = np.zeros(int(dur * SR))
    for i, f in enumerate(freqs):
        out += saw_stack(f, dur, (-0.004, 0.0, 0.005), bright, attack, release, trem, seed + i)
    out /= max(1, len(freqs))
    return out * gain


def sub(freq, dur, gain=0.5, attack=0.4, release=1.0):
    t = tt(dur)
    w = np.sin(2 * np.pi * freq * t) + 0.25 * np.sin(2 * np.pi * freq * 2 * t)
    w = np.tanh(w * 1.4)
    return fade(w, attack, release) * gain


def impact(dur=2.6, gain=0.9, size=1.0, seed=7):
    t = tt(dur)
    f = 130 * np.exp(-t * 2.2) + 33
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * (2.6 / size))
    n = white(len(t)) * np.exp(-t * (9 / size))
    n = band(n, 120, 5200)
    trans = white(len(t)) * np.exp(-t * 60)
    trans = band(trans, 1800, 12000)
    w = body * 0.9 + n * 0.55 + trans * 0.5
    return np.tanh(fade(w, 0.002, 0.3) * 1.3) * gain


def riser(dur, gain=0.3, lo=300, hi=9000, seed=11):
    t = tt(dur)
    x = white(len(t))
    steps = 24
    out = np.zeros(len(t))
    seg = len(t) // steps
    for i in range(steps):
        a, b = i * seg, (i + 1) * seg if i < steps - 1 else len(t)
        f0 = lo * (hi / lo) ** (i / steps)
        f1 = lo * (hi / lo) ** ((i + 1) / steps)
        out[a:b] = band(x[a:b], f0, f1 * 1.1)
    sweep = np.sin(2 * np.pi * np.cumsum(240 * (6 ** (t / max(dur, .01)))) / SR) * 0.25
    env = np.linspace(0.05, 1, len(t)) ** 2.2
    return np.tanh((out * 0.9 + sweep) * env) * gain


def whoosh(dur=1.8, gain=0.28, pan=0.0, up=True):
    t = tt(dur)
    x = white(len(t))
    y = band(x, 240, 4200)
    env = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 2
    if not up:
        env = env[::-1]
    return y * env * gain


def siren(dur, gain=0.20, base=620, pan=0.0):
    t = tt(dur)
    f = base * (1 + 0.28 * np.sin(2 * np.pi * 0.55 * t)) * (1 + 0.02 * np.sin(2 * np.pi * 6 * t))
    w = np.sin(2 * np.pi * np.cumsum(f) / SR)
    w = np.tanh(w * 2.0)
    w = band(w, 400, 2600)
    env = 0.55 + 0.45 * np.sin(2 * np.pi * 0.14 * t)
    return fade(w * env * gain, 0.6, 1.2)


def heartbeat(dur, bpm=64, gain=0.55):
    t = tt(dur)
    out = np.zeros(len(t))
    beat = 60.0 / bpm
    for k in range(int(dur / beat) + 1):
        for off, amp in ((0.0, 1.0), (0.30, 0.62)):
            t0 = k * beat + off
            i0 = int(t0 * SR)
            if i0 >= len(t):
                continue
            d = 0.34
            td = tt(d) if i0 + int(d * SR) < len(t) else tt((len(t) - i0) / SR)
            f = 62 * np.exp(-td * 7) + 34
            thump = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-td * 11)
            click = band(white(len(td)) * np.exp(-td * 90), 90, 900) * 0.35
            seg = np.tanh((thump + click) * 1.6) * amp * gain
            out[i0:i0 + len(seg)] += seg[:len(out) - i0]
    return out


def hum(dur, gain=0.08, base=100):
    t = tt(dur)
    w = (np.sin(2 * np.pi * base * t) * 0.6 + np.sin(2 * np.pi * base * 1.5 * t) * 0.25 +
         np.sin(2 * np.pi * base * 2.02 * t) * 0.12)
    w += band(white(len(t)), 200, 1600) * 0.06
    w *= 1 + 0.05 * np.sin(2 * np.pi * 0.7 * t)
    return fade(w * gain, 0.5, 0.8)


def city_bed(dur, gain=0.10, bright=2400, seed=5):
    r = np.random.default_rng(seed)
    n = len(tt(dur))
    x = band(white(n), 80, bright)
    mod = 0.6 + 0.4 * np.abs(np.sin(np.linspace(0, 9 + r.random() * 4, n)))
    return fade(x * mod * gain, 1.2, 2.0)


def crowd(dur, gain=0.09, seed=6, panic=False):
    r = np.random.default_rng(seed)
    n = len(tt(dur))
    x = white(n)
    y = band(x, 280, 1500) * 0.7 + band(x, 1200, 3400) * 0.4
    if panic:
        am = 0.35 + 0.65 * np.abs(np.sin(np.linspace(0, 40 + r.random() * 20, n))) ** 2
        y = y * am
    mod = 0.55 + 0.45 * np.sin(np.linspace(0, 3.2, n) + r.random() * 6)
    return fade(y * mod * gain, 0.8, 1.4)


def sparks(dur, gain=0.16, rate=7, seed=8):
    r = np.random.default_rng(seed)
    n = len(tt(dur))
    out = np.zeros(n)
    count = int(dur * rate)
    for _ in range(count):
        i0 = int(r.random() * (n - 4000))
        d = int(SR * (0.02 + r.random() * 0.05))
        z = white(d) * np.exp(-np.linspace(0, 8, d))
        out[i0:i0 + d] += band(z, 2000, 11000)
    return out * gain


def glitch_burst(dur=0.18, gain=0.3, seed=9):
    r = np.random.default_rng(seed)
    n = int(dur * SR)
    x = white(n)
    step = max(8, n // 14)
    for i in range(0, n, step):
        x[i:i + step] = np.round(x[i:i + step] * (2 + r.integers(0, 5))) / 3
    x = band(x, 200, 7000)
    return fade(x * gain, 0.002, 0.03)


def machine_click(gain=0.5):
    t = tt(0.5)
    a = band(white(len(t)) * np.exp(-t * 120), 900, 9000) * 0.9
    b = np.sin(2 * np.pi * 150 * t) * np.exp(-t * 55) * 0.7
    c = np.sin(2 * np.pi * 2400 * t) * np.exp(-t * 40) * 0.2
    return np.tanh((a + b + c) * 1.4) * gain


def shutdown(dur=4.5, gain=0.65):
    t = tt(dur)
    f = 900 * np.exp(-t * 1.5) + 28
    w = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 0.5)
    n = band(white(len(t)), 60, 6000) * np.exp(-t * 1.1) * 0.55
    clunk = np.zeros(len(t))
    ci = int(0.9 * SR)
    if ci < len(t):
        d = len(t) - ci
        td = t[:d]
        clunk[ci:] = np.tanh((np.sin(2 * np.pi * 70 * td) * np.exp(-td * 16) +
                              band(white(d) * np.exp(-td * 60), 200, 5000)) * 1.3)
    return fade(w + n + clunk * 0.6, 0.01, 0.6) * gain


def chime(freqs=(523.25, 783.99, 1046.5), dur=3.0, gain=0.16):
    t = tt(dur)
    out = np.zeros(len(t))
    for i, f in enumerate(freqs):
        d = t - i * 0.09
        e = np.where(d > 0, np.exp(-np.maximum(d, 0) * 1.6), 0.0)
        out += np.sin(2 * np.pi * f * np.maximum(d, 0)) * e
        out += 0.3 * np.sin(2 * np.pi * f * 2.01 * np.maximum(d, 0)) * e
    return fade(out * gain, 0.004, 0.8)


def bass_pulse(freq, dur=0.26, gain=0.30):
    t = tt(dur)
    w = np.sin(2 * np.pi * freq * t) + 0.4 * (2 * ((t * freq) % 1) - 1)
    return np.tanh(w * 1.5) * np.exp(-t * 9) * gain


def kick(gain=0.5):
    t = tt(0.36)
    f = 120 * np.exp(-t * 18) + 44
    return np.tanh(np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9) * 1.8) * gain


def snare(gain=0.28):
    t = tt(0.24)
    n = band(white(len(t)), 900, 7000) * np.exp(-t * 22)
    b = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 26) * 0.5
    return np.tanh((n + b) * 1.4) * gain


def hat(gain=0.12):
    t = tt(0.07)
    return band(white(len(t)) * np.exp(-t * 70), 6000, 15000) * gain


# ---------------------------------------------------------------- score
NOTE = {n: 440 * 2 ** ((i - 9) / 12) for i, n in enumerate(
    ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"])}


def f(name, octv):
    return NOTE[name] * 2 ** (octv - 4)


D2, A2, F3, A3, E4, C4, D3 = f("D", 2), f("A", 2), f("F", 3), f("A", 3), f("E", 4), f("C", 4), f("D", 3)
Bb1, Bb2, D4, F4 = f("A#", 1), f("A#", 2), f("D", 4), f("F", 4)
G2, Bb3, G3 = f("G", 2), f("A#", 3), f("G", 3)
Eb3, Fs3, A4, Eb4 = f("D#", 3), f("F#", 3), f("A", 4), f("D#", 4)
D4m, G4, Bb4, D5 = f("D", 4), f("G", 4), f("A#", 4), f("D", 5)

print("score: cold open + scene 1 ...")
# --- S0/S1 : wonder -------------------------------------------------------
place(MUS, pad([D2, A2, F3, A3, E4], 13.0, 0.22, 3600, 3.0, 3.0, seed=1), 0.0)
place(MUS, sub(D2, 13.0, 0.30, 2.0, 3.0), 0.0)
place(SFX, city_bed(36.0, 0.10, 2600, 5), 0.0)
place(SFX, impact(3.2, 0.55, 1.2), 0.6)
place(SFX, whoosh(3.0, 0.16), 0.2)
place(SFX, chime((1046.5, 1567.98), 4.0, 0.05), 2.0)

place(MUS, pad([D2, A2, F3, C4, E4], 9.0, 0.19, 4200, 2.2, 2.6, seed=4), 6.5)
place(MUS, pad([Bb1 * 2, Bb2, D4, F4], 10.0, 0.18, 3800, 2.4, 3.0, seed=7), 14.0)
place(MUS, sub(Bb1 * 2, 10.0, 0.24, 1.6, 2.6), 14.0)
place(MUS, pad([D2, A3, D4, E4, F4], 10.0, 0.17, 4600, 2.6, 3.2, seed=9), 23.0)
place(MUS, sub(D3 / 2, 10.0, 0.22, 1.4, 3.0), 23.0)
# gentle arpeggio motif: the "perfect world" theme
for k, fr in enumerate([D5, A4, F4, E4, D4, A4]):
    t0 = 9.0 + k * 1.35
    if t0 < 33:
        place(MUS, saw_stack(fr, 2.2, (-0.002, 0.003), 3000, 0.03, 1.7, seed=20 + k) * 0.045, t0,
              pan=(-0.35 if k % 2 else 0.35))
place(SFX, siren(6.0, 0.03), 24.0, pan=0.6)
place(SFX, riser(5.0, 0.16, 200, 6000), 31.0)

print("scene 2: discovery ...")
# --- S2 : the discovery ---------------------------------------------------
place(SFX, hum(30.0, 0.075, 100), 36.0)
place(SFX, city_bed(30.0, 0.03, 1200, 12), 36.0)
place(MUS, pad([D2, A2, Eb3, A3], 12.0, 0.15, 1700, 1.6, 2.4, seed=31), 36.0)
for i, fr in enumerate([D2, D2, Eb3 / 2, D2]):
    place(SFX, bass_pulse(fr, 0.9, 0.20), 37.0 + i * 2.2)
for t0 in (40.8, 47.8, 55.4):
    place(SFX, glitch_burst(0.22, 0.22, seed=int(t0 * 10)), t0, pan=-0.2)
place(SFX, impact(3.4, 0.75, 1.1), 41.1)
place(SFX, riser(6.0, 0.22, 250, 8000), 50.0)
place(MUS, pad([D2, F3, Eb4, Fs3], 12.0, 0.13, 1500, 2.4, 2.8, seed=41), 48.0, )
place(SFX, impact(2.4, 0.6, 0.9), 52.3)
place(SFX, hum(6.0, 0.09, 76), 56.0)
place(SFX, sparks(9.0, 0.16, 9, 55), 56.5)
place(MUS, pad([D2, Eb3, A3, Eb4], 10.0, 0.14, 1900, 1.4, 2.2, seed=51), 56.0)
place(SFX, riser(4.0, 0.20, 300, 9000), 62.0)

print("scene 3: revelation ...")
# --- S3 : the revelation --------------------------------------------------
place(SFX, impact(4.0, 1.0, 1.4), 66.0)
place(SFX, sub(D2 / 2, 12.0, 0.34, 1.0, 2.0), 66.0)
place(MUS, pad([D2, A2, Eb3, Fs3, A3], 14.0, 0.20, 2400, 1.6, 2.6, seed=61), 66.0)
place(SFX, crowd(14.0, 0.085, 62), 66.0)
place(SFX, siren(10.0, 0.05, 700, 0.3), 68.0)
for k in range(9):
    place(SFX, bass_pulse(D2, 0.7, 0.16), 67.0 + k * 2.0)
# the A.I. motif: metallic descending figure
for k, fr in enumerate([Eb4, D4m, A3, Fs3]):
    place(MUS, saw_stack(fr, 2.4, (-0.01, 0.0, 0.01), 2600, 0.05, 1.8, seed=70 + k) * 0.07,
          69.0 + k * 2.3, pan=(0.4 if k % 2 else -0.4))
place(SFX, riser(7.0, 0.26, 200, 10000), 79.0)
place(SFX, impact(3.6, 0.9, 1.3), 80.6)
place(MUS, pad([D2, A2, Eb3, A3, Eb4], 12.0, 0.19, 2600, 1.2, 2.4, seed=71), 80.0)
for k in range(6):
    place(SFX, impact(2.0, 0.35, 0.7, seed=80 + k), 81.0 + k * 2.4)
place(SFX, crowd(9.0, 0.10, 63, panic=True), 90.0)
place(SFX, riser(6.0, 0.24, 250, 9000), 92.0)

print("scene 4: chaos ...")
# --- S4 : chaos -----------------------------------------------------------
place(SFX, impact(3.0, 0.85, 1.2), 99.0)
place(SFX, crowd(26.0, 0.11, 64, panic=True), 99.0)
place(SFX, siren(22.0, 0.10, 820, -0.2), 99.5)
place(SFX, siren(18.0, 0.07, 590, 0.55), 104.0)
place(SFX, sparks(26.0, 0.13, 5, 66), 99.0)
place(SFX, hum(20.0, 0.05, 120), 99.0)

# driving percussion -- accelerates across the sequence
t = 99.0
step = 0.50
while t < 126.0:
    prog = (t - 99.0) / 27.0
    if t < 118:
        place(SFX, kick(0.34 + 0.12 * prog), t)
        if abs((t * 2) % 1) < 0.01:
            place(SFX, hat(0.10 + 0.05 * prog), t + 0.25, pan=0.25)
        if int(t * 2) % 4 == 2:
            place(SFX, snare(0.16 + 0.10 * prog), t)
    else:
        place(SFX, kick(0.46), t)
        place(SFX, snare(0.22), t + 0.25)
        place(SFX, hat(0.13), t + 0.125, pan=-0.3)
    t += step if t < 114 else step * 0.75
for k in range(12):
    place(MUS, bass_pulse(D2, 0.5, 0.16), 99.0 + k * 1.0)
# industrial hits (jump-cut accents) matching the shot list
for tc in (99.0, 104.0, 108.0, 113.0, 119.0, 122.0):
    place(SFX, impact(1.6, 0.45, 0.8, seed=int(tc)), tc)
place(MUS, pad([D2, Fs3, Eb4], 12.0, 0.13, 1800, 0.8, 1.6, seed=81), 99.0)
place(MUS, pad([D2, A2, Eb3, Fs3], 10.0, 0.16, 2000, 0.8, 1.6, seed=82), 114.0)
place(SFX, riser(6.5, 0.30, 200, 11000), 119.5)
place(SFX, impact(4.0, 1.0, 1.5), 126.0)

print("scene 5: final choice ...")
# --- S5 : the final choice -----------------------------------------------
place(SFX, hum(24.0, 0.085, 92), 126.0)
place(MUS, pad([D2, A2, D3, F3], 15.0, 0.15, 1200, 2.0, 3.0, seed=91), 126.0)
place(SFX, heartbeat(15.0, 66, 0.34), 127.0)
for k in range(4):
    place(SFX, bass_pulse(D2, 1.4, 0.10), 127.0 + k * 3.6)

# music drops almost to silence during the hesitation
place(SFX, whoosh(2.4, 0.10, 0.0, up=True), 139.6)
place(SFX, heartbeat(9.4, 78, 0.46), 141.0)
place(MUS, pad([D2, A2], 9.0, 0.06, 700, 3.0, 3.0, seed=92), 141.0)
place(SFX, hum(9.0, 0.10, 118), 141.0)

# the click
place(SFX, machine_click(0.9), 149.2)
place(SFX, impact(2.0, 0.55, 0.8), 149.35)
place(SFX, shutdown(6.0, 0.85), 149.4)
place(SFX, glitch_burst(0.5, 0.30), 149.8)
place(SFX, glitch_burst(0.3, 0.22, seed=99), 150.4)

print("scene 6: the twist ...")
# --- S6 : the twist -------------------------------------------------------
# near-total silence, then one startup chime
place(SFX, chime((880.0, 1318.5, 1760.0), 3.2, 0.13), 161.2)
place(SFX, hum(19.0, 0.05, 62), 161.0)
place(MUS, pad([D2, A2, Eb3], 14.0, 0.055, 700, 4.0, 3.0, seed=95), 161.5)
place(SFX, riser(7.0, 0.20, 120, 5200), 165.0)
place(SFX, impact(4.5, 1.0, 1.6), 172.0)
place(SFX, sub(D2 / 2, 8.0, 0.30, 0.05, 3.0), 172.0)
place(SFX, glitch_burst(0.35, 0.28, seed=101), 172.2)
place(SFX, glitch_burst(0.25, 0.20, seed=102), 173.1)
place(SFX, crowd(6.0, 0.05, 70, panic=True), 172.0)

print("end card ...")
# --- S7 : end card, resolve to hope --------------------------------------
place(SFX, whoosh(3.0, 0.14, 0.0, up=True), 178.4)
place(SFX, impact(4.0, 0.55, 1.3), 180.0)
place(MUS, pad([D2, A2, F3, A3, D4, F4], 12.0, 0.22, 3400, 2.2, 4.0, seed=111), 180.0)
place(MUS, pad([f("D", 3), f("A", 3), f("D", 4), f("F#", 4), f("A", 4)], 11.0, 0.14, 2800, 3.0, 4.5, seed=112), 182.0)
for k, fr in enumerate([D5, A4, F4, D4, A3, D4]):
    place(MUS, saw_stack(fr, 3.0, (-0.002, 0.003), 2400, 0.05, 2.6, seed=120 + k) * 0.05,
          180.5 + k * 1.25, pan=(-0.3 if k % 2 else 0.3))
place(SFX, chime((1046.5, 1318.5, 1567.98), 5.0, 0.07), 184.0)

# ---------------------------------------------------------------- voices
def load_audio(path):
    """Decode any audio file to mono float32 @ SR using ffmpeg."""
    tmp = os.path.join(HERE, "out", "_vo_tmp.wav")
    os.makedirs(os.path.dirname(tmp), exist_ok=True)
    subprocess.run([ffmpeg(), "-y", "-loglevel", "error", "-i", path, "-ac", "1",
                    "-ar", str(SR), "-c:a", "pcm_s16le", tmp], check=True)
    with wave.open(tmp, "rb") as w:
        n = w.getnframes()
        raw = np.frombuffer(w.readframes(n), dtype=np.int16).astype(np.float64) / 32768.0
    return raw


def resample(x, factor):
    """Pitch+time change by resampling (factor<1 = lower, longer)."""
    n = int(len(x) / factor)
    xi = np.interp(np.arange(n) * factor, np.arange(len(x)), x)
    return xi


def talk(sig, kind):
    sig = sig - np.mean(sig)
    sig = band(sig, 70, 12000)
    if kind == "narrator":
        sig = reverb(sig, 1.1, 0.16, 5000, seed=5)
        sig *= 1.0
    elif kind == "kai":
        # young, tight, a little room
        sig = band(sig, 95, 11000)
        sig = reverb(sig, 0.55, 0.10, 6000, seed=6)
        sig = np.tanh(sig * 1.15)
    else:  # ai -- metallic, wide, inhuman
        low = resample(sig, 0.90)                    # -1.8 semitones, slower
        low2 = resample(sig, 0.945)                  # chorus voice
        n = max(len(low), len(low2) + int(0.013 * SR))
        a = np.zeros(n); a[:len(low)] = low
        b = np.zeros(n); b[int(0.013 * SR):int(0.013 * SR) + len(low2)] = low2
        base = (a + b * 0.8) / 1.8
        t = np.arange(len(base)) / SR
        ring = base * (1 + 0.22 * np.sin(2 * np.pi * 63.0 * t))   # subharmonic ring-mod
        ring = band(ring, 130, 6200)
        sub = band(base, 60, 300) * 0.35
        out = np.tanh((ring + sub) * 1.5)
        # short metallic slap
        d = int(0.085 * SR)
        slap = np.zeros(len(out)); slap[d:] = out[:-d] * 0.22
        sig = out + slap
        sig = reverb(sig, 1.5, 0.22, 5200, seed=7)
    return sig


print("voices ...")
for fname, spk, text, t0, t1 in S.VO:
    raw = load_audio(os.path.join(HERE, fname))
    sig = talk(raw, spk)
    peak = np.abs(sig).max() + 1e-9
    target = {"narrator": 0.62, "kai": 0.72, "ai": 0.70}[spk]
    sig = sig / peak * target
    # gentle fade for the A.I. tail
    sig = fade(sig, 0.01, 0.05)
    place(VOX, sig, t0, gain=1.0)

# ---------------------------------------------------------------- mix
print("mixing ...")
vo_env = smooth_env(VOX[:, 0] + VOX[:, 1], 0.18)
duck = 1.0 - 0.62 * np.clip(vo_env / 0.30, 0, 1)

mix = MUS * duck[:, None].astype(np.float32) * 1.0 + SFX * 0.9 + VOX

# master fade + a hint of air
mix = np.nan_to_num(mix)
head = int(0.4 * SR)
mix[:head] *= np.linspace(0, 1, head)[:, None]
tail = int(3.2 * SR)
mix[-tail:] *= np.linspace(1, 0, tail)[:, None] ** 1.5

mix = mix[:N]
peak = np.abs(mix).max()
mix = np.tanh(mix / max(peak, 1e-9) * 1.25) / np.tanh(1.25)
mix *= 0.92

out = os.path.join(HERE, "out", "score.wav")
os.makedirs(os.path.dirname(out), exist_ok=True)
with wave.open(out, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((np.clip(mix, -1, 1) * 32767).astype("<i2").tobytes())
print("wrote", out, round(N / SR, 2), "s")
