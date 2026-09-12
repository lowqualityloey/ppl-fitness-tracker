> **M4-00** · Foundation · `#priority/p0` · Derived from: `docs/STATE.md` §5 (D4), §7 item 5, §5 carried-forward ("evaluate a migration before production hardening"), `PROMPTKIT.md` §3 (mixed-authority warning), `docs/tasks/2026-09-11-intake-debt-index.md` D4.

## Intent
As the engineer who must land schema-touching M4 cards (body measurements, export, auth-FK cascade), I want **one recorded authorship model for migrations** so that `drizzle-kit generate` never silently reasons from a stale journal snapshot again.

## What the record says
- `supabase/migrations/` is mixed-authority: `0000`–`0003` are drizzle-generated and in `meta/_journal.json`; `0004`–`0006` are hand-authored and **absent from the journal**. (`STATE.md` §5 D4, `PROMPTKIT.md` §3.)
- D4 is named as "the item that can block the next schema-touching slice", and `drizzle.config.ts` still generates into the same directory.
- M4 has at least three schema-touching candidates queued (M4-20 body measurements, the auth→profiles cascade, possibly export indexes) — this is the gate they all sit behind.
- Separately carried by `STATE.md` §5: `profiles.id` has no FK to `auth.users.id`, so Auth-user deletion leaves the profile row; "keep explicit cleanup in fixtures … **evaluate a migration before production hardening**". This card is that evaluation.

## Scope & invariants
- Choose and **implement** one model: (a) journal is authoritative → record `0004`–`0006` into the journal and prove a generate against current DB emits an empty diff; or (b) hand-authoring is authoritative → stop `db:generate` from writing into that directory (config or script removal) and say so in `PROMPTKIT.md` §3.
- Decide the auth-FK cascade question either way (migration under the chosen model, or a written acceptance that fixture-side cleanup is the policy) — Expand→Contract applies (STATE §4 item 12; every new/changed table keeps RLS per item 6).
- `MIGRATION_DATABASE_URL` stays owner-only, never runtime (STATE §4 item 18).

## Out of scope
Any body-measurement or export schema itself — those are M4-20/M4-21 and blocked by this card, not part of it.

## Acceptance criteria
```gherkin
Scenario: The stale-snapshot trap is disarmed, not just documented
  Given the chosen model
  When the regeneration or generation step named by that model runs
  Then it cannot emit a migration computed from a journal that omits shipped files
  And a negative control proves it: injecting a drift (or an unjournalable generate) is observed to fail loudly, then reverted

Scenario: Auth-deletion semantics are a decision with a record
  Given the auth→profiles FK question
  When this card closes
  Then either a migration ships that cascades (or refuses) deletion with an integration test that sees it fire,
  Or docs/STATE.md §5 carries a written acceptance naming who cleans up and when

Scenario: The next schema card starts from the docs, not from folklore
  When M4-20 is picked up
  Then PROMPTKIT.md §3 states the chosen authorship model in one paragraph, and the card needs no archaeology
```

## Automated Verification
```bash
npm run db:up
# model (a): journal is authoritative — a catch-up generate must be a no-op
npm run db:generate && git diff --stat supabase/migrations   # expect: no new migration emitted
# model (b): hand-authored is authoritative — the trap is removed at the config level
grep -n out supabase/config.ts drizzle.config.ts; npm run db:generate  # expect: refuses or writes nowhere near supabase/migrations
node --env-file-if-exists=.env.local node_modules/vitest/vitest.mjs run tests/integration/schema-drift.test.ts
npm run test:mutation   # with .env.local sourced; must stay exit 0
npm run db:down
```

## Definition of done
- One model recorded in `PROMPTKIT.md` §3 and `docs/STATE.md` §5 (D4 row closed).
- The chosen trap-disarm step was **watched to behave** — the negative control fired and was reverted. A control does not exist until a test proves it runs (STATE §4 item 11).
- If a migration shipped, the drift and tenancy suites execute it, not trust it.

## Dependencies
- Blocks: M4-20 (body-measurement contract), M4-21 (export, if it denormalizes), any cascade migration.
