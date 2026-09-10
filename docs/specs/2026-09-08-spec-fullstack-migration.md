# Technical Design Document (RFC): Full-Stack PPL Fitness Tracker

- **Author**: Lead Engineer (paired with Kiro)
- **Status**: Draft — open decisions resolved 2026-09-08, see §7
- **Created**: 2026-09-08
- **Last Revised**: 2026-09-08 (ADR-0001…0005 accepted; auth provider changed from Clerk to Supabase Auth)
- **Target Release**: v1.0.0 — Milestones M0–M4

---

## 1. Executive Summary & Problem Statement

The PPL Fitness Tracker is currently three independently-written vanilla-JS pages plus a dashboard shell, persisting to three divergent `localStorage` keys. Progress is trapped on one browser, no training history survives a completed workout (`clearProgress()` wipes the key on completion), and the dashboard's streak/volume figures are derived from `new Date().getDay()` against a hardcoded schedule rather than from anything the user actually did. The production build additionally emits zero JavaScript, because all four `<script>` tags are classic scripts that Vite declines to process.

This RFC converts the application to a server-authoritative full-stack app: Supabase Auth magic-link identity, a PostgreSQL schema of record on Supabase, typed API routes for workouts and progress, multi-device sync that survives a gym with no signal, and a one-time lossy-but-honest import of existing `localStorage` progress. The primary outcome is that a set logged on a phone mid-workout is durable, attributable to a real user, visible on a laptop seconds later, and still there next month.

---

## 2. Goals and Explicit Non-Goals

### Goals (In Scope)

- **G1 — Durable history.** Every completed set is persisted server-side and survives session completion, browser reset, and device change. Completing a workout archives it rather than deleting it.
- **G2 — Real identity.** Supabase Auth email magic-link sign-in. Every row is attributable to a user id derived server-side from the session, never from a request body.
- **G3 — Data-driven content.** The 18 exercises and 15 stretches currently hardcoded across three HTML files move into `exercises` / `routine_exercises`. Adding a set becomes a data change, not a four-site JS edit.
- **G4 — Multi-device sync.** A set checked on device A appears on device B within 5s while both are online, with a deterministic conflict rule when they aren't.
- **G5 — Offline-capable sessions.** A full workout can be completed with zero connectivity; the mutation queue drains within 5s of reconnect with no lost or duplicated sets.
- **G6 — Weight and rep logging.** *Scope addition, confirmed in scope per ADR-0005.* The current app records set completion as a bare boolean — no weight, no reps. "Workout history" is not meaningful without them, and personal records and progression are impossible. `session_sets` carries nullable `weight_kg` and `reps`, **prefilled from the previous session** for that exercise, so the steady-state flow remains one tap and logging load costs zero extra interaction. Kilograms are canonical in storage; display unit is a per-profile preference.
- **G7 — Proven tenant isolation.** An automated test attempts a cross-user read through the production Drizzle client and asserts zero rows. This test is a merge gate.
- **G8 — Accessibility floor.** The session flow is completable by keyboard alone, timers and notifications announce via live regions, and the three primary routes score 100 on Lighthouse a11y. The current push-day page contains zero `aria-*` attributes across 1032 lines; that is the baseline we are leaving.

### Measurable SLAs

| Metric | Target |
| :--- | :--- |
| `POST /api/sync` p95 latency | < 200 ms @ 50 rps |
| Set-tap to local UI update | < 50 ms (optimistic; no network in the interaction path) |
| Cross-device propagation (both online) | < 5 s p95 |
| Outbox drain after reconnect | < 5 s for a 60-mutation queue |
| Cross-user data leakage | 0, verified by CI |
| Lighthouse a11y, `/`, `/session/[id]`, `/history` | 100 |
| Legacy import fidelity | 100% of recoverable push/legs set data; explicit loss report for pull |

### Non-Goals (Explicit Scope Boundary)

Written down because this repo already carries two module READMEs advertising a React/Express/PostgreSQL/JWT/Cloudinary system that does not exist. Not repeating that.

- Nutrition, macro, or calorie tracking
- Progress photos and media upload
- Social feed, sharing, achievements, badges
- Push notifications and workout reminders
- Apple Health / Google Fit / wearable integration
- A custom routine *builder* UI — v1 seeds the PPL program and allows per-user overrides of sets/reps/weight only
- Native iOS/Android apps (the web app is installable; no app-store artifact)
- Coach/team/multi-tenant organisations — the tenancy unit in v1 is a single user
- Strength-progression charting beyond a simple per-exercise e1RM trendline

---

## 3. Architecture & System Context

### High-Level Architecture

