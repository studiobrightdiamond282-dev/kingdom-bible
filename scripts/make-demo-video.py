#!/usr/bin/env python3
"""Build the silent, captioned KINGDOM BIBLE product-preview MP4.

Asset generation only; the deployed app uses the committed MP4 and poster and does
not need Python. To regenerate locally: install Pillow + imageio-ffmpeg, then run
`python3 scripts/make-demo-video.py`.
"""
from __future__ import annotations

import math
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont
import imageio_ffmpeg

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "public" / "assets"
VIDEO = ASSETS / "kingdom-bible-product-preview.mp4"
POSTER = ASSETS / "kingdom-bible-product-preview.jpg"
WIDTH, HEIGHT, FPS = 1280, 720, 24
SCENE_SECONDS = 6.0
TRANSITION_SECONDS = 0.45

NAVY = (6, 16, 34)
PANEL = (13, 28, 52)
PANEL_2 = (17, 36, 64)
GOLD = (245, 215, 120)
GOLD_DARK = (195, 145, 22)
WHITE = (239, 244, 252)
MUTED = (157, 174, 199)
LINE = (43, 63, 91)
GREEN = (119, 205, 151)

FONT_PATHS = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
]
BOLD_PATHS = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf",
]

def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    paths = BOLD_PATHS if bold else FONT_PATHS
    for path in paths:
        if Path(path).exists():
            return ImageFont.truetype(path, size=size)
    return ImageFont.load_default()

FONTS = {
    "brand": font(21, True),
    "eyebrow": font(13, True),
    "title": font(48, True),
    "body": font(18),
    "small": font(12),
    "ui": font(13),
    "ui_bold": font(14, True),
    "ui_small": font(10),
    "ui_tiny": font(9, True),
}

SCENES = [
    {
        "eyebrow": "A QUIETER SPACE FOR SCRIPTURE",
        "title": ["A richer rhythm", "for the Word."],
        "body": ["Read, study and serve with tools", "made to work together."],
        "kind": "reader",
        "active": "Bible",
        "screen": "Read Scripture",
        "foot": "READ · STUDY · PRESENT",
    },
    {
        "eyebrow": "BIBLE READING",
        "title": ["Meet the passage", "where you are."],
        "body": ["Choose a book, chapter and translation.", "Save verses and notes as you read."],
        "kind": "reader",
        "active": "Bible",
        "screen": "Read Scripture",
        "foot": "YOUR READING SPACE",
    },
    {
        "eyebrow": "SEARCH + STUDY",
        "title": ["Find it. Understand", "it. Keep it."],
        "body": ["Search by word, phrase or reference.", "Explore context and related passages."],
        "kind": "study",
        "active": "Study",
        "screen": "Study with context",
        "foot": "FROM VERSE TO INSIGHT",
    },
    {
        "eyebrow": "PLANS + PRAYER",
        "title": ["Build a steady", "daily rhythm."],
        "body": ["Follow a reading plan, track today's", "progress and keep a private prayer journal."],
        "kind": "rhythm",
        "active": "Plans",
        "screen": "Reading plans",
        "foot": "A GENTLE DAILY RHYTHM",
    },
    {
        "eyebrow": "MINISTRY MODE",
        "title": ["Bring Scripture", "to the room."],
        "body": ["Prepare a clear audience display and", "control it from the presenter screen."],
        "kind": "ministry",
        "active": "Ministry",
        "screen": "Present Scripture",
        "foot": "PRESENTER + AUDIENCE VIEW",
    },
    {
        "eyebrow": "KINGDOM BIBLE PRO",
        "title": ["Tools for deeper", "study and ministry."],
        "body": ["Explore voice reading, focused study and", "hands-free presentation in one place."],
        "kind": "tools",
        "active": "Study",
        "screen": "Tools for the journey",
        "foot": "START YOUR 30-DAY FREE TRIAL",
    },
]


