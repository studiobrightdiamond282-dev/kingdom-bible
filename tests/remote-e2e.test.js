#!/usr/bin/env node
'use strict';
/**
 * End-to-end check of the live remote against a real running server.
 * Starts server.js, then drives the same calls remote.js makes, proving a
 * verse published from one "device" is readable by the "display".
 */
const assert = require('assert');
const path = require('path');
const { spawn } = require('child_process');

const root = path.join(__dirname, '..');
const KBRef = require('../public/ref-parser.js');
const L = require('../public/live-sync.js');
const books = require('../public/data/books.json').books;
const index = KBRef.createIndex(books);

const PORT = 4187;
const BASE = `http://127.0.0.1:${PORT}`;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const server = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'ignore'
  });
  const stop = () => { try { server.kill(); } catch { /* already gone */ } };
  process.on('exit', stop);

  try {
    // wait for boot
    for (let i = 0; i < 40; i++) {
      try {
        const r = await fetch(`${BASE}/health`);
        if (r.ok) break;
      } catch {
        await wait(150);
      }
    }
    const health = await (await fetch(`${BASE}/health`)).json();
    assert.equal(health.status, 'healthy');
    console.log('  ok  server is up on', BASE);

    // The remote page and its assets must all be reachable.
    for (const p of ['/remote', '/remote.html', '/remote.js', '/remote.css', '/live-sync.js', '/ref-parser.js']) {
      const r = await fetch(BASE + p);
      assert.equal(r.status, 200, `${p} -> ${r.status}`);
    }
    console.log('  ok  /remote and all its assets are served');

    // --- act as the phone remote ---
    const translation = 'kjv';
    async function chapterSizes(bi) {
      const r = await fetch(`${BASE}/data/bibles/${translation}/${bi}.json`);
      const d = await r.json();
      return d.chapters.map((c) => c.length);
    }
    async function verseAt(pos) {
      const d = await (await fetch(`${BASE}/data/bibles/${translation}/${pos.book}.json`)).json();
      const ch = d.chapters[pos.chapter - 1] || [];
      let text = ch[pos.verse - 1] || '';
      if (pos.verseEnd > pos.verse) text = ch.slice(pos.verse - 1, pos.verseEnd).filter(Boolean).join(' ');
      const name = books[pos.book].name;
      return { ...pos, text, ref: pos.verseEnd > pos.verse ? `${name} ${pos.chapter}:${pos.verse}-${pos.verseEnd}` : `${name} ${pos.chapter}:${pos.verse}` };
    }
    async function publish(pos) {
      const v = await verseAt(pos);
      const payload = { ...v, translation, theme: 'royal', church: 'TEST CHURCH' };
      const r = await fetch(`${BASE}/api/presentation`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload)
      });
      assert.equal(r.status, 200);
      return v;
    }

    // A preacher typing "luk 3 23" on their phone
    const typed = KBRef.parse('luk 3 23', { index, contextBook: 42 });
    assert.equal(typed.label, 'Luke 3:23');
    const sizes = await chapterSizes(typed.book);
    const first = await publish({ book: typed.book, ...L.clampPassage(typed, sizes) });
    assert.ok(first.text.includes('thirty'), 'Luke 3:23 text should be correct');
    console.log(`  ok  phone sent "${first.ref}"`);

    // --- act as the display ---
    const shown = await (await fetch(`${BASE}/api/presentation`)).json();
    assert.equal(shown.ref, 'Luke 3:23');
    assert.equal(shown.text, first.text);
    assert.equal(shown.church, 'TEST CHURCH');
    console.log('  ok  display reads back the same verse');

    // Pressing NEXT VERSE (block size 1)
    const cur = { book: typed.book, chapter: typed.chapter, verse: typed.verse, verseEnd: typed.verseEnd };
    const next1 = L.stepPassage(cur, 1, 1, sizes);
    assert.equal(next1.verse, 24);
    await publish({ book: typed.book, ...next1 });
    const after1 = await (await fetch(`${BASE}/api/presentation`)).json();
    assert.equal(after1.ref, 'Luke 3:24');
    console.log('  ok  NEXT VERSE moved Luke 3:23 -> Luke 3:24');

    // Switch the block to 3 and press NEXT twice
    const start = { book: typed.book, chapter: 3, verse: 16, verseEnd: 18 };
    await publish({ book: typed.book, ...start });
    const a = L.stepPassage(start, 1, 3, sizes);
    assert.equal(a.verse, 19);
    assert.equal(a.verseEnd, 21);
    await publish({ book: typed.book, ...a });
    const shownA = await (await fetch(`${BASE}/api/presentation`)).json();
    assert.equal(shownA.ref, 'Luke 3:19-21', 'passage mode should send the whole block');
    assert.ok(shownA.text.length > first.text.length, 'a block carries more text than one verse');
    console.log(`  ok  passage mode sent "${shownA.ref}" (${shownA.text.length} chars)`);

    const b = L.stepPassage(a, 1, 3, sizes);
    await publish({ book: typed.book, ...b });
    const shownB = await (await fetch(`${BASE}/api/presentation`)).json();
    assert.equal(shownB.ref, 'Luke 3:22-24');
    console.log('  ok  NEXT again -> Luke 3:22-24 (block size held)');

    // Blanking, as the preacher does between points
    const blank = await fetch(`${BASE}/api/presentation`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...shownB, blank: true })
    });
    assert.equal(blank.status, 200);
    const shownBlank = await (await fetch(`${BASE}/api/presentation`)).json();
    assert.equal(shownBlank.blank, true);
    console.log('  ok  blank screen propagated to the display');

    // LAN discovery, so a volunteer knows which address to open on the phone.
    const net = await (await fetch(`${BASE}/net`)).json();
    assert.strictEqual(net.port, PORT);
    assert.ok(Array.isArray(net.remoteUrls) && Array.isArray(net.displayUrls));
    net.remoteUrls.forEach((u) => assert.ok(u.endsWith('/remote'), `bad remote url ${u}`));
    net.displayUrls.forEach((u) => assert.ok(u.endsWith('/present'), `bad display url ${u}`));
    assert.strictEqual(net.remoteUrls.length, net.displayUrls.length);
    console.log(`  ok  /net exposes ${net.remoteUrls.length} LAN address(es) for the phone remote`);

    // The self-hosted path is the reliable cross-device setup, so the local
    // server must report its presentation state as shared.
    const h = await (await fetch(`${BASE}/health`)).json();
    assert.strictEqual(h.presentation, 'shared');
    console.log('  ok  self-hosted server reports shared presentation state');

    console.log('\nLive remote end-to-end passed.');
  } finally {
    stop();
  }
}

main().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
