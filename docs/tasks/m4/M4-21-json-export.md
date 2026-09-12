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
