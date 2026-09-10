# Technical Design Document (RFC): M3 — Presentation & Client Integration

- **Author**: Agent (DSH), with Owner decisions recorded in §2.4
- **Status**: Draft for `pk:grill` / Owner approval
- **Created**: 2026-09-11
- **Target Release**: M3 of the full-stack migration (PRs #8–#12 in the master spec's numbering)

**Parents**: `docs/specs/2026-09-08-spec-fullstack-migration.md` (master RFC, §3, §4.7, §6), `DESIGN.md`, ADR-0004, ADR-0005, ADR-0003.
**Predecessor state**: M2 is **complete** on `main` (`e1664c2` after PR #54). Every route handler exists; `npm test` 24 files / 217 tests, `test:api` 7 files / 40 passed / 0 skipped, merged-`main` CI green.

---

## 1. Executive Summary & Problem Statement

M2 produced a correct, tested, fully-scoped backend that **no user can reach**. Today's entire client surface is `src/app/layout.tsx`, a 14-line `page.tsx`, and the magic-link sign-in form. The workout itself still happens in four vanilla-JS modules on port 3000 (`ppl-workout-dashboard/`, `push-day-workout/`, `pull-day-workout/`, `legs-day-workout/` — 13,734 lines of JS/CSS/HTML between them), writing to `localStorage`, with no weight, no reps, and no cross-device capability.

M3 replaces that with the Next.js UI: a dashboard, a session runner that works offline, history and progress views, and a legacy-import dialog — built on one design-token set, verifiably WCAG 2.2 AA, and meeting the master RFC's interaction budgets rather than merely "looking like" the old app.

The specific engineering problem is **not** "render components". It is that a workout is a **long-lived, disconnected, locally-authored transaction** — a session spans 25–90 minutes, survives airplane-mode gyms, tab closes, and two devices touching the same day — while the server already owns phase gating, PR detection, and per-session ordering via `server_seq`. M3 must give the user an instant, optimistic feel without ever letting the client's version of the truth outrank the server's. The outbox, not the components, is where this milestone is won or lost.

---

## 2. Goals and Explicit Non-Goals

### 2.1 Goals (in scope, measurable)

| # | Goal | Measurement method |
| :-- | :--- | :--- |
| **G-M3-1** | Complete the offline workout loop: start a session, tick sets with prefilled weight/reps, close the tab, reopen with **no network**, see the sets still there; reconnect and watch the queue drain with no lost or duplicated sets. | Playwright E2E with `context.set_offline(true)`, asserting final server rows equal the local intent (row-level, not response-level). |
| **G-M3-2** | **Set-tap to local UI update < 50 ms**, with no network in the interaction path. | Playwright `performance.measure()` around the pointer handler in a **production** build (`playwright.config.ts` already runs `next:build && next:start`), median + p95 of 100 taps. |
| **G-M3-3** | **Cross-device propagation < 5 s p95** with the polling channel chosen in §2.4. | Two Playwright browser contexts, same user; measure the distribution of "mutation committed → visible in peer context". |
| **G-M3-4** | Outbox drains a **60-mutation queue in < 5 s** after reconnect. | E2E that enqueues 60 mutations offline, restores the network, and times the drain to server-row equality. |
| **G-M3-5** | **Lighthouse a11y = 100** on `/`, `/session/[id]`, `/history`; keyboard-only completion of a full session. | Lighthouse CI gate + a Playwright "no mouse" run that completes a session using only keyboard. |
| **G-M3-6** | No completion state, phase state, or day identity conveyed by **colour alone**. | Automated axe scan + a spec-level assertion that every such state carries an icon **and** a text label. |
| **G-M3-7** | Legacy data lands through the existing importer with its report surfaced to the user, including what was *not* recovered. | E2E asserting the dialog renders `fieldsNotRecovered`, not just "import succeeded". |

### 2.2 Non-Goals (deliberate exclusions)

- **Supabase Realtime subscriptions.** Structurally unavailable under the current authorization model (§3.4) and deferred by decision. M3 ships polling; M4 may revisit as a privilege decision.
- **Dark mode.** ADR-0005: v1 is light-only. Tokens are authored as `:root` custom properties so a later `.dark` block is additive.
- **Deleting the legacy modules, their READMEs, or their `localStorage` keys.** M4 owns decommission. M3 must run *beside* them without breaking them — including never writing to `pushWorkoutProgress`, `legsWorkoutProgress`, `pullDayProgress`, `userStats`, or `guest_mode`, so a user who has not migrated loses nothing.
- **Production SMTP / magic-link deliverability** (issue #16). A launch blocker, not an M3 task; it is the front door for a magic-link-only app and stays with the Owner.
- **Telemetry, Sentry, correlation ids, load testing at 50 rps.** M4.
- **Body-measurement / `userStats` migration.** See §5.4 — this slice names it as unrecovered legacy data rather than silently dropping it.
- **Native app, PWA install prompts, push notifications.** Out of v1 entirely.

### 2.3 Success metrics that must not regress

All 217 `npm test` assertions, 40 `test:api` specs, the mutation gate (`test:mutation` exit 0), `check-set-config.sh`, and `eslint --max-warnings=0` remain green at every M3 merge. M3 adds a **new** gate: Playwright E2E, which today has a working config and **zero spec files** (`tests/e2e/` does not exist).

### 2.4 Decisions taken for this plan (Owner-confirmed 2026-09-11)

1. **Sync channel: poll first, Realtime deferred.** Rationale in §3.4: the browser's Postgres role has no SELECT policy on any table, so Realtime cannot work without widening RLS. A bounded poll also makes the <5 s SLA a property we control and measure, rather than one that depends on a websocket we do not yet operate.
2. **`--accent-legs` = `#7a3ff2` (violet).** Measured 5.50:1 on `#ffffff`, 5.26:1 on `surface #f9fafb` — clears SC 1.4.11's 3:1 for the 2px card border *and* 4.5:1 should it ever carry text. Distinct from push/pull by hue, not merely lightness. Requires the `DESIGN.md` extension commit in M3-01.
3. **Backend gaps land as an opening slice (M3-00)** before any screen depends on them, mirroring M1's RED-first structure.
4. **Client stack: Tailwind v4 + shadcn/ui (Radix) + TanStack Query.** The repo currently has none of them — dependencies are `@supabase/ssr`, `@supabase/supabase-js`, `drizzle-orm`, `pg`, `next`, `react`, `react-dom`, `zod` and nothing else. shadcn presumes Tailwind; Radix supplies the dialog/popover semantics M3 would otherwise re-implement badly (focus trap, restore, `aria-*`).

---

## 3. Architecture & System Context

### 3.1 Request/response flow

```text
┌──────────────────────────────────────────── Client (Next.js, port 3001) ─────────────────────────────────────────┐
│                                                                                                                   │
│  RSC / route handlers ──► lib/supabase/server (cookie-scoped) ──► requireUserContext() ──► Repository ──► Drizzle│
│        │  (reads at render: dashboard, history, progress)                                            │           │
│        ▼                                                                                              ▼         │
│  Client islands (runner, forms)                                            Postgres via app_authenticated + RLS   │
│        │  writes only, always:                                                                          │         │
│        ▼                                                                                                │         │
│  SyncEngine ──► IndexedDB outbox ──► POST /api/sync ──► SyncEngine(server) ──► server_seq + PR fan-out  │         │
│        ▲                    │              │                                                            │         │
│        │                    │ (offline:    ▼                                                            │         │
│   optimistic            queue and retry)  reconcile(delta/poll) ◄── GET /api/sessions/[id]?since=seq ──┘         │
│   local state                                                                                                   │
└───────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

The rule that keeps this honest: **the client never writes to the database directly, and never trusts a render-time read as the mutation baseline.** Reads may happen at the server edge; all mutations go through `/api/sync` with a client-generated `mutationId`.

### 3.2 Deep modules and seams (with the deletion test applied)

| Module | Public interface | Complexity hidden | Deletion test verdict |
| :--- | :--- | :--- | :--- |
| **`Outbox`** (client, new) | `enqueue(mutation)`, `peek()`, `markApplied(ids)`, `drain(send)`, `status$` | IndexedDB durability, schema versioning, idempotency-key generation, exponential backoff with jitter, single-in-flight guard, quota handling, ordering across sessions | **Passes.** Delete it and the persistence/replay/backoff logic scatters into every form handler. This is where "offline workout" actually lives. |
| **`SyncEngine` (client)** = `Outbox` + `reconcile()` | `mutate(mutation)`, `reconcile(sessionId, baseSeq, serverState)`, `pending$` | Optimistic apply, rollback on rejection, merging a server snapshot under a non-empty outbox, poll scheduling and focus/visibility triggers | **Passes**, but see §3.3 — I deliberately did *not* name a separate `Reconciler` module. |
| **`TimerController`** (client, new) | `start(deadlineEpochMs)`, `remaining$`, `cancel()` | Absolute-deadline arithmetic, background-tab throttling recovery via `visibilitychange`, AudioContext unlock-on-first-gesture, cross-phase cancellation | **Passes.** The master RFC §3 documents the concrete defect it exists to kill: all three legacy modules drive countdowns with `setInterval(…, 1000)` decrementing counters, so a backgrounded tab throttles to ~1/min and a 90 s rest timer finishes minutes late. Deriving `remaining` from `Date.now()` versus a stored `endsAt` fixes the class, not the instance. |
| **`UnitDisplay`** (client, new) | `format(kg, unit)`, `parse(input, unit)` | Canonical-kg storage ↔ per-profile display unit, rounding that cannot drift a PR, locale decimal separators | **Passes.** Delete it and `× 2.20462` appears in every component that prints a weight, and the canonical kg/lb boundary (ADR-0005) stops existing. |
| **`prefill` read** (server, M3-00) | `SessionEngine.prefillFor(userId, routineDayId, excludeSessionId)` | Per-exercise last-known weight/reps, completed-sets-only filter, archived-session lookup, exclusion of the session being started | **Passes.** Server-side because "the previous session" is a domain rule (ADR-0005 G6) and must not be re-derived by each client at the cost of fetching whole sessions. |
| **`profile` read/write** (server, M3-00) | `GET /api/profile`, `PATCH /api/profile` | Claim scoping, `preferredUnit` validation, no email/display-name write path in v1 | **Passes as a thin route over existing repository patterns.** A client-side "store the unit in localStorage instead" shortcut would fail the same test: the column already exists and is per-user, so a second source of truth is worse than the endpoint. |
| `components/*` (shadcn) | props | styling primitives | **Shallow by design** — vendored, readable, replaceable. Not a candidate for abstraction beyond what shadcn gives us. |

**Interfaces are the test surfaces.** Everything above is testable without a browser: `Outbox` and `TimerController` against an injected `IDBFactory`-shaped stub and an injected clock; `reconcile()` as a pure function; `prefill` and `profile` through repository/API tests exactly like M2's; the *composition* of them (offline → reconnect → drain) only through Playwright.

### 3.3 Rejected alternatives, recorded so they are not re-litigated

- **A `Reconciler` class separate from `SyncEngine`.** Pure `reconcile(base, server, pending)` **function**, not a module. A class here would forward state between two owners of the same data and add a seam with nothing behind it.
- **Server Actions / direct repository calls for mutations.** Technically available from RSC, and wrong: `/api/sync` is the idempotent, contract-tested write path, the outbox must be able to replay it while the user is offline and after the page is gone, and an Action is a page-lifetime HTTP call. Actions remain fine for the sign-in form, which is genuinely online, stateless, and already cookie-bound.
- **`localStorage` for the outbox.** The master RFC specifies IndexedDB, and it is the right call: quota (5 MB vs hundreds of MB), structured cloning of mutation payloads, transactional batching, and no synchronous main-thread writes during the one interaction with a 50 ms budget.
- **React Query's `mutationCache` persistence as the outbox.** Its persistence layer is not an offline-first durable queue with backoff and per-item apply semantics. TanStack Query is the **server-cache and invalidation** layer; `Outbox` is the durability layer; they compose, and confusing them is how sets get lost.
- **Full RSC for the session runner.** A 60-tap-per-session, offline-tolerant, timer-driven screen is the worst possible fit for per-interaction server round trips. Dashboard, history, and progress are RSC-first; the runner is a client island.

### 3.4 Why Realtime is not available today (evidence, not opinion)

`grep -oh "TO [a-z_]*" supabase/migrations/*.sql | sort | uniq -c` → **66 policies `TO app_authenticated`, 1 `TO public`**. `grep -rin "realtime|publication" supabase/migrations/*.sql` → **no matches**. Consequences, in order:

1. Browser-side Supabase Realtime connects with the user's JWT as the `authenticated` Postgres role, which has **no SELECT policy on any application table**, so it would receive nothing.
2. No table is a member of `supabase_realtime`, so no replication messages are emitted for them at all.
3. Fixing it means adding a second policy family (`TO authenticated`) to every subscribed table — widening exactly the surface ADR-0003 chose to keep narrow — plus a migration, publication membership, and a self-hosted Realtime verification on the local stack.

Polling is therefore the honest v1 channel: it reuses the authenticated read path, keeps RLS as designed, and makes the <5 s SLA something we schedule and measure. If M4 opts into Realtime, that is a **privilege-expansion decision with its own tenancy gate**, not a configuration change.

---

## 4. Detailed Design & Contracts First

### 4.1 Contracts added in M3-00 (Zod, written before implementation)

```typescript
// lib/contracts/profile.ts  (new)
export const ProfileDataSchema = z.object({
  userId: UuidSchema,
  displayName: z.string().trim().max(120).nullable(),
  preferredUnit: z.enum(['kg', 'lb']),        // mirrors db/schema weightUnit enum
}).strict();                                   // no email: identity is not client-editable here

export const ProfilePatchSchema = z.object({
  preferredUnit: z.enum(['kg', 'lb']).optional(),
  displayName: z.string().trim().min(1).max(120).optional(),
}).strict().refine(v => Object.keys(v).length > 0, 'At least one field is required.');
```

```typescript
// lib/contracts/sessions.ts  (extension)
export const SessionPrefillQuerySchema = z.object({
  routineDayId: UuidSchema,
  excludeSessionId: UuidSchema.optional(),     // never prefill from the session being started
}).strict();

export const PrefillEntrySchema = z.object({
  exerciseId: UuidSchema,
  setIndex: z.number().int().min(0).max(50),
  weightKg: z.number().min(0).max(1000).multipleOf(0.01).nullable(),
  reps: z.number().int().min(0).max(1000).nullable(),
  sourceLocalDate: LocalDateSchema,            // the UI says "from Aug 3" — provenance is not optional
}).strict();
```

Session-detail deltas become real rather than accepted-and-discarded:

```typescript
// GET /api/sessions/[id]?since=<serverSeq>
// changed > 0  → full SessionState (cheap, always correct, no client merge needed)
// unchanged = 0 → { status: 304-equivalent no-op } with the same seq, so a poll costs almost nothing
```

The **first implementation task of that change is to delete `void parsedQuery.data.since` and its comment** at `src/app/api/sessions/[id]/route.ts:31-32`. That comment claims "M2-04 owns true deltas"; M2-04 did not ship them, and a reader who believed it would build a polling client that silently refetches whole sessions forever. Comments asserting other milestones' work are how this repo has twice been misled.

### 4.2 Storage and migration plan (Expand–Contract)

**Expected outcome: no schema migration in M3.** Justification rather than hope:

| Need | Existing? | If not |
| :--- | :--- | :--- |
| Display unit | `profiles.preferred_unit` exists, `notNull default 'kg'` (`db/schema/index.ts:67`) | — |
| Prefill source | `session_sets` + `workout_sessions` (`user_id`, `exercise_id`, `set_index`, `weight_kg`, `reps`, `is_completed`, `local_date`) | — |
| Deltas | `workout_sessions.server_seq` exists and M2-04 maintains it | — |
| Outbox | client IndexedDB, no server involvement | — |

**Indexes are decided by measurement, not by intuition** (D3 remains open — the pre-M2-04 change-tracked keyset is unmeasured, which is the cautionary tale). M3-00 writes the prefill query, runs `EXPLAIN (ANALYZE, BUFFERS)` at seeded scale, and only then decides. If an index is needed it is added **`CREATE INDEX CONCURRENTLY` in its own migration file outside a transaction**, Expand-only, with the rollback being `DROP INDEX CONCURRENTLY` — no table rewrite, no downtime, no contract phase.

Any `import_batches` or client-visible-shape change follows the same Expand → backfill/read-switch → Contract discipline already used in M2.

### 4.3 The outbox contract, precisely

```typescript
type StoredMutation = {
  mutationId: string;      // client-generated UUID, the server's idempotency key
  sessionId: string;
  seq: number;             // per-session client order, monotonic
  payload: SyncMutation;   // exactly what POST /api/sync accepts
  attempt: number;         // for backoff, not for correctness
  createdAt: number;       // ms epoch — display/diagnosis only, never a tiebreaker
};
```

Invariants, each with a named test:

- **Durable before acknowledged.** A tap is not "saved" until IndexedDB has the record. Optimistic UI may precede it; the *promise* may not.
- **Per-session FIFO, cross-session unconstrained.** The server enforces `server_seq` ordering per session and rejects out-of-order applies; the outbox never makes it harder than that.
- **Idempotent forever.** `mutationId` is generated once, at enqueue time, and survives drain, retry, tab close, and reload. A response that is lost is never a reason to invent a new id.
- **One in-flight batch.** A second concurrent drain of the same user's queue is a self-inflicted race; the 429 budget exists but is not a design goal.
- **Rejections surface, never vanish.** `rejected` items become user-visible state. A rejected mutation with no UI is a silent data-loss event with extra steps.
- **`localStorage` is never the queue.** Legacy keys are read **once**, by the import flow, and never written.

### 4.4 Design tokens (M3-01), with measured contrast

`DESIGN.md` is the source of truth (TailAdmin); master RFC §4.7 governs deviations.

| Token | Value | `#ffffff` | `#f9fafb` | Verdict |
| :--- | :--- | :--- | :--- | :--- |
| `--accent-push` | `#465fff` | 4.84:1 | 4.63:1 | **Passes** 3:1; matches the ≈4.8:1 recorded in ADR-0004 |
| `--accent-pull` | `#fb6514` | **3.01:1** | **2.88:1** | **Fails** SC 1.4.11 on the app surface |
| `--accent-legs` | `#7a3ff2` (new) | 5.50:1 | 5.26:1 | **Passes**; hue-distinct from both |
| focus ring | 2px `#465fff` + 2px offset | 4.84:1 | — | ADR-0004 override, shipped value |
| `DESIGN.md` focus | `#ecf3ff` | **1.12:1** | 1.07:1 | The already-recorded failure. Not used. |

The pull finding is new and must be fixed in M3-01 rather than argued about: §4.7 scopes accents to a day badge and a 2px card border, and a 2px border that identifies a component boundary is a non-text contrast target. M3-01 introduces **`--accent-pull-strong`** — a darkened variant for borders and badge text, derived and **measured to ≥ 3:1 on `#f9fafb` and ≥ 4.5:1 for text**, computed in the same script that produced the table above and recorded in `DESIGN.md` as a second documented extension. The bright `#fb6514` remains available where it is decorative and paired with text.

This is the second time this project has found a specified colour that fails the WCAG bar it also specifies. So M3-01 adds a **gate, not a note**: a test enumerating every token used for a border, focus indicator, or badge and asserting its measured ratio against the surface it renders on. A finding that lived only in a doc comment became a defect again within five months — that is the argument for the gate.

---

## 5. Security, Privacy & Failure Modes

### 5.1 Authorization posture for the client layer

- No new Postgres privileges in M3. §3.4 is explicit that Realtime is deferred partly to avoid granting them.
- The browser holds **no database connection string and no service key**. Only `NEXT_PUBLIC_SUPABASE_URL` and the anon key, which are already used only for the SSR cookie exchange.
- Every authenticated page resolves identity via `requireUserContext()` → `getUser()`, never by decoding a cookie — the invariant behind ADR-0003 Amendment A1.2.
- TanStack Query keys are namespaced by `userId`. A cache keyed on `['sessions']` alone is a cross-account leak through a shared browser, which is the single most likely security bug M3 can introduce. It is on the §5.3 list and gets an explicit test.
- Per-user payloads stay `no-store` (M2-06 precedent); only system content is edge-cacheable.
- Direct `set_config` remains banned by ESLint and `scripts/check-set-config.sh`.
- **CSRF**: the session cookie is the credential and `/api/sync` is a same-origin, `Content-Type: application/json` POST. M3-04 verifies the `SameSite`/`SameOrigin` posture and adds a negative control that a cross-origin form post cannot mutate a session.

### 5.2 FMEA — resilience and degradation

| Failure scenario | Prob. / Sev. | Detection | Mitigation | Recovery |
| :--- | :--- | :--- | :--- | :--- |
| Tab closed mid-session | High / Med | Re-entry finds an `in_progress` session | Outbox + session snapshot in IndexedDB | Resume screen offers "continue" with pending count and last local change time |
| Device asleep through a rest timer | High / Low | `visibilitychange` with `remaining ≤ 0` | Absolute `endsAt` arithmetic | Timer shows elapsed-past-zero, announces via `role="status"`; never a silent wrong number |
| Reconnect storm (network flaps) | High / Med | Failed `drain()` | Exponential backoff + jitter, single in-flight | Converges; `pending$` surfaces queue length to the user |
| Duplicate apply after lost response | Med / High | Server returns the mutation as already applied | `mutationId` idempotency; the server's unique ledger is the arbiter | Client marks applied, no user-visible duplicate |
| Two devices edit one session | Med / Med | `server_seq` divergence | M2-04's deterministic conflict rules win; client **never** resolves conflicts itself | Re-fetch authoritative state, keep only genuinely local pending edits |
| IndexedDB quota exceeded / private mode | Low / High | `QuotaExceededError` at enqueue | Explicit "cannot save offline" state; online path still works | Never pretend a write is durable when it is not |
| Poll returns a session mid-outbox-drain | Med / Med | `baseSeq` mismatch with pending | Merge under pending, per `(sessionId, exerciseId, setIndex)` | Pending wins locally, server wins authoritatively once drained |
| Rejected mutation (validation, out-of-order) | Med / Med | `rejected[]` in the sync response | Item-level UI state naming the set and reason | User retries or discards; nothing disappears silently |
| Server-side session already archived | Med / Med | Transition rejection from `SessionEngine` | Client mirrors the transition table, not a copy of the rules | Read the authoritative session; show archived state |
| Unit switched while a queue is pending | Low / Med | Prefill/display mismatch | **Store kg canonically in the outbox**; unit is a display concern only | No conversion on drain; render in the new unit |
| Prefill from a stale or deleted custom exercise | Med / Low | Prefill row without a resolvable exercise | Prefill returns ids and provenance together | Runner omits the suggestion; a missing number beats a wrong one |
| Import dialog on a device with legacy data | Med / Low | `LEGACY_KEYS` scan finds slots | Send only the three known slots; report `ignored`/`absent` honestly | Report enumerates unrecovered fields rather than claiming fidelity |

### 5.3 Risks the plan is explicitly aware of

- **Query-key bleed across accounts** — test required (§5.1).
- **Optimistic drift** — a rollback that leaves a checkbox visually ticked is a data-integrity bug users will report as "it ate my workout".
- **Zero existing E2E coverage**: `tests/e2e/` does not exist. The harness must be built and one test must be proven to *fail before it passes*, or "the E2E gate is green" is meaningless — which is D7, open since intake.
- **`since` semantics** must be specified in the contract *before* implementation so the client cannot assume "since" means what it wants it to mean.
- **Bundle weight** of Tailwind + Radix + TanStack Query on a phone on gym wifi: M3-01 records a first-load baseline, and M3-05 asserts no regression. The SLA table fixes no number, so we measure one rather than invent a target.
- **The <5 s polling SLA is a schedule, not a guarantee** on a throttled background tab; M3-03's test runs with the page visible and the doc says so.

### 5.4 Legacy data the importer cannot recover — surfaced to the user, not buried

`pushWorkoutProgress`, `legsWorkoutProgress`, `pullDayProgress` map onto the importer's three known slots. But inventorying the legacy modules shows two further keys — **`userStats`** and **`guest_mode`** — that no contract models. So the import UI must present a complete accounting: recovered / partial / unrecoverable-by-design, never a bare "Import successful". The pull-day path is already known-lossy (its completion path was stubbed to `return true`), which is the master RFC's own note and the reason `dateConfidence` and `fieldsNotRecovered` exist in the report.

---

## 6. Phased Implementation Milestones (TDD, one independently reviewable PR each)

- [ ] **M3-00 — Backend gaps the client needs** *(closes §4.1; blocks everything downstream)*
  `GET`/`PATCH /api/profile`; prefill read + contract; **real `since` deltas** (including deleting the misleading comment as the first task). Contracts and failing tests first; repository + API suites green; `EXPLAIN (ANALYZE, BUFFERS)` recorded for the prefill query with an index decision attached to the evidence. **No migration expected.**

- [ ] **M3-01 — Token foundation and gates** *(no product screens)*
  Tailwind v4 + shadcn init; tokens under `:root` as CSS custom properties; Outfit self-hosted; ADR-0004 focus ring; `--accent-legs #7a3ff2` and measured `--accent-pull-strong` both added to `DESIGN.md` as documented extensions; first-load bundle baseline captured; **Playwright harness created with the deliberately-failing test that proves it runs** (D7); the token-contrast gate of §4.4; axe wired into CI.

- [ ] **M3-02 — Dashboard `/` and sign-in polish**
  Day cards with badges and phase summaries (system content from `/api/exercises` + routine days), RSC-first, keyboard-complete, `aria-current` on day navigation, colour-plus-icon-plus-label. Lighthouse 100 on `/`.

- [ ] **M3-03 — Session runner (the hard one)**
  Client island; `SessionEngine` transitions mirrored, never re-derived; set rows with prefilled weight/reps and canonical-kg storage; `Outbox` + `reconcile()` + `TimerController` with their unit tests; polling channel with focus/visibility triggers; optimistic tap under the 50 ms budget. The **offline E2E lands here**, not in M4 — M4's variant is the 50 rps load test.

- [ ] **M3-04 — History, progress, settings, legacy import**
  `/history` list + detail; `/progress/[exerciseSlug]` on the M2-06 trendline (already `no-store`); settings for `preferredUnit` with `UnitDisplay`; import dialog rendering the full report; CSRF posture verified (§5.1). Lighthouse 100 on `/history`.

- [ ] **M3-05 — Accessibility and SLA verification**
  Full WCAG 2.2 AA audit with findings fixed rather than logged; keyboard-only session completion; live-region announcements for timers and notifications; dialog focus trap/restore; G-M3-2/3/4 measured **on the production build** and recorded with numbers in `docs/STATE.md`; this is also the natural place to close the outstanding **production-mode p95 for `/api/sync`**, since the Playwright config already boots `next:build && next:start` and the M2-06 gate's 800 ms dev ceiling is the one open perf claim.

**M3 exit criteria:** G-M3-1…G-M3-7 measured and green; every pre-existing gate still green; Playwright suite present, running in CI, and *demonstrably capable of failing*; `docs/STATE.md` describing what exists with numbers re-measured on merged `main`; legacy modules untouched so a non-migrated user loses nothing.

---

## 7. Sign-off & Grilling Checklist

- [ ] Non-goals agreed (§2.2) — particularly: no Realtime, no dark mode, no legacy deletion, SMTP stays #16.
- [ ] §2.4 decisions confirmed in writing (all four, Owner-answered 2026-09-11).
- [ ] Zero-downtime plan verified: **no migration expected**, index decision evidence-gated, `CONCURRENTLY` rules understood (§4.2).
- [ ] FMEA covers every failure with a named detection method, not only a mitigation (§5.2).
- [ ] Test surfaces are public interfaces, not private mocks (§3.2).
- [ ] **`pk:grill` before the first line of M3 code** — the priority questions are the outbox's ordering and merge rules (§4.3), polling's SLA arithmetic (§3.4), and whether `--accent-pull-strong` should be a new token or a corrected `--accent-pull` (§4.4).
- [ ] Then `pk:tasks` to decompose M3-00…M3-05 into issues with Gherkin AC, in `docs/tasks/m3/`, matching M2's task-file shape.
