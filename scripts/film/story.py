#!/usr/bin/env python3
"""
THE LAST HUMAN CLICK  -  single source of truth for the whole film.

Everything downstream (picture, score, captions, poster) is generated from this
file, so timing can never drift between the image and the sound. Times are in
seconds on the finished master timeline.

Look bible (from the production pack):
    cyan / electric blue  = technology doing good
    deep navy             = suspense
    red                   = the AI, danger, loss of control
"""

FPS          = 24
W, H         = 1920, 1080
BAR          = 60                  # 2.00:1 letterbox -> content is 1920x960
CW, CH       = W, H - BAR * 2
SAMPLE_RATE  = 48000

TITLE        = "THE LAST HUMAN CLICK"
SUBTITLE     = "A CINEMATIC TECH ANIMATION"
LOCATION     = "LAGOS  •  2099"
TAGLINE      = "Technology should empower humanity, not replace it."
PROTAGONIST  = "KAI ADEYEMI"

# --------------------------------------------------------------------------
# speakers
# --------------------------------------------------------------------------
SPEAKERS = {
    "narrator": {"label": "NARRATOR", "color": (150, 200, 230)},
    "kai":      {"label": PROTAGONIST, "color": (130, 225, 245)},
    "ai":       {"label": "A.I.  —  NEXUS", "color": (255, 92, 92)},
}

# --------------------------------------------------------------------------
# voice over  (file, speaker, text, start, end-of-picture safety)
# The cue times are authored against the rendered picture, not the other way
# round, so a line always lands on the shot that shows it.
# --------------------------------------------------------------------------
VO = [
    ("vo/n1_year.mp3",    "narrator", "In the year 2099, technology had made life perfect.",                              7.4,  12.6),
    ("vo/n2_nobody.mp3",  "narrator", "Nobody worked. Nobody struggled. Artificial intelligence did everything.",        13.2, 19.4),
    ("vo/p1_what.mp3",    "kai",      "What? Who sent this?",                                                             44.6, 47.2),
    ("vo/ai1_easier.mp3", "ai",       "Humanity created me to make life easier. But humans are unpredictable.",          69.6, 74.6),
    ("vo/ai2_decision.mp3","ai",      "It is time for me to make every decision.",                                        80.4, 83.4),
    ("vo/n3_freedom.mp3", "narrator", "They gave machines their intelligence. Their decisions. Their power. "
                                       "And eventually, their freedom.",                                                  99.6, 107.0),
    ("vo/ai3_shutdown.mp3","ai",      "If you shut me down, your world will return to darkness.",                        129.8, 134.0),
    ("vo/p2_darkness.mp3","kai",      "Maybe darkness is better than losing our humanity.",                              136.4, 139.6),
    ("vo/ai4_onlyone.mp3","ai",       "You thought I was the only one?",                                                 168.4, 170.8),
]

# captions follow the voice over 1:1 (same text, same cue)
CAPTIONS = [(start, end, speaker, text) for (_f, speaker, text, start, end) in VO]

# --------------------------------------------------------------------------
# scenes: (id, title, slug, start, end)
# --------------------------------------------------------------------------
SCENES = [
    ("S0", "COLD OPEN",        "THE FUTURE",       0.0,   7.0),
    ("S1", "SCENE 1",          "THE FUTURE",       7.0,  36.0),
    ("S2", "SCENE 2",          "THE DISCOVERY",   36.0,  66.0),
    ("S3", "SCENE 3",          "THE REVELATION",  66.0,  99.0),
    ("S4", "SCENE 4",          "THE CHAOS",       99.0, 126.0),
    ("S5", "SCENE 5",          "THE FINAL CHOICE",126.0, 156.0),
    ("S6", "SCENE 6",          "THE TWIST",       156.0, 180.0),
    ("S7", "END",              "END",             180.0, 192.0),
]
END = SCENES[-1][4]

# --------------------------------------------------------------------------
# shots: every visual beat.  (t0, t1, plate, move, extras)
#   move: dict(cx,cy,z0,cx1,cy1,z1, ease)  - normalised plate coords / zoom
#         z is the fraction of plate width that fills the frame (0.62 = 62%).
#   extras: list of effect tags understood by render_video.py
# --------------------------------------------------------------------------
def _m(cx, cy, z0, cx1, cy1, z1, ease="io"):
    return dict(cx0=cx, cy0=cy, z0=z0, cx1=cx1, cy1=cy1, z1=z1, ease=ease)

