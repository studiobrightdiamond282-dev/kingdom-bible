# THE LAST HUMAN CLICK — the film pipeline

A 3 min 12 s cinematic short built entirely from code: painted plates, a
software camera, a synthesised score, three voiced characters and burned-in
captions. Everything is generated from `story.py`, so the picture and the sound
can never drift apart.

```
scripts/film/
  story.py          the whole film as data: shots, camera moves, cues, captions
  build_audio.py    score, sound design, voice treatment and mix  -> out/score.wav
  render_video.py   the compositor: 24 fps frames piped into ffmpeg -> out/video.mp4
  poster.py         key art + 2:3 one-sheet (+ optional contact sheet)
  stills/           the painted plates the film is cut from
  vo/               the nine recorded lines (narrator / Kai / NEXUS)
  fonts/            Orbitron, Inter, JetBrains Mono (TTF, offline)
  out/              build products (git-ignored)
```

## Build

```bash
cd scripts/film
python3 build_audio.py                 # ~12 s   -> out/score.wav
python3 render_video.py                # ~20 min -> out/video.mp4  (1080p24, x264 crf 17)
python3 poster.py --gallery            # poster, one-sheet, contact sheet
```

Only `numpy`, `pillow`, `pypdf` and `imageio-ffmpeg` are needed; `ffmpeg` ships
inside `imageio-ffmpeg`, so no system packages are required.

Spot-check a single moment instead of a full render:

```bash
python3 render_video.py --frames 1200,2500,4300   # writes out/peek/*.png
```

## How the picture is made

Each frame is composited in this order, per the production pack's look bible:

1. **Plate + virtual camera** — `camera()` samples a painted plate through an
   authored move (`cx, cy, z` start/end, eased). It is bounds-safe: a shot can
   never sample past the painted pixels, and extreme pushes are pulled back
   automatically. A second layer of smooth noise adds handheld breathing to
   every shot so nothing is ever frozen.
2. **Light** — volumetric god rays, drifting haze, per-shot grading, red/cyan
   washes that follow the story (blue = technology serving people, red = the
   A.I. taking control).
3. **Particles and overlays** — air-traffic streaks, dust motes, embers, a
   holographic interface with a sweeping data bar, the A.I.'s pulsing eyes.
4. **Damage** — datamosh/glitch tearing, channel split, strobe and shake, timed
   to the beats that earn them.
5. **Finish** — vignette, scanline, film grain, 2.00:1 letterbox at 1920×960.
6. **Type** — scene slates, diegetic warnings ("YOU ARE NO LONGER IN CONTROL"),
   speaker-tagged captions and the end card, all drawn as real glyphs from the
   bundled fonts (never asked of an image model, so nothing is ever misspelled).

The edit rhythm follows the pack: Scene 1 breathes, 2–3 tighten, 4 accelerates
with the percussion, 5 drops almost to silence, 6 holds a long black before the
twist, then the end card resolves to hope.

## How the sound is made

`build_audio.py` synthesises everything with numpy — detuned saw pads, sub
drops, FFT band-passing, a synthetic reverb impulse, sirens, crowd beds,
sparks, a heartbeat, a machine click and an electrical shutdown. The three
voices are the recorded takes in `vo/`:

- **Narrator** — clean, warm, long reverb tail.
- **Kai** — tight and close, gentle saturation.
- **NEXUS (A.I.)** — pitched down ~2 semitones, chorused against a delayed
  copy, subharmonic ring-modulated, then given a metallic slap. It should
  sound like a machine speaking through a building.

The music is side-chain ducked under every line, so dialogue always sits on top.

## Credits

Story, direction, character continuity, palette and prompts: the supplied
production pack. Plates, animation, score, mix and edit: generated here.
