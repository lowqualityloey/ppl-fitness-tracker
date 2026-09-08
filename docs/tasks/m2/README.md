# M2 Core Domain Engine Task Breakdown

- **Related spec**: `docs/specs/2026-09-08-m2-core-domain-engine.md`
- **Milestone**: `M2: Core Domain Engine`
- **Status**: Formalized; GitHub issues #36–#42 are filed under the `M2: Core Domain Engine` milestone.
- **Scope**: M2-00 through M2-06, ordered by dependency and bounded to 1–4 hour reviewable slices where practical.

## Dependency graph

```text
M2-00 foundation review/commit
  └─► M2-01 sessions fixtures + routes
        └─► M2-02 SessionEngine lifecycle
              ├─► M2-03 ProgressionEngine
              ├─► M2-04 sync/conflict model
              └─► M2-05 LegacyImporter (after write/archive contracts freeze)
                    └─► M2-06 all-route green + hardening
```

## Task index

| Local task | Issue | Proposed issue title | Priority | Dependencies | Artifact |
| :--- | :--- | :--- | :--- | :--- | :--- |
| M2-00 | [#36](https://github.com/lowqualityloey/ppl-fitness-tracker/issues/36) | `refactor(m2): review and commit runtime repository foundation` | p0 | M1 merged baseline | `M2-00-runtime-repository-foundation.md` |
| M2-01 | [#37](https://github.com/lowqualityloey/ppl-fitness-tracker/issues/37) | `feat(sessions): wire session routes and deterministic fixtures` | p1 | M2-00 | `M2-01-sessions-api-fixtures-routes.md` |
| M2-02 | [#38](https://github.com/lowqualityloey/ppl-fitness-tracker/issues/38) | `feat(sessions): implement SessionEngine lifecycle` | p1 | M2-01 | `M2-02-session-engine-lifecycle.md` |
| M2-03 | [#41](https://github.com/lowqualityloey/ppl-fitness-tracker/issues/41) | `feat(progress): implement e1RM and personal records` | p1 | M2-02 | `M2-03-progression-engine.md` |
| M2-04 | [#39](https://github.com/lowqualityloey/ppl-fitness-tracker/issues/39) | `feat(sync): implement transactional sync and conflict model` | p1 | M2-02, M2-03 | `M2-04-sync-conflict-model.md` |
| M2-05 | [#40](https://github.com/lowqualityloey/ppl-fitness-tracker/issues/40) | `feat(import): implement idempotent legacy importer` | p1 | M2-02; M2-04 sequence only if shared | `M2-05-legacy-importer.md` |
| M2-06 | [#42](https://github.com/lowqualityloey/ppl-fitness-tracker/issues/42) | `test(m2): close API baseline and harden domain engine` | p0 | M2-01 through M2-05 | `M2-06-route-hardening.md` |

## GitHub filing

Use the exact command generated for each task file after verifying labels and milestone names. Project-board sync is intentionally omitted because no project board is designated for this repository; the GitHub milestone is the source of truth.
