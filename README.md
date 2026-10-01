# KINGDOM BIBLE

**Read. Study. Understand. Live the Word.**

A premium, local-first Progressive Web App for Bible reading, Scripture study, prayer journaling, reading plans, memorization, and professional church Scripture presentation.

## Included in v1.0

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
npm test                  # smoke + QR round-trip (no server needed)
node tests/integration.js # full remote/display flow (needs `npm start` running)
npm run test:all          # everything
```

`tests/qr.js` decodes the QR output with an independent decoder and checks the format
info BCH, the finder patterns, the Reed-Solomon syndromes and the exact payload across
all ten QR versions — so the connect code is proven scannable, not just plausible.

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

1. Ministry Mode → **Copy browser-source URL** (includes the session code).
2. vMix → **Add Input → Web Browser**, or OBS → **Browser Source**, at 1920×1080.
3. Paste `http://<LAN-IP>:4173/present?code=<SERVICE-CODE>` so the display follows the phone.

**Text-highlight fix** — vMix/OBS forward synthetic mouse input, which used to drag-select the
verse and paint a highlight across the output. The capture surface now blocks selection, caret,
tap-highlight and drag, and the JS defensively clears any selection the capture browser still
manages to create. Long passages auto-shrink to fit the frame instead of being cropped.

Choose **Transparent (key)** for a keyed overlay; the page body is cleared too, so vMix does not
composite black behind the text.

## Google Play compliance

Two messages appear in Play Console for a sideloaded build. Both are addressed:

- **"App scanning detected installation from an unknown source"** — expected for any APK that
  was not installed from Play. It disappears once the app is distributed through Google Play.
- **"Sensitive permissions detected: Notifications"** — caused by `Notification.requestPermission()`
  in the prayer-reminder dialog. That call has been **removed**; the reminder time is now stored
  locally only, and no OS permission is requested. A smoke-test guard fails the build if the call
  ever returns.

`public/.well-known/assetlinks.json` is included for Trusted Web Activity / Play Store digital
asset linking — replace the placeholder fingerprint with your release SHA-256.

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

`GET /health` returns service status without secrets or stack traces.

## Keyboard shortcuts

- `Ctrl/Cmd + K` — command search
- `B` — Bible
- `S` — Search
- `P` — Ministry presentation

## Version

KINGDOM BIBLE v1.0.0