```text
┌──────────────────────────┐
│  Client (Next.js 16 RSC) │
│  ┌────────────────────┐  │   1. optimistic local write (<50ms)
│  │ SyncEngine         │  │   2. enqueue mutation {id, ts, op}
│  │  IndexedDB outbox  │──┼──────────┐
│  └────────────────────┘  │          │
└──────────┬───────────────┘          │ POST /api/sync (batched, idempotent)
           │ Realtime WS              ▼
           │              ┌────────────────────────────────────┐
           │              │ Next.js 16 Route Handlers          │
           │              │  requireUser() -> supabase          │
           │              │    .auth.getUser()  (server client) │
           │              │  Zod parse -> SessionEngine         │
           │              └──────────────┬─────────────────────┘
           │                             │ Drizzle, as app_authenticated
           │                             │ (NOBYPASSRLS, non-owner)
           │                             │ + set_config('request.jwt.claims')
           │                             ▼
           │              ┌────────────────────────────────────┐
           └──────────────┤ Supabase PostgreSQL 17.6 + RLS     │
        session_sets      │   auth.users  ──trigger──> profiles │
        changes for       └────────────────────────────────────┘
        session_id                       ▲
                                         │ magic link (custom SMTP)
                           ┌────────────────────────────────────┐
                           │ Supabase Auth (same project)       │
                           └────────────────────────────────────┘
```

Identity and data live in the same Postgres instance, so there is no cross-vendor identity sync path at all. That removal is the main engineering dividend of ADR-0002.

### Deep Module Decomposition & Seams

> Deletion test applied to each: does it concentrate complexity, or scatter boilerplate?

| Module / Seam | Public Interface | Internal Complexity Hidden |
| :--- | :--- | :--- |
| **SessionEngine** (server) | `start(userId, routineDayId, clientId)`, `completeSet(...)`, `advancePhase(...)`, `finish(...)` | Phase-gate predicates, the one-active-session-per-day invariant, PR detection fan-out, task-completion tallies. Replaces three divergent client implementations, one of which had gating stubbed to `return true`. |
| **SyncEngine** (client) | `enqueue(mutation)`, `subscribe(sessionId)`, `status$` | IndexedDB outbox durability, idempotency key generation, exponential backoff, LWW reconciliation against server state, Realtime merge, clock-skew detection |
| **WorkoutRepository** | every method takes `userId` as its required first argument | RLS transaction setup and `request.jwt.claims` config, connection pooling. **Justification against the deletion test:** a repository that only forwards to Drizzle would be a shallow pass-through and should be inlined. This one earns its existence because it is the single place the RLS-scoped transaction is opened — no caller can accidentally query outside it. |
| **LegacyImporter** | `import(raw: Record<string,string>) -> ImportReport` | Three mutually incompatible storage schemas, the unrecoverable pull-day path, fingerprint-based idempotency, date-confidence inference |
| **TimerController** (client) | `start(durationMs) -> { endsAt }`, `remaining$` | Absolute-deadline arithmetic, background-tab throttling recovery via `visibilitychange`, AudioContext unlock-on-first-gesture, cross-phase cancellation |

`TimerController` exists because of a specific current defect: all timers in all three modules are decrementing counters driven by `setInterval(…, 1000)`. Browsers throttle background timers to roughly once per minute, so a 90-second rest timer in a backgrounded tab finishes minutes late. Storing an absolute `endsAt` and deriving remaining time from `Date.now()` fixes the class of bug rather than the instance.

### State Ownership

| State | Owner | Invalidation |
| :--- | :--- | :--- |
| Identity, email, session token | Supabase `auth.users` (same database) | Supabase-managed; `public.profiles` row created by an in-database trigger, not a network webhook |
| Exercise library, routines | PostgreSQL (system rows, `owner_user_id IS NULL`) | Immutable per deploy; seeded by migration |
| Session + set records | PostgreSQL (record of record) | `server_seq` monotonic counter per session |
| Active-session working copy | Client IndexedDB | Reconciled against server on every sync response |
| Personal records | PostgreSQL, materialised | Recomputed on set write inside the same transaction |
| Timer deadlines | Client only, never synced | Derived from absolute `endsAt`; deliberately not server state |

---

## 4. Detailed Design & Contracts First

### 4.1 Domain Models (Drizzle)

Abbreviated to the load-bearing decisions.

