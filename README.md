# KINGDOM BIBLE

**Read. Study. Understand. Live the Word.**

A premium, local-first Progressive Web App for Bible reading, Scripture study, prayer journaling, reading plans, memorization, and professional church Scripture presentation.

## Live sites

| What | URL |
| --- | --- |
| **Live app (Vercel)** | https://kingdom-bible-deploy.vercel.app |
| Source code (GitHub) | https://github.com/studiobrightdiamond282-dev/kingdom-bible |
| Audience display | https://kingdom-bible-deploy.vercel.app/present |
| Service status | https://kingdom-bible-deploy.vercel.app/status |
| Health check | https://kingdom-bible-deploy.vercel.app/health |


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
## Hosting architecture

The app is local-first, so the whole product is static and runs in the browser. The only server-side feature is the Ministry Mode presentation broadcast, which is a separate concern from the Bible data.

```
public/     the entire PWA — HTML, CSS, app.js, service worker, and ~30 MB of Bible data
api/        Vercel serverless functions
lib/        shared, dependency-free helpers (security headers + payload store)
```

`server.js` is a plain `http.createServer` that cannot run on serverless platforms, so Vercel and Netlify serve `public/` directly and expose the same three endpoints as functions:

| Route | Purpose |
| --- | --- |
| `GET /health` | Service health, no secrets or stack traces |
| `GET /api/presentation` | Current live Scripture payload |
| `POST /api/presentation` | Update the live payload (validated and length-bounded) |
| `GET /api/presentation/events` | Server-sent updates for the audience display |

The security headers in `vercel.json` and `netlify.toml` are identical to the ones `server.js` sets, including the same Content-Security-Policy.

### Shared presentation state

By default the live payload is held in the function's memory, which is enough for a single instance. To keep the audience display in sync across regions and cold starts, attach a Vercel KV or Upstash Redis store:

| Variable | Purpose |
| --- | --- |
| `UPSTASH_REDIS_REST_URL` | Redis REST endpoint |
| `UPSTASH_REDIS_REST_TOKEN` | Redis REST token |

The app degrades safely without them. `app.js` already mirrors every update through `localStorage`, the `storage` event, and `BroadcastChannel`, so the presenter and audience windows on the same device stay in sync even with no server at all. The event stream also sends the current payload as its first frame, so a display that connects late is never blank, and each function stops before the platform's duration cap and lets the browser reconnect.


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
npm test
node --check public/app.js
node --check server.js
```

## Presentation / vMix / OBS

1. Open **Ministry Mode**.
2. Click **Open audience display**, or copy `/present`.
3. In vMix, add a **Web Browser** input at 1920×1080.
4. In OBS, add a **Browser Source** at 1920×1080.
5. Use the controller to change Scripture and presentation theme.
6. Select **Transparent** for overlay-style browser capture.

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