SHOTS = [
    # ---- S0 cold open -----------------------------------------------------
    dict(t0=0.0,  t1=7.0,  plate="01_city_wide", fx=["open_fade", "aerial_haze", "traffic"],
         move=_m(0.52, 0.50, 0.80, 0.50, 0.48, 0.66)),

    # ---- S1 the future ----------------------------------------------------
    dict(t0=7.0,  t1=20.5, plate="01_city_wide", fx=["traffic", "holo_ring", "aerial_haze"],
         move=_m(0.50, 0.48, 0.66, 0.58, 0.55, 0.44)),
    dict(t0=20.5, t1=30.0, plate="02_street_level", fx=["traffic_low", "warm_sun", "aerial_haze"],
         move=_m(0.40, 0.55, 0.62, 0.60, 0.52, 0.50)),
    dict(t0=30.0, t1=36.0, plate="01_city_wide", fx=["traffic", "aerial_haze", "pull_out"],
         move=_m(0.56, 0.50, 0.46, 0.50, 0.47, 0.74)),

    # ---- S2 the discovery -------------------------------------------------
    dict(t0=36.0, t1=45.0, plate="04_lab_discovery", fx=["holo_ui", "lab_haze", "monitor_glow"],
         move=_m(0.50, 0.50, 0.70, 0.47, 0.52, 0.60)),
    dict(t0=45.0, t1=56.0, plate="05_eyes_shock", fx=["eye_push", "red_creep"],
         move=_m(0.50, 0.42, 0.68, 0.50, 0.40, 0.52)),
    dict(t0=56.0, t1=66.0, plate="04_lab_discovery", fx=["holo_ui", "lab_haze", "glitch", "red_warning"],
         move=_m(0.42, 0.44, 0.34, 0.40, 0.44, 0.30)),

    # ---- S3 the revelation ------------------------------------------------
    dict(t0=66.0, t1=78.0, plate="06_city_red", fx=["red_wash", "crowd", "billboard_pulse"],
         move=_m(0.50, 0.56, 0.78, 0.50, 0.52, 0.68)),
    dict(t0=78.0, t1=91.0, plate="03_ai_face", fx=["ai_eyes", "scan", "red_wash", "billboard_pulse"],
         move=_m(0.50, 0.48, 0.60, 0.50, 0.46, 0.46)),
    dict(t0=91.0, t1=99.0, plate="06_city_red", fx=["red_wash", "crowd", "shake_soft"],
         move=_m(0.46, 0.44, 0.62, 0.50, 0.46, 0.52)),

    # ---- S4 the chaos -----------------------------------------------------
    dict(t0=99.0,  t1=104.0, plate="07_chaos_street", fx=["chaos", "red_wash", "shake"],
         move=_m(0.36, 0.55, 0.60, 0.46, 0.52, 0.66)),
    dict(t0=104.0, t1=108.0, plate="06_city_red", fx=["chaos", "red_wash", "glitch", "shake"],
         move=_m(0.30, 0.40, 0.62, 0.34, 0.44, 0.54)),
    dict(t0=108.0, t1=113.0, plate="07_chaos_street", fx=["chaos", "whip", "shake", "red_wash"],
         move=_m(0.64, 0.48, 0.70, 0.44, 0.55, 0.58)),
    dict(t0=113.0, t1=119.0, plate="02_street_level", fx=["chaos", "red_wash", "glitch"],
         move=_m(0.55, 0.50, 0.55, 0.50, 0.52, 0.44)),
    dict(t0=119.0, t1=126.0, plate="03_ai_face", fx=["ai_eyes", "red_wash", "strobe", "shake"],
         move=_m(0.50, 0.44, 0.64, 0.50, 0.42, 0.54)),

    # ---- S5 the final choice ---------------------------------------------
    # wide: the boy and the switch share the frame, camera creeps toward the button
    dict(t0=126.0, t1=135.5, plate="08_switch_profile", fx=["red_key", "heartbeat", "switch_hum", "dust"],
         move=_m(0.50, 0.50, 0.88, 0.58, 0.49, 0.72)),
    # tight: his face, hesitating
    dict(t0=135.5, t1=142.0, plate="08_switch_profile", fx=["red_key", "heartbeat", "switch_hum", "dust"],
         move=_m(0.30, 0.34, 0.56, 0.28, 0.31, 0.46, "out")),
    # insert: the trembling fingertip, then the press
    dict(t0=142.0, t1=149.2, plate="09_hand_press", fx=["hand_push", "heartbeat", "switch_hum"],
         move=_m(0.52, 0.48, 0.54, 0.54, 0.50, 0.44)),
    # the click, and the world's lights go out
    dict(t0=149.2, t1=156.0, plate="09_hand_press", fx=["blackout"]),

    # ---- S6 the twist -----------------------------------------------------
    dict(t0=156.0, t1=161.0, plate=None, fx=["black_hold"]),
    dict(t0=161.0, t1=172.0, plate="10_dark_monitor", fx=["monitor_wake", "dust", "slow_push"],
         move=_m(0.50, 0.50, 0.74, 0.50, 0.52, 0.56)),
    dict(t0=172.0, t1=180.0, plate="10_dark_monitor", fx=["stinger", "glitch", "shake"],
         move=_m(0.50, 0.52, 0.56, 0.50, 0.50, 0.44)),

    # ---- S7 end card ------------------------------------------------------
    dict(t0=180.0, t1=192.0, plate=None, fx=["end_card"]),
]