```ts
// profiles.id IS auth.users.id — same UUID, no mapping table, no mirror drift.
// Every domain FK points at profiles.id, so auth.uid() is directly comparable
// in every RLS policy with no lookup function required.
export const profiles = pgTable('profiles', {
  id:            uuid('id').primaryKey(),   // FK -> auth.users(id) ON DELETE CASCADE (raw SQL: auth schema)
  email:         text('email').notNull(),
  displayName:   text('display_name'),
  preferredUnit: weightUnit('preferred_unit').notNull().default('kg'), // display only
  createdAt:     timestamptz('created_at').notNull().defaultNow(),
});

export const exercises = pgTable('exercises', {
  id:            uuid('id').primaryKey().defaultRandom(),
  slug:          text('slug').notNull().unique(),
  name:          text('name').notNull(),
  muscleGroups:  text('muscle_groups').array().notNull(),
  equipment:     text('equipment'),
  formTips:      text('form_tips'),
  videoUrl:      text('video_url'),
  alternatives:  text('alternatives').array().notNull().default(sql`'{}'`),
  ownerUserId:   uuid('owner_user_id').references(() => profiles.id, { onDelete: 'cascade' }),
});

export const workoutSessions = pgTable('workout_sessions', {
  id:            uuid('id').primaryKey().defaultRandom(),
  userId:        uuid('user_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  routineDayId:  uuid('routine_day_id').notNull().references(() => routineDays.id),
  clientId:      uuid('client_id').notNull(),          // client-generated, for idempotent start
  status:        sessionStatus('status').notNull().default('in_progress'),
  phase:         sessionPhase('phase').notNull().default('pre_workout'),
  source:        sessionSource('source').notNull().default('app'), // 'app' | 'legacy_import'
  localDate:     date('local_date').notNull(),         // user's calendar day, not UTC
  startedAt:     timestamptz('started_at').notNull().defaultNow(),
  completedAt:   timestamptz('completed_at'),
  serverSeq:     bigint('server_seq', { mode: 'number' }).notNull().default(0),
  updatedAt:     timestamptz('updated_at').notNull().defaultNow(),
}, (t) => ({
  // Kills the "both devices started a workout" duplicate at the database layer.
  oneActivePerDay: uniqueIndex('one_active_session_per_day')
    .on(t.userId, t.routineDayId, t.localDate)
    .where(sql`status = 'in_progress'`),
  clientIdUnique: uniqueIndex('session_client_id').on(t.userId, t.clientId),
  historyLookup:  index('session_history').on(t.userId, t.localDate.desc()),
}));

export const sessionSets = pgTable('session_sets', {
  id:          uuid('id').primaryKey().defaultRandom(),
  userId:      uuid('user_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  sessionId:   uuid('session_id').notNull().references(() => workoutSessions.id, { onDelete: 'cascade' }),
  exerciseId:  uuid('exercise_id').notNull().references(() => exercises.id),
  setIndex:    integer('set_index').notNull(),
  isCompleted: boolean('is_completed').notNull().default(false),
  weightKg:    numeric('weight_kg', { precision: 6, scale: 2 }),  // nullable: G6
  reps:        integer('reps'),
  clientTs:    timestamptz('client_ts').notNull(),   // LWW tiebreak only
  updatedAt:   timestamptz('updated_at').notNull().defaultNow(),
}, (t) => ({
  // The natural key. Makes every set write an idempotent upsert.
  naturalKey: uniqueIndex('set_natural_key').on(t.sessionId, t.exerciseId, t.setIndex),
  weightSane: check('weight_sane', sql`weight_kg IS NULL OR (weight_kg >= 0 AND weight_kg <= 1000)`),
  repsSane:   check('reps_sane',   sql`reps IS NULL OR (reps >= 0 AND reps <= 1000)`),
}));

// Fixed-key checklist / warm-up / stretch completion. Per-row rather than a JSONB
// blob so each item syncs and conflict-resolves independently.
export const sessionTasks = pgTable('session_tasks', { /* sessionId, taskKey, completedAt, clientTs */ });

export const personalRecords = pgTable('personal_records', { /* userId, exerciseId, bestE1rm, achievedAt, sessionId */ });

// Idempotency ledger for the offline outbox.
export const syncMutations = pgTable('sync_mutations', {
  mutationId: uuid('mutation_id').primaryKey(),        // client-generated
  userId:     uuid('user_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  appliedAt:  timestamptz('applied_at').notNull().defaultNow(),
});

export const importBatches = pgTable('import_batches', { /* userId, sourceFingerprint UNIQUE(userId, fp), report jsonb */ });
```

### 4.2 Authorization: two layers, one of them authoritative

Per ADR-0003 both layers ship. Layer 1 is the control; Layer 2 is the backstop.

> **Verified 2026-09-08 by the M0 spike.** Enforcement was demonstrated end to end through Drizzle, and each control was removed in turn to confirm the suite fails without it. Five corrections came out of it, all folded into this section and recorded in full at `docs/spikes/2026-09-08-drizzle-rls-enforcement.md` / ADR-0003 Amendment A1. The two that change code: `withUser` needs a second `set_config` (A1.1), and the app role gets **no** privileges on the `auth` schema, so nothing outside a policy may call `auth.uid()` (A1.2).

**Layer 1 — application, authoritative.** Every mutation enters through a Route Handler or Server Action that calls `requireUser()`, which resolves the Supabase session server-side via the SSR server client and returns `user.id`. No handler reads a user id from a request body or query param. `WorkoutRepository` methods take `userId` as a required positional argument; there is no helper that accepts an unscoped filter.

**Layer 2 — Postgres RLS, defense in depth.** Drizzle connects as `app_authenticated`, a role created explicitly `NOBYPASSRLS` and deliberately *not* the owner of any table. Each request opens a transaction that seeds the verified JWT claims before touching data:

```ts
export async function withUser<T>(claims: SupabaseJwtClaims, fn: (tx: Tx) => Promise<T>) {
  return db.transaction(async (tx) => {
    // Third arg `true` = is_local: scoped to THIS transaction only.
    // Non-negotiable under transaction pooling — see FMEA row 2.
    //
    // The first statement is not redundant. auth.uid() reads the LEGACY singular
    // GUC first and only falls back to request.jwt.claims, so a stale
    // session-scoped request.jwt.claim.sub silently outranks the claims we set.
    // Demonstrated in the M0 spike; see ADR-0003 Amendment A1.1.
    await tx.execute(sql`SELECT set_config('request.jwt.claim.sub', '', true)`);
    await tx.execute(sql`SELECT set_config('request.jwt.claims', ${JSON.stringify(claims)}, true)`);
    return fn(tx);
  });
}
```

