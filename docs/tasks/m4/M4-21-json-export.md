> **M4-21** · M3 named non-goal · `#priority/p2` · Derived from: handoff §3.4 bullet 5 ("**Data export.** The master RFC's risk register prescribed 'a JSON export escape hatch so data is never hostage'; never built. The outbox UI shows the queue, not the archive"); master RFC risk register (spec §FMEA, the row whose mitigation names the export).

## Intent
As the only user of this database, I want a one-action JSON export of *my* archive (profile, sessions with sets/tasks, PRs, imports, sync state as needed) — the risk register's "never hostage" mitigation — downloadable, parseable, and re-importable in principle.

## Scope
- Server-generated from the repositories (app-scoped reads, `userId` first — never a browser-side stitched set of fetches that misses a page); streamed or bounded (a multi-year archive should not OOM a serverless function — size decision recorded).
- Format: versioned envelope (`{ version, exportedAt, user, data… }`), Zod-modeled so the exporter is *tested against the contract* rather than a shape of the PR author's choosing; kg canonical per ADR-0005 with the unit in metadata.
- `/settings` affordance; the file must contain everything an import would need to recreate history (the FMEA's purpose), including the NULL-load legacy imports honestly.

## Out of scope
CSV/spreadsheets; re-import *tooling* (the format's promise is stated and tested for round-trip-ability of a sample; building the importer back is not this card); deleting-account flows.

## Acceptance criteria
```gherkin
Scenario: Export is complete against the database, not against the UI
  Given a fixture user with sessions across statuses, sets with NULLs, PRs, profile, and an import batch
  When the export is produced
  Then every row the repositories can see for that user appears, counts asserted per table (a deliberately-missing-table control is watched red before the assertion is trusted)

Scenario: Cross-user containment
  Given user A authenticated
  When A exports
  Then zero bytes of B's data — same isolation shape as the sessions suites

Scenario: The envelope is self-describing
  When the JSON is parsed by the versioned schema
  Then it validates, with a unit test locking the current version and the kg-canonical statement
```

## Automated Verification
```bash
node --env-file-if-exists=.env.local node_modules/vitest/vitest.mjs run tests/integration/api/<export spec>
npm test && npm run test:api
npx playwright test settings.spec.ts      # the affordance + download
```

## Definition of done
The FMEA row's mitigation reads true in the shipped product, and `STATE.md` §1's "export … do not exist" line is retired.

## Dependencies
- None hard (read-side only); schedule after M4-00 anyway so prose about table sets stays singular.

## Implementation record (PR branch `feat/m4-21-json-export`, 2026-09-16)

**Owner calls taken during this build (handoff session, 2026-09-16):**
- `measurements` reserved as an always-empty v1 key (shape copied from the #109 spec lines so the two contracts cannot drift when the table lands).
- Rate limit 5/hour per user, import-class (matches `legacyImportRateLimiter`; keyed by verified user id).
- `preferredUnit` added to `user` despite the spec §4.1 skeleton omitting it — ADR-0005 label, converts nothing.
- `personalRecords` and `imports` added top-level for the same reason: AC scenario 1 requires per-table counts including PRs and an import batch, and the skeleton listed neither. Recorded in `lib/contracts/export.ts`'s header rather than shipped silently.
- `syncState` **not** exported: the card says "as needed", the locked skeleton omits it, and the ledger is transport state, not athlete data.

**Deliberately-missing-table control (AC's precondition for trusting the count assertions):** watched red — `ExportRepository` sessions mapped with `tasks: []` → `tests/integration/api/export.test.ts > exports every seeded row per table` failed on the per-table id-set assertion; mapping restored, suite re-run green. Route-absent red also observed (all 7 specs 404) before implementation.

**Quality-gate evidence (this branch, locally measured):**
- `npm run lint` (max-warnings=0) · `npm run typecheck` · `scripts/check-set-config.sh` · `next build`: all exit 0.
- `npm test`: 61 files / 594 passed (includes 7 new `buildExportV1` unit specs, contract-graph + route-scope registrations).
- `npm run test:api`: 12 files / 72 passed — the 7 export specs cover completeness-by-id, kg-canonical-under-lbs-preference, NULL-load honesty, cross-user byte containment, 201-session truncated branch, 5/hour 429 + `Retry-After`, 401/404 postures, `no-store` + `Content-Disposition` filename.
- E2E: two new `settings.spec.ts` tests (real download parsed by hand; truncated warning rendered via a mocked valid-but-truncated payload). **Not run locally** — `libnspr4.so` missing on this machine, the same documented block #96 recorded; CI is the verification venue for these two.
