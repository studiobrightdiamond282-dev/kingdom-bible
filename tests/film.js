#!/usr/bin/env node
'use strict';
/* THE LAST HUMAN CLICK — structural checks on the film pipeline.
 *
 * These run without rendering anything: they read scripts/film/story.py, the
 * viewer page and the publish script, and fail if the cut could not possibly
 * hang together. Rendering itself is a manual step (scripts/film/README.md).
 */
const fs = require('fs'), path = require('path'), assert = require('assert');
const root = path.join(__dirname, '..');
const film = path.join(root, 'scripts/film');

for (const f of ['story.py', 'build_audio.py', 'render_video.py', 'poster.py', 'README.md']) {
  assert(fs.existsSync(path.join(film, f)), `Missing scripts/film/${f}`);
}
for (const d of ['stills', 'vo', 'fonts']) {
  assert(fs.existsSync(path.join(film, d)), `Missing scripts/film/${d}/`);
}

const py = fs.readFileSync(path.join(film, 'story.py'), 'utf8');

/* the master must be 16:9 1080p at 24 fps — the production pack's delivery spec */
assert(/^FPS\s*=\s*24$/m.test(py), 'story.py must render at 24 fps');
assert(/^W,\s*H\s*=\s*1920,\s*1080$/m.test(py), 'story.py must master at 1920x1080');

/* every VO line must exist on disk and every cue must be inside the cut */
const voDir = path.join(film, 'vo');
const voiceFiles = fs.readdirSync(voDir).filter(f => f.endsWith('.mp3'));
assert(voiceFiles.length >= 9, `expected at least 9 recorded lines, found ${voiceFiles.length}`);
const voBlock = py.split('VO = [')[1].split(']')[0];
/* a cue's text may be a pair of adjacent string literals wrapped across lines */
const cues = [...voBlock.matchAll(/\("(vo\/[^"]+)",\s*"(\w+)",\s*((?:"(?:[^"\\]|\\.)*"\s*)+),\s*([\d.]+),\s*([\d.]+)\)/gs)]
  .map(m => [m[1], m[2], [...m[3].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(x => x[1]).join(' '), m[4], m[5]]);
assert(cues.length >= 9, `expected at least 9 VO cues, parsed ${cues.length}`);
for (const [file, speaker, text, a, b] of cues) {
  assert(fs.existsSync(path.join(film, file)), `VO cue points at a missing take: ${file}`);
  assert(['narrator', 'kai', 'ai'].includes(speaker), `unknown speaker "${speaker}" in ${file}`);
  assert(Number(a) < Number(b), `cue ${file} starts after it ends`);
  assert(Number(b) <= 192, `cue ${file} runs past the end of the film`);
  assert(text.trim().length > 2, `cue ${file} has no text to caption`);
}

/* the shots must tile the timeline with no holes and no overlaps */
const shotsBlock = py.split('SHOTS = [')[1].split('SCREEN_TEXT')[0];
const shots = [...shotsBlock.matchAll(/dict\(t0=([\d.]+),\s*t1=([\d.]+)/g)]
  .map(m => [Number(m[1]), Number(m[2])]);
assert(shots.length >= 18, `expected a real shot list, found ${shots.length} shots`);
let prev = 0;
for (const [t0, t1] of shots) {
  assert(Math.abs(t0 - prev) < 1e-6, `timeline gap/overlap at ${prev}s -> ${t0}s`);
  assert(t1 > t0, `zero-length shot at ${t0}s`);
  prev = t1;
}
assert(Math.abs(prev - 192) < 1e-6, `cut should end at 192s, ends at ${prev}s`);

/* the scare beats the pack asks for must actually be in the cut */
for (const beat of ['THE DISCOVERY', 'THE REVELATION', 'THE CHAOS', 'THE FINAL CHOICE', 'THE TWIST']) {
  assert(py.includes(beat), `missing scene "${beat}"`);
}
assert(py.includes('YOU ARE NO LONGER IN CONTROL'), 'the on-screen warning line is missing');
assert(py.includes('Technology should empower humanity, not replace it.'), 'the closing message is missing');

/* the viewer page must reference the published master and its poster */
const html = fs.readFileSync(path.join(root, 'public/film.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'public/film.js'), 'utf8');
assert(html.includes('/film/the-last-human-click.mp4'), 'film.html must point at the published master');
assert(html.includes('/film/poster.jpg'), 'film.html must use the poster as its video poster');
assert(html.includes('/film.js'), 'film.html must load film.js');
assert(js.includes('SCENES') && js.includes('probeVideo'), 'film.js must render the scene list and probe the master');

/* the app knows how to serve an mp4 and never caches the master in the shell */
assert(fs.readFileSync(path.join(root,'server.js'),'utf8').includes("'.mp4':'video/mp4'"), 'server.js must serve video/mp4');
assert(fs.readFileSync(path.join(root,'public/sw.js'),'utf8').includes("'/film'"), 'the service worker must treat /film as network-only');
assert(!fs.readFileSync(path.join(root,'public/sw.js'),'utf8').includes("'/film/the-last-human-click.mp4'"), 'the 40 MB master must never be precached');

/* publish script refuses a missing or stub master */
const pub = fs.readFileSync(path.join(root, 'scripts/publish-film.js'), 'utf8');
assert(pub.includes('public/film'), 'publish-film.js must target public/film');
assert(pub.includes('1e6'), 'publish-film.js must reject a stub render');

/* the build products are ignored, the published master is not */
const ignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
assert(ignore.includes('scripts/film/out/'), 'render products must be git-ignored');

console.log('film: timeline, cues, viewer and publish path all check out');
