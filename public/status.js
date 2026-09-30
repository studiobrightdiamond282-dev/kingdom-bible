// Reports the real state of each subsystem. Nothing is claimed as connected
// unless the server actually confirms it.
const rows = document.querySelectorAll('.row');
const set = (i, text, ok) => {
  const cell = rows[i] && rows[i].querySelector('strong');
  if (!cell) return;
  cell.textContent = text;
  cell.className = ok ? 'ok' : '';
};

fetch('/health')
  .then((r) => r.json())
  .then((d) => {
    set(3, d.presentation === 'operational' || d.presentation === 'shared' ? 'Operational' : 'Unavailable', true);
  })
  .catch(() => set(3, 'Unavailable', false));

// Cloud accounts are only "Connected" when a database is genuinely configured.
fetch('/api/account')
  .then((r) => r.json())
  .then((d) => {
    set(4, d.configured ? 'Connected' : 'Not connected', Boolean(d.configured));
    const note = document.getElementById('cloudNote');
    if (note) {
      note.textContent = d.configured
        ? 'Cloud accounts and sync are active. Sign in from Profile to keep your library in step across devices.'
        : 'Cloud authentication, payments and external AI are not connected on this deployment, so they are not reported as operational. Everything you create stays on this device.';
    }
  })
  .catch(() => set(4, 'Unavailable', false));
