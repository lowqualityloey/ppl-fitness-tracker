> **M4-22** · M3 named non-goal · `#priority/p1` · Derived from: handoff §3.4 bullet 6 ("**A true offline shell.** G-M3-1's reload-under-offline proof runs with the dev server reachable while the *API* is aborted; a browser that cannot fetch the document at all needs a cached shell — a service worker — which M3 did not ship and no card claimed (`session-runner.spec.ts:43`)"); verified on `main` 2026-09-12 — the spec's own comment block (≈:38–46) says a dead `context` cannot even reload, which is why the harness aborts only `/api/sync`.

## Intent
As a lifter in a concrete box, I want reopening the app with **no network at all** to show my session and queue instead of a browser error page — closing the last honest gap under G-M3-1 ("offline loop, one online step").

## Scope
- A service worker caching the app shell (document + build assets) for the offline-capable routes (`/session/[id]` primarily; `/` read-mostly posture decided in-PR); stale-while-revalidate or precache+update flow — *decide and document which*, because SW update policy is where offline apps get subtle wrong.
- The outbox already survives reload via IndexedDB (G-M3-1's proof); this card changes *what serves the page*, nothing about queue semantics (STATE §4.3 rules stay load-bearing).
- Replace the test trap the spec comment describes: e2e can now use `context.setOffline(true)` + real reload against the cached shell — the *faithful* simulation the comment says was "unusable here" becomes the assertion.

## Out of scope
Full PWA install story beyond minimal manifest if trivial; push; multi-device sync timing (poll/Realtime — M4-23); caching *API data* (the server remains sole truth for data; the shell is HTML/JS/CSS only).

## Acceptance criteria
```gherkin
Scenario: True airplane-mode reload works
  Given an authenticated session page opened once online, context fully offline
  When the page reloads
  Then the app shell renders from cache, the pending queue and optimistic state restore from IndexedDB, and the offline indicator posture matches §4.3's rules
  And a control proves the SW is what served it (with the SW unregistered, the same test is observed RED — a control does not exist until watched to fire)

Scenario: No stale-code landmine
  Given a deployed asset revision
  When a client holding the old shell reconnects
  Then the update flow is the documented one (skipWaiting policy stated), and an e2e or unit spec covers old-shell + new-API compatibility for at least the queue replay path

Scenario: Auth pages degrade honestly
  Given an offline cold start on /sign-in (no cached auth state)
  When the shell renders
  Then it fails as *offline*, not as *unauthorized* — the distinction asserted, not hoped
```

## Automated Verification
```bash
npm run next:build && npx playwright test session-runner.spec.ts   # incl. the upgraded setOffline(true) reload spec
npm test    # any SW-logic unit specs through the injected-cache seam (no real browser in the unit layer — D2 discipline)
```

## Definition of done
STATE §5's sentence "'reopen with no network' is proven with the *API* dead rather than the document unfetchable" retires, and the spec comment block that recorded the gap is rewritten to describe what now exists.

## Dependencies
- Coordinate with M4-14 (port/build-script changes) and M4-15 (which build is precached).
