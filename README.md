# KINGDOM BIBLE

**Read. Study. Understand. Live the Word.**

A premium, local-first Progressive Web App for Bible reading, Scripture study, prayer journaling, reading plans, memorization, and professional church Scripture presentation.

## New in v1.2.1

- **Scripture lock for Voice Preacher Mode** scans every interim speech frame. A complete
  book + chapter + verse dispatches immediately when more speech follows; edge references
  use a 350 ms fuse, chapter-only references use a 1.1 second hold, and the dedupe key is
  locked at dispatch so one verse cannot fire twice. `KingdomRef.scan()` exposes `atEnd` for
  this timing decision.
- **In-app User Manual** is available from the Ministry page, Profile, and the `Ctrl/Cmd + K`
  command palette. It covers navigation, reading, search, Ministry setup, Voice Mode and
  microphone/Voicemeeter troubleshooting, secure microphone origins, phone QR pairing, and
  vMix/OBS browser-source setup.
- **KINGDOM BIBLE PRO foundation** adds a 30-day trial with a seven-day warning, Silver
  (₦2,500), Gold (₦5,000), Premium (₦10,000), and Unlimited (₦20,000) monthly plans,
  Paystack server-side checkout boundaries, referral wallets, three-working-day withdrawal
  review, admin free-access grants, secure admin portal entry, profile photo upload, WhatsApp
  support, and privacy/refund pages. Payment and AI secrets are deployment environment values;
  no live credential is committed.
- **Share and earn.** Every account has a referral link (`/?ref=CODE`) shown in Profile and in
  the account sheet, with copy and native-share buttons. Any share from the app — including
  sharing a verse — attaches that link, and `?ref=` is credited on both email registration and
  Google sign-up. Earnings appear under **Earnings & Wallet** in Profile: withdrawable balance,
  people invited, total earned, and a progress bar to the ₦1,000 minimum. Withdraw unlocks at
  ₦1,000 and is reviewed by an administrator.
- **Password handling.** The sign-in form has show/hide and "Keep me signed in", which asks the
  server for a 30-day cookie. The browser stores only the email address — never the password.
  Forgotten passwords use a one-time 6-digit code issued from the admin portal (no mail provider
  is configured); codes are single-use, expire in 30 minutes, and are stored hashed.
- **Profile photos** are downscaled to 320px in the browser, then stored on the account so they
  follow the user to another device. Only PNG/JPEG/WebP data URLs under 512 KB are accepted.
- **Update notifications.** When a new service worker finishes installing, the app shows an
  "Update now" banner; choosing it activates the new version and reloads once. Bump
  `VERSION` in `public/sw.js` (and `VERSION` in `server.js`) on every release or users will
  never be told.
- **Support number.** The WhatsApp number is defined once as `SUPPORT_PHONE` in `server.js`,
  exposed through `/api/premium/config`, and injected into the policy pages as
  `{{WHATSAPP}}` / `{{WHATSAPP_LINK}}`. Change it there, never in a page or bundle.
- **App icons** are generated from `public/assets/logo.png` by `npm run icons`. The favicon,
  PWA icons, and maskable icon therefore always match the real logo.
- **Shared-link branding.** `public/assets/logo-social.png` (1200×630, built from
  `logo-hero.png` by `npm run social`) is the picture shown when the hub URL is shared on
  WhatsApp, Facebook or X. `index.html` wires it up as `og:image` / `twitter:image` with full
  Open Graph, Twitter and canonical tags. Every one of those URLs is emitted through the
  `{{ORIGIN}}` placeholder, which `server.js` fills from the request host (or `PUBLIC_URL`
  when the hub is reached under a different name). Do not hardcode a hostname in a page: a
  relative `og:image` is ignored by every crawler, which is why the link used to preview as
  bare text. The card is deliberately not in the service-worker precache — crawlers never run
  the worker, and 400 KB of image would slow first install for no offline benefit.
- AI study access uses plan fair-use allowances rather than an unsafe promise of unlimited
  paid API usage. The optional provider is configured with `AI_API_KEY`, `AI_API_URL`, and
  `AI_MODEL`. Admin audit records cover security, payment, referral, and withdrawal events;
  the app does not secretly record every page visit, location, microphone audio, or reading page.

## New in v1.2

