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

- **Vercel deployment:** pending.
- **Production route checks:** pending. Verify `/privacy` and `/refund` contain no `{{WHATSAPP*}}` tokens and show the configured WhatsApp link; `/admin` must be an informational live-service handoff, not a static login form; `/status` and `/` must load after deployment.
- **Admin sign-in:** verify the handoff URL opens the live account service login, then confirm a non-admin cannot enter and an admin can reach the portal.

## Operational note

Prayer reminders are deliberately in-app only and require the app to be open. The static Vercel reader cannot provide account sign-in, subscription, referral, or ministry-hub APIs; it links readers/admins to the live Render service. No credentials or private deployment settings are included in this handover.