```sql
ALTER TABLE session_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_sets FORCE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own sets." ON session_sets
  FOR SELECT TO app_authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Users insert their own sets." ON session_sets
  FOR INSERT TO app_authenticated WITH CHECK (user_id = (SELECT auth.uid()));
-- separate UPDATE and DELETE policies; never FOR ALL
```

**What ADR-0002 bought us here.** Because `profiles.id` *is* `auth.users.id`, policies compare `user_id` directly against `auth.uid()`. The Clerk design needed a custom `app.current_user_id()` function to resolve an external subject claim into an internal UUID, marked `STABLE` so Postgres evaluated it once per statement rather than once per row. That function, its volatility marker, and the whole class of bugs around it are now deleted rather than solved. `auth.uid()` is wrapped in a scalar subselect so the planner hoists it out of the row loop — the same optimisation, for free.

Migrations and seeds run under the owner role via a separate `MIGRATION_DATABASE_URL`, available to CI only. The Supabase `service_role` key never appears in client-reachable code.

**The gate that makes Layer 2 real.** `tests/integration/tenancy.test.ts` seeds two users, authenticates as A, and asserts every repository read returns zero rows for B's ids — executed through the same Drizzle client and the same `app_authenticated` role the app uses. Two known ways this gate goes green while production is open, both of which it must therefore also cover:

1. **Wrong role in the test harness.** If the test connects via `MIGRATION_DATABASE_URL` (owner, `BYPASSRLS`) it passes vacuously. The test asserts `current_user = 'app_authenticated'` as its first statement. Note that `FORCE ROW LEVEL SECURITY` does *not* save you here — it removes the owner's ownership exemption but not the `BYPASSRLS` attribute, and Supabase ships `postgres` with that attribute set. Confirmed in M0.
2. **A table added after M4 with no policy.** RLS is per-table, not per-database. A future migration that creates a table and forgets `ENABLE ROW LEVEL SECURITY` is unprotected, and no existing test would notice. Mitigated by a schema-drift test that queries the catalog and fails on any table in `public` that has `rowsecurity = false`, **or has RLS enabled with zero policies** (denies everything, looks safe, is a broken deploy), **or carries a `FOR ALL` policy**. The last two were added after M0 showed the narrower `rowsecurity` check passing over both states.

A third hole, found during M0 rather than reasoned about: **a mitigation with no exercised failure mode**. The `is_local` invariant was asserted but never demonstrated. The suite now runs a deliberately wrong `is_local = false` variant first, on a pool pinned to one connection, and requires it to leak — otherwise the passing case proves nothing.

### 4.3 API Contracts

Unified envelope per the `PROMPTKIT.md` guardrail: `{ ok: true, data: T } | { ok: false, error: AppError }`.

```ts
// POST /api/sync — the single write path for session mutations.
export const SyncMutationSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('set.upsert'),
    mutationId: z.string().uuid(),
    clientTs: z.string().datetime(),
    sessionId: z.string().uuid(),
    exerciseId: z.string().uuid(),
    setIndex: z.number().int().min(0).max(50),
    isCompleted: z.boolean(),
    weightKg: z.number().min(0).max(1000).nullable(),
    reps: z.number().int().min(0).max(1000).nullable(),
  }),
  z.object({ op: z.literal('task.complete'), /* … */ }),
  z.object({ op: z.literal('phase.advance'), /* … */ }),
  z.object({ op: z.literal('session.finish'), /* … */ }),
]);

export const SyncRequestSchema = z.object({
  deviceId: z.string().uuid(),
  sinceSeq: z.number().int().nonnegative(),
  mutations: z.array(SyncMutationSchema).max(200),
});

export const SyncResponseSchema = z.object({
  serverSeq: z.number().int(),
  applied: z.array(z.string().uuid()),        // mutationIds accepted
  rejected: z.array(z.object({ mutationId: z.string().uuid(), reason: z.string() })),
  state: SessionStateSchema,                   // authoritative post-merge session
  clockSkewMs: z.number().int(),               // server-observed, for client warning
});
```

Route surface:

| Method | Path | Purpose |
| :--- | :--- | :--- |
| `POST` | `/api/sync` | Batched idempotent session mutations. Sole write path during a workout. |
| `GET` | `/api/sessions?cursor=` | Paginated history |
| `POST` | `/api/sessions` | Start (idempotent on `clientId`); returns existing session if one is active today |
| `GET` | `/api/sessions/:id` | Full session state, `?since=<seq>` for delta |
| `GET` | `/api/exercises` | Library; cacheable, `s-maxage=3600` |
| `GET` | `/api/progress/:exerciseSlug` | e1RM trendline + PR history |
| `POST` | `/api/import/legacy` | One-time localStorage import, idempotent on fingerprint |
| `GET` | `/auth/confirm` | Magic-link token exchange, sets the session cookie, redirects |
| `POST` | `/auth/signout` | Clears the session |

`POST /api/sync` is rate-limited to 120 req/min/user; `/api/import/legacy` to 5 req/hour/user.

