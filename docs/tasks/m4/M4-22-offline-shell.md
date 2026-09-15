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

## Implementation record (PR branch `feat/m4-22-offline-shell`, 2026-09-16)

**Shipped.** Hand-written `public/sw.js` (DECISION-m4-003 — no Workbox/Serwist): precache+update
with build-id stamping (`scripts/build-sw-manifest.ts` chained into `next:build`), network-first
verbatim navigation documents, cache-first `/_next/static`, and a pure pass-through for `/api/`
and `/auth/` — the worker never sees a JSON exchange, which is why `sla.spec.ts` runs against it
unmodified. `skipWaiting: false`, no `clients.claim()` (ASSUMPTION-m4-004); `/sw.js` served
`Cache-Control: no-cache` via `next.config.ts`; registration + "reload to apply" chip in
`src/components/shell-registration.tsx` (prod-only). PD-2's bound: `sign-out-button.tsx` calls
`purgeOfflineShellDocuments()` (`lib/offline/shell-cache.ts`). AC-3's honesty: `sign-in-form.tsx`
maps a `TypeError` fetch rejection to "You appear to be offline", asserted distinct from the 4xx
copy. CSP: **zero edits** — `worker-src 'self'` was pre-paid by #142.

**PD-4 (deviation, recorded before merge):** the eviction predicate left the TS unit layer — a
classic worker cannot `import`, and a unit test of a second copy grades a double. Runtime
behaviour lives in `tests/e2e/offline-shell.spec.ts` (5 specs: AC-1 airplane reload + replay, a
discard control that *must* fail offline without the shell, AC-2 eviction through the real
activate handler via unregister-reregister, AC-3/PD-7 offline `/sign-in`, PD-2 sign-out purge);
the never-do policy is pinned as a property of the shipped bytes in
`tests/unit/infra/sw-shell-source.test.ts` (no `skipWaiting`/`claim`, no `/api/` writes, manifest
version guard). Controls watched red, before and after the helper fix below: store-disabled →
AC-1+AC-3 red; keep-previous removed → AC-2 red; purge call deleted → PD-2 red.

**Two harness truths found the expensive way, both documented in the spec header:**
`next start` snapshots `public/` at boot, so mid-test file swaps cannot simulate a second deploy
— the waiting-worker/chip path is reviewed, not executed (named residual), and never-steal is
pinned statically instead. And `page.waitForFunction` with an **async** predicate resolves
instantly on the truthy Promise — three waits were silently inert until the purge mutant proved
it; all async predicates now run Node-side through `expect.poll`, which awaits.

**Also:** `completedSetCount` moved to `runner-fixtures.ts` (second use earned the shared seam);
`session-runner.spec.ts`'s gap comment rewritten to describe both simulations (the card's DoD
half); e2e census 15 → 16 in `sync-response-fixture.test.ts`. Load evidence, both full-suite
runs on this 4-core box (76 → 81 specs): run 1 `80 passed / 1 failed`, run 2 `79 passed / 2
failed` — the reds were only `sla.spec.ts`'s two time-boxed specs (G-M3-3 p95 6113/6152 ms vs
the 5000 goal; G-M3-4's 60-mutation drain outside its 15 s window once), while all five shell
specs passed both runs and `sla.spec.ts` is green in isolation with the shell live. This is the
#100 ledger's documented class — the battery is at this machine's capacity — so the budgets are
untouched, the numbers are recorded, and CI's re-watch is the arbiter, per #86's precedent.
