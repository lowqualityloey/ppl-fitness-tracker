# M3 Exit Report & M4 Handoff — 2026-09-12

**Slice:** M3-10 (#67), the verification gate. Every number below is quoted from a run recorded in
`docs/tests/2026-09-11-m3-verification-audit.md` (entry 16 holds the one command sequence that
regenerates all of them); nothing here is inherited from a plan.

**M3 verdict: complete, with the misses and the margins named rather than absorbed.** M3-00…M3-09
merged 2026-09-11 as PRs #69, #71, #72, #74, #75, #79, #81, #83, #85; M3-10 lands with this
report. Against the spec's exit criteria: the seven goals are measured (§1), every pre-existing
gate is still green (§2), the Playwright suite runs in CI and has been *watched* to fail — by
injection nine times and, once, by catching a real defect unaided (§3, audit entries 9–15),
`docs/STATE.md` describes what exists, and the legacy modules are untouched with parity *measured*
rather than assumed.

> **Status, added 2026-09-12 in the post-merge state sync:** this report merged as **PR #86
> (`8704c19`, 2026-09-11T19:23Z)** and **#73 merged on top of it as PR #87 (`2d5edfb`,
> 2026-09-12T02:00Z)**, so milestone #3 now reads **open=0 / closed=19 — M3 is closed, not closing**.
> §3.4's #73 bullet is superseded (see the erratum there); everything else in §3 stands as M4's
> starting facts, and `docs/STATE.md` §7 item 22 is the start line.

## 1. The seven goals