No user-lifecycle webhook exists. Profile creation is an `AFTER INSERT` trigger on `auth.users` running in the same transaction as the signup, and deletion cascades from `auth.users` via the `profiles.id` foreign key. Both are database-local, so there is no network hop that can silently fail — the failure mode the Clerk design had to defend against with a JIT upsert and a nightly reconciliation job simply does not arise.

### 4.4 Multi-Device Sync & Conflict Resolution

1. **Optimistic local write.** Tap → IndexedDB write → UI update. No network on the interaction path.
2. **Outbox.** The mutation, carrying a client-generated `mutationId` and `clientTs`, is appended to a durable IndexedDB queue. The queue is never cleared on failure, only on server acknowledgement.
3. **Idempotent apply.** The server inserts `mutationId` into `sync_mutations` inside the same transaction as the domain write. A duplicate hits the primary key, and the mutation is reported as applied without re-running. Replaying the entire queue is therefore safe.
4. **Conflict rule — per-row Last-Write-Wins on `session_sets`,** keyed by the natural key `(session_id, exercise_id, set_index)`. The winner is the higher `clientTs`; ties break on `deviceId` lexicographically for determinism. LWW is defensible here because the conflicting field is a single user's own set record, and the two candidate values are "checked" and "unchecked" — there is no merge semantics to preserve and no second party to disadvantage.
5. **Clock skew.** `clientTs` is untrusted. The server compares it to receipt time; beyond 5 minutes of skew it substitutes server time and returns `clockSkewMs` so the client can surface a warning. Ordering across devices always uses the server-assigned `serverSeq`, never client clocks.
6. **Fanout.** Supabase Realtime subscription on `session_sets` filtered to `session_id`. Received rows merge through the same LWW reducer as sync responses — one code path, not two. Fallback: poll `GET /api/sessions/:id?since=<seq>` at 15s while a session is active and the socket is down.
7. **Concurrent start.** Handled by the partial unique index rather than by application checks. Device B's insert fails, the handler catches the constraint violation and returns the existing session — B joins rather than forking.

### 4.5 Legacy localStorage Migration

The three existing keys have three different shapes. Each gets its own Zod parser.

| Key | Recoverable | Loss |
| :--- | :--- | :--- |
| `pushWorkoutProgress` | Full set-level completion (keyed by real element ids: `ex1-set1`…`ex6-set2`), phase, `timestamp` | No weight or reps — never captured |
| `legsWorkoutProgress` | Full set-level completion, phase, per-timer state | No weight/reps; no `timestamp`, so session date is inferred |
| `pullDayProgress` | **Aggregate counts only** (`completedSets`, `completedExercises`) | Per-set detail is unrecoverable. `saveProgress()` keyed checkbox state by `checkbox.id`, and the dynamically rendered set checkboxes never had an `id` — all 17 collapsed into a single object key. The data was never written. **Erratum (2026-09-11, M2-05):** the key is the **empty string** in a real browser — `Element.id` reflects the content attribute and is `""` when absent — whereas `"undefined"` is what this row originally recorded and is what a hand-authored or restored payload can carry. Both spellings mean the same thing ("identity lost") and the importer treats them as one sentinel. The distinction is not cosmetic: `BooleanMapSchema` is `z.record(z.string().min(1), z.boolean())`, so the `""` spelling made a genuine browser-produced `pullDayProgress` fail validation *as a whole*, which would have reported real user history as malformed. The importer strips the sentinel before validating, and reports the loss. |
| `userStats` (dashboard) | Nothing to migrate | Read by `getUserStats()` but written by nothing. Streaks and hours were computed from day-of-week and `Math.random()`, so there is no real history to preserve. |

Flow:

1. Client detects legacy keys pre-import and shows a dialog with a per-key preview count and an explicit note about the pull-day limitation. No silent background import.
2. `POST /api/import/legacy` with the raw payload. Server parses per-key, tolerates partial failure, and creates `workout_sessions` with `source = 'legacy_import'`.
3. Session date: `pushWorkoutProgress.timestamp` where present; otherwise import date with `date_confidence: 'low'` recorded in the batch report.
4. Idempotent on `unique (user_id, source_fingerprint)` where the fingerprint is a SHA-256 of the raw payload. Re-running returns the original `ImportReport` and writes nothing.
5. On 2xx the client **renames** keys to `*_archived_2026_09_08` rather than deleting, and drops them after 30 days. A failed or regretted import stays recoverable.
6. The response `ImportReport` is shown to the user: sessions created, sets recovered, fields that could not be recovered and why.

### 4.6 Zero-Downtime Schema Evolution

The database is greenfield, so v1 has no Expand-Contract obligation — stating that plainly rather than inventing a migration lifecycle to satisfy the template. Two real commitments:

