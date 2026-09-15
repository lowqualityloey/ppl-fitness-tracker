# M4-22 — Service-Worker Offline Shell: Implementation Design

**Card**: `docs/tasks/m4/M4-22-offline-shell.md` · **Issue**: #111 · **Board**: `pk:plan #111` (2026-09-16)
**Governing ratified records** (implemented, not re-debated): `DECISION-m4-003` (hand-written `public/sw.js`, no Workbox/Serwist), `ASSUMPTION-m4-004` (`skipWaiting: false`, precache keyed by build id, never cache any `/api` response, reload-offers-new-version), spec §4 goal **G-M4-4**, spec §5.4 line "`/sw.js` scope must be root-served with correct MIME".

---

## 1. Problem & Non-Goals

**Problem.** G-M3-1's "reopen with no network" is proven only with the *API* dead: `session-runner.spec.ts` aborts `**/api/sync` because `context.setOffline(true)` kills the document request itself (`ERR_INTERNET_DISCONNECTED` before the queue can be inspected). The card's comment block (~:52–63) records this as the honest gap. Closing it means a browser that cannot reach the server at all must still render the shell.

**Non-goals** (card §Out of scope, binding): no PWA install story beyond a trivial manifest if it falls out; no push; no caching of API *JSON*; no change to outbox/queue semantics (STATE §4.3 rules stay load-bearing); no multi-device timing work (M4-23).

## 2. Measured Ground (read from disk this pass, not inherited)

| Fact | Source | Consequence |
| :-- | :-- | :-- |
| `/session/[id]` is `force-dynamic` and **server-renders the session view** | `src/app/session/[id]/page.tsx:22,43–48` | "Shell = HTML/JS/CSS only" cannot be read literally: an offline reload can only show the *last rendered document*. See PD-2. |
| Middleware only refreshes the session cookie + attaches CSP; **no route redirects** | `src/middleware.ts:71–73` | `/sw.js` from `public/` passes through with a CSP header and 200 regardless of auth state. No exclusion needed. |
| CSP already carries `worker-src 'self'` + `child-src 'self'` | `lib/http/csp.ts:49–50`, asserted in `tests/unit/http/csp.test.ts:44,102–103` | **#111 requires zero CSP edits** — the pre-clearance was bought by #142 exactly for this. |
| `sign-in-form.tsx:14` has **no try/catch** around `fetch` | read this pass | Offline submit today = unhandled `TypeError`. AC-3 needs an explicit offline branch. |
| `public/` does not exist | `ls` this pass | `/sw.js` is the first entry; `next start` serves public files with no `Cache-Control` (heuristic caching) → must be pinned `no-cache` or update detection rides only the 24 h byte-check. |
| Legacy `/sw.js` registration is **fiction** | `pull-day-workout/app.js:1518–1521` registers `/sw.js`; no such file in `pull-day-workout/` | M4-14's parity flip must not confuse the new real `public/sw.js` with the legacy phantom (different port, different origin — but same *name*; record it on the M4-14 card). |
| Playwright runs against `npm run next:build && npm run next:start` | `playwright.config.ts` webServer | A post-build manifest step chained into `next:build` is automatically present in the e2e venue and CI. |
| e2e already uses `setOffline` **without reload** | `tests/e2e/sla.spec.ts:223` (G-M3-4 drain) | That spec must stay green *unmodified* after the SW ships — the SW must be transparent to failed `/api` passes. |

## 3. Component Design

```
                        ┌──────────────────────────────────────────────┐
 online                 │  public/sw.js  (hand-written, no build step) │
 ┌───────────┐  fetch   │  install: fetch /sw-manifest.json → precache │
 │ browser   │─────────►│  activate: purge non-{current,previous}      │
 │  (page)   │          │           build-id caches; clients.claim? NO │
 └───────────┘          │  fetch: policy below                         │
        ▲               └──────────────────────────────────────────────┘
        │ register('/sw.js')                     │ delegates to
 ┌──────┴──────────────┐              ┌──────────▼─────────────────────┐
 │ ShellRegistration   │              │ scripts/build-sw-manifest.ts   │
 │ client component in │              │ (pure logic + one writer)      │
 │ root layout; prod-  │              │ reads .next/BUILD_ID, walks    │
 │ runtime only        │              │ .next/static/** → manifest +   │
 └─────────────────────┘              │ stamps VERSION into sw.js      │
                                      └────────────────────────────────┘
```