def make_background() -> Image.Image:
    base = Image.new("RGB", (WIDTH, HEIGHT), NAVY)
    px = base.load()
    for y in range(HEIGHT):
        t = y / max(1, HEIGHT - 1)
        c = tuple(round(NAVY[k] * (1 - t) + (10, 28, 52)[k] * t) for k in range(3))
        for x in range(WIDTH):
            px[x, y] = c
    glow = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse((650, -250, 1430, 530), fill=(212, 175, 55, 38))
    gd.ellipse((-260, 400, 520, 1120), fill=(24, 92, 132, 28))
    glow = glow.filter(ImageFilter.GaussianBlur(72))
    base = Image.alpha_composite(base.convert("RGBA"), glow).convert("RGB")
    d = ImageDraw.Draw(base, "RGBA")
    for x in range(32, WIDTH, 48):
        d.line((x, 0, x, HEIGHT), fill=(255, 255, 255, 5), width=1)
    for y in range(22, HEIGHT, 48):
        d.line((0, y, WIDTH, y), fill=(255, 255, 255, 5), width=1)
    return base

BASE_BG = make_background()


def rounded(draw: ImageDraw.ImageDraw, box, radius: int, fill, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def text(draw: ImageDraw.ImageDraw, xy, value, f, fill, anchor=None):
    draw.text(xy, value, font=f, fill=fill, anchor=anchor)


def line(draw: ImageDraw.ImageDraw, xy, fill=LINE, width=1):
    draw.line(xy, fill=fill, width=width)


def draw_brand(draw: ImageDraw.ImageDraw, scene_index: int, progress: float):
    # Small K-mark echoes the app's gold emblem without fabricating a logo asset.
    draw.ellipse((72, 42, 112, 82), fill=GOLD)
    text(draw, (92, 62), "K", font(25, True), (15, 25, 40), anchor="mm")
    text(draw, (126, 49), "KINGDOM BIBLE", FONTS["brand"], WHITE)
    text(draw, (127, 77), "READ · STUDY · SERVE", FONTS["ui_small"], MUTED)
    rounded(draw, (1013, 48, 1208, 82), 17, (14, 29, 52), outline=(67, 82, 104), width=1)
    draw.ellipse((1030, 60, 1040, 70), fill=GOLD)
    text(draw, (1050, 56), "PRODUCT PREVIEW", FONTS["ui_tiny"], WHITE)
    # Film progress is useful even when native controls are hidden in a poster view.
    rounded(draw, (72, 681, 1208, 685), 2, (32, 48, 70))
    rounded(draw, (72, 681, 72 + int(1136 * progress), 685), 2, GOLD)
    text(draw, (72, 653), "ILLUSTRATIVE SAMPLE SCREENS", FONTS["ui_tiny"], MUTED)
    text(draw, (1208, 653), f"{scene_index + 1:02d} / {len(SCENES):02d}", FONTS["ui_tiny"], MUTED, anchor="ra")


def draw_arrow(draw: ImageDraw.ImageDraw, target, t: float):
    tx, ty = target
    pulse = 8 + 3 * (0.5 + 0.5 * math.sin(t * 3.2))
    # Curved-looking segmented pointer that leads the eye to the active control.
    points = [(1090, 160), (1048, 185), (1003, 208), (960, 234), (tx, ty)]
    for a, b in zip(points, points[1:]):
        length = max(1, int(math.dist(a, b)))
        steps = max(1, length // 16)
        for i in range(0, steps, 2):
            t0, t1 = i / steps, min(1, (i + 1) / steps)
            p0 = (int(a[0] + (b[0] - a[0]) * t0), int(a[1] + (b[1] - a[1]) * t0))
            p1 = (int(a[0] + (b[0] - a[0]) * t1), int(a[1] + (b[1] - a[1]) * t1))
            draw.line((p0, p1), fill=GOLD, width=2)
    draw.line((tx - 8, ty - 4, tx, ty), fill=GOLD, width=3)
    draw.line((tx - 7, ty + 5, tx, ty), fill=GOLD, width=3)
    draw.ellipse((tx - pulse, ty - pulse, tx + pulse, ty + pulse), outline=GOLD, width=2)


def draw_ui_window(image: Image.Image, scene: dict, t: float, scene_index: int):
    d = ImageDraw.Draw(image, "RGBA")
    x, y, w, h = 626, 146, 582, 464
    # Floating shadow, browser frame and content surface.
    shadow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle((x + 10, y + 16, x + w + 10, y + h + 16), radius=22, fill=(0, 0, 0, 105))
    shadow = shadow.filter(ImageFilter.GaussianBlur(18))
    image.alpha_composite(shadow)
    d = ImageDraw.Draw(image, "RGBA")
    rounded(d, (x, y, x + w, y + h), 20, (8, 21, 42), outline=(55, 75, 102), width=1)
    rounded(d, (x + 1, y + 1, x + w - 1, y + 48), 19, (10, 26, 49))
    d.rectangle((x + 1, y + 27, x + w - 1, y + 49), fill=(10, 26, 49))
    for i, color in enumerate(((231, 117, 110), (232, 195, 99), (111, 190, 128))):
        d.ellipse((x + 18 + i * 16, y + 17, x + 26 + i * 16, y + 25), fill=color)
    text(d, (x + 78, y + 15), "KINGDOM BIBLE  ·  SCRIPTURE WORKSPACE", FONTS["ui_tiny"], (182, 197, 217))
    rounded(d, (x + w - 92, y + 12, x + w - 17, y + 35), 10, (29, 44, 65), outline=(56, 74, 98))
    text(d, (x + w - 55, y + 17), "SAMPLE", FONTS["ui_tiny"], GOLD, anchor="ma")

    rail_x, rail_w = x + 12, 126
    d.rectangle((x + 1, y + 49, rail_x + rail_w, y + h - 1), fill=(7, 18, 36, 255))
    rounded(d, (rail_x + 14, y + 66, rail_x + 40, y + 92), 8, GOLD)
    text(d, (rail_x + 27, y + 70), "K", FONTS["ui_bold"], (15, 25, 40), anchor="ma")
    nav = [("⌂", "Home"), ("▤", "Bible"), ("⌕", "Search"), ("✦", "Study"), ("◫", "Plans"), ("♡", "Prayer"), ("▣", "Ministry")]
    for i, (icon, label) in enumerate(nav):
        yy = y + 105 + i * 39
        active = label == scene["active"]
        if active:
            rounded(d, (rail_x + 8, yy - 3, rail_x + rail_w - 8, yy + 28), 7, (64, 55, 28, 160))
            d.rectangle((rail_x + 8, yy + 2, rail_x + 11, yy + 23), fill=GOLD)
        text(d, (rail_x + 18, yy + 2), icon, FONTS["ui_bold"], GOLD if active else (131, 151, 179))
        text(d, (rail_x + 39, yy + 5), label, FONTS["ui_small"], WHITE if active else (131, 151, 179))

    cx, cy = rail_x + rail_w + 20, y + 68
    cw = x + w - cx - 20
    text(d, (cx, cy), scene["foot"], FONTS["ui_tiny"], GOLD)
    text(d, (cx, cy + 25), scene["screen"], FONTS["ui_bold"], WHITE)
    rounded(d, (x + w - 116, cy + 19, x + w - 22, cy + 45), 12, (17, 35, 59), outline=LINE)
    text(d, (x + w - 69, cy + 27), "Reader  ⌄", FONTS["ui_tiny"], MUTED, anchor="ma")

    kind = scene["kind"]
    if kind in ("reader",):
        # Reader toolbar
        controls = [("BOOK", "John  ⌄"), ("CHAPTER", "3  ⌄"), ("VERSION", "KJV  ⌄")]
        widths = [120, 103, 112]
        xx = cx
        for (label, value), ww in zip(controls, widths):
            rounded(d, (xx, cy + 65, xx + ww, cy + 112), 8, (12, 28, 51), outline=LINE)
            text(d, (xx + 10, cy + 73), label, FONTS["ui_tiny"], MUTED)
            text(d, (xx + 10, cy + 91), value, FONTS["ui_small"], WHITE)
            xx += ww + 7
        text(d, (cx, cy + 132), "JOHN 3 · KING JAMES VERSION", FONTS["ui_tiny"], GOLD)
        rounded(d, (cx, cy + 154, cx + cw, cy + 284), 12, (15, 31, 54), outline=(63, 73, 91))
        text(d, (cx + 17, cy + 170), "16  For God so loved the world, that he gave", FONTS["ui_small"], WHITE)
        text(d, (cx + 17, cy + 193), "his only begotten Son, that whosoever believeth", FONTS["ui_small"], WHITE)
        text(d, (cx + 17, cy + 216), "in him should not perish, but have everlasting life.", FONTS["ui_small"], WHITE)
        rounded(d, (cx + 16, cy + 246, cx + 123, cy + 273), 8, (55, 48, 31))
        text(d, (cx + 69, cy + 253), "♡ Save", FONTS["ui_tiny"], GOLD, anchor="ma")
        for j, label in enumerate(("Note", "Compare", "Study")):
            xx = cx + 135 + j * 74
            rounded(d, (xx, cy + 246, xx + 68, cy + 273), 8, (18, 37, 61), outline=LINE)
            text(d, (xx + 34, cy + 253), label, FONTS["ui_tiny"], MUTED, anchor="ma")
        target = (cx + 75, cy + 184)
    elif kind in ("study",):
        rounded(d, (cx, cy + 66, cx + cw, cy + 186), 12, (15, 31, 54), outline=(63, 73, 91))
        text(d, (cx + 17, cy + 80), "SELECTED PASSAGE  ·  JOHN 3:16", FONTS["ui_tiny"], GOLD)
        text(d, (cx + 17, cy + 107), "For God so loved the world…", font(19, True), WHITE)
        for j, label in enumerate(("Save", "Highlight", "Add note", "Study")):
            xx = cx + 16 + j * 96
            rounded(d, (xx, cy + 145, xx + 87, cy + 170), 8, (18, 37, 61), outline=LINE)
            text(d, (xx + 43, cy + 151), label, FONTS["ui_tiny"], MUTED, anchor="ma")
        rounded(d, (cx, cy + 202, cx + cw, cy + 292), 12, (11, 27, 49), outline=LINE)
        text(d, (cx + 16, cy + 215), "RELATED PASSAGE", FONTS["ui_tiny"], GOLD)
        text(d, (cx + 16, cy + 237), "Romans 5:8", FONTS["ui_bold"], WHITE)
        text(d, (cx + 16, cy + 259), "A cross-reference to explore in context.", FONTS["ui_small"], MUTED)
        target = (cx + 45, cy + 157)
    elif kind == "rhythm":
        rounded(d, (cx, cy + 66, cx + cw, cy + 206), 12, (14, 31, 54), outline=(63, 73, 91))
        text(d, (cx + 17, cy + 81), "YOUR CURRENT PLAN", FONTS["ui_tiny"], GOLD)
        text(d, (cx + 17, cy + 105), "Bible in One Year", font(20, True), WHITE)
        text(d, (cx + 17, cy + 138), "DAY 38 / 365", FONTS["ui_tiny"], MUTED)
        rounded(d, (cx + 17, cy + 164, cx + cw - 17, cy + 175), 6, (31, 49, 72))
        rounded(d, (cx + 17, cy + 164, cx + 17 + int((cw - 34) * .36), cy + 175), 6, GOLD)
        text(d, (cx + 17, cy + 183), "TODAY  ·  EXODUS 12–14", FONTS["ui_tiny"], GREEN)
        rounded(d, (cx, cy + 223, cx + cw, cy + 293), 12, (11, 27, 49), outline=LINE)
        text(d, (cx + 17, cy + 236), "PRAYER JOURNAL", FONTS["ui_tiny"], GOLD)
        text(d, (cx + 17, cy + 258), "A quiet place to return to your prayers.", FONTS["ui_small"], WHITE)
        text(d, (cx + 17, cy + 278), "Private · Saved on this device", FONTS["ui_tiny"], MUTED)
        target = (cx + 185, cy + 169)
    elif kind == "ministry":
        rounded(d, (cx, cy + 67, cx + cw, cy + 300), 12, (7, 18, 36), outline=(63, 73, 91))
        text(d, (cx + 18, cy + 82), "AUDIENCE DISPLAY  ·  PREVIEW", FONTS["ui_tiny"], GOLD)
        # Main stage card
        rounded(d, (cx + 18, cy + 108, cx + cw - 18, cy + 266), 10, (14, 30, 53), outline=(46, 62, 83))
        text(d, (cx + cw // 2, cy + 127), "PSALM 23:1  ·  KJV", FONTS["ui_tiny"], GOLD, anchor="ma")
        text(d, (cx + cw // 2, cy + 164), "The LORD is my shepherd;", font(21, True), WHITE, anchor="ma")
        text(d, (cx + cw // 2, cy + 193), "I shall not want.", font(21, True), WHITE, anchor="ma")
        text(d, (cx + cw // 2, cy + 236), "KINGDOM BIBLE", FONTS["ui_tiny"], MUTED, anchor="ma")
        rounded(d, (cx + 18, cy + 276, cx + 155, cy + 300), 7, (54, 48, 32))
        text(d, (cx + 87, cy + 282), "Open audience view", FONTS["ui_tiny"], GOLD, anchor="ma")
        target = (cx + cw // 2, cy + 177)
    else:
        # Premium feature cards; each shows a different tool without implying it is
        # already enabled for every account or deployment.
        cards = [
            ("STUDY", "Ask about a passage", "Context + cross references", "✦"),
            ("LISTEN", "Read aloud", "Follow as Scripture is spoken", "◉"),
            ("MINISTRY", "Voice Preacher Mode", "Hands-free presentation", "▣"),
        ]
        for i, (eyebrow, title, copy, icon) in enumerate(cards):
            yy = cy + 66 + i * 75
            rounded(d, (cx, yy, cx + cw, yy + 64), 11, (13, 30, 52), outline=LINE)
            rounded(d, (cx + 12, yy + 14, cx + 48, yy + 50), 9, (54, 48, 32))
            text(d, (cx + 30, yy + 21), icon, FONTS["ui_bold"], GOLD, anchor="ma")
            text(d, (cx + 60, yy + 12), eyebrow, FONTS["ui_tiny"], GOLD)
            text(d, (cx + 60, yy + 27), title, FONTS["ui_bold"], WHITE)
            text(d, (cx + 60, yy + 46), copy, FONTS["ui_tiny"], MUTED)
        rounded(d, (cx, cy + 306, cx + cw, cy + 337), 9, (49, 43, 30))
        text(d, (cx + cw // 2, cy + 315), "A guided preview · sample screens only", FONTS["ui_tiny"], GOLD, anchor="ma")
        target = (cx + 42, cy + 98)

    # Mock screen footer keeps the preview readable at mobile video sizes.
    line(d, (cx, y + h - 30, x + w - 20, y + h - 30), (43, 61, 86), 1)
    text(d, (cx, y + h - 21), "A SIMPLE PLACE TO OPEN THE WORD", FONTS["ui_tiny"], MUTED)
    draw_arrow(d, target, t)


def draw_scene(index: int, t: float, progress: float) -> Image.Image:
    scene = SCENES[index]
    image = BASE_BG.convert("RGBA")
    d = ImageDraw.Draw(image, "RGBA")
    draw_brand(d, index, progress)
    # Gold eyebrow and a cinematic title reveal.
    ey = 188
    text(d, (80, ey), scene["eyebrow"], FONTS["eyebrow"], GOLD)
    title_y = 232 + int(11 * (1 - min(1, t / 0.7)))
    title_font = FONTS["title"]
    for i, row in enumerate(scene["title"]):
        text(d, (80, title_y + i * 59), row, title_font, WHITE)
    body_y = title_y + len(scene["title"]) * 60 + 18
    for i, row in enumerate(scene["body"]):
        text(d, (82, body_y + i * 29), row, FONTS["body"], MUTED)

    rounded(d, (80, 510, 523, 561), 13, (15, 31, 54), outline=(61, 77, 101))
    d.ellipse((98, 527, 125, 554), fill=(57, 48, 30))
    text(d, (111, 531), "✓", FONTS["ui_bold"], GOLD, anchor="ma")
    text(d, (139, 526), scene["foot"], FONTS["ui_tiny"], WHITE)
    text(d, (139, 545), "A calm, connected workspace for every reader.", FONTS["ui_tiny"], MUTED)

    draw_ui_window(image, scene, t, index)
    # An understated floating caption card brings focus to the current feature.
    cap_y = 606 + int(3 * math.sin(t * 1.4))
    rounded(d, (867, cap_y, 1179, cap_y + 33), 12, (10, 24, 45, 235), outline=(84, 86, 73))
    d.ellipse((883, cap_y + 12, 891, cap_y + 20), fill=GOLD)
    text(d, (902, cap_y + 10), scene["foot"], FONTS["ui_tiny"], WHITE)
    return image.convert("RGB")


def main():
    ASSETS.mkdir(parents=True, exist_ok=True)
    # Use a clean, high-quality opening frame as the accessible, non-autoplay poster.
    draw_scene(0, 1.0, 0.02).save(POSTER, quality=90, optimize=True)

    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    output = [
        ffmpeg, "-hide_banner", "-loglevel", "error", "-y",
        "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{WIDTH}x{HEIGHT}",
        "-r", str(FPS), "-i", "-", "-an", "-c:v", "libx264", "-preset", "medium",
        "-crf", "25", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(VIDEO),
    ]
    proc = subprocess.Popen(output, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    assert proc.stdin is not None
    frames_per_scene = round(SCENE_SECONDS * FPS)
    blend_frames = round(TRANSITION_SECONDS * FPS)
    total_frames = frames_per_scene + (len(SCENES) - 1) * (frames_per_scene - blend_frames)
    for index in range(len(SCENES)):
        start = 0 if index == 0 else blend_frames
        for frame_no in range(start, frames_per_scene):
            t = frame_no / FPS
            global_frame = index * (frames_per_scene - blend_frames) + frame_no
            progress = global_frame / max(1, total_frames - 1)
            frame = draw_scene(index, t, progress)
            if index < len(SCENES) - 1 and frame_no >= frames_per_scene - blend_frames:
                cross = frame_no - (frames_per_scene - blend_frames)
                alpha = (cross + 1) / (blend_frames + 1)
                incoming = draw_scene(index + 1, cross / FPS, progress)
                frame = Image.blend(frame, incoming, alpha)
            proc.stdin.write(frame.tobytes())
    proc.stdin.close()
    stderr = proc.stderr.read().decode("utf-8", "replace") if proc.stderr else ""
    code = proc.wait()
    if code:
        raise SystemExit(f"ffmpeg exited with {code}: {stderr[-2000:]}")
    print(f"Built {VIDEO.relative_to(ROOT)} ({VIDEO.stat().st_size / 1024 / 1024:.2f} MB)")
    print(f"Built {POSTER.relative_to(ROOT)} ({POSTER.stat().st_size / 1024:.1f} KB)")


if __name__ == "__main__":
    main()