- **Accepted coupling.** `profiles.id` is `auth.users.id`, so every domain foreign key transitively depends on Supabase Auth owning identity. Stated as a real cost of ADR-0002, not hidden: migrating to a different auth provider later means an Expand-Contract across the FK graph — add `profiles.external_id`, dual-write, switch reads, then repoint. Accepted because a single-user fitness tracker has no realistic provider-migration pressure, and the alternative (a mapping table plus a `STABLE` resolver function in every RLS policy) is a permanent tax paid to hedge a hypothetical.
- **Binding from M1 forward.** Every subsequent schema change follows Expand → Backfill & Read-Switch → Contract, in separate deploys. The `session_sets.weight_kg` / `reps` columns land nullable in the initial migration precisely so the eventual "require weight for barbell lifts" rule is a backfill and a constraint, not a table rewrite.
- **Rollback (RPO/RTO).** Supabase PITR enabled, 7-day window. RPO ≤ 2 min, RTO ≤ 30 min. Every migration ships with a tested `down` and is applied to a branch database in CI before production.

### 4.7 Design Tokens & Visual Unification (ADR-0004, ADR-0005)

The current app carries three stylesheets of roughly 41KB each with mutually unrelated palettes, plus a separate set of gradient variables on the dashboard — one application with three visual identities. v1 collapses this to a single token set derived from `DESIGN.md` (TailAdmin), exposed as CSS custom properties and consumed by shadcn/ui.

**One base palette, everywhere.** Surfaces, text, borders, inputs, cards, and shadows come from `DESIGN.md` unchanged and are identical on every route: `surface #f9fafb`, `surface-bright #ffffff`, `on-surface #101828`, `outline #d0d5dd`, Outfit across all type scales, the three-level elevation stack, 16px radius on buttons and cards, 12px on inputs.

**Three accent tokens, tightly scoped.** Day identity is genuinely useful for orientation, so `--accent-push`, `--accent-pull`, `--accent-legs` exist — but they are used *only* for the day badge and a 2px card border, never for buttons, backgrounds, or body text.

| Token | Value | Provenance |
| :--- | :--- | :--- |
| `--accent-push` | `#465fff` | `DESIGN.md` `primary` |
| `--accent-pull` | `#fb6514` | `DESIGN.md` `secondary` |
| `--accent-legs` | *one new hue, to be added to `DESIGN.md` as a documented extension* | Not from TailAdmin. `tertiary #667085` is reserved by `DESIGN.md` for disabled states and secondary labels, so reusing it as a day accent would collide with its semantic role. |

Two constraints inherited directly from the `DESIGN.md` "Don't" list and the `PROMPTKIT.md` WCAG guardrail:

- **Primary blue stays the CTA colour on every page**, regardless of which day it is. `DESIGN.md` explicitly forbids the secondary orange on primary CTAs, so Pull day's "Start workout" button is blue like everyone else's; only its badge is orange.
- **No accent ever carries meaning alone.** Every day accent and every completion state pairs colour with an icon *and* a text label. This closes a finding from the code review, where set and exercise completion was signalled by a `.completed` class and colour only.

**Focus ring override (ADR-0004).** `DESIGN.md` specifies a 3px focus outline in `primary-container #ecf3ff`. Measured against `surface-bright #ffffff` that is approximately 1.1:1, well under the 3:1 that WCAG 2.2 SC 1.4.11 requires for non-text contrast — keyboard users would effectively not be able to see focus. Replaced with a 2px ring in `primary #465fff` (≈4.8:1 on white) plus a 2px white offset, which preserves the intended visual weight. This is a deliberate, recorded deviation from the design file, not an oversight.

**Light mode only in v1 (ADR-0005).** `DESIGN.md` ships no dark tokens. Rather than invent a dark ramp and pass it off as TailAdmin, v1 is light-only and dark mode is deferred. Acknowledged cost: this app gets used in dim gyms at night, so dark mode is a real want, not a nice-to-have. Mitigated by authoring every token as a CSS custom property under a single `:root` scope from day one, so adding a `.dark` block later is additive rather than a refactor. Revisit immediately after v1.

---

## 5. Security, Privacy & Failure Modes (FMEA)

### Security Audit

- **Tenancy boundary.** Single-user tenancy. Layer 1 scopes every query by a server-derived `userId`; Layer 2 is RLS under a `NOBYPASSRLS` non-owner role. Verified by the CI tenancy test (§4.2).
- **Auth.** Supabase Auth email magic link (`signInWithOtp`), exchanged at `/auth/confirm`. Session held in `HttpOnly` / `SameSite=Lax` cookies via the SSR client, refreshed in middleware. No token ever enters `localStorage` — which is where the current app keeps its entire state, so the habit needs breaking explicitly.
- **Email deliverability is a launch blocker, not a detail.** Supabase's built-in SMTP is capped at [2 messages per hour](https://supabase.com/docs/guides/auth/auth-smtp) and sends from a shared generic address. For a magic-link app that is the *only* way in, so custom SMTP (Resend / Postmark / SES) with a verified sending domain, SPF, and DKIM is required before any real user touches the app. Add a synthetic monitor that completes a full magic-link round trip hourly.
- **Auth rate limits.** Supabase's OTP endpoint limits are configurable under Authentication → Rate Limits; tune them explicitly rather than inheriting defaults, and pair with our own per-IP limit on the sign-in form to blunt address enumeration.
- **Input validation.** Zod at every boundary: route handlers, legacy import, Realtime messages, and the auth callback's `token_hash` / `type` params. Database-level `check` constraints on weight and rep ranges, because application validation is not a data integrity guarantee.
- **Secrets.** `service_role` key server-only, and never used by request-path code — the app path uses `app_authenticated`. `MIGRATION_DATABASE_URL` (owner role) available to CI only, never to the runtime.
- **PII.** Email lives in `auth.users` and is mirrored to `profiles` for display. Never logged. Structured logs carry `userId` and a correlation id only.
- **Open redirect.** `/auth/confirm` accepts a `next` param; it is validated against an allowlist of relative paths. Magic-link callbacks are a classic open-redirect sink.
- **Rate limits.** Per-user token bucket on all mutating routes, Upstash-backed.
- **CSP.** Server-sent, not `<meta>`. The current pages set `X-Frame-Options` and `X-Content-Type-Options` via `meta http-equiv`, where browsers ignore both; clickjacking protection moves to a real `frame-ancestors` directive. No `'unsafe-inline'` — nonce-based script policy.

