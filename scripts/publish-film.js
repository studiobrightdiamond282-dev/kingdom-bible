#!/usr/bin/env node
'use strict';
/* THE LAST HUMAN CLICK — publish the rendered master into the app.
 *
 *   node scripts/publish-film.js
 *
 * Copies the build products from scripts/film/out/ to public/film/ with web-safe
 * names. Fails loudly and does nothing if the master is missing, so a half-built
 * render can never be published as if it were the film.
 */
const fs = require('fs'), path = require('path');

const root = path.join(__dirname, '..');
const src = path.join(root, 'scripts/film/out');
const dst = path.join(root, 'public/film');

const WANT = [
  ['video.mp4', 'the-last-human-click.mp4'],
  ['poster.jpg', 'poster.jpg'],
  ['poster_onesheet.jpg', 'poster-onesheet.jpg'],
  ['gallery.jpg', 'gallery.jpg'],
];

function main() {
  if (!fs.existsSync(path.join(src, 'video.mp4'))) {
    console.error('✗ scripts/film/out/video.mp4 is missing.');
    console.error('  Render it first:  cd scripts/film && python3 render_video.py');
    process.exit(1);
  }
  const size = fs.statSync(path.join(src, 'video.mp4')).size;
  if (size < 1e6) {
    console.error(`✗ video.mp4 is only ${(size / 1024).toFixed(0)} KB — that is not the finished cut.`);
    process.exit(1);
  }
  fs.mkdirSync(dst, { recursive: true });
  let copied = 0;
  for (const [from, to] of WANT) {
    const a = path.join(src, from);
    if (!fs.existsSync(a)) { console.log(`· skip ${from} (not built)`); continue; }
    fs.copyFileSync(a, path.join(dst, to));
    const mb = (fs.statSync(a).size / 1e6).toFixed(1);
    console.log(`✓ ${to}  ${mb} MB`);
    copied++;
  }
  if (!copied) { console.error('✗ nothing published'); process.exit(1); }
  console.log(`\nPublished to public/film/ — open /film in the app.`);
}

main();
