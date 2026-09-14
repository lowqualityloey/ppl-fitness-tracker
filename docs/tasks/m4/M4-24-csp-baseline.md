> **M4-24** · Security baseline · `#priority/p1` · Derived from: the M4 spec's §3.4 gap ruling and its
> §9.3(1) binding rule — **Owner ruled FILE 2026-09-14**, that the card *"must merge before or with #95,
> and its `connect-src` must already carry Sentry ingest"* — closing what master RFC §5:400 promised and
> nothing shipped: *"Server-sent, not `<meta>` … clickjacking protection moves to a real
> `frame-ancestors` directive. No `'unsafe-inline'` — nonce-based script policy."*

## Intent

As the owner, I want the Next app to stop shipping **zero** script-injection and clickjacking protection,
and I want the only policy in this repo to be the RFC's — server-sent, nonce-based, no `'unsafe-inline'`
— rather than a `<meta>` on a page browsers ignore and wave 4 deletes. It is ordered before #95 on
purpose: §9.3(1) found that a policy retrofitted under a deadline is how `'unsafe-inline'` sneakily
returns. So this card opens the `connect-src` door **before Sentry exists**, and #95's observed-to-fire
envelope is what proves the door is the right width.

One correction the grill already filed (§3.4): §5's premise — *"current pages set … via `meta
http-equiv`"* — describes **only the legacy estate**; `grep http-equiv src/` is empty. This card
**extends** that requirement to the Next app; it repairs no regression in it.

## What the record says (measured 2026-09-14 at `33865da`)

- **Nothing ships.** `grep -rn Content-Security-Policy src/` is empty. The repo's only CSP text is
  `push-day-workout/index.html:7-8`, a `<meta http-equiv>` whose `script-src` carries `'unsafe-inline'`
  — the exact token §5 forbids — beside an `X-Frame-Options` meta (`:11`) browsers ignore. #103 deletes
  that estate, so without this card M4's net effect on declared CSP is *deleting the last lie*.
- **The browser speaks to one origin: itself.** All seven client-initiated fetches are same-origin —
  `/auth/signin` (`sign-in-form.tsx:14`), `/auth/signout` (`sign-out-button.tsx:27`), `/api/sync`
  (`provider.tsx:118`), `/api/sessions` (`start-button.tsx:44`), `/api/sessions/{id}` (`runner.tsx:201`),
  `/api/profile` (`unit-choices.tsx:36`), `/api/import/legacy` (`import-panel.tsx:81`). Supabase is
  contacted **server-side only** (`middleware.ts:23`, `src/app/auth/*/route.ts`) and no browser client
  exists (`src/lib/` holds only `utils.ts`). So `connect-src` is `'self'` **plus Sentry**, *not*
  Supabase; #108's AC line ("Supabase domain in CSP `connect-src`") describes a client that does not
  exist yet, and when #108 creates one, #108 widens this policy in its own PR with its own test.
- **Header site: `src/middleware.ts`.** A nonce must be minted per request, and the `matcher` (`:59`)
  already spans every document route while excluding `_next/static`, `_next/image`, favicon and image
  extensions. `next.config.ts` → `headers()` is rejected: a static string cannot carry a nonce, and
  Next's own no-nonce example is literally `script-src 'self' 'unsafe-inline'`. `<meta>` is rejected by
  §5 by name, and `frame-ancestors` is not expressible in meta at all.
- **The nonce's price, named before it is paid.** `/sign-in` and `/_not-found` are the **only two**
  `○ (Static)` routes of nineteen. Next is blunt: *"no nonce can be injected"* into a static page, and
  misconfigured pages *"will build successfully but may encounter runtime errors"*. So a green build is
  **not** the signal — a working sign-in form against the production server is. Cheap here: no ISR, no
  CDN cache, and the battery already runs `next:build && next:start` (`playwright.config.ts:21-25`).

## Scope — the baseline policy

Dev concessions only where Next documents them (`'unsafe-eval'` for React's dev stack), gated on
`NODE_ENV`, never present in the string a production build serves.

| Directive | Value | Buys / must not break |
| :--- | :--- | :--- |
| `default-src` | `'self'` | Deny-by-default floor; the app is same-origin, so no functional cost |
| `script-src` | `'self' 'nonce-{n}' 'strict-dynamic'` + `'unsafe-eval'` in dev | §5's requirement. `strict-dynamic` propagates trust to what the framework loader appends — how Next's chunks survive `'self' + nonce`. **No `'unsafe-inline'`, any mode, ever** |
| `style-src` | `'self' 'nonce-{n}'` | Strict is affordable *because* zero `style={{…}}` and zero `<style>` were measured in `src/`; a later card needing one edits this line with a test, not with `'unsafe-inline'` |
| `connect-src` | `'self'` + Sentry (below) | The §9.3(1) coupling |
| `img-src` / `font-src` / `media-src` | `'self'` | Zero `data:`/`blob:` URIs; the optimizer is same-origin; Outfit is self-hosted at build (`layout.tsx:2`, `:11-14`); the completion chime is `AudioContext` synthesis (`state/audio-cue.ts`), so there is no media URL to gate |
| `worker-src` / `child-src` | `'self'` | Pre-clears #111: its service worker stays same-origin and need not touch this file |
| `frame-ancestors` / `base-uri` / `form-action` / `object-src` | `'none'` / `'self'` / `'self'` / `'none'` | §5's clickjacking promise, plus the legacy estate's own `base-uri`/`form-action`. Its `frame-src` YouTube allowance is **not** inherited |
| `upgrade-insecure-requests` | present in production | This harness is plain HTTP on `localhost:3001` (`playwright.config.ts:12`); the directive is what keeps the promise honest the day it isn't |

**Absent, with reasons** — a baseline that silently invents sinks is worse than a narrow one: no
`report-uri`/`report-to` and **no report-only-first rollout** (reporting into nothing collects nothing, a
report sink is a network surface this card declines to invent, and the battery's violation listener in
Verification gives the same signal for free against the enforced header rather than a shadow of it) · no
HSTS (unverifiable against a plain-HTTP harness, and the deploy that would make it observable is still
blocked on #16, production SMTP) · no COOP/COEP/CORP (no open card owns cross-origin isolation; this one
won't invent it) · no Trusted Types (cheap later *because* zero `dangerouslySetInnerHTML` was measured; its interplay with
`'strict-dynamic'` is its own card) · no `frame-src` (that permission lived only in the estate #103
deletes, `index.html:8`, and the Next app renders no iframes).

### Sentry-aware `connect-src` (#95 is error-sink-only, per `DEFERRED-m4-005`)

The browser SDK POSTs envelopes **from the page**, so this is a `connect-src` matter, not `script-src`
(its code is bundled, same-origin). This card opens the door; #95 proves its width.

1. Ship `'self'` plus **both** documented Sentry ingest shapes, `https://*.sentry.io` and
   `https://*.ingest.sentry.io`: DSN hosts come in both depths, and this card **refuses to assert what a
   CSP host wildcard matches in depth** — that claim needs a measurement, and #95's observed-to-fire
   envelope *is* the measurement, for free.
2. When #95 lands, narrow to the exact origin of the configured DSN host **in that PR** and record which
   shape the DSN needed. Widening any *other* directive to make Sentry work violates this card, not #95.
3. If #95 takes Sentry's same-origin `tunnel` route instead, `'self'` suffices, the `sentry.io` entries
   become deletable, and §9.3(1)'s ordering rule stops being breakable — so if #95 has already merged and
   envelopes are not arriving, the tunnel is the fix, not a looser policy. `strict-dynamic` in
   `script-src` does **not** cover `connect-src`; never widen-and-forget on that theory.

## Acceptance criteria

```gherkin
Scenario: Every document response carries the policy, and the nonce is per-request
  Given a production build served by next:start — the mode the whole battery already runs in
  When /, /sign-in, /history, /history/{id}, /session/{id}, /settings, /progress/{slug}, an unmatched
       path (404), and /api/sync are each requested
  Then each response carries Content-Security-Policy with default-src 'self', frame-ancestors 'none',
       base-uri 'self', form-action 'self', object-src 'none', and a script-src carrying 'nonce-…',
       plus X-Content-Type-Options: nosniff
  And no directive in the production string contains 'unsafe-inline'
  And two requests to one path yield two different nonces — the check that stops a build-time constant
       being mistaken for a nonce

Scenario: The policy is enforced, not decorative (which criterion 1 cannot supply)
  Given /sign-in in Chromium under the shipped policy
  When a script element is appended at runtime without the nonce
  Then its global side effect never appears and a script-src violation is logged
  And the page's own scripts did execute — the form still accepts input and posts — proving the nonce
       reached the framework's tags and not merely this card's fixture
  And the watched-red capture shows this spec failing when the header is dropped, and again when
       'unsafe-inline' returns; either edit alone, reverted after

Scenario: The app never violates its own policy on a document it served
  Given the existing Playwright battery, unmodified, under the shipped policy
  When it completes
  Then zero CSP violation console messages are observed — the static-route catch, because Next builds
       fine under a nonce policy and fails at runtime instead

Scenario: Clickjacking protection is the real thing
  Given /sign-in framed by a same-origin parent document
  Then the framed document never renders and the browser names frame-ancestors in the refusal
  And the same probe against the pre-change build shows no refusal (the check-can-fail control)

Scenario: Sentry ingest is permitted before Sentry exists
  Given the policy as shipped by this card, while no Sentry code exists yet
  When its connect-src is parsed
  Then it carries 'self' and both documented ingest shapes, and a set comparison pins the rest: any
       added origin, any script-src wildcard host, or any 'unsafe-inline' fails here, not later

Scenario: The static routes paid the nonce cost on purpose
  Given the route table the build prints after the change, where exactly two of nineteen routes were
       ○ (Static) before it: /sign-in and /_not-found
  Then both are ƒ, the diff names what forced them (`connection()` or equivalent), and G-M3-5's
       Lighthouse 100 on /sign-in is still green

Scenario: The repo holds exactly one CSP statement, and it is the enforced one
  When this card closes
  Then either index.html's two inert meta declarations (:7-8 CSP, :11 X-Frame-Options) are deleted with
       legacy parity green, or this card records that #103's deletion is where they die — a recorded
       choice, not a silent carry-over
```

**AC-7 RECORD (implementation, 2026-09-15): option two — chosen at the gate, not in prose.** Deleting
the metas reddens `tests/e2e/legacy-parity.spec.ts:77` ("the four legacy modules are untouched on this
branch"); its diff has no allowlist, and editing that guard inside the PR that needs the edit is the
self-loosening pattern the verification audit exists to refuse. Both metas are inert where it counts
(browsers ignore meta `X-Frame-Options`; the CSP meta governed only the estate's own pages, which #103
deletes anyway). The repo's one **enforced** CSP statement is now `src/middleware.ts`; the estate's dead
text dies with it.

## Implementation record (2026-09-15, per-AC — every number re-measured this pass)

Server: `next build` → `next start` on `:3001`, the mode the battery runs in. `npm run typecheck` 0 · `npm run lint` 0 ·
`npm run test` 52 files / 497 tests · `npx playwright test csp.spec.ts` **4/4**.

| AC | Result | Evidence, and where it did not say what the card expected |
| :--- | :--- | :--- |
| **1** headers + per-request nonce | **green** | Live `curl -D -` on `/sign-in` returns the policy with `default-src 'self'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`, `object-src 'none'`, a `script-src` nonce, and `X-Content-Type-Options: nosniff`; two GETs yield two different nonces. Spec covers `/`, `/sign-in`, `/history`, `/settings`, `/progress/{slug}`, an unmatched 404 path and `/api/sync`. |
| **2** enforced, not decorative | **green** | The srcdoc inline script and the inline `onerror` handler both stayed dead while the form typed and posted. **Watched-red (a)** — header-set removed in `src/middleware.ts` — turned it red on `"un-nonce'd markup executed — script-src is decorative"`, which is also this AC's pre-change control. |
| **3** zero violations on served documents | **green** | All-page-types sweep (unauth, 404, dashboard, settings, history, history/{id}, runner, progress) observed no violation, and the rest of the battery ran under the shipped policy: **60/62 passed**, the 2 failures being the documented load-sensitive family (`sla.spec.ts:90` G-M3-2 at p95 50.3 ms; `timers.spec.ts:278`) — re-run alone with `--workers=1` both were green, 8/8 in 1.7 min. **Deviation kept:** the card pictures the listener on a shared fixture; the battery has none, and adding one rewrites 13 spec files, which "unmodified" forbids. The sweep substitutes. |
| **4** clickjacking is real | **green** | Frame refused, browser named `frame-ancestors`. Under watched-red (a) the same test went red on `"no frame-ancestors violation was named"` — the control the AC demands. |
| **5** Sentry permitted before Sentry | **green** | `tests/unit/http/csp.test.ts` (12 tests) pins `connect-src` by set comparison with mutation controls; the e2e asserts the same set on a live response. **Watched-red (b)** — `'unsafe-inline'` appended to `script-src` — went red on test 1 plus three unit assertions, **but e2e test 2 stayed green**: a CSP3 browser disregards `'unsafe-inline'` whenever `script-src` carries a nonce or hash. Behaviour would not notice the smuggling; the string assertion does. That is why the card bans the token by text. |
| **6** the nonce price paid on purpose | **green** | Route table after the change: **19/19 routes `ƒ`**, `/_not-found` and `/sign-in` included; the named cause is the `connection()` call in each file. Lighthouse accessibility on `/sign-in`: **100, audits below 0.9: none**. Measured through Lighthouse's Node API against a manually launched Chromium because `chrome-launcher`'s WSL branch builds its temp dir from a Windows profile path this box cannot write (`EACCES: /mnt/c/Users/…/AppData/Local`) — a machine defect, not a build one: the same error precedes any page load. `lighthouse.spec.ts` is untouched and CI runs it. |
| **7** one CSP statement | **recorded** | Option two, above. |

**Not needed:** the `layout.tsx` nonce plumbing the card lists as conditional. Next reads the policy off the request
headers the middleware sets and stamps its own tags — measured: the font-preload `Link` header carried the response's
own nonce, and hydration (typing into the controlled `#email`, submitting) worked against the prod server. The AC that
decided this was AC-2's second half, so the sign-in form is the proof, as the card said it would be.

**One CI gap this card opened** (shipped in its own commit): the e2e job ran without `NEXT_PUBLIC_APP_URL`, so
`lib/auth/magic-link.ts`'s `confirmUrl()` threw and `/auth/signin` answered an empty-body 500. AC-2's "the form still
posts" is the first assertion in the battery that ever submitted that form — everything else authenticates through
GoTrue cookies (`tests/e2e/auth.ts`). Latent on `main` since M1-13; not caused by the policy.

## Automated Verification

```bash
npx playwright test csp.spec.ts                  # new: header set + nonce freshness + enforcement pair
npx playwright test                              # the whole battery, watching for CSP violations
npm run typecheck && npm run lint && npm run test # lint is clean at 33865da; keep it that way
```

`tests/e2e/csp.spec.ts` asserts the headers against the **production** server (`:3001`), checks nonce
freshness and the injected-script control, and the violation listener (`page.on('console')`) rides on the
battery's shared fixture — so a later card that quietly needs a new origin fails loudly instead of
degrading a workout screen. Gates touched: **G-M4-2** (#95's observed-to-fire proof rides on this
allowlist) and **G-M4-7** (an owner-decidable artifact per card).

## Out of scope

**The `middleware` → `proxy` rename.** Every build prints *"The "middleware" file convention is
deprecated. Please use "proxy" instead."* (codemod: `npx @next/codemod@canary middleware-to-proxy .`) and
the route table already labels the file `ƒ Proxy (Middleware)`. Renaming an RFC-mandated control's
transport in the PR that writes its policy leaves two candidates moving together the day sign-in breaks;
it is its own card, and this one is its evidence. Also out: HSTS and anything needing a real TLS edge ·
CSP *reporting* endpoints · Trusted Types · COOP/COEP/CORP · service-worker policy beyond pre-clearing
`worker-src` (#111) · Supabase/Storage origins (#108, and #103 for the estate's own) · Sentry wiring
(#95) · zero-JS build scripts (#104).

## Definition of done

RFC §5:400 is true of the shipped app: the policy is server-sent, clickjacking protection is a real
`frame-ancestors` directive, and `'unsafe-inline'` is gone from the script policy — with the enforcement
probe (a runtime-injected script that does not run, beside a sign-in form that still does) watched to
fail and the capture in the PR, per the board's definition-of-done law. And #95 then merges without
touching a single directive here.

## Dependencies

- **Blocks:** #95 (M4-06 Sentry), which merges **after or with** this per §9.3(1); #95's PR body states
  the ordering, so the two decisions are never made blind to each other.
- **Sequenced after, not gated by:** #94 (M4-05) — §6's wave-1 arrow runs #94 → this card → #95, so
  #94's `requestId` seam is the incumbent in `src/middleware.ts`. §4.3 defers echoing that id in any
  client response header *until this card settles*, and this card settles it: nothing new beyond the
  policy and `nosniff`. **Seam declared in both PRs:** the header composition in that file.
- **Future widening:** #103, #108 and #111 each own any directive change their own work requires, with
  the reason named in their PR — never `'unsafe-inline'` as the answer here.
- **Files:** `src/middleware.ts` (mint the nonce, set the headers on the matched set),
  `src/app/layout.tsx` (Next's documented plumbing that hands the nonce to its own script loader — the
  sign-in-form AC decides whether it is needed), `src/app/sign-in/page.tsx` and the 404 document (made
  dynamic), `tests/e2e/csp.spec.ts` (new), and this card.