### FMEA Resilience Matrix

| Failure Scenario | Prob / Sev | Detection | Mitigation / Fallback | Recovery |
| :--- | :--- | :--- | :--- | :--- |
| **RLS silently bypassed** because Drizzle connects as an owner role | Medium / **Critical** | CI tenancy test asserts 0 rows on cross-user read | Dedicated `NOBYPASSRLS` non-owner role; `FORCE ROW LEVEL SECURITY` | CI blocks merge; runtime canary query on deploy |
| Entire session offline, outbox flush fails | High / High | Outbox depth + age metric surfaced in UI | Durable IndexedDB queue, never cleared on failure, exponential backoff with jitter | Manual "retry sync" plus a JSON export escape hatch so data is never hostage |
| Two devices start the same workout | Medium / Medium | Partial unique index violation | Handler catches constraint error, returns existing session | Device B joins; client reconciles from `serverSeq` |
| **`request.jwt.claims` leaks across requests**, so user B inherits user A's identity | Low / **Critical** | Integration test: two sequential `withUser` calls on a deliberately size-1 pool, assert the second sees only its own rows | `set_config(..., true)` — the `is_local` flag scopes the setting to the transaction. Without it the setting persists on the *connection*, and under PgBouncer transaction-mode pooling that connection is handed to the next request | Lint rule banning `set_config` with a literal `false` or a missing third argument |
| `profiles` row missing after signup → FK violation on first write | Low / High | 5xx on first authenticated write | `AFTER INSERT` trigger on `auth.users` runs in the signup transaction — same database, no network hop | Backfill query reconciling `auth.users` against `profiles`; idempotent, safe to re-run |
| Magic-link email undelivered or rate-limited → user cannot sign in at all | **High** / **High** | Hourly synthetic monitor completing a real round trip; alert on delivery failure or bounce | Custom SMTP with verified domain, SPF/DKIM; never ship on Supabase's 2/hour default sender | Surface a plain-language "resend" with a cooldown; support path to re-issue manually |
| Clock skew inverts LWW ordering | Medium / Medium | Server compares `clientTs` to receipt time, flags > 5 min | Server substitutes its own time; `serverSeq` is the only cross-device ordering | `clockSkewMs` returned; client warns the user |
| Rest timer dies or drifts in a backgrounded tab | High / Medium | Wall-clock vs tick-count divergence | Absolute `endsAt` deadline, remaining derived from `Date.now()` | Recompute on `visibilitychange`; no reliance on interval fidelity |
| Legacy import run twice → duplicate history | Medium / Low | `unique (user_id, source_fingerprint)` | Idempotent no-op | Returns the original `ImportReport` |
| Supabase Realtime channel drops | Medium / Low | Heartbeat timeout | Fall back to 15s delta polling | Auto-resubscribe with backoff; sync correctness never depends on the socket |
| Malformed legacy payload (hand-edited localStorage) | Low / Low | Zod parse failure per key | Import the keys that parse, report the ones that don't | User sees exactly what was skipped |
| Supabase connection pool exhausted by per-request transactions | Medium / High | Pool wait-time metric | PgBouncer transaction-mode pooling; `withUser` transactions kept short | Circuit-break to read-only mode with a queued-writes banner |

---

## 6. Phased Implementation Milestones (TDD Red-Green-Refactor)

- [x] **M0 — De-risk spike (`pk:spike`). Complete 2026-09-08, ~half a day.** RLS enforcement demonstrated through Drizzle against Postgres 17.6: non-owner `app_authenticated` role, eight policies, two real GoTrue users, cross-user read/update/delete returning zero and cross-user insert rejected `42501`. Both gate-defeating cases from §4.2 covered, plus a third found during the spike. `set_config(..., true)` shown not to leak across a size-1 pool *and* through supavisor in transaction mode, with the `is_local = false` variant run first as a negative control to prove the leak is real. All three controls removed in turn to confirm the suite goes red. 32 assertions, `docs/spikes/2026-09-08-drizzle-rls-enforcement.md`, harness at `spikes/m0-drizzle-rls/`. **M1 unblocked.** Five corrections folded back into §4.2 and ADR-0003 Amendment A1.