- **Shared Scripture reference engine** (`public/bible-ref.js`) used by the reader, Search,
  Ministry Mode, the phone remote (via `server.js`) and Voice Preacher Mode. It understands
  `John 3:16`, `jn 3 16`, `Jn.3.16`, `1john2:5`, ranges (`John 3:16-18`), whole chapters
  (`Psalm 23`), misspellings (`jhon`, `revelations`) and spoken forms
  (“the book of John chapter number one verse three”). Matching runs in strict-first tiers:
  exact → prefix → subsequence → edit distance. This removes the "Reference not found"
  regression: the old parser accepted only an exact book name with a colon.
- **Voice Preacher Mode (premium, hands-free)** in Ministry Mode: the app listens to the
  sermon and projects every spoken Bible reference to the audience display within
  milliseconds of recognition. Spoken commands: “next verse”, “previous verse”,
  “blank screen”, “show the verse”, “stop listening”. Includes live transcript, per-verse
  latency readout, instant-send or approve-first mode, translation and accent settings.
  - Needs Chrome or Edge (Web Speech API) and a secure page (`https://` or
    `http://localhost:4173`). A plain `http://192.168…` LAN address cannot access the
    microphone — the card explains this honestly instead of failing silently.
  - Recognition accuracy belongs to the browser's speech service; recognised references are
    resolved only against the real canon, never guessed. Free-speech scanning uses the
    strict matching tiers only, so ordinary preaching cannot hallucinate a verse.
- Ministry "Send Scripture live" now accepts ranges and whole chapters, and explains
  exactly why a reference failed instead of a bare "Reference not found".
- `Permissions-Policy` now grants `microphone=(self)` (and nothing else) in both
  `server.js` and `vercel.json`.

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
npm test                  # smoke + reference/voice timing + QR + display auto-fit (no server needed)
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
2. The "Connect a phone remote" card shows a **service code**, a QR code, and a **direct phone link**.
3. Use **Open phone remote** or **Copy link** first. The direct link already contains the service code. If scanning fails, type that full link on the phone; never use `localhost` on the phone.
4. If the card says "Needs Wi-Fi", connect the ministry computer to the same Wi-Fi as the phone, open the app from its LAN address, and allow Node.js through the firewall. Do not use a guest network that isolates devices.
5. Type a reference (`John 3:16`), pick a translation, press **Send**.

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

## Premium deployment configuration

The premium account foundation is server-side and must not be deployed as a static-only site.
Copy `.env.example` into deployment secrets and set a new admin password. The supplied
Paystack `pk_live` value is a publishable key, but it should still be injected through
`PAYSTACK_PUBLIC_KEY`; the matching `PAYSTACK_SECRET_KEY` must remain server-only. Never
commit either key or an admin password.

The included `server.js` provides account sessions, a 30-day trial, the seven-day warning,
Paystack initialize/verify boundaries, referral wallet entries, withdrawal requests, admin
free-access grants, and an in-app audit log. The JSON store is suitable for local testing only;
production should move it to PostgreSQL or another durable database before taking payments.
The AI assistant is optional and requires `AI_API_KEY`; its “Unlimited” plan is fair-use capped
so provider costs cannot grow without control.

The administrator portal is at `/admin`. Holding the Kingdom Bible logo for 2.5 seconds only
opens that route; actual access still requires `ADMIN_EMAIL` and `ADMIN_PASSWORD`. The admin
can grant free access, review withdrawals, and mark payments complete. Hidden page-by-page
surveillance is intentionally not implemented: audit logs cover authentication, payment,
referral, withdrawal, and security events and are explained in the Privacy Policy.

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
{"ok":true,"app":"KINGDOM BIBLE","version":"1.2.1","presentation":"operational",
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

KINGDOM BIBLE v1.2.1 — `package.json`, `server.js` and the service-worker cache version are
kept in sync, and a smoke test fails the build if they drift.

## Duplicate-folder cleanup (one-time, on the ministry PC)

The canonical source of truth is the Git checkout of
`studiobrightdiamond282-dev/kingdom-bible` (branch `main`).
`C:\Users\DELL\Downloads\kingdom-bible-deploy` is a stale copy — never edit or deploy it.

1. In the canonical repo: `git status --short` must be clean.
2. In the Vercel dashboard: Project → Settings → Git — the project must deploy from
   `kingdom-bible.git` @ `main`, root directory = the repo root (where `vercel.json` lives).
3. Rename the old folder to `kingdom-bible-deploy.ARCHIVED-<date>` (or zip it), never merge
   its files back.
4. Push / redeploy, hard-refresh (`Ctrl+F5`), verify Search + Reader + Ministry, then delete
   the archive after one good service.
