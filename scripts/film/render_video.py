#!/usr/bin/env python3
"""
THE LAST HUMAN CLICK  -  picture.

A software compositor. Every frame is built from the painted plates plus a
virtual camera, an atmospheric layer stack and a typographic layer, then piped
straight into ffmpeg at 24 fps. No slideshow: each shot has an authored camera
move, its own light, its own particles, and its own failure modes (glitch,
strobe, shake) that match the story beat.

    python3 render_video.py                     full film  -> build/video.mp4
    python3 render_video.py --frames 600,601    spot-check frames -> build/peek/
"""
import os, sys, math, time, argparse, subprocess
from concurrent.futures import ThreadPoolExecutor
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import story as S

HERE = os.path.dirname(os.path.abspath(__file__))
STILLS = os.path.join(HERE, "stills")
BUILD = os.path.join(HERE, "out")
TXT = os.path.join(BUILD, "txt")
os.makedirs(BUILD, exist_ok=True)
os.makedirs(TXT, exist_ok=True)

FW, FH = S.W, S.H
CW, CH = S.CW, S.CH            # 1920 x 960 content
BAR = S.BAR
FPS = S.FPS
WORKERS = max(1, min(4, (os.cpu_count() or 2)))

CYAN = np.array([0.20, 0.85, 1.00], np.float32)
RED = np.array([1.00, 0.18, 0.18], np.float32)
WARM = np.array([1.00, 0.86, 0.62], np.float32)
GREEN = np.array([0.45, 1.00, 0.70], np.float32)


# =============================================================== helpers
def ease_io(x):
    x = min(max(x, 0.0), 1.0)
    return x * x * (3 - 2 * x)


def ease_out(x):
    x = min(max(x, 0.0), 1.0)
    return 1 - (1 - x) ** 3


def ease_in(x):
    x = min(max(x, 0.0), 1.0)
    return x ** 3


EASES = {"io": ease_io, "out": ease_out, "in": ease_in, "lin": lambda x: min(max(x, 0), 1)}


def smoothnoise(t, seed=0, speed=1.0):
    """Deterministic smooth 1-D noise in [-1,1]."""
    r = np.random.default_rng(seed)
    k = r.random(64) * 6.283
    return float(np.mean([np.sin(t * speed * (0.7 + i * 0.31) + k[i]) for i in range(6)]) / 0.85)


def fnt(name, size):
    return ImageFont.truetype(os.path.join(HERE, "fonts", name), size)


# =============================================================== the plates
_plate_cache = {}


def plate(name, width=2300):
    key = (name, width)
    if key in _plate_cache:
        return _plate_cache[key]
    im = Image.open(os.path.join(STILLS, name + ".png")).convert("RGB")
    h = int(round(width * im.height / im.width))
    im = im.resize((width, h), Image.LANCZOS)
    # mirrored border so an extreme camera push never meets a hard edge
    pad = max(2, int(width * 0.02))
    canvas = Image.new("RGB", (width + 2 * pad, h + 2 * pad))
    canvas.paste(im, (pad, pad))
    canvas.paste(im.transpose(Image.FLIP_LEFT_RIGHT).crop((0, 0, pad, h)), (0, pad))
    canvas.paste(im.transpose(Image.FLIP_LEFT_RIGHT).crop((width - pad, 0, width, h)), (width + pad, pad))
    canvas.paste(im.transpose(Image.FLIP_TOP_BOTTOM).crop((0, 0, width, pad)), (pad, 0))
    canvas.paste(im.transpose(Image.FLIP_TOP_BOTTOM).crop((0, h - pad, width, h)), (pad, h + pad))
    for cx0, cy0, flip in ((0, 0, "tl"), (width + pad, 0, "tr"), (0, h + pad, "bl"), (width + pad, h + pad, "br")):
        corner = im.crop((0, 0, pad, pad) if flip[0] == "l" else (width - pad, 0, width, pad))
        if flip[0] == "l":
            corner = corner.transpose(Image.FLIP_LEFT_RIGHT)
        if flip[1] == "b":
            corner = corner.transpose(Image.FLIP_TOP_BOTTOM)
        canvas.paste(corner, (cx0, cy0))
    im = canvas
    if len(_plate_cache) > 3:
        _plate_cache.pop(next(iter(_plate_cache)))
    _plate_cache[key] = im
    return im


def camera(im, cx, cy, z, roll=0.0, jx=0.0, jy=0.0):
    """Sample the plate through a virtual camera.

    z  = fraction of the plate width that fills frame width (smaller = closer)
    cx,cy = normalised centre of interest

    The camera is bounds-safe: a shot can never sample past the edge of the
    plate (which would show a flat grey border). If the requested framing
    would fall outside, the view is pushed back in and the plate is mirrored
    at the edges first, so even an extreme push stays photographic.
    """
    pw, ph = im.size
    pad = max(2, int(pw * 0.02))
    pw0, ph0 = pw - 2 * pad, ph - 2 * pad     # real painted pixels only
    s = (pw * z) / CW
    hw = (abs(math.cos(math.radians(roll))) * CW / 2 + abs(math.sin(math.radians(roll))) * CH / 2) * s
    hh = (abs(math.sin(math.radians(roll))) * CW / 2 + abs(math.cos(math.radians(roll))) * CH / 2) * s
    # never sample the mirrored margin: if the push is too tight, pull back
    k = max(1.0, hw * 2 / pw0, hh * 2 / ph0)
    if k > 1.0:
        s *= k
        hw, hh = hw * k, hh * k
    ox = min(max(cx * pw + jx, pad + hw), pad + pw0 - hw)
    oy = min(max(cy * ph + jy, pad + hh), pad + ph0 - hh)

    a = math.cos(math.radians(roll)) * s
    b = -math.sin(math.radians(roll)) * s
    d = math.sin(math.radians(roll)) * s
    e = math.cos(math.radians(roll)) * s
    c = ox - (a * CW / 2 + b * CH / 2)
    f = oy - (d * CW / 2 + e * CH / 2)
    return im.transform((CW, CH), Image.AFFINE, (a, b, c, d, e, f), resample=Image.BICUBIC)


# =============================================================== static layers
def _grid():
    y, x = np.mgrid[0:CH, 0:CW].astype(np.float32)
    return x / CW, y / CH