- [ ] **M1 — Contracts & Seams (RED).** Next.js 16 + React 19 + TypeScript strict scaffold; Drizzle schema and initial migration; `app_authenticated` role and RLS policies on every table; `handle_new_user` trigger on `auth.users`; seed the 18 exercises and 15 stretches extracted from the existing HTML; Zod contracts for every route; Supabase SSR middleware, `requireUser()`, magic-link sign-in and `/auth/confirm`; custom SMTP configured. Failing integration tests written first, including the tenancy gate. (PR #1–#3)

- [ ] **M2 — Core Domain Engine (GREEN).** `SessionEngine`, `WorkoutRepository`, `SyncEngine` server half, `ProgressionEngine` (e1RM + PR detection), `LegacyImporter`. All M1 tests go green. (PR #4–#7)

- [ ] **M3 — Presentation & Client Integration.** shadcn/ui initialised against the `DESIGN.md` token set per §4.7 (Outfit self-hosted, `#465fff` primary, 16px button radius, three-level shadow stack), the ADR-0004 focus-ring override, and the three day-accent tokens — **`--accent-legs` must be agreed and added to `DESIGN.md` before the day cards are built.** Session runner with prefilled weight/rep inputs, offline outbox, Realtime subscription, history and progress views, legacy-import dialog. WCAG 2.2 AA audit: keyboard-complete flow, `role="timer"` with `aria-live` on countdowns, `role="status"` on notifications, real dialog semantics with focus trap and restore, `aria-current` on phase navigation, and an assertion that no completion state is conveyed by colour alone. (PR #8–#12)

- [ ] **M4 — Hardening, Telemetry & Decommission.** Structured logging with correlation ids, Sentry, rate limits, a Playwright E2E that puts the browser offline for a full session and asserts a clean drain on reconnect, load test against the `/api/sync` SLA. Delete the four legacy static modules, `SECURITY_IMPROVEMENTS.md`, and the two fictional module READMEs. Drop archived localStorage keys. (PR #13–#15)

---

## 7. Resolved Decisions (ADR Log)

All six open decisions were resolved 2026-09-08. Full records in `docs/adrs/`.

| # | Decision | Outcome | ADR |
| :--- | :--- | :--- | :--- |
| 1 | Framework version | **Next.js 16 + React 19 + TypeScript strict.** The requested `Next.js 14 + React 19` is not a valid pair — React 19 became stable in Next.js 15, and 14 is past EOL. | [`0001`](../adrs/0001-nextjs-16-react-19.md) |
| 2 | Auth provider | **Supabase Auth**, replacing the originally requested Clerk. Removes a vendor, the identity-sync webhook, the `users` mirror table, and the custom RLS resolver function. | [`0002`](../adrs/0002-supabase-auth-over-clerk.md) |
| 3 | Authorization model | **Both layers.** App-layer scoping is authoritative; Postgres RLS under a `NOBYPASSRLS` non-owner role is the backstop. Cost accepted knowingly. | [`0003`](../adrs/0003-rls-defense-in-depth.md) |
| 4 | Focus-ring contrast | **Override `DESIGN.md`.** 2px `primary #465fff` ring (≈4.8:1) replaces the specified `#ecf3ff` (≈1.1:1), which fails WCAG 2.2 SC 1.4.11. | [`0004`](../adrs/0004-focus-ring-contrast-override.md) |
| 5 | Weight & rep logging | **In scope**, both nullable, prefilled from the previous session, kilograms canonical with display-unit preference. | [`0005`](../adrs/0005-design-tokens-and-set-logging.md) |
| 6 | Visual unification | **One base palette from `DESIGN.md` + three tightly-scoped day accents.** Light mode only in v1. See §4.7. | [`0005`](../adrs/0005-design-tokens-and-set-logging.md) |

### Carried Forward as Open Risks

Not decisions, but items deliberately left unresolved and tracked:

- **`--accent-legs` hue is unspecified.** Needs one new colour added to `DESIGN.md` as a documented extension, since `tertiary` is semantically reserved. Blocks M3, not M1.
- **Dark mode deferred.** Real want for an app used in dim gyms; revisit immediately post-v1. Tokens authored under a single `:root` so it stays additive.
- **Custom SMTP is a launch blocker.** Supabase's default sender allows 2 emails/hour. On a magic-link-only app that is the entire front door.

---

## 8. Sign-off & Grilling Checklist

- [x] Open decisions 1–6 resolved and recorded as ADR-0001…0005
- [ ] Architecture stress-tested via `pk:grill` — priority targets: the LWW justification, outbox behaviour across a multi-day offline gap, and connection-pool behaviour under per-request transactions. *Partially retired: per-request transaction cost is now measured (+1.29 ms p50 direct, +1.98 ms through the pooler), so the pool question narrows to sustained-load exhaustion, which is an M4 load test.*
- [x] M0 spike completed and RLS enforcement demonstrated through Drizzle, including both gate-defeating cases from §4.2 — 2026-09-08
- [ ] `--accent-legs` hue agreed and added to `DESIGN.md`
- [ ] Custom SMTP provider chosen, domain verified, synthetic monitor green
- [ ] Non-goals reviewed — explicitly guarding against the aspirational-README pattern already present in this repo
- [ ] Legacy import loss profile accepted, including unrecoverable pull-day set detail
- [ ] Ready for M1 execution
