#!/usr/bin/env python3
"""
THE LAST HUMAN CLICK  -  poster + one-sheet + gallery.

Key art is taken from the film itself (the cold-open title beat) so the poster
can never drift from the finished look.

    python3 poster.py             poster + one-sheet
    python3 poster.py --gallery   also writes a scene contact sheet
"""
import os, sys
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import story as S
import render_video as R

BUILD = R.BUILD


def paste(canvas, layer, cx, cy, alpha=1.0):
    """Composite an RGBA layer onto any-size float canvas (0..1 RGB)."""
    if alpha <= 0.003:
        return
    arr = np.asarray(layer, np.float32) / 255.0
    a = arr[..., 3:4] * alpha
    rgb = arr[..., :3]
    H, W = canvas.shape[:2]
    x0 = int(cx - layer.width / 2); y0 = int(cy - layer.height / 2)
    x1, y1 = x0 + layer.width, y0 + layer.height
    sx0, sy0 = max(0, -x0), max(0, -y0)
    x0, y0 = max(0, x0), max(0, y0)
    x1, y1 = min(W, x1), min(H, y1)
    if x1 <= x0 or y1 <= y0:
        return
    sa = a[sy0:sy0 + (y1 - y0), sx0:sx0 + (x1 - x0)]
    sc = rgb[sy0:sy0 + (y1 - y0), sx0:sx0 + (x1 - x0)]
    reg = canvas[y0:y1, x0:x1]
    reg *= (1 - sa)
    reg += sc * sa


def key_art():
    """A real frame from the cold open, re-typed at poster scale."""
    fr = R.build_frame(4.05)
    a = np.asarray(fr, np.float32) / 255.0
    # cool the letterbox to deep navy rather than pure black
    a[:S.BAR] = np.array([0.012, 0.020, 0.035], np.float32)
    a[S.BAR + S.CH:] = np.array([0.012, 0.020, 0.035], np.float32)
    a = np.clip(a, 0, 1) ** (1 / 1.05)
    return Image.fromarray((a * 255).astype(np.uint8)), a


def one_sheet(_unused=None):
    """Tall key art: the city plate without its burned-in title, re-typed 2:3."""
    W, H = 1280, 1920
    bg = R.title_card(3.4) * np.array([0.95, 1.0, 1.05], np.float32)
    body = Image.fromarray((np.clip(bg, 0, 1) * 255).astype(np.uint8))
    scale = max(W / body.width, H / body.height) * 1.06
    body = body.resize((int(body.width * scale), int(body.height * scale)), Image.LANCZOS)
    x0 = (body.width - W) // 2
    y0 = int((body.height - H) * 0.42)
    crop = body.crop((x0, y0, x0 + W, y0 + H))
    a = np.asarray(crop, np.float32) / 255.0
    a *= np.array([0.80, 0.93, 1.06], np.float32)
    yy = np.linspace(0, 1, H, dtype=np.float32)[:, None, None]
    a *= 0.62 + 0.38 * (1 - yy)
    a += np.random.default_rng(4).standard_normal((H, W, 1)).astype(np.float32) * 0.022

    def put(txt, size, col, cx, cy, **kw):
        paste(a, R.text(txt, size, col, **kw), cx, cy, 1.0)

    put("A  CINEMATIC  TECH  ANIMATION", 24, (150, 225, 255), W * 0.5, 250,
        font="Orbitron-Medium.ttf", tracking=int(24 * 0.42), glow=(20, 130, 190), glow_r=14)
    put("THE LAST", 104, (235, 244, 255), W * 0.5, 420,
        font="Orbitron-Bold.ttf", tracking=int(104 * 0.14), glow=(20, 110, 170), glow_r=34)
    put("HUMAN", 186, (255, 255, 255), W * 0.5, 566,
        font="Orbitron-Black.ttf", tracking=int(186 * 0.055), glow=(30, 200, 255), glow_r=46)
    put("CLICK", 186, (255, 255, 255), W * 0.5, 742,
        font="Orbitron-Black.ttf", tracking=int(186 * 0.055), glow=(255, 36, 36), glow_r=46)
    w = int(W * 0.60)
    a[int(H * 0.412):int(H * 0.412) + 3, (W - w) // 2:(W + w) // 2] += R.CYAN * 0.65
    a[int(H * 0.412) + 7:int(H * 0.412) + 9, (W - int(w * 0.66)) // 2:(W + int(w * 0.66)) // 2] += R.CYAN * 0.28
    put("LAGOS  •  2099", 28, (195, 238, 255), W * 0.5, 880,
        font="Orbitron-Medium.ttf", tracking=int(28 * 0.44), glow=(20, 140, 200), glow_r=16)
    put(S.TAGLINE, 33, (243, 250, 255), W * 0.5, 1636,
        font="Inter-SemiBold.ttf", tracking=1, glow=(30, 130, 190), glow_r=24)
    put("A  KINGDOM  BIBLE  STUDIO  SHORT", 21, (155, 195, 225), W * 0.5, 1772,
        font="Orbitron-Medium.ttf", tracking=int(21 * 0.40), glow=(10, 60, 95), glow_r=12)
    a = np.clip(a, 0, 1) ** (1 / 1.12)
    return Image.fromarray((a * 255).astype(np.uint8))


def gallery():
    times = [3.2, 11.0, 25.5, 40.0, 49.0, 72.0, 84.0, 101.0, 121.0, 129.5, 145.0, 166.0]
    tw, th, cols = 640, 360, 4
    rows = (len(times) + cols - 1) // cols
    sheet = Image.new("RGB", (tw * cols, th * rows), (6, 10, 16))
    for i, t in enumerate(times):
        sheet.paste(Image.fromarray(R.build_frame(t)).resize((tw, th), Image.LANCZOS),
                    ((i % cols) * tw, (i // cols) * th))
    return sheet


if __name__ == "__main__":
    wide, arr = key_art()
    wide.save(os.path.join(BUILD, "poster.jpg"), quality=93)
    one_sheet(arr).save(os.path.join(BUILD, "poster_onesheet.jpg"), quality=93)
    print("poster + one-sheet written")
    if "--gallery" in sys.argv:
        gallery().save(os.path.join(BUILD, "gallery.jpg"), quality=90)
        print("gallery written")
