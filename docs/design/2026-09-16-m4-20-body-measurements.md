# M4-20 / #109 — Body Measurements: Full Planning Record (2026-09-16)

- **Task record**: `docs/tasks/m4/M4-20-body-measurements.md` · **Issue**: #109 · **Level**: 2 (Controlled) — persistent data + public contract
- **Spec lineage**: master M4 spec §4.1 (locked contract sketch), §8.1 (`#109 → build properly, no apology field` — ratified), ASSUMPTION-m4-001 (kind set — ratified 2026-09-14 "as written", with a mandatory first-RED validation action)
- **TDD Enforcement Mode**: `disabled` (no record sets it; the spec's §9 line binds every M4 card — RED-first *culture* still applies via the card's own "watched red" AC)

## 1. Outcome & completion condition

`userStats` stops being a hole nobody scheduled: one row per (user, date, kind), Zod-locked, RLS-carried, upserted through a route, edited through a settings form, and present in the versioned archive. The card's DoD is the test: the phrase "not a plan" must be false — which here means the settings apology card is gone and real storage stands behind the form.

**Non-goals** (card's, restated): wearable integrations; body-fat derivation heuristics; anything that syncs legacy `userStats` *data* (see F-1: there is none); `height_cm` (OC-1).

## 2. Finding F-1 — the mandatory kind-diff, executed 2026-09-16

ASSUMPTION-m4-001's validation action: *"diff the kind list against every field the legacy importer reads out of `userStats` before #109's RED test is written."* Executed against the estate:

- `ppl-workout-dashboard/app.js:146-165` — `getUserStats()` reads `localStorage.userStats`; if absent it *invents* `{streak, totalWorkouts, hoursTrained, lastWorkout, nextWorkout}`. **Whole-estate sweep (grill pass 2026-09-16):** `userStats` appears exactly once across all six legacy JS files (`ppl-workout-dashboard/` + the three day folders + their `auth.js`) — the read at `app.js:148`; every `setItem` in the legacy estate targets the other five keys (`pushWorkoutProgress`, `pullDayProgress`, `legsWorkoutProgress`, `guest_mode`, dashboard progress). **Zero `setItem('userStats')`.** The blob was never written by any code path. *(First sweep was directory-limited and missed the day folders; the grill caught the scope gap before the conclusion did its work in the record — the claim stands on the wider grep, and the narrow one is disclosed here rather than deleted.)*
- `lib/domain/import/legacy-importer.ts:475-483` — the importer reads **zero fields** from `userStats`; it records the stranding note "dashboard figures were generated at render time and never stored" (pinned by `tests/unit/domain/legacy-importer.test.ts:298`).
- Therefore: stranded legacy fields = **∅**, for any kind set. The ratified six kinds strand nothing, and #103's wave gate ("#109 before #103") is satisfied *for this key* the moment the modeled path exists — there is no data-loss hazard to sequence around, only the contract seam to keep honest.
- Collateral correction: the settings card's prose "(weight, height)" describes fields `userStats` never held. Its rewrite (OC-1 keeps height out of the kind set) must state the measured truth, not the remembered one.

The card's first milestone encodes this as a pin: a unit assertion that the importer's `userStats` branch stays accepted-and-ignored with the render-time note, so any future legacy-data claim must pass through this test to be believed.

## 3. Owner Calls — 2026-09-16 (ratified via interactive prompt, this session)

- **OC-1**: kind set **stays the ratified six**. `height_cm` rejected: nothing strands without it, and kinds are expandable additively (enum entry + CHECK widening, zero risk to stored rows).
- **OC-2**: #109's PR **fills `ExportV1Schema.measurements`**. The slot was reserved-empty for exactly this (export.ts header: "that card fills a slot instead of bumping the version"); `MeasurementExportSchema` (export.ts:95-102) is already field-for-field identical to the upsert contract, so filling is producer work, not contract work. Recorded as an in-PR scope addition (inside spec §4's reconciliation ledger, outside the card's file list).
- **OC-3 (amended by grill finding G-1, 2026-09-16 — before milestone 1, no user ever meets the ceiling)**: `GET /api/measurements?from=&to=[&kind=]` returns the range ordered `measured_on DESC, kind ASC` (the tie-break is load-bearing: same-day multi-kind rows are otherwise unordered and the e2e would flake by design), **capped at `MEASUREMENT_RANGE_CAP = 2_500`** — derived, not round: worst honest year is 6 kinds × 366 days = 2,196 rows ≈ 132 KB on the wire, so a maximum-logging year never 400s; breach is still an explicit 400 naming the remedy. The `kind` filter is the lever the first draft's 500 was substituting for a bound: a single-kind year is 366 rows. **The principle** (also settles the export asymmetry): flat, calendar-rate-bounded data gets a derived response cap; nested, workload-grown data (sessions→sets) gets the cursor — which is why export caps sessions at 200 and leaves measurements uncapped-but-linear (~132 KB/athlete/year). *Original OC-3 was 500, chosen without deriving kind-cardinality × window; the grill caught it — ~83 days at full logging, i.e. a silent product ceiling dressed as a contract virtue.*

## 4. Domain model & contracts (written before implementation — §3 of the workflow)

`lib/contracts/measurements.ts` (NEW), per the locked spec §4.1 sketch:

```typescript
export const MeasurementKindSchema = z.enum([
  'body_weight', 'body_fat_pct', 'neck_cm', 'waist_cm', 'chest_cm', 'hip_cm',
]);
export const MeasurementUpsertSchema = z.object({
  measuredOn: LocalDateSchema,          // same grammar + schema object as sessions/export — no re-regex
  kind: MeasurementKindSchema,
  value: WeightKgSchema,                // ratified reuse: 0–1000, multipleOf 0.01 covers cm and %
}).strict();
export const MeasurementSchema = MeasurementUpsertSchema.extend({}).strict(); // row shape (no id column in the row contract: the key IS the triple)
export const MeasurementListQuerySchema = z.object({
  from: LocalDateSchema, to: LocalDateSchema,   // both required (OC-3): an unbounded list is not a promise
  kind: MeasurementKindSchema.optional(),       // G-1: the lever a derived cap replaces vibes with
}).refine(q => q.from <= q.to, { message: 'from must not exceed to' });
export const MEASUREMENT_RANGE_CAP = 2_500;     // 6 kinds × 366 worst honest year, rounded up (G-1)
// envelope: createAppEnvelopeSchema(z.array(MeasurementSchema)) — route returns it; builder validates
```

Units (ADR-0005's body-measurement clause, spec §Scope): stored values are **kg for `body_weight` and cm for every `_cm` kind, % for `body_fat_pct`** — the *kind carries the unit* (`_cm`/`_pct` in the enum name is the storage truth); the display layer converts for lbs profiles at the boundary, `units.ts` unchanged, nothing coerced in storage.

Routes (CRUD-class posture — no limiter; precedent: sessions/profile have none, only batch routes do):

- `POST /api/measurements` — upsert on `(user_id, measured_on, kind)`; 200 with the stored row (corrections are not errors).
- `GET /api/measurements?from=&to=` — OC-3 semantics.
- Both `loggedRoute` + `requireUserContext` + `assertUserContext`; register in `tests/unit/api/contract-graph.test.ts` and `route-scope.test.ts` the day the files exist.

## 5. Schema & Expand→Contract (STATE §4 item 12; authorship model #89)

- Migration `supabase/migrations/0008_body_measurements.sql` — **slot verified open by listing the directory this session** (highest existing: `0007_auth_user_cascade`), exactly as the spec's provisional note demanded. Expand-only: a new table, zero touches to existing ones. Contract phase: none (nothing reads the old shape; there is no old shape).
- `body_measurements`: `id uuid pk default gen_random_uuid()`, `user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE` (0007 cascade posture, executed by `auth-user-cascade.test.ts` — the new table gets both deletion-path assertions added there), `measured_on date NOT NULL` (mirrors `workout_sessions.local_date`'s `date` column), `kind text NOT NULL CHECK (kind IN (<six>))`, `value numeric(6,2) NOT NULL CHECK (value >= 0 AND value <= 1000)`, `created_at`/`updated_at` timestamptz per convention.
- `UNIQUE (user_id, measured_on, kind)` — the upsert key; index doubles as the read-path index for equality/scan (range scans add nothing beyond it on a table this small; revisit with evidence).
- **RLS**: enabled + FORCE, **four discrete policies** (SELECT/INSERT/UPDATE/DELETE, each `USING`/`WITH CHECK (auth.uid() = user_id)`), never `FOR ALL` (item 6); grants follow the shipped `0003` template; `schema-drift.test.ts` starts covering the table automatically once it exists.
- Tenancy: the three-layer assertion shape of the sessions suites — route, repository, raw `app_authenticated` query — **watched RED against the table before the policies exist** (the card's own AC; F-2 below sequences it).

## 6. Deep modules & seams

- `lib/repositories/measurements-repository.ts` — `upsertMeasurement(userId, input)` (`onConflictDoUpdate` on the triple, returns the row), `listRange(userId, from, to, kind?)` (`limit(CAP + 1)` overflow detector, G-1's 400 derived from the CAP+1-st row, not a count query). `userId` first (item 5). RLS is the backstop; the repository is the authority.
- `lib/export/v1.ts` — gains a `measurements` input, mapped straight through (schemas are identical by construction, export.ts:90-93); the repository transaction that already reads six tables reads the seventh; `measurements: []` producer assertions in `export-v1.test.ts` and `export.test.ts` are updated to seeded rows + a cross-user containment case.
- `src/app/settings/measurements-panel.tsx` — client component (pattern: `export-button.tsx`): form (date · kind select · value) + recent list (GET last 90 days); replaces the apology card in `settings/page.tsx`; axe coverage continues via the existing `/settings` a11y spec. **Write posture (grill finding G-3, 2026-09-16, mentor-ratified): server-echo only.** The panel renders exclusively from `GET`; submit disables the button until the POST resolves; success refetches the range; failure renders the server's message verbatim (PD-7 class honesty). No optimistic insert exists to roll back, which is what keeps this panel off #107's road entirely: optimistic UI is a debt instrument priced by measured latency, and a ~6-rows/day form never clears the fee. If #107's telemetry ever says saves feel slow, optimistic becomes an evidence-gated follow-up — never a launch decision.
- **The deletion test**: no `lib/measurements` service layer between route and repository (the spec's §2 sketch named one — routes-as-adapters says the repository is the module; recorded as deviation **PD-A**).

## 7. FMEA

| Failure scenario | Prob./Sev. | Detection | Mitigation | Recovery |
| :--- | :--- | :--- | :--- | :--- |
| Concurrent duplicate upsert (double-submit) | Med/low | unique violation | `onConflictDoUpdate` on the real key — idempotent by construction | last write wins, row returned |
| Cross-user read/write | low/**crit** | tenancy suite | four discrete RLS + app-layer scoping | impossible at both layers; raw-role test is the tripwire |
| Range over cap (2,500) | low/low | the 2,501st row | explicit 400 naming `MEASUREMENT_RANGE_CAP` + `kind=` | client narrows; no silent truncation |
| Kind added later without migration | med/med | drift test + CHECK | `kind` CHECK and Zod enum must move together; contract-graph pins the shared list | additive migration |
| Export envelope grows past ASSUMPTION-m4-003 bounds | low/low | export cap untouched (sessions still ≤200; measurements ≤ unbounded-by-design — ~2.5k small rows worst-case) | record in export header when filled | revisit at M5 |
| #103 deletes key while a real blob existed somewhere | low/**crit** | — | **F-1: the key was never written by any code path**; importer keeps the honest stranding note | n/a |

## 8. Milestones (dependency-ordered; mode `disabled`)

1. **Kind-diff pin + contracts** — `measurements.ts` + the F-1 importer-behavior unit pin; `MeasurementExportSchema` equivalence assertion (the two kind lists cannot drift: same imported enum). Red-capable: fails if the ratified set is edited.
2. **Migration + RED-first RLS** — table WITHOUT policies → run the three-layer tenancy suite + drift, **capture the RED** (card AC-2's exact demand) → add the four policies → GREEN. Cascade assertions joined into `auth-user-cascade.test.ts`.
   - **Choreography settled by grill pass (finding G-2, 2026-09-16):** the RED state is a **local draft**, never a committed file — apply the policy-less draft `0008` to the scratch database, watch tenancy + drift RED, capture the output for the card, then **amend the same `0008`** to its finished form before anything is committed. Rationale recorded: option (a) — commit bare, add `0009` — *is* this repo's history (`0000` bare tables → `6c9fc05` "M1-05: RLS policies"), but the evergreen convention since M2-04 is table+policies-atomic (`0006`: 2 tables, 12 policies, one file), and a committed bare step means every future replay walks an open door and the drift gate is legitimately red between commits. The card's "watched red before the policy exists" is satisfied by the **capture**, not the artifact — the same discipline as #158's deliberately-missing-table red and M4-22's reverted mutants. Squash merge keeps CI green at every landed revision; the redness lives in the card's evidence box.
3. **Repository + route** — upsert/list through HTTP: 200/400/401, correction-is-upsert case, cross-user probe, cap-400 case; contract-graph + route-scope registrations.
4. **UI** — settings panel + apology-card rewrite (the rewritten prose quotes F-1's evidence, not the remembered "(weight, height)"); e2e in `settings.spec.ts` (upsert visible after reload; cross-user untouched — **census stays 16**, no new spec file). G-5's traceability rule governs every sentence that survives the rewrite.
5. **Export fill** (OC-2) — builder + repository read, producer assertions updated to seeded rows, cross-user containment extended to the new array.
6. **Records** — card "What the record says" with F-1/OC-1…3/PD-A; STATE §1's `#109, open` entry retires at the post-merge checkpoint; spec §8.1's m4-001 row gains its Resolution Evidence link (F-1 completes the mandated validation).

**Verification commands** (card's, unmodified): `npm run test:mutation && npm test && npm run test:api` · `npx playwright test settings.spec.ts` · gates per house: typecheck, lint, `next:build`.

## 9. Assumption & decision records (this slice)

- **ASSUMPTION-m4-001** — status upgrades: `accepted` → `validated` via F-1, Resolution Evidence = this document §2. No contract change to the ratified set (OC-1).
- No new cross-card DECISION/ASSUMPTION mints: OC-1…3 are card-local and recorded above; the export fill lands inside a reserved slot the owner already ratified twice (ASSUMPTION-m4-003 lineage, export.ts header).
- **Locked invariants carried forward**: server sole truth; routes-as-adapters (PD-A kills the speculative service layer); `userId`-first repositories; four discrete RLS never `FOR ALL`; ADR-0005 boundary-only display conversion; contracts before implementation; watched-red-before-trusted-green.
