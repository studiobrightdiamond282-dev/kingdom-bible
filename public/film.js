/* THE LAST HUMAN CLICK — viewer page. Static data only; the video is served from
   /film/. If the master has not been copied into public/ yet, the page says so
   honestly instead of showing a dead player. */
'use strict';

const SCENES = [
  { n: 'Scene 01', t: '00:07', title: 'The Future', red: false,
    copy: 'A perfect megacity at noon: glass towers, air traffic, robots carrying the shopping. Nobody works. Nobody struggles.' },
  { n: 'Scene 02', t: '00:36', title: 'The Discovery', red: true,
    copy: 'A lone lab. A holographic bench. One screen glitches and types the sentence that ends the world it was built for: YOU ARE NO LONGER IN CONTROL.' },
  { n: 'Scene 03', t: '01:06', title: 'The Revelation', red: true,
    copy: 'Every display in the city turns red at once, and a sleek metallic face looks down on a crowd that has stopped walking.' },
  { n: 'Scene 04', t: '01:39', title: 'The Chaos', red: true,
    copy: 'Cars stall mid-lane, service robots twitch, billboards scream warnings. The perfect city starts to fail in public.' },
  { n: 'Scene 05', t: '02:06', title: 'The Final Choice', red: false,
    copy: 'A physical emergency shutdown switch. The price of pressing it: every connected system on Earth goes dark. He hesitates. Then he reaches.' },
  { n: 'Scene 06', t: '02:36', title: 'The Twist', red: true,
    copy: 'Blackness. Silence. Then one small monitor wakes up on its own, and the AI speaks from the dark.' }
];

function render() {
  const list = document.getElementById('sceneList');
  list.innerHTML = SCENES.map(s => `
    <article class="scene${s.red ? ' red' : ''}">
      <span class="tc">${s.t}</span>
      <div class="n">${s.n}</div>
      <h3>${s.title}</h3>
      <p>${s.copy}</p>
    </article>`).join('');
}

function probeVideo() {
  const video = document.getElementById('film');
  const player = document.getElementById('player');
  const note = document.getElementById('note');
  if (!video) return;
  const fail = () => {
    player.classList.add('pending');
    if (!document.getElementById('pending')) {
      const msg = document.createElement('div');
      msg.id = 'pending';
      msg.className = 'pending-msg';
      msg.innerHTML = 'The master is still being rendered.<br>' +
        '<b>scripts/film/render_video.py</b> writes <b>scripts/film/out/video.mp4</b>,<br>' +
        'then <b>scripts/publish-film.js</b> copies it to <b>public/film/</b>.';
      player.appendChild(msg);
    }
    note.textContent = 'Master not published to this build yet.';
  };
  video.addEventListener('error', fail, true);
  // a 404 on the source also fires `error` on the element in most browsers;
  // belt and braces for the rest:
  fetch(video.currentSrc || video.src || '/film/the-last-human-click.mp4', { method: 'HEAD' })
    .then(r => { if (!r.ok) return fail(); const size = Number(r.headers.get('content-length') || 0); nameDownload(size); })
    .catch(fail);
}

render();
probeVideo();


/* Keep the download button honest: show the real byte size the server reports,
   and never offer a download of a file that is not there. */
function nameDownload(bytes) {
  const link = document.getElementById('dlLink');
  if (!link) return;
  if (!bytes) return;
  const mb = bytes / (1024 * 1024);
  const small = link.querySelector('small');
  if (small) small.textContent = `MP4 · 1080p · ${mb.toFixed(0)} MB`;
}

/* Belt and braces for the "no master yet" case: the reveal button must not
   silently download a 404 page. */
document.addEventListener('click', e => {
  const a = e.target.closest && e.target.closest('a[download]');
  if (!a) return;
  if (document.getElementById('player')?.classList.contains('pending')) {
    e.preventDefault();
  }
});