GX, GY = _grid()
ANG = np.arctan2(GY - 0.5, (GX - 0.5) * (CW / CH)).astype(np.float32)
RAD = np.sqrt(((GX - 0.5) * (CW / CH)) ** 2 + (GY - 0.5) ** 2).astype(np.float32)

VIG = (1.0 - 0.62 * np.clip((RAD - 0.28) / 0.75, 0, 1) ** 1.7).astype(np.float32)
VIG = np.clip(VIG, 0.18, 1.0)[..., None]

SCAN = (1.0 - 0.035 * (np.sin(np.arange(CH, dtype=np.float32) * math.pi * 2 / 3.0) * 0.5 + 0.5)
        ).astype(np.float32)[:, None, None]


def _noise_field(seed, scale):
    r = np.random.default_rng(seed)
    small = r.standard_normal((scale, int(scale * CW / CH))).astype(np.float32)
    im = Image.fromarray(((small - small.min()) / (small.max() - small.min()) * 255).astype(np.uint8))
    im = im.resize((CW, CH), Image.BICUBIC).filter(ImageFilter.GaussianBlur(4))
    a = np.asarray(im, np.float32) / 255.0
    return (a - a.mean())[..., None]


HAZE1 = _noise_field(11, 24)
HAZE2 = _noise_field(12, 60)