| Goal | Verdict | Where measured | Numbers (recorded run) |
| :--- | :--- | :--- | :--- |
| G-M3-1 offline loop, one online step | **Pass** | `tests/e2e/session-runner.spec.ts` (offline tick survives reload, drains, row-level server assertion), `sla.spec.ts` G-M3-4 | queue survives reload (IndexedDB, not memory); server rows equal local intent |
| G-M3-2 tap→UI < 50 ms, production build | **Pass** | `sla.spec.ts` G-M3-2 | median 14.5 / p95 16.8 / max 16.8 ms (n=17); 100-tap spec median 16.2 / p95 31.3 ms |
| G-M3-3 cross-device < 5 s p95, polling | **Pass — margin is the poll itself** | `sla.spec.ts` G-M3-3 | n=5 median 4353 / p95 4503 ms against 5000. The 4 s `POLL_INTERVAL_VISIBLE_MS` floor *is* the measurement; see §3.1 |
| G-M3-4 60-mutation drain < 5 s | **Pass after a defect was found and fixed** | `sla.spec.ts` G-M3-4 | Pre-fix: 4693–9660 ms, *missed*, recorded as a miss (audit entry 4). Post-fix (`9ca17cc`): **1643–1838 ms across five runs**, one batch POST [200], 5/5 (audit entries 15, 16's table). The budget never moved |
| G-M3-5 Lighthouse 100 + keyboard-only | **Pass** | `lighthouse.spec.ts`, `a11y.spec.ts:102` | 100 on `/`, `/history`, `/session/[id]`, `/sign-in`; keyboard-only completion passes behind the mouse guard (which was watched to throw, audit entry 10); the test flaked once under suite load with budgets untouched (entry 17) |
| G-M3-6 no colour-alone state | **Pass, with the gate tightened here** | `a11y.spec.ts:146`, contrast gate | measured `hueCarriesState=false` (tick colour is *constant*); glyph + word + `aria-pressed` carry state; the break-each-gate pass found the gate itself had a hole and fixed it (`4ca87e5`, audit entry 13); contrast gate now follows `var()` indirection and measures the alias layer (35/35, `96b5202`, audit entries 2/14) |
| G-M3-7 import report surfaced, losses included | **Pass** | `tests/e2e/import.spec.ts`, `settings.spec.ts` | dialog renders `fieldsNotRecovered` per key; settings states plainly that body measurements are *not* imported |

Exit criteria also demanded *a suite demonstrably capable of failing*: unit gates (audit 1, 2, 14),
E2E gates (audit 9–13), harness guards (`axe` injected image-alt, dev-server tripwire — entry 5
era), RLS mutation suite (`npm run test:mutation`, green on this branch), and the legacy-parity
scan catching its own author's bug (entry 3). Nine deliberate breakages this slice, each restored;
two permanent controls kept because the hole was real (word carrier, alias re-point) plus one
because the fix is new (connectivity reset).

## 2. Gates still green that arrived before M3

preflight green · lint 0 errors 0 warnings · typecheck 0 · `npm test` and `test:api` totals in
audit entry 16's table · schema drift + RLS suites green · production `/api/sync` **ceiling**
(800 ms, M2-06's) holds at p95 234–282 ms · legacy modules and keys untouched (`git diff` + scan).

## 3. M4 handoff

M4 is, per the master RFC: **hardening, telemetry, decommission** — plus everything M3 explicitly
did not do, listed here so M4's spec starts from facts rather than memory.

### 3.1 The performance promises M3 kept by the skin of its arithmetic

- **G-M3-4's history is a warning about ceilings.** The drain *missed* 5 s throughout M3-10's
  first pass because a backoff window grown while offline survived the reconnect (audit entry 15).
  Fixed on this branch; the pre-fix samples stand as the record. M4's load test must re-measure
  the drain **under contention** — 1.7–1.8 s is a solo number; server-side apply of a 60-mutation
  batch is the untested part.
- **G-M3-3's margin is a 4 s poll interval, not engine speed.** p95 4503 vs 5000 ms budget means
  any real slowdown eats it. Poll cadence is pinned by the §8.3 limiter arithmetic (120 req/min
  per user, polls ≤ 40%) — so the fix is not a shorter poll. It is Realtime, and Realtime is a
  **privilege decision**: the browser's role has no SELECT policy on application tables
  (spec §3.4), so enabling it widens RLS and needs its own tenancy gate. Deferred by owner
  decision; M4 owns whether to revisit.
- **Production `/api/sync` p95 misses the documented 200 ms budget**: p50 187.5–199.0 / p95
  234.2–282.1 / max 268.6–302.2 ms across 50 single-mutation POSTs on this machine (two recorded
  runs; PR #72's CI saw 222.0 ms). The 200 ms figure stayed *documented, not enforced*; the
  enforced 800 ms ceiling holds. This is the honest current state of the claim, not a regression.
- **The rate limiter is process-local** (`lib/auth/rate-limit.ts`): N instances = N × every
  budget. Fine on one box, fiction on many. M4's multi-instance story needs shared state or
  documented acceptance.

### 3.2 Telemetry and observability (spec §2.2 — explicitly not in M3)

Structured logging with correlation ids, Sentry, and the **50 rps load test against the
`/api/sync` SLA** (master RFC M4 line). Also retired-from-prose: connection-pool behaviour under
sustained load is precisely this load test (master RFC grill note: per-request cost is measured,
sustained exhaustion is not). Outbox metrics exist *in UI only* (badge depth); depth/age
*metrics* were the FMEA's detection plan and exist as an on-screen count — decide whether that
satisfies "surfaced" or a real metric channel is needed.

### 3.3 Decommission (spec §2.2: M4 owns it; M3 was required to run *beside* all of it)

- Delete the four legacy static modules and their two fictional READMEs; drop the five
  `localStorage` keys (`pushWorkoutProgress`, `legsWorkoutProgress`, `pullDayProgress`,
  `userStats`, `guest_mode`). M3 never wrote them (measured: audit table, legacy-parity row).
  `tests/e2e/legacy-parity.spec.ts` is the guard that will **fire when you delete them** — it
  asserts the keys' *existence* is what makes the import story true; flipping that scan is a
  deliberate M4 step, not a green-suite chore.
- `npm run build` (legacy Vite) emits zero JavaScript and `dist/` is inert — its removal retires
  the footgun documented in PROMPTKIT §2.
- `SECURITY_IMPROVEMENTS.md` cleanup (M3-10 card out-of-scope list).

### 3.4 Features M3 explicitly did not build (named so they don't become folklore)

- **Per-stretch countdowns.** Only the between-sets `rest` phase drives a real timer; the stretch
  section renders "rest 90s" as *static text* (`src/app/session/[id]/runner.tsx` — the countdown
  component is gated to `serverView.phase === 'rest'`). Either wire the sequence to the same
  `TimerController` or remove the misleading seconds.
- **Timer persistence across reload.** Deliberate (M3-07 card: "a rest timer is not worth outbox
  traffic") — a reload loses the running countdown. Revisit if evidence says it costs users.
- **Volume/streak analytics** (M3-08 out-of-scope). The legacy dashboard derives these from
  `new Date().getDay()` against a hardcoded schedule — not from anything the user did. M4 must
  not port that fiction; compute from sessions or show nothing.
- **Body measurements / `userStats`** (M3-08/M3-09 out-of-scope): no contract models them; the
  settings screen says import does not cover them, which is honest but not a plan.
- **Data export.** The master RFC's risk register prescribed "a JSON export escape hatch so data
  is never hostage"; never built. The outbox UI shows the queue, not the archive.
- **A true offline shell.** G-M3-1's reload-under-offline proof runs with the dev server
  reachable while the *API* is aborted; a browser that cannot fetch the document at all needs a
  cached shell — a service worker — which M3 did not ship and no card claimed (`session-runner.spec.ts:43`).
- **#73 — `SessionStateSchema` is still a passthrough placeholder** and still sits *under
  milestone M3* while the milestone closes. The view layer (`lib/views/session-view.ts`) is the
  seam that carries the real typing today. Move it to M4 or finish it; do not let milestone 3
  "complete" by ignoring an open child.
  > **Erratum, added 2026-09-12 after this report merged — the bullet above is no longer true.**
  > The owner took the call the bullet asked for: #73 **stayed under milestone 3 and was
  > finished**, merging as **PR #87 (`2d5edfb`, 2026-09-12T02:00Z)**. `SessionStateSchema` now
  > describes the session graph (`.strict()`, enums reused from `contracts/common.ts`),
  > `lib/views/session-view.ts` is a re-export of it rather than a second opinion, and all three
  > producers validate what they send. **M4 does not own the schema.** What it *does* own are the
  > two limits #73 disclosed and did not close — `SyncResponseData.state` has no runtime consumer,
  > and `tests/e2e/session-runner.spec.ts:174` mocks that field in a shape the contract never had
  > — both carried in `docs/STATE.md` §7 item 22. The text above is left as written because it is
  > the state of the milestone at the moment this report was authored.

### 3.5 Open issues parked with their evidence (raise them, don't re-derive them)

- **#76** no API path produces an archived session → #63's archived-session scenario untestable.
- **#77** sync rejections carry only a code → the client cannot explain a refused change (the
  `rejections`/`discardRefused` seam is exactly what would render it).
- **#78** two mutations for one entity in the same millisecond are decided by a random UUID (LWW
  tie-break) — needs a deterministic tie-break (server seq / deviceId order) or a documented
  acceptance.
- **#80** the API/E2E fixture layer uses one hardcoded id set → parallel specs delete each
  other's rows (the reason this suite runs `fullyParallel` carefully).
- **#82** `/history` card asks for `?from=`/`?to=` paging; `SessionsListQuerySchema` accepts only
  an opaque cursor — contract decision, then UI.
- **#84** the weight ceiling rejects thousands-grouped input ("2,000 lb") — `parseForInput` in
  `src/app/state/unit-display.ts` handles grouping for the *value*, but the parse-and-ceiling
  interaction is what the issue calls out; read the issue before touching it.
- **#16** production SMTP/delivery, open since M1 (milestone 1) — magic-link delivery is still the
  local stack's; a real deploy needs this closed first.

### 3.6 Gate improvements the audit suggested and did not implement

- Lighthouse scores a zero-width-space accessible name as a *name* (audit entry 11, first
  injection — measured 100). A "renders as nothing" name is invisible to this gate; axe did not
  catch it either. If this matters, it needs a structural check (e.g., the a11y.spec DOM scan
  extended to reject name-only-ZWSP), not a louder Lighthouse.
- The contrast matrix measures **enumerated** tokens; a brand-new alias token must be added to
  `GATE_MATRIX` by hand (the matrix comment records which shipped aliases are deliberately absent
  and why). Generating rows from the `@theme inline` mapping would close the class of omission.
