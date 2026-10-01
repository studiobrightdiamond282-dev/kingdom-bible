# KINGDOM BIBLE

**Read. Study. Understand. Live the Word.**

A premium, local-first Progressive Web App for Bible reading, Scripture study, prayer journaling, reading plans, memorization, and professional church Scripture presentation.

## Included in v1.1

- Complete 66-book Bible reader with KJV, ASV, and WEB public-domain translations
- 1,189 chapters and 31,102 KJV verses
- Full-Bible worker-based text search and reference navigation
- 263,000+ TSK cross-reference links across 29,000+ verses
- Bookmarks, six-color highlights, rich Scripture notes, reading history, and real streak metrics
- Translation comparison and browser device read-aloud
- Private local prayer journal with status and categories
- Daily devotional and nine reading plans
- Scripture memorization practice
- KINGDOM AI local Scripture study assistant with transparent safety boundaries
- Ministry Mode with live presentation screen, SSE/BroadcastChannel synchronization, themes, service timer, vMix and OBS guides
- Phone remote with QR pairing, service-code locking, and server-side Scripture resolution
- Responsive desktop, tablet, mobile, projector and 16:9 display layouts
- Light, dark, sepia, AMOLED, and high-contrast themes
- Installable PWA, runtime caching, offline fallback, accessible keyboard/focus behavior
- Personal JSON data export and local privacy controls
- Security headers, request validation, payload limits, basic rate limiting, health endpoint

## Run locally

```bash
npm start
```

Open `http://localhost:4173`.

## Test

```bash
npm test                  # smoke + QR round-trip + display auto-fit (no server needed)
node tests/integration.js # full remote/display flow (needs `npm start` running)
npm run test:all          # everything
```

`tests/qr.js` decodes the QR output with an independent decoder and checks the format
info BCH, the finder patterns, the Reed-Solomon syndromes and the exact payload across
all ten QR versions — so the connect code is proven scannable, not just plausible.

`tests/fit.js` extracts `fitText()` **verbatim from `public/app.js`** and runs it against a
mocked layout engine. It proves the audience display never crops a verse, that a single
verse stays projector-large, that the previous 18px floor really did overflow a whole
chapter, and that resizing a vMix input re-fits the text.

## Phone remote + vMix

Open **Ministry Mode**. The server runs a **live service session**, so a phone on the same
Wi-Fi can drive the audience display.

1. `npm start` prints a LAN address such as `http://192.168.100.5:4173`.
2. The "Connect a phone remote" card shows a **service code**, a **QR code** and the **phone address**.
3. On the phone, scan the QR **or** type the address and enter the 6-character code.
4. Type a reference (`John 3:16`), pick a translation, press **Send**.

The phone can send verses, step next/previous (crossing chapter and book boundaries),
blank the screen, and switch look. Verses resolve **server-side**, so the phone never
downloads the multi-megabyte Bible files.

**If the phone can't connect**

| Problem | Fix |
| --- | --- |
| Times out | Allow Node.js through Windows Firewall: *Windows Security → Firewall → Allow an app → Node.js*, on **Private** networks. |
| Wrong address shown | Virtual adapters (Docker/WSL `172.17–172.31`) are ignored; use the `192.168.x.x` or `10.x.x.x` address. |
| Blank output | Put the phone and PC on the same Wi-Fi — guest networks often isolate clients. |

**Pairing security** — every mutating action and the display stream require the 6-character
code; wrong codes get `401`. Codes live in server memory only and reset on restart.

### vMix / OBS

1. Ministry Mode → **Copy browser-source URL**. It copies the **LAN address plus the live
   service code**, e.g. `http://192.168.100.5:4173/present?code=AB12CD` — never
   `localhost`, and never a code-less URL that would ignore the phone.
2. vMix → **Add Input → Web Browser**, or OBS → **Browser Source**, at 1920×1080.
3. Paste that URL. The display then follows the phone live.
4. **Open audience display** opens the same coded URL on the ministry PC for a preview.

Because the URL carries the code, restarting the hub or reloading the Ministry page does
not break a running vMix input: the code is reused rather than rotated.

**Text-highlight fix** — vMix/OBS forward synthetic mouse input, which used to drag-select the
verse and paint a highlight across the output. The capture surface now blocks selection, caret,
tap-highlight and drag, and the JS defensively clears any selection the capture browser still
manages to create.

**Never-cropped text** — a long passage (a whole chapter) used to run off the top and bottom of
the frame because the shrink loop gave up at an 18px floor. `fitText()` now binary-searches the
largest font size that fits the frame, and if even the floor overflows it scales the whole block
down uniformly. It re-fits whenever the browser input is resized. `?debug=1` reveals the
connection dot, which is otherwise hidden so it never appears in captured output.

Choose **Transparent (key)** for a keyed overlay; the page body is cleared too, so vMix does not
composite black behind the text.

## Deployment

The app has two halves, and they deploy differently.

**Static PWA (Vercel)** — reading, study, search, prayer, plans and devotional work fully at
the edge. Deployed from `public/` via `vercel.json`, with SPA rewrites for `/present`,
`/remote` and `/status`.

```bash
npx vercel --prod          # manual
```