GRAIN = []
_r = np.random.default_rng(5)
for i in range(6):
    g = _r.standard_normal((CH // 2, CW // 2)).astype(np.float32)
    GRAIN.append(np.repeat(np.repeat(g, 2, axis=0), 2, axis=1)[..., None] * 0.010)


def _bokeh(r=26, seed=3):
    rr = np.random.default_rng(seed)
    n = r * 2 + 1
    y, x = np.mgrid[0:n, 0:n].astype(np.float32)
    d = np.sqrt((x - r) ** 2 + (y - r) ** 2) / r
    disc = np.clip(1 - (d - 0.72) / 0.28, 0, 1) ** 1.4
    disc *= 0.55 + 0.45 * np.clip(d / 0.85, 0, 1)      # bright rim
    return disc.astype(np.float32)


BOKEH = _bokeh()

# ---------------------------------------------------------------- particles
def make_particles(n, seed, depth=(0.3, 1.0)):
    r = np.random.default_rng(seed)
    return dict(x=r.random(n), y=r.random(n),
                d=r.uniform(*depth, n), s=r.uniform(0.4, 1.0, n),
                p=r.random(n) * 6.283,
                vx=r.uniform(-0.006, 0.006, n), vy=r.uniform(-0.02, -0.004, n))


DUST_A = make_particles(90, 21)
DUST_B = make_particles(140, 22, (0.5, 1.4))
EMBERS = make_particles(120, 23, (0.4, 1.2))


def draw_particles(img, parts, t, t0, colour, gain=0.5, motion=(0.0, -1.0), radius=1.0, wrap=True):
    """Additive motes. Vectorised where it matters, stamped where it's cheap."""
    n = len(parts["x"])
    age = t - t0
    x = parts["x"] + parts["vx"] * age * motion[0] * 6 + 0.012 * np.sin(age * 0.7 + parts["p"])
    y = parts["y"] + parts["vy"] * age * motion[1] * 3.2
    if wrap:
        x = np.mod(x, 1.0)
        y = np.mod(y, 1.0)
    px = (x * (CW - 1)).astype(np.int32)
    py = (y * (CH - 1)).astype(np.int32)
    for i in range(n):
        d = parts["d"][i]
        rad = max(1, int(radius * parts["s"][i] * (1.0 + d * 2.0)))
        if px[i] < rad or px[i] > CW - rad - 1 or py[i] < rad or py[i] > CH - rad - 1:
            continue
        tw = 0.45 + 0.55 * (0.5 + 0.5 * math.sin(age * (1.6 + d * 2.4) + parts["p"][i]))
        a = gain * tw * (0.35 + 0.65 * d)
        if rad <= 1:
            img[py[i], px[i]] += colour * a
        else:
            spr = BOKEH if rad > 4 else None
            k = rad
            if spr is not None:
                sub = np.asarray(Image.fromarray((spr * 255).astype(np.uint8)).resize((2 * k + 1, 2 * k + 1),
                                                                                       Image.BILINEAR), np.float32) / 255
            else:
                yy, xx = np.mgrid[-k:k + 1, -k:k + 1]
                sub = np.clip(1 - np.sqrt(xx ** 2 + yy ** 2) / (k + 0.5), 0, 1) ** 1.6
            img[py[i] - k:py[i] + k + 1, px[i] - k:px[i] + k + 1] += (sub[..., None] * colour * a)


# ---------------------------------------------------------------- traffic
TRAFFIC = dict(
    lanes=[(0.16, 0.055, 0.020), (0.24, -0.075, 0.014), (0.33, 0.045, 0.011),
           (0.42, 0.090, 0.008), (0.52, -0.050, 0.007), (0.61, 0.032, 0.005)],
    phase=[0.12, 0.63, 0.31, 0.87, 0.45, 0.72],
)


def draw_traffic(img, t, gain=0.6, palette=(CYAN, WARM), speed=1.0):
    """Streaking air traffic: the city keeps breathing."""
    for li, (ly, sp, sz) in enumerate(TRAFFIC["lanes"]):
        length = int(28 + 44 * abs(sp) * 12)
        n = 3
        for k in range(n):
            ph = (TRAFFIC["phase"][li] + k / n + t * sp * speed) % 1.0
            x = int(ph * (CW + 400)) - 200
            yy = int(ly * CH + 6 * math.sin(t * 0.6 + li + k))
            col = palette[(li + k) % len(palette)]
            for o in range(length):
                xx = x - o * (1 if sp > 0 else -1)
                if 0 <= xx < CW and 0 <= yy < CH:
                    a = gain * (1 - o / length) ** 2.2 * sz / 0.02
                    img[yy, xx] += col * a * 0.9
                    if 0 <= yy - 1 < CH:
                        img[yy - 1, xx] += col * a * 0.25
                    if yy + 1 < CH:
                        img[yy + 1, xx] += col * a * 0.25


# ---------------------------------------------------------------- light
def godrays(img, t, colour=WARM, gain=0.16, cx=0.86, cy=-0.05, spokes=11, sway=0.15):
    ox = (cx - 0.5) * (CW / CH)
    ang = np.arctan2(GY - cy, (GX - 0.5) * (CW / CH) - ox)
    r = np.sqrt(((GX - 0.5) * (CW / CH) - ox) ** 2 + (GY - cy) ** 2)
    m = np.sin(ang * spokes + math.sin(t * 0.21) * sway * 4) * 0.5 + 0.5
    m = m.astype(np.float32) ** 3.2
    fall = np.exp(-r * 1.55).astype(np.float32)
    img += (m * fall)[..., None] * colour * gain


def haze(img, t, gain=0.05, drift=0.02, seed=0):
    f = HAZE1 if seed == 0 else HAZE2
    ox = int(t * drift * CW) % CW
    oy = int(t * drift * CH * 0.6) % CH
    img += np.roll(np.roll(f, ox, axis=1), oy, axis=0) * gain


def glow_at(img, cx, cy, radius, colour, gain):
    """Additive radial glow, in normalised coords."""
    x0 = max(0, int((cx - radius) * CW)); x1 = min(CW, int((cx + radius) * CW))
    y0 = max(0, int((cy - radius) * CH)); y1 = min(CH, int((cy + radius) * CH))
    if x1 <= x0 or y1 <= y0:
        return
    yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
    d = np.sqrt(((xx / CW - cx) * (CW / CH)) ** 2 + (yy / CH - cy) ** 2)
    m = np.clip(1 - d / radius, 0, 1) ** 2.6
    img[y0:y1, x0:x1] += m[..., None] * colour * gain


# ---------------------------------------------------------------- damage
def glitch(img, t, amount=1.0, seed=0):
    r = np.random.default_rng(int(t * 1000) + seed * 7919)
    out = img
    n = int(3 + 6 * amount)
    for _ in range(n):
        y0 = int(r.random() * CH)
        h = max(2, int(r.random() * 26 * amount))
        sh = int((r.random() - 0.5) * 90 * amount)
        out[y0:y0 + h] = np.roll(out[y0:y0 + h], sh, axis=1)
    # channel split
    sh = int(2 + 7 * amount)
    out[..., 0] = np.roll(out[..., 0], sh, axis=1)
    out[..., 2] = np.roll(out[..., 2], -sh, axis=1)
    # block tearing
    for _ in range(int(2 * amount)):
        y0 = int(r.random() * CH); h = int(10 + r.random() * 60)
        x0 = int(r.random() * CW); w = int(60 + r.random() * 320)
        blk = out[y0:y0 + h, x0:x0 + w].copy()
        out[y0:y0 + h, x0:x0 + w] = np.clip(blk * r.uniform(0.3, 1.8) +
                                            np.array([0, 40, 70], np.float32) * r.random(), 0, 4)
    return out


def grade(img, exposure=1.0, contrast=1.06, tint=np.array([1, 1, 1], np.float32),
          lift=0.0, sat=1.0, black=0.0):
    img *= exposure
    if sat != 1.0:
        lum = img.mean(axis=2, keepdims=True)
        img += (img - lum) * (sat - 1.0)
    img *= tint
    img += lift
    if black:
        np.subtract(img, black, out=img)
    if contrast != 1.0:
        img *= contrast
        img += -(contrast - 1.0) * 0.5
    return img


# =============================================================== typography
def text_layer(body, size, colour, font="Inter-SemiBold.ttf", tracking=0,
               glow=None, glow_r=18, glow_gain=1.0, shadow=True, align="c",
               mono=False, italic_shift=0):
    """Render one line into a full-frame RGBA layer (cached by the caller)."""
    f = fnt(font, size)
    tracking = tracking or max(0, int(size * (0.10 if mono else 0.055)))
    widths = [f.getlength(ch) for ch in body]
    total = sum(widths) + tracking * (len(body) - 1)
    pad = int(glow_r * 3 + 24)
    lw, lh = int(total) + pad * 2, int(size * 1.9) + pad * 2
    lay = Image.new("RGBA", (lw, lh), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    x = pad
    for ch, w in zip(body, widths):
        if shadow:
            d.text((x + max(1, size // 22), pad + size * 0.32 + max(1, size // 22)), ch,
                   font=f, fill=(0, 0, 0, 190))
        d.text((x, pad + size * 0.32), ch, font=f, fill=colour + (255,))
        x += w + tracking
    if shadow:
        sh = lay.filter(ImageFilter.GaussianBlur(size * 0.09))
        lay = Image.alpha_composite(sh, lay)
    if glow is not None:
        g = Image.new("RGBA", lay.size, (0, 0, 0, 0))
        g.paste(Image.new("RGBA", lay.size, glow + (255,)), (0, 0), lay)
        g = g.filter(ImageFilter.GaussianBlur(glow_r))
        if glow_gain != 1.0:
            arr = np.asarray(g, np.float32)
            arr[..., 3] *= glow_gain
            g = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
        lay = Image.alpha_composite(g, lay)
    return lay


def paste_rgba(dst_arr, layer, cx, cy, alpha=1.0, scale=1.0):
    """Composite a text layer onto a float RGB array, additive-ish over blacks."""
    if alpha <= 0.003:
        return
    if scale != 1.0:
        layer = layer.resize((max(1, int(layer.width * scale)), max(1, int(layer.height * scale))),
                             Image.BILINEAR)
    arr = np.asarray(layer, np.float32) / 255.0
    a = arr[..., 3:4] * alpha
    rgb = arr[..., :3]
    x0 = int(cx - layer.width / 2); y0 = int(cy - layer.height / 2)
    x1, y1 = x0 + layer.width, y0 + layer.height
    sx0, sy0 = max(0, -x0), max(0, -y0)
    x0, y0 = max(0, x0), max(0, y0)
    x1, y1 = min(CW, x1), min(CH, y1)
    if x1 <= x0 or y1 <= y0:
        return
    sub_a = a[sy0:sy0 + (y1 - y0), sx0:sx0 + (x1 - x0)]
    sub_c = rgb[sy0:sy0 + (y1 - y0), sx0:sx0 + (x1 - x0)]
    region = dst_arr[y0:y1, x0:x1]
    region *= (1 - sub_a)
    region += sub_c * sub_a


_TEXT_CACHE = {}


def text(body, size, colour, **kw):
    key = (body, size, tuple(colour), tuple(sorted(kw.items(), key=lambda kv: kv[0])))
    if key not in _TEXT_CACHE:
        _TEXT_CACHE[key] = text_layer(body, size, tuple(colour), **kw)
    return _TEXT_CACHE[key]


# =============================================================== shot lookup
def shot_at(t):
    for sh in S.SHOTS:
        if sh["t0"] <= t < sh["t1"]:
            return sh
    return S.SHOTS[-1]


def cam_state(sh, t):
    p = (t - sh["t0"]) / max(1e-6, sh["t1"] - sh["t0"])
    m = sh.get("move") or dict(cx0=.5, cy0=.5, z0=.6, cx1=.5, cy1=.5, z1=.6, ease="io")
    e = EASES[m["ease"]](p)
    cx = m["cx0"] + (m["cx1"] - m["cx0"]) * e
    cy = m["cy0"] + (m["cy1"] - m["cy0"]) * e
    z = m["z0"] + (m["z1"] - m["z0"]) * e
    # handheld breathing: always alive, scaled by how tense the scene is
    jx = smoothnoise(t * 1.0, 3, 1.0) * 2.2 + smoothnoise(t * 2.7, 4, 1.0) * 0.7
    jy = smoothnoise(t * 0.9, 5, 1.0) * 2.0 + smoothnoise(t * 3.1, 6, 1.0) * 0.6
    roll = smoothnoise(t * 0.5, 7, 1.0) * 0.22
    return cx, cy, z, roll, jx, jy


# =============================================================== frames
def base_frame(sh, t):
    """The photographic layer for one shot."""
    fxs = set(sh.get("fx", []))
    if "black_hold" in fxs:
        return np.zeros((CH, CW, 3), np.float32)
    if "blackout" in fxs:
        # the frame holds on the switch, flashes, then dies to black
        p = t - sh["t0"]
        if p > 1.5:
            return np.zeros((CH, CW, 3), np.float32)
        a = camera(plate(sh["plate"]), 0.54, 0.50, 0.44 + 0.10 * p)
        a = np.asarray(a, np.float32) / 255.0
        a *= max(0.0, 1.0 - p / 1.35) ** 1.0
        a *= 1.5
        a += (0.9, 0.55, 0.55) if p < 0.10 else 0
        glow_at(a, 0.54, 0.50, 0.55, RED, max(0.0, 0.5 - p * 0.5))
        if p < 0.55:
            glitch(a, t + 31, 0.5 * (1 - p / 0.55))
        a *= max(0.0, 1.0 - p / 1.35) ** 1.1
        a *= VIG
        a += GRAIN[int(t * FPS) % len(GRAIN)]
        return a

    name = sh["plate"]
    im = plate(name)
    cx, cy, z, roll, jx, jy = cam_state(sh, t)

    if "shake" in fxs:
        amp = 7 if "whip" not in fxs else 18
        jx += smoothnoise(t, 11, 9.0) * amp
        jy += smoothnoise(t, 12, 9.5) * amp
        roll += smoothnoise(t, 13, 7.0) * 0.8
    if "shake_soft" in fxs:
        jx += smoothnoise(t, 14, 4.0) * 2.0
        jy += smoothnoise(t, 15, 4.5) * 2.0

    img = camera(im, cx, cy, z, roll, jx, jy)
    a = np.asarray(img, np.float32) / 255.0

    # ---------------- per-scene light --------------------------------
    if "warm_sun" in fxs:
        grade(a, exposure=1.06, contrast=1.07, tint=np.array([1.04, 1.0, 0.95], np.float32), sat=1.06)
        godrays(a, t, WARM, 0.13, 0.9, -0.08, 13)
        haze(a, t, 0.035, 0.02)
    if "aerial_haze" in fxs:
        haze(a, t, 0.055, 0.025)
        grade(a, exposure=1.02, contrast=1.05, tint=np.array([0.97, 1.0, 1.05], np.float32))
    if "red_wash" in fxs:
        k = 1.0
        if "billboard_pulse" in fxs and name.startswith("06"):
            k = 0.85 + 0.15 * math.sin(t * 3.4)
        a *= np.array([1.16, 0.86, 0.88], np.float32) * k
        a += np.array([0.05, 0.0, 0.012], np.float32) * k
        grade(a, contrast=1.10, sat=1.10)
    if "red_creep" in fxs:
        # the blue in the room turns to red across the shot
        p = ease_io((t - sh["t0"]) / max(0.01, sh["t1"] - sh["t0"]))
        a *= (1 - p) + p * np.array([1.40, 0.62, 0.66], np.float32)
        a += p * np.array([0.06, 0.0, 0.01], np.float32)
    if "red_key" in fxs:
        a *= np.array([1.12, 0.90, 0.92], np.float32)
        glow_at(a, 0.70, 0.52, 0.42, RED, 0.16 + 0.05 * math.sin(t * 2.2))
    if "lab_haze" in fxs:
        haze(a, t, 0.030, 0.012, 1)
        glow_at(a, 0.44, 0.44, 0.55, CYAN, 0.05)

    # ---------------- particles --------------------------------------
    if "dust" in fxs or "lab_haze" in fxs:
        draw_particles(a, DUST_A, t, sh["t0"], np.array([0.55, 0.85, 1.0], np.float32), 0.22, radius=1.4)
    if "traffic" in fxs:
        draw_traffic(a, t, 0.55)
    if "traffic_low" in fxs:
        draw_traffic(a, t, 0.20)
    if "crowd" in fxs:
        draw_particles(a, DUST_B, t, sh["t0"], np.array([1.0, 0.70, 0.62], np.float32), 0.10, radius=2.0)
    if "chaos" in fxs:
        draw_particles(a, EMBERS, t, sh["t0"], np.array([1.0, 0.45, 0.16], np.float32), 0.34, radius=1.6)
    if "switch_hum" in fxs:
        glow_at(a, 0.72, 0.52, 0.30, RED, 0.10 + 0.05 * math.sin(t * 1.7))

    # ---------------- holographic overlays --------------------------
    if "holo_ui" in fxs:
        holo_ui(a, t, sh)
    if "holo_ring" in fxs:
        holo_ring(a, t)
    if "ai_eyes" in fxs:
        ai_eyes(a, t, name)
    if "scan" in fxs:
        band_y = (t * 0.22) % 1.0
        m = np.exp(-((GY - band_y) ** 2) / (2 * 0.035 ** 2)).astype(np.float32)
        a += m[..., None] * np.array([0.10, 0.35, 0.45], np.float32)
    if "monitor_wake" in fxs:
        p = ease_out((t - sh["t0"]) / 3.2)
        a *= (0.10 + 0.90 * p)
        glow_at(a, 0.33, 0.53, 0.34, np.array([0.45, 0.95, 1.0], np.float32), 0.10 * p)
        draw_particles(a, DUST_A, t, sh["t0"], np.array([0.55, 0.95, 1.0], np.float32), 0.30 * p, radius=1.3)
    if "stinger" in fxs:
        p = ease_out((t - sh["t0"]) / 0.5)
        a *= 1.0 + 0.5 * p * (1 - ease_out((t - sh["t0"]) / 1.6))
        glow_at(a, 0.35, 0.52, 0.30, np.array([1.0, 0.20, 0.24], np.float32), 0.26 * p)

    # ---------------- damage ----------------------------------------
    if "strobe" in fxs:
        a *= 0.55 + 0.45 * (1 if int(t * 8) % 2 else 0.25)
    if "glitch" in fxs:
        k = 0.5 + 0.5 * math.sin(t * 7.0) ** 2
        if (int(t * 6) % 5) < 2:
            glitch(a, t, 0.16 + 0.26 * k)
        if "red_warning" in fxs:
            a *= np.array([1.30, 0.72, 0.74], np.float32)
    if "eye_push" in fxs:
        grade(a, contrast=1.14, sat=0.94)
        a *= np.array([1.05, 0.99, 1.01], np.float32)

    # ---------------- grade + finish --------------------------------
    a *= VIG
    a *= SCAN
    a += GRAIN[int(t * FPS) % len(GRAIN)]
    return a


def holo_ui(a, t, sh):
    """Floating translucent interface frames over the lab table."""
    r = np.random.default_rng(31)
    for i in range(5):
        bx = 0.18 + 0.13 * i + 0.004 * math.sin(t * 0.9 + i)
        by = 0.30 + 0.05 * math.sin(t * 0.7 + i * 1.7)
        w, h = 0.075, 0.10 + 0.03 * ((i * 7) % 3)
        x0, x1 = int((bx - w / 2) * CW), int((bx + w / 2) * CW)
        y0, y1 = int((by - h / 2) * CH), int((by + h / 2) * CH)
        if x1 <= x0 or y1 <= y0:
            continue
        flick = 0.75 + 0.25 * math.sin(t * (3 + i) + i)
        col = np.array([0.25, 0.85, 1.0], np.float32) * 0.30 * flick
        a[y0:y0 + 1, x0:x1] += col
        a[y1 - 1:y1, x0:x1] += col
        a[y0:y1, x0:x0 + 1] += col
        a[y0:y1, x1 - 1:x1] += col
        # scanlines inside the panel
        for yy in range(y0 + 3, y1 - 2, 4):
            a[yy:yy + 1, x0 + 2:x1 - 2] += col * 0.28
        # a data bar that sweeps
        bar = y0 + int(((t * 0.35 + i * 0.21) % 1.0) * (y1 - y0))
        a[bar:bar + 2, x0 + 2:x1 - 2] += np.array([0.5, 0.95, 1.0], np.float32) * 0.35


def holo_ring(a, t):
    cx, cy, rad = 0.50, 0.52, 0.16
    for k in range(3):
        rr = rad * (0.8 + 0.25 * k) * (1 + 0.03 * math.sin(t * 1.3 + k))
        d = np.sqrt(((GX - cx) * (CW / CH)) ** 2 + (GY - cy) ** 2)
        m = np.exp(-((d - rr) ** 2) / (2 * 0.0016)).astype(np.float32)
        a += m[..., None] * np.array([0.20, 0.75, 1.0], np.float32) * (0.14 - k * 0.03)


def ai_eyes(a, t, name):
    if not name.startswith("03"):
        return
    pulse = 0.72 + 0.28 * math.sin(t * 2.1) + 0.06 * math.sin(t * 11.0)
    for (ex, ey, rad) in ((0.415, 0.355, 0.16), (0.665, 0.325, 0.16)):
        glow_at(a, ex, ey, rad, RED, 0.42 * pulse)
        glow_at(a, ex, ey, rad * 0.30, np.array([1.0, 0.55, 0.45], np.float32), 0.55 * pulse)


# =============================================================== title / end cards
def title_card(t):
    """Cold open: the city, the location, the name, the cursor."""
    im = plate("01_city_wide")
    cx = 0.5 + 0.03 * ease_io(t / 7.0)
    img = camera(im, cx, 0.5, 0.86 - 0.06 * ease_io(t / 7.0))
    a = np.asarray(img, np.float32) / 255.0
    a *= 0.42
    a *= np.array([0.72, 0.86, 1.02], np.float32)
    # slow darkening so the type can breathe
    a *= (1 - 0.35 * ease_io((t - 2.0) / 4.0))
    godrays(a, t, np.array([0.35, 0.75, 1.0], np.float32), 0.10, 0.5, 1.05, 9, 0.08)
    draw_particles(a, DUST_A, t, 0.0, np.array([0.6, 0.9, 1.0], np.float32), 0.22, radius=1.3)
    a *= VIG
    a *= SCAN
    a += GRAIN[int(t * FPS) % len(GRAIN)]
    return a


def end_card(t):
    """After the blackout the world restarts: a slow zoom out of the city at night."""
    tt = t - 180.0
    im = plate("01_city_wide")
    z = 0.92 - 0.10 * ease_out(tt / 10.0)
    img = camera(im, 0.50, 0.46, z)
    a = np.asarray(img, np.float32) / 255.0
    a *= 0.30 + 0.10 * ease_out(tt / 4.0)
    a *= np.array([0.62, 0.80, 1.05], np.float32)
    godrays(a, t, np.array([0.35, 0.70, 1.0], np.float32), 0.07, 0.5, 1.05, 9, 0.06)
    draw_traffic(a, t, 0.20, (CYAN, np.array([1.0, 0.92, 0.75], np.float32)))
    draw_particles(a, DUST_A, t, 180.0, np.array([0.65, 0.90, 1.0], np.float32), 0.24, radius=1.3)
    haze(a, t, 0.040, 0.012)
    # a soft band of light behind the type
    glow_at(a, 0.5, 0.33, 0.62, np.array([0.10, 0.25, 0.40], np.float32), 0.55)
    a *= VIG
    a *= SCAN
    a += GRAIN[int(t * FPS) % len(GRAIN)]
    return a


# =============================================================== the text track
def draw_slates(arr, t):
    for sl in S.SLATES:
        if not (sl["t0"] <= t <= sl["t1"]):
            continue
        p = (t - sl["t0"])
        fade_in = ease_out(p / 0.55)
        fade_out = 1 - ease_in(max(0.0, (t - (sl["t1"] - 0.5))) / 0.5)
        al = fade_in * fade_out
        # left-aligned lower-third slate: never fights the plate's own signage
        x0 = CW * 0.075
        k = text(sl["kicker"], 24, (150, 240, 255), glow=(40, 160, 210), glow_r=12,
                 tracking=int(24 * 0.34), glow_gain=1.1)
        paste_rgba(arr, k, x0 + k.width / 2, CH * 0.615 - 6 * (1 - fade_in), al * 0.92)
        # rule, growing to the right
        w = int(CW * 0.14 * ease_out(p / 0.8))
        if w > 2 and al > 0.05:
            y0 = int(CH * 0.615) + 14
            arr[y0:y0 + 2, int(x0):int(x0) + w] += CYAN * 0.40 * al
        tl = text(sl["title"], 62, (255, 255, 255), font="Orbitron-Bold.ttf",
                  glow=(20, 120, 180), glow_r=26, tracking=int(62 * 0.10))
        slide = 26 * (1 - fade_in)
        paste_rgba(arr, tl, x0 + tl.width / 2 + slide, CH * 0.615 + 56, al)
        break


def draw_screen_text(arr, t):
    for tx in S.SCREEN_TEXT:
        if not (tx["t0"] <= t <= tx["t1"]):
            continue
        kind = tx["kind"]
        p = t - tx["t0"]
        al = min(1.0, p / 0.35) * min(1.0, (tx["t1"] - t) / 0.35)
        if tx.get("blink"):
            al *= 0.55 + 0.45 * (1 if int(t * 3) % 2 else 0.15)
        body = tx["text"]
        if kind == "loc":
            al *= 0.9
            lay = text(body, 34, (200, 240, 255), font="Orbitron-Medium.ttf",
                       glow=(30, 140, 200), glow_r=14, tracking=int(34 * 0.42))
            paste_rgba(arr, lay, tx["x"] * CW, tx["y"] * CH + 150, al * ease_out(p / 1.4))
            continue
        if kind in ("hud",):
            col = (170, 255, 235) if tx.get("greenish") else (170, 245, 255)
            lay = text(body, 30, col, font="JetBrainsMono-Bold.ttf", glow=(20, 170, 200),
                       glow_r=14, tracking=int(30 * 0.22))
            paste_rgba(arr, lay, tx["x"] * CW, tx["y"] * CH, al)
            continue
        if kind == "warn":
            size = 30 if tx.get("small") else (46 if not tx.get("big") else 64)
            col = (255, 236, 236)
            lay = text(body, size, col, font="JetBrainsMono-Bold.ttf", glow=(230, 30, 30),
                       glow_r=20, tracking=int(size * 0.16), glow_gain=1.2)
            if tx.get("glitch"):
                g = np.asarray(lay, np.float32)
                g[..., 0] = np.roll(g[..., 0], 3, axis=1)
                lay = Image.fromarray(np.clip(g, 0, 255).astype(np.uint8))
            paste_rgba(arr, lay, tx["x"] * CW, tx["y"] * CH, al)
            continue
        # ai voice / caption-in-world
        if kind == "ai":
            size = 62 if tx.get("big") else 36
            lay = text(body, size, (255, 232, 232), font="Orbitron-Bold.ttf", glow=(255, 24, 24),
                       glow_r=24, tracking=int(size * 0.10), glow_gain=1.25)
            if tx.get("glitch") and (int(t * 5) % 4) < 2:
                g = np.asarray(lay, np.float32)
                for ch, sh in ((0, 5), (2, -5)):
                    g[..., ch] = np.roll(g[..., ch], sh, axis=1)
                lay = Image.fromarray(np.clip(g, 0, 255).astype(np.uint8))
            paste_rgba(arr, lay, tx["x"] * CW, tx["y"] * CH, al)


def draw_captions(arr, t):
    for (t0, t1, speaker, body) in S.CAPTIONS:
        if not (t0 - 0.15 <= t <= t1 + 0.45):
            continue
        al = min(1.0, (t - t0 + 0.15) / 0.30) * min(1.0, (t1 + 0.45 - t) / 0.45)
        sp = S.SPEAKERS[speaker]
        # speaker tag
        lab = text(sp["label"], 22, sp["color"], font="JetBrainsMono-Bold.ttf",
                   glow=tuple(int(c * 0.55) for c in sp["color"]), glow_r=10,
                   tracking=int(22 * 0.30), shadow=False)
        paste_rgba(arr, lab, CW * 0.5, CH - 152, al * 0.9)
        # line, wrapped to two lines if needed
        words = body.split()
        lines, cur = [], ""
        max_w = CW * 0.78
        fnt_obj = fnt("Inter-SemiBold.ttf", 40)
        for w in words:
            trial = (cur + " " + w).strip()
            if fnt_obj.getlength(trial) < max_w or not cur:
                cur = trial
            else:
                lines.append(cur); cur = w
        if cur:
            lines.append(cur)
        if len(lines) > 2:
            mid = len(lines) // 2
            lines = [" ".join(lines[:mid]), " ".join(lines[mid:])]
        y = CH - 96 if len(lines) == 1 else CH - 118
        for ln in lines:
            lay = text(ln, 40, (244, 250, 255), font="Inter-SemiBold.ttf",
                       glow=(10, 40, 70), glow_r=16, tracking=int(40 * 0.02))
            paste_rgba(arr, lay, CW * 0.5, y, al)
            y += 52
        break


def draw_title(arr, t):
    """THE LAST HUMAN CLICK reveal during the cold open."""
    if t < 2.0:
        return
    p = t - 2.0
    al = ease_out(p / 1.1)
    # location line
    loc = text(S.LOCATION, 30, (190, 235, 255), font="Orbitron-Medium.ttf",
               glow=(20, 140, 200), glow_r=14, tracking=int(30 * 0.44))
    paste_rgba(arr, loc, CW * 0.5, CH * 0.315 - 10 * (1 - al), al * 0.9)
    # main title, letter-spaced, chromatic
    t1 = text("THE LAST", 96, (235, 244, 255), font="Orbitron-Bold.ttf",
              glow=(20, 110, 170), glow_r=30, tracking=int(96 * 0.16))
    t2 = text("HUMAN CLICK", 150, (255, 255, 255), font="Orbitron-Black.ttf",
              glow=(30, 200, 255), glow_r=40, tracking=int(150 * 0.05), glow_gain=1.2)
    s1 = 0.985 + 0.015 * ease_out(p / 2.2)
    sc = 1.0 + 0.012 * ease_out(p / 2.4)
    paste_rgba(arr, t1, CW * 0.5, CH * 0.395, al * 0.96, scale=s1)
    if al > 0.02:
        # chromatic ghost on the big word
        for ch, dx, colmul in (("r", -5, (1, 0.25, 0.3)), ("b", 5, (0.3, 0.7, 1))):
            pass
    paste_rgba(arr, t2, CW * 0.5, CH * 0.552, al, scale=sc)
    # underline sweep
    w = int(CW * 0.30 * ease_out((p - 0.6) / 1.0))
    if w > 2:
        y0 = int(CH * 0.552 + 104)
        arr[y0:y0 + 2, CW // 2 - w // 2:CW // 2 + w // 2] += CYAN * 0.55
        arr[y0 + 3:y0 + 4, CW // 2 - w // 3:CW // 2 + w // 3] += CYAN * 0.20
    # subtitle
    sub = text(S.SUBTITLE, 26, (160, 205, 235), font="Orbitron-Medium.ttf",
               tracking=int(26 * 0.46), glow=(10, 60, 100), glow_r=10)
    paste_rgba(arr, sub, CW * 0.5, CH * 0.845 + 6 * (1 - ease_out((p - 0.8) / 0.8)),
               ease_out((p - 0.8) / 0.8) * 0.85)

    # the click: a glowing cursor arrives at 4.6s and clicks at 5.2s
    if t > 4.0:
        cp = ease_out((t - 4.0) / 1.1)
        cx = CW * 0.5 + (CW * 0.205) * (1 - cp) + 8
        cy = CH * 0.552 + 44 + (90) * (1 - cp)
        click = 1.0 if t > 5.2 else 0.0
        ring_r = (t - 5.2) * 900 if click else 0
        if click and ring_r < 320:
            d = np.sqrt(((GX - cx / CW) * (CW / CH)) ** 2 + (GY - cy / CH) ** 2)
            m = np.exp(-((d - ring_r / CW) ** 2) / (2 * 0.006 ** 2)).astype(np.float32)
            arr += m[..., None] * CYAN * 0.35 * max(0.0, 1 - ring_r / 320)
        draw_cursor(arr, cx, cy, 1.0 if not click else 0.75 + 0.25 * math.cos((t - 5.2) * 20), ease_out((t - 4.0) / 0.5))


def draw_cursor(arr, x, y, alpha, grow=1.0):
    """The last human click: a hand-drawn arrow pointer with a soft glow."""
    pts = [(0, 0), (0, 30), (8, 23), (14, 36), (20, 33), (14, 20), (24, 19)]
    k = 1.55 * grow
    poly = np.array([(x + px * k, y + py * k) for px, py in pts], np.float32)
    yy, xx = np.mgrid[0:CH, 0:CW]
    mask = np.zeros((CH, CW), np.float32)
    # scanline polygon fill (cheap and exact enough for a 7-gon)
    for i in range(len(poly)):
        x0, y0 = poly[i]
        x1, y1 = poly[(i + 1) % len(poly)]
        if y0 == y1:
            continue
        for yline in range(int(min(y0, y1)), int(max(y0, y1)) + 1):
            if 0 <= yline < CH:
                xa = x0 + (x1 - x0) * (yline - y0) / (y1 - y0)
                xb = x0
                mask[yline, int(min(xa, xb)):int(max(xa, xb)) + 1] = 1
    glow = np.asarray(Image.fromarray((mask * 255).astype(np.uint8)).filter(
        ImageFilter.GaussianBlur(14)), np.float32) / 255
    arr += glow[..., None] * CYAN * 0.45 * alpha
    inner = mask > 0
    arr[inner] = arr[inner] * 0.25 + np.array([0.92, 0.98, 1.0], np.float32) * 0.85 * alpha


def draw_end_card_text(arr, t):
    tt = t - 180.0
    al = ease_out((tt - 0.4) / 1.2)
    if al <= 0:
        return
    # darken behind the type so it reads over the city
    shade = np.exp(-(((GX - 0.5) * 1.55) ** 2 + ((GY - 0.46) * 1.9) ** 2)).astype(np.float32)
    arr *= (1 - 0.72 * shade)[..., None]

    a0 = ease_out((tt - 0.2) / 1.0)
    if a0 > 0:
        kick = text("A  CINEMATIC  TECH  ANIMATION", 22, (150, 225, 255),
                    font="Orbitron-Medium.ttf", tracking=int(22 * 0.44),
                    glow=(20, 130, 190), glow_r=12)
        paste_rgba(arr, kick, CW * 0.5, CH * 0.245, a0 * 0.9)
    a1 = text("THE LAST HUMAN CLICK", 64, (255, 255, 255), font="Orbitron-Bold.ttf",
              glow=(20, 150, 220), glow_r=30, tracking=int(64 * 0.16))
    paste_rgba(arr, a1, CW * 0.5, CH * 0.335, al * 0.97)
    w = int(CW * 0.26 * ease_out((tt - 1.2) / 1.2))
    if w > 2:
        y0 = int(CH * 0.335 + 62)
        arr[y0:y0 + 2, CW // 2 - w // 2:CW // 2 + w // 2] += CYAN * 0.55
        arr[y0 + 4:y0 + 5, CW // 2 - w // 3:CW // 2 + w // 3] += CYAN * 0.18
    a2 = ease_out((tt - 1.8) / 1.4)
    if a2 > 0:
        msg = text(S.TAGLINE, 50, (240, 249, 255), font="Inter-SemiBold.ttf",
                   glow=(30, 130, 190), glow_r=24, tracking=int(50 * 0.01))
        paste_rgba(arr, msg, CW * 0.5, CH * 0.50, a2)
    a3 = ease_out((tt - 3.6) / 1.6)
    if a3 > 0:
        credit = text("WRITTEN, VOICED, SCORED & RENDERED IN CODE", 20, (165, 205, 232),
                      font="JetBrainsMono-Medium.ttf", tracking=int(20 * 0.34),
                      glow=(10, 60, 95), glow_r=10)
        paste_rgba(arr, credit, CW * 0.5, CH * 0.66, a3 * 0.95)
        tag = text("A  KINGDOM  BIBLE  STUDIO  SHORT", 19, (135, 175, 205),
                   font="Orbitron-Medium.ttf", tracking=int(19 * 0.40))
        paste_rgba(arr, tag, CW * 0.5, CH * 0.735, a3 * 0.85)
    # the click comes back one last time: a blinking caret after the message
    if tt > 6.0:
        b = 0.5 + 0.5 * math.cos((tt - 6.0) * 3.4)
        cx = int(CW * 0.5)
        cy = int(CH * 0.50)
        arr[cy - 26:cy + 26, cx - 9:cx - 5] += CYAN * 0.55 * b
        arr[cy - 26:cy + 26, cx + 5:cx + 9] += CYAN * 0.35 * b


# =============================================================== frame builder
TITLE_SHOTS = {(0.0, 7.0)}


def build_frame(t):
    sh = shot_at(t)
    fxs = set(sh.get("fx", []))
    if "end_card" in fxs:
        arr = end_card(t)
        draw_end_card_text(arr, t)
    else:
        arr = base_frame(sh, t)
        if sh["t0"] == 0.0:
            draw_title(arr, t)

    # dissolve in at the very start and out at the very end
    if t < 0.9:
        arr *= ease_io(t / 0.9)
    if t > S.END - 1.6:
        arr *= max(0.0, (S.END - t) / 1.6) ** 0.8

    # cross-dissolves at three key cuts
    for (tc, dur) in ((7.0, 0.7), (36.0, 0.6), (126.0, 0.5), (156.0, 0.4)):
        if tc < t < tc + dur:
            k = ease_io((t - tc) / dur)
            nxt = shot_at(tc + dur + 0.001)
            if nxt and nxt.get("plate") and nxt["t0"] == tc:
                a2 = base_frame(nxt, t)
                arr = arr * (1 - k) + a2 * k

    draw_slates(arr, t)
    draw_screen_text(arr, t)
    draw_captions(arr, t)

    # gate weave + final clamp
    wx = int(round(smoothnoise(t * 6, 17, 1.0) * 0.8))
    wy = int(round(smoothnoise(t * 5, 18, 1.0) * 0.8))
    if wx or wy:
        arr = np.roll(np.roll(arr, wx, axis=1), wy, axis=0)
    arr = np.clip(arr, 0, 1)
    arr = arr ** (1 / 1.06)          # gentle display gamma

    out = np.zeros((FH, FW, 3), np.uint8)
    out[BAR:BAR + CH] = (arr * 255).astype(np.uint8)
    return out


# =============================================================== main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--frames", default="")
    ap.add_argument("--out", default=os.path.join(BUILD, "video.mp4"))
    ap.add_argument("--from", dest="f0", type=float, default=0.0)
    ap.add_argument("--to", dest="f1", type=float, default=S.END)
    ap.add_argument("--audio", default=os.path.join(BUILD, "score.wav"))
    args = ap.parse_args()

    # sanity: shots must tile the timeline with no holes
    holes = []
    for sh in S.SHOTS:
        if abs(sh["t1"] - sh["t0"]) < 1e-6:
            holes.append(("zero", sh))
    for i in range(len(S.SHOTS) - 1):
        if abs(S.SHOTS[i]["t1"] - S.SHOTS[i + 1]["t0"]) > 1e-6:
            holes.append((S.SHOTS[i]["t1"], S.SHOTS[i + 1]["t0"]))
    if holes:
        print("WARNING: timeline gaps:", holes[:6])

    if args.frames:
        os.makedirs(os.path.join(BUILD, "peek"), exist_ok=True)
        for f in [int(x) for x in args.frames.split(",") if x.strip()]:
            t = f / FPS
            fr = build_frame(t)
            Image.fromarray(fr).save(os.path.join(BUILD, "peek", f"f{f:05d}.png"))
            print("peek", f, round(t, 2), "s")
        return

    import imageio_ffmpeg
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    n0, n1 = int(args.f0 * FPS), int(args.f1 * FPS)
    cmd = [ff, "-y", "-loglevel", "error",
           "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{FW}x{FH}", "-r", str(FPS), "-i", "-",
           "-ss", str(args.f0), "-t", str(args.f1 - args.f0), "-i", args.audio,
           "-map", "0:v", "-map", "1:a",
           "-vf", "hqdn3d=2:2:6:6,scale=out_color_matrix=bt709:out_range=tv",
           "-c:v", "libx264", "-preset", "slow", "-crf", "24",
           "-tune", "film", "-profile:v", "high", "-level", "4.2",
           "-pix_fmt", "yuv420p", "-colorspace", "bt709", "-color_primaries", "bt709",
           "-color_trc", "bt709", "-x264-params", "keyint=48:min-keyint=24:scenecut=0",
           "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
           "-movflags", "+faststart", "-shortest", args.out]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    frames = list(range(n0, n1))
    done = 0
    t_start = time.time()
    try:
        with ThreadPoolExecutor(max_workers=WORKERS) as ex:
            it = ex.map(lambda f: (f, build_frame(f / FPS)), frames, chunksize=2)
            for f, fr in it:
                p.stdin.write(fr.tobytes())
                done += 1
                if done % 96 == 0 or done == len(frames):
                    el = time.time() - t_start
                    pct = 100 * done / len(frames)
                    eta = el / done * (len(frames) - done)
                    print(f"  {done}/{len(frames)}  {pct:5.1f}%  t={f / FPS:6.2f}s  "
                          f"{el / done * 1000:5.0f} ms/f  eta {eta / 60:4.1f} min", flush=True)
    finally:
        p.stdin.close()
        p.wait()
    print("wrote", args.out, os.path.getsize(args.out) / 1e6, "MB")


if __name__ == "__main__":
    main()