### 3.1 `public/sw.js` — the fetch policy (four classes, in order)

1. **Never touch**: non-GET, anything under `/api/`, `/auth/` → `fetch(request)` pass-through, errors propagate unchanged (this is what keeps `sla.spec.ts` honest: offline API calls fail exactly as before).
2. **Navigations (GET, `mode: navigate` network-first)**: try network; on success `cache.put` into `shell-<buildId>`; on network failure serve the cached entry. **The cached response object is stored and served verbatim**, headers included — the document's own CSP header carries the same nonce that stamps its inline scripts, so the cached copy is self-consistent. A synthesized (not stored) response would *not* be.
3. **`/_next/static/**` (cache-first)**: immutable, content-hashed; serve from the newest `assets-<buildId>` cache that has it, else network-and-cache.
4. **Everything else**: pass-through, uncached.

Update flow (documented per the card's "decide and document which"): **precache + update**, not stale-while-revalidate. A new deploy changes `sw.js` bytes (the stamped `VERSION`), the browser's byte-check fetches it, the new SW **waits** (`skipWaiting: false` — a mid-workout asset swap is the forbidden state), and it activates on the next natural navigation/reopen. `ShellRegistration` listens for `controllerchange` from a *waiting* worker and surfaces a dismissible "New version ready — reload to apply" affordance (ASSUMPTION-m4-004's "reload-offers-new-version"). No forced reload, ever.

### 3.2 Manifest generation — `scripts/build-sw-manifest.ts`

Runs **after** `next build` (chained in the `next:build` script, one-line diff, see §7): reads `.next/BUILD_ID`, walks `.next/static/**` (`.js`, `.css`, fonts), emits `public/sw-manifest.json` (`{ version, urls[] }`), and stamps `VERSION` into a marker line in `public/sw.js` (idempotent replace of a `const BUILD_VERSION = "…"` line). Chunks/fonts are all under `/_next/static/` at runtime — that URL space is what gets precached, not file paths.

**Why post-build and not import-time:** `BUILD_ID` does not exist while `next.config.ts` evaluates; anything that inlines it into client code pre-build either races it or fakes it. A post-build step is also the only thing that can enumerate *this build's* hashed chunks.

### 3.3 Registration — `src/components/shell-registration.tsx`

Client component mounted in `src/app/layout.tsx`; registers only when `process.env.NODE_ENV === 'production'` (the Next inlined literal — same idiom `src/instrumentation-client.ts:18–21` documents for env reads). A SW against `next:dev` is a known footgun (HMR chunks vs. a stale cache) and the e2e venue is the production build anyway, so the dev posture is *not registered, documented, and asserted nowhere in the battery*. It also hosts the `controllerchange`→update-chip listener. Registration is unconditional on auth state (an anonymous user caching `/sign-in` is exactly the AC-3 requirement).

### 3.4 Sign-out purge

The cached navigation documents contain user data (PD-2), so Cache Storage must not outlive the session: on successful `POST /auth/signout`, the client runs `await navigator.serviceWorker.getRegistration(); await caches.delete(...)` — concretely a new exported helper called from wherever sign-out is triggered (settings page), plus `{ ignoreCache: true }` reload semantics are *not* needed — deleting the caches is sufficient because the SW never serves synthetic fallbacks for authenticated routes beyond what it stored.

## 4. Decision Ledger (PD = plan decision; † = needs Owner acknowledgment, see §8)

| # | Decision | Call | Rationale / rejected alternative |
| :-- | :-- | :-- | :-- |
| PD-1 | Update flow | **precache + update, `skipWaiting: false`**, reload-offers-new-version chip | Ratified by ASSUMPTION-m4-004; SWR for documents is rejected: it would serve a stale shell *while online*, which contradicts "server remains sole truth". |
| PD-2† | What gets cached for navigations | **the last successful navigation document, verbatim** (includes RSC payload → **user data rests in Cache Storage**) | The runner SSRs session state (§2 table), so a shell without the document cannot render AC-1. Same browser profile already holds the same data in IndexedDB — no new data *class*, a new *location*, with an explicit lifetime bound: **purged on sign-out (§3.4)**. Rejected: a generic offline page for `/session/[id]` (cannot hydrate an app-router page whose server component supplies props); caching only a static shell + moving session restore fully client-side (that is a queue-semantics change — out of scope per card §Scope bullet 2). |
| PD-3 | Which routes' documents are cached | every same-origin navigation (so `/`, `/session/[id]`, `/history`, `/progress`, `/settings`, `/sign-in`) — **one uniform rule, no allowlist** | `/` "read-mostly posture": the card left it in-PR; uniform network-first is strictly less code than an allowlist and its offline view is the last dashboard render, which is honest. The eviction rule (§3.1.2 cache naming) bounds how long any of it lives. |
| PD-4 | Test seam for SW logic | **unit tests the pure manifest builder; e2e owns all fetch behavior** | The card's D2 line says *any* SW-logic unit specs — satisfied by `build-sw-manifest.ts` (version derivation, URL selection, stamp idempotence, eviction name-matching — all pure functions). Rejected: extracting a `sw-policy.js` for Node import → either module-SW (`{type:'module'}` — browser-support claim is exactly the kind of material vendor fact the workflow refuses to guess without a citation) or duplicated policy logic (a test that passes against a copy is the STATE-item-21 failure this repo has a standing allergy to). |
| PD-5 | Cache eviction | keep **current + one previous** `assets-<buildId>`/`shell-<buildId>` generation, delete older on activate | A cached document references the chunks of *its* build; deleting the previous generation strands last-deploy's offline reload — the "stale-code landmine" AC-2 exists for. Bounded staleness (one deploy behind) is the accepted ASSUMPTION-m4-004 residual; two deploys offline degrades to the browser error page, documented. |
| PD-6 | `/sw.js` HTTP caching | `next.config.ts` `headers()`: `/sw.js` → `Cache-Control: no-cache`, correct MIME automatic from `public/` | The spec §5.4 line names MIME + root-scope; `no-cache` makes update detection immediate instead of riding the 24 h byte-check. (M4-24 rejected `headers()` *for the CSP nonce*; a static per-path header is precisely what `headers()` is for.) |
| PD-7 | Sign-in offline posture | wrap the `fetch` in `try/catch`; `TypeError`/`navigator.onLine === false` → "You appear to be offline…" **distinct string**, 4xx/5xx → existing generic error | AC-3's "asserted, not hoped" requires two observable states, not one message. |
| PD-8 | Controls | AC-1 and AC-3 each ship with an unregistered-SW (and no-cached-doc) variant **watched RED first** | House rule: a control does not exist until watched to fire. |

## 5. Failure-Mode Analysis (top rows)

| Mode | Sequence | Guard |
| :-- | :-- | :-- |
| SW not active before the controlled reload | `register` is async; the first navigation is never SW-controlled | Test flow: goto → `page.evaluate(() => navigator.serviceWorker.ready)` → one online reload (now cached network-first) → *then* `setOffline(true)` → reload asserts cache. |
| Cached doc serves but chunks 404 | eviction bug or first-ever offline after 2 deploys | PD-5 keep-previous; e2e asserts rendered content (not just a 200 document). |
| Byte-identical `sw.js` across deploys → updates never detected | stamp bug | Unit spec on the stamp function (idempotent replace, version actually embedded); e2e old-shell/new-API spec (AC-2). |
| SW corrupts the offline API story | pass-through synthesizes responses | Policy class 1 is a pure pass-through; `sla.spec.ts` re-runs unmodified as the regression witness. |
| Anonymous user's `/sign-in` document cached at a shared browser | PD-2 residual | Same purge as sign-out; documented residual; single-user v1 posture. |
| Middleware/Supabase round trip on every `/sw.js` fetch | matcher includes `.js` | Harmless (GET of a public file, cookie refresh idempotent); no plan to widen the matcher exclusion — fewer special cases. |
| Route-table gate | `public/` files are not routes | 19/19-`ƒ` §8 gate unaffected; `check-set-config.sh` unaffected. Verify anyway (it is cheap and the gate is the contract). |
| CSP regression | nothing to change | `csp.test.ts` already asserts `worker-src 'self'`; e2e csp battery re-run proves the SW itself violates nothing (it makes no cross-origin requests — self-hosted fonts confirm PD needs no new directives). |

## 6. Verification Plan

**Unit** (`npm test`): `tests/unit/scripts/build-sw-manifest.test.ts` — pure functions: URL selection from a fake `.next/static` tree, version derivation, stamp idempotence (stamp twice = stamp once), cache-name eviction predicate. Watched-red control: flip the eviction predicate's generation window to 0 and the "keep previous" spec goes red.

**E2E** (new `tests/e2e/offline-shell.spec.ts`, production build venue):
1. *Airplane-mode reload* (AC-1): sign in → start push day → warm up → tick (queue 1) → SW ready + one controlled reload → `context.setOffline(true)` → reload → shell renders, `sync-status` shows "1 waiting to sync", server still has 0 sets (reuse `completedSetCount`) → `setOffline(false)` → drains to "All changes synced".
2. *Control*: same flow with `navigator.serviceWorker.getRegistration().then(r => r?.unregister())` + cache clear before the offline reload → **observed RED** (`ERR_INTERNET_DISCONNECTED`), then restored green.
3. *No stale-code landmine* (AC-2): simulate revision by mutating the stamped version in the served `sw-manifest.json` path names (build-time: run the manifest builder twice with different fake BUILD_IDs); assert old shell + queue replay against new API works and the waiting-worker does not steal control (`skipWaiting:false` observable via `controller` identity).
4. *Auth degrade* (AC-3): offline cold context on `/sign-in` after one online visit → submit → the distinct offline message renders, and the response is *not* the 401-flavored generic error (assert the exact string split). Control: same without SW cached doc → browser error page, RED observed.
5. *Upgrade of `session-runner.spec.ts`*: the abort-API variant stays (it models "server reachable, sync refused"); its comment block is rewritten to describe both simulations (card §Scope bullet 3 + DoD). `sla.spec.ts` untouched, re-run green.

**CI venue note**: this box cannot run the browser battery end-to-end (`libnspr4.so`; the `LD_LIBRARY_PATH=/tmp/pw-libs/…` workaround per STATE §1) — e2e verification happens in CI with controls watched locally wherever the harness permits, and RED-before-trusting-green applies to every control above.

## 7. Files Touched (contract surface)

| File | Change |
| :-- | :-- |
| `public/sw.js` | **new** — hand-written SW, ~60 lines incl. policy comments |
| `public/sw-manifest.json` | generated; committed? **No** — build artifact; gitignored alongside |
| `scripts/build-sw-manifest.ts` | **new** — pure logic + writer |
| `package.json` | `next:build` → `next build && tsx scripts/build-sw-manifest.ts` (match how other scripts invoke TS); one line |
| `src/components/shell-registration.tsx` | **new**; mounted in `src/app/layout.tsx` |
| `next.config.ts` | `headers()` rule for `/sw.js` (`no-cache`) |
| `src/app/sign-in/sign-in-form.tsx` | PD-7 offline branch |
| sign-out call site (settings) | PD cache purge |
| `tests/unit/scripts/build-sw-manifest.test.ts` | **new** |
| `tests/e2e/offline-shell.spec.ts` | **new** (4 specs + controls) |
| `tests/e2e/session-runner.spec.ts` | comment block rewrite (DoD) |
| `.gitignore` | `public/sw-manifest.json` |
| `docs/STATE.md`, card, `PROMPTKIT.md` §2 command table (script change), §5 "does not exist" sentence retirement | records |

## 8. Sequencing & Open Items for the Owner

- **M4-14 (#103) / M4-15 (#104) dependency**: both still open. #111 touches `package.json`'s `next:build` (one line) — M4-15 rewires `build/dev/preview` around it. Mitigation: keep #111's script edit to that single line, record the interaction on both cards; whoever merges second rebases (this repo's rule is one active branch anyway).
- **M4-14 note to file**: the legacy `app.js` registers a `/sw.js` that **does not exist in the estate** (phantom, like `userStats`) — the flipped parity scan must assert absence of the *legacy* reference without matching `public/sw.js`.
- † **PD-2 is the one Owner-level acknowledgment** (spec §9.3 sign-off style): user data (last-rendered navigation documents) at rest in Cache Storage, purged on sign-out, bounded by the keep-previous eviction. Everything else in this design is inside the latitude the card and the ratified DECISION-m4-003/ASSUMPTION-m4-004 already granted.