**Live ministry hub (local)** — `/api/*`, the phone remote, vMix SSE and LAN discovery are
**not** in the static build. They require `npm start` on the ministry PC, because the hub is
intentionally LAN-only: it discovers the local address, holds the session in memory, and
streams to devices on the same Wi-Fi with no internet and no cloud account.

The static build detects the missing API and tells the user to start the hub rather than
showing a raw `HTTP 404`.

## Google Play compliance

Two messages appear in Play Console for a sideloaded build. Both are addressed:

- **"App scanning detected installation from an unknown source"** — expected for any APK that
  was not installed from Play. It disappears once the app is distributed through Google Play.
- **"Sensitive permissions detected: Notifications"** — caused by `Notification.requestPermission()`
  in the prayer-reminder dialog. That call has been **removed**; the reminder time is now stored
  locally only, and no OS permission is requested. A smoke-test guard fails the build if the call
  ever returns.

`public/.well-known/assetlinks.json` is included for Trusted Web Activity / Play Store digital
asset linking. The committed file ships an **empty** `sha256_cert_fingerprints` array rather
than a fake value — a placeholder fingerprint silently fails Play verification. Generate the
real one from your upload keystore:

```bash
npm run assetlinks -- ./upload-keystore.jks
```

This runs `keytool`, writes the exact SHA-256 into `assetlinks.json`, and refuses debug
keystores (Play signs releases with the upload key). Commit the result.

## Data and licensing

- **KJV**: Public domain in the United States. Rights vary by jurisdiction (notably the Crown’s prerogative in the UK); production operators must confirm local requirements.
- **ASV (1901)**: Public domain.
- **World English Bible**: Public domain.
- **Cross references**: CrossReferences.org / Treasury of Scripture Knowledge dataset, CC BY 4.0. Attribution must be retained in production.
- The supplied KINGDOM BIBLE logo is used as the product artwork.

No copyrighted commercial translations or licensed audio are bundled. The read-aloud control uses the browser/operating system speech service and is labeled as device read-aloud.

## Production architecture notes

This repository is a dependency-free, local-first release. Notes, prayers, highlights, and profile settings remain in `localStorage`; this is explicitly disclosed in the interface. Real cloud authentication, multi-tenant church accounts, payment providers, external generative AI, remote device pairing, and push scheduling require production infrastructure and are not falsely presented as connected.

For production SaaS deployment, add:

- PostgreSQL with row-level tenant authorization
- Server-side email/social authentication and secure HTTP-only sessions
- Object storage with signed URLs
- WebSocket/SSE session tokens for multi-device presentation
- Stripe/Paystack/Flutterwave hosted checkout
- Licensed translation/audio providers
- Queue-backed email and Web Push
- External AI provider behind server-side citation verification, cost controls, and safety policy
- Automated encrypted backups, monitoring, audit logs, and CI/CD environments

Never place provider secrets in browser code. Use the names in `.env.example` on the server only.

## Health check

`GET /health` returns service status without secrets or stack traces:

```json
{"ok":true,"app":"KINGDOM BIBLE","version":"1.1.1","presentation":"operational",
 "sessionActive":true,"listeners":1,"uptime":412,"serverTime":1757404800000}
```

The service **code is never returned** from `/health`, `/api/network` or `/api/state` — only
from routes authenticated with the code itself. Otherwise anyone on the church Wi-Fi could
read the pairing code out of a discovery probe and hijack the projector.

## Hub detection (why the website cannot run a service)

The phone remote, the service code, the SSE stream and server-side verse resolution all live
in `server.js`. A static host such as Vercel serves `public/` and nothing else, so the
ministry controls genuinely do not exist there.

`public/hub-probe.js` decides which world the page is in, and the app renders three honest
states instead of pretending:

| State | When | What the presenter sees |
| --- | --- | --- |
| `online` | `/health` returns real JSON stamped `app: "KINGDOM BIBLE"` | Service code, scannable QR, LAN address, green **Live** |
| `static` | Host answers, but there is no hub (Vercel) | Instructions to run `npm start`, plus **Check again** |
| `offline` | Nothing answers (hub stopped) | The same, worded for a local page |

**A status code is never treated as proof.** Vercel answers `GET /health` with **200
`text/html`** (the SPA rewrite catches every unknown path) and `404` on `/api/*`, so a naive
`res.ok` check would report a dead hub as live. `hub-probe.js` requires a JSON body carrying
this application's marker, and the phone remote and `/status` use the same rule.

The card never renders a blank QR canvas, a dashed `------` code or a green **Live** pill
without a real hub. **Check again** re-probes in place, so once `npm start` is running the
card flips to live without a page reload — no need to reload the phone mid-service.

Presenter control still works without a hub: Previous/Next walk the canon locally from the
bundled data, crossing book and chapter boundaries exactly like the server does.

### Pairing stability

`ensureSession()` retires a saved service code **only** on an explicit `401`. A dropped
request or a Wi-Fi blip is not proof the code is stale, and rotating it would orphan every
paired phone plus any vMix input that is mid-service.

## Keyboard shortcuts

- `Ctrl/Cmd + K` — command search
- `B` — Bible
- `S` — Search
- `P` — Ministry presentation

## Version

KINGDOM BIBLE v1.1.1 — `package.json`, `server.js` and the service-worker cache version are
kept in sync, and a smoke test fails the build if they drift.
