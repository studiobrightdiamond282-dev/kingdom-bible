# KINGDOM BIBLE reader and portal audit handover

- **Release:** 1.2.5
- **Date:** 18 November 2026
- **Working branch:** `arena/64788ef2-kingdom-bible`
- **Scope:** Reader, plans, prayer reminders, account/admin portal, static Vercel legal routes.

## Audit findings and changes

- Corrected damaged punctuation, placeholder/loading copy, and missing/ministry glyphs in the main UI; profile headings now use the resolved reader identity.
- Replaced the placeholder reading-plan logic. The annual, New Testament, Gospel, Psalms, and Proverbs schedules cover every scheduled chapter exactly once; daily references are clickable; completion advances progress; custom-plan references are validated/canonicalized; custom plans remain deletable after re-render.
- Aligned the reminder copy with the implementation: it is an on-device in-app card shown while the app is open, does not request system notification permission, and uses local calendar dates for its daily key.
- Added a Vercel static build. `scripts/build-static.js` renders the legal WhatsApp details from `config/site.js`, omits the private admin shell/script, and serves the safe `/admin` handoff page. The actual Node admin portal, HTML alias, and JavaScript require an administrator session. A fresh administrator can sign in at the live service through `/?admin=1` and is sent to `/admin` after authentication.
- Bumped the package, Node health response, and PWA cache to 1.2.5. Added regression coverage for static pages, admin routes, reading-plan schedules, links/progress, custom-plan creation/deletion, and reader Study/Notes/Saved tabs with note persistence and verse-context updates.

## Verification

- `npm test` — passed.
- `npm run test:all` — passed with the local Node ministry hub running; integration suite reported 51/51.
- `node --check` on the changed JavaScript files and `git diff --check` — passed.
- `npm run build:static` / `tests/static-build.js` — passed; output is generated in ignored `dist/`.
- VM-based UI tests exercise plan navigation/progress/custom-plan flows and reader Study/Notes/Saved tabs, note persistence, verse context, and the one-time font adjustment. No standalone browser binary is installed in the workspace, so full visual/manual browser verification is not claimed.

## Deployment and production checks

- **Vercel project settings:** build command `node scripts/build-static.js`, output directory `dist`. The production deployment `dpl_44vfXaXqK8Cd4faNcduiBSkvS3N5` is READY/PROMOTED on `https://kingdom-bible-wine.vercel.app` at merged commit `2556f50`.
- **Vercel production routes:** `/`, `/status`, `/privacy`, `/refund`, and `/admin` returned their expected pages. The legal pages have no unresolved WhatsApp placeholders and link to `wa.me/2348134438808`; `/admin` is the safe live-service handoff. `/admin.js` and `/admin-portal.html` return 404 on static hosting, confirming the private assets are absent.
- **Render live service:** `/api/premium/config` reports app version `1.2.5` and the shared support number. Unauthenticated `/admin`, `/admin.js`, and `/admin-portal.html` return the private-portal denial; `/api/auth/me` returns a null user. The shipped `/?admin=1` flow opens login for a signed-out visitor and redirects an admin after authentication. A real production sign-in was not performed (no production credentials used); authenticated-admin and non-admin access are covered by the local integration tests.
- PR #5 was merged; its Vercel preview was SSO-protected, so route checks were performed against the promoted public production alias.

## Operational note

Prayer reminders are deliberately in-app only and require the app to be open. The static Vercel reader cannot provide account sign-in, subscription, referral, or ministry-hub APIs; it links readers/admins to the live Render service. No credentials or private deployment settings are included in this handover.
