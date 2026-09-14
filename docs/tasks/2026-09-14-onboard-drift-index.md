# Onboard Drift Index — `pk:onboard` Re-scan (2026-09-14)

- **Source**: passive brownfield intake on `feat/m4-05-structured-logging` @ `18de6da`;
  12 findings, every one produced by running a command, not by reading docs
- **Reconstructed**: 2026-09-15 closeout. The intake session cited this file from
  `PROMPTKIT.md` §0/§5 but **never wrote it** — verified absent from disk, `.worktrees/`,
  and the full git history at closeout. The content below is rebuilt from the intake's
  own §8 record in `docs/STATE.md` (row "`pk:onboard` re-scan → drift report").
- **Numbering caveat**: the original session's O-numbers were not persisted. The O1–O12
  grouping here is **re-derived at reconstruction** to match the §8 row's applied patches
  one-to-one. Treat this file as authoritative from the closeout forward.
- **Re-verified at reconstruction** (commands run again 2026-09-15, values unchanged):
  `find src/app -name route.ts | wc -l` → **11** · `find tests -name '*.test.ts' | wc -l`
  → **62** (unit 36 · DB 15 · API 11) · `supabase/migrations/` head → `0007_auth_user_cascade.sql`
  · `docs/adrs/` head → `0006-migration-authorship-hand-authored.md`

Every finding below was already **patched** by the authorized doc patch (committed at the
closeout); this index is the record, not a queue.

| # | Drift (doc said → measured) | Patched in |
| :--- | :--- | :--- |
| O1 | §2 route enumeration listed 8 → 11 real `route.ts` files | PROMPTKIT.md §2 Framework |
| O2 | `lib/logger/` + `lib/http/request-log.ts` absent from the domain-layer list | PROMPTKIT.md §2 Domain layer (barrel rule included) |
| O3 | §2 carried a forward-looking "0007 **lands with #89**" claim; 0007 was already merged | PROMPTKIT.md §2 banner (claim retired) |
| O4 | §2 test-file count 56 → measured 62 (36 unit + 15 DB + 11 API) | PROMPTKIT.md §2 Testing |
| O5 | §2/§3 test-*total* figures quoted from merge runs, never re-run on the counting tree | PROMPTKIT.md §2/§3 (totals demoted to "last measured at 324d4b7") |
| O6 | §3 recorded DB stack state as a dated inheritable fact; three intakes disagreed | PROMPTKIT.md §3 (ask-`docker ps` rule) |
| O7 | §3 API-suite count 10 → 11 route-handler files | PROMPTKIT.md §3 API suite |
| O8 | §3 Lint bullet omitted #94's `no-console` ban | PROMPTKIT.md §3 Lint |
| O9 | §5 ADR range 0001–0005 → 0001–0006; current spec unnamed | PROMPTKIT.md §5 |
| O10 | §5 had **no** `docs/tasks/` artifact-path entry (debt/task indices undiscoverable) | PROMPTKIT.md §5 (added) |
| O11 | §5 had **no** task-tracking-system entry (GitHub Issues + milestones + the three-way count trap) | PROMPTKIT.md §5 (added) |
| O12 | §5 had **no** Active-MCP entry; measured: no `.mcp.json`, no `mcpServers` block anywhere | PROMPTKIT.md §5 (`N/A (Standard CLI Fallback)`) |

## Actions recorded by the same pass that are not findings

- §0 intake-scan stamp; engine/`AGENTS.md` byte-identity re-verified (`b3c5edf`).
- §6 new invariant "one logging seam, no raw `console.*`".
- STATE §1: milestone #4 open=22 → **23** (delta is #142); stale working-tree claim corrected.
- `package.json` gains `packageManager: npm@11.19.0+sha512-…` (integrity from
  `npm view npm@11.19.0 dist.integrity`; the field was missing while corepack 0.35.0 is
  live on this box; local `npm --version` → `11.19.0`, so the pin binds without moving
  the toolchain).
- Hygiene: empty `undefined:/Users/undefined/AppData/Local` tree deleted (Windows path
  template built from unset env vars — the #122 chrome-launcher/WSL failure class);
  empty `semantic-review/` deleted; `PROMPTKIT.md` mode `0600` → `0644` (git carries only
  the exec bit, so `git status` cannot see mode drift).

## Correction applied at closeout (why this file's shape differs from the intake's intent)

The intake row itself was truncated mid-paste when saved, so the 12 findings survive only
in patched form (the PROMPTKIT.md diff) and in the row's leading summary. The grouping
above was re-derived from that diff; if the original numbering differed, the patches and
their evidence are unaffected — only the labels are.