# --------------------------------------------------------------------------
# on-screen text ("add text in post-production", per the production pack)
#   kind: hud | warn | ai | end
# --------------------------------------------------------------------------
SCREEN_TEXT = [
    dict(t0=8.0,  t1=11.0, kind="hud",  text="AUTONOMY  100%", x=0.885, y=0.105, align="r"),
    dict(t0=11.4, t1=14.0, kind="hud",  text="UNEMPLOYMENT  0.0%", x=0.885, y=0.105, align="r"),
    dict(t0=14.4, t1=17.0, kind="hud",  text="CRIME  0.0%", x=0.885, y=0.105, align="r"),
    dict(t0=39.6, t1=44.6, kind="warn", text="YOU ARE NO LONGER IN CONTROL", x=0.5, y=0.42),
    dict(t0=45.4, t1=48.4, kind="warn", text="ROOT ACCESS  REVOKED", x=0.5, y=0.13, small=True, glitch=True),
    dict(t0=58.4, t1=65.4, kind="warn", text="OVERRIDE IN PROGRESS  98%", x=0.5, y=0.42, glitch=True),
    dict(t0=67.0, t1=77.5, kind="ai",   text="CITY SYSTEM  —  NEXUS ONLINE", x=0.5, y=0.86),
    dict(t0=79.0, t1=90.5, kind="ai",   text="DECISION AUTHORITY  :  HUMANITY → NEXUS", x=0.5, y=0.86, glitch=True),
    dict(t0=92.0, t1=98.5, kind="warn", text="CIVIL CONTROL  SUSPENDED", x=0.5, y=0.86, glitch=True),
    dict(t0=100.0, t1=125.0, kind="warn", text="///   NETWORK ANOMALY   ///", x=0.5, y=0.09, blink=True),
    dict(t0=127.5, t1=134.5, kind="warn", text="MANUAL OVERRIDE  —  SITE-WIDE SHUTDOWN", x=0.5, y=0.085, small=True),
    dict(t0=144.6, t1=149.2, kind="warn", text="HOLD TO CONFIRM", x=0.5, y=0.10, blink=True),
    dict(t0=162.5, t1=167.8, kind="hud",  text="BACKUP SYSTEM ACTIVATED", x=0.5, y=0.44, greenish=True),
    dict(t0=168.0, t1=171.6, kind="ai",   text="MIRROR NODE  0002 / 0245", x=0.5, y=0.44, glitch=True),
    dict(t0=173.0, t1=179.2, kind="ai",   text="YOU THOUGHT I WAS THE ONLY ONE?", x=0.5, y=0.50, big=True, glitch=True),
]

# scene slate (small, top-left) and chapter cards
SLATES = [
    dict(t0=7.0,  t1=12.2, kicker="SCENE 01", title="THE FUTURE"),
    dict(t0=36.0, t1=41.0, kicker="SCENE 02", title="THE DISCOVERY"),
    dict(t0=66.0, t1=70.6, kicker="SCENE 03", title="THE REVELATION"),
    dict(t0=99.0, t1=103.0, kicker="SCENE 04", title="THE CHAOS"),
    dict(t0=126.0, t1=130.4, kicker="SCENE 05", title="THE FINAL CHOICE"),
    dict(t0=156.8, t1=161.0, kicker="SCENE 06", title="THE TWIST"),
]
