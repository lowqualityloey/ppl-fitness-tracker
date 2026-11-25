# Task Record: Magic-link deliverability monitor (#16)

<a id="TASK-smtp-synthetic-monitor"></a>

## 1. Identity and Authority

- **Record Type**: Task Record
- **Task ID**: `TASK-smtp-synthetic-monitor`
- **Ceremony Level**: `Level 2 (Controlled Work)`
- **PromptKit Adaptation Profile**: `sdlc-overlay-v1`
- **Work Type**: `Code Work`
- **Planning Record Link**: [PLAN-smtp-synthetic-monitor](../specs/2026-11-25-spec-smtp-synthetic-monitor.md#PLAN-smtp-synthetic-monitor)
- **Planning Depth Reference**: `Full`
- **Assumption Record Links**: `None`
- **Specification**: `docs/specs/2026-11-25-spec-smtp-synthetic-monitor.md`
- **External Reference**: `https://github.com/lowqualityloey/ppl-fitness-tracker/issues/16`
- **Owner / Actor**: `Agent (DeepSeek Harness / lead)`
- **Execution Scope**: `scripts/check-magic-link.ts`, `tests/unit/scripts/check-magic-link.test.ts`, `package.json` (script map only), `.github/workflows/magic-link-monitor.yml`, `supabase/config.toml` (the `additional_redirect_urls` allow-list, added during execution - see section 8.1), `docs/STATE.md` (§5 B2 row, §7 queued action).
- **Approval Boundary**: Level 2 with the Planning Record and this Task Record landed before the code, unit tests on the pure parsing and verdict functions instead of a browser E2E, and one commit on `main`. Explicitly NOT authorized by this record: creating a Resend/Postmark/SES account, uncommenting `[auth.email.smtp]` or pushing Supabase configuration to the linked project, changing `email_sent` or any Auth rate limit, verifying a sending domain or DNS, configuring production alerting, tagging `v1.0.0`, force-pushing, or touching any worktree. Those are owner actions and remain open.
- **Created**: 2026-11-25 UTC

> This Local Task Source is authoritative for Controlled Work. The Planning Record supplies context only; it does not control readiness, execution state, active ownership, completion, or approval.

## 2. Objective and Boundaries

- **Objective**: `prove that a magic-link email can be requested, delivered, read, and redeemed end to end against the local Supabase/Mailpit stack, and wire that proof to an hourly scheduled job whose failure is the alert - so the release gate stops being "nobody has checked" and becomes "a check runs and can go red".`
- **In Scope**:

  - `scripts/check-magic-link.ts` - an exit-coded CLI. Pure, exported functions for link parsing, token extraction, message selection, and the verdict table; `main()` performs the HTTP round trip and prints one aligned line per phase.
  - `tests/unit/scripts/check-magic-link.test.ts` - unit tests over the exported functions, weighted toward the red verdicts.
  - `package.json` - one new script entry, `monitor:magic-link`, using the file's existing `node --env-file-if-exists` + `tsx` invocation.
  - `.github/workflows/magic-link-monitor.yml` - hourly schedule plus `workflow_dispatch`, boots the local stack and the app, runs the monitor, uploads the log.
  - `docs/STATE.md` - the B2 row and the §7 queued action now name exactly which parts remain owner-supplied.
  - `supabase/config.toml` - the `additional_redirect_urls` allow-list, added during execution after a live run proved a spelling mismatch degraded the link; see section 8.1.
- **Explicit Non-Goals**:

  - Choosing a mail provider. Issue #16 forbids it and the choice needs an account.
  - Verifying a sending domain, SPF, or DKIM.
  - Uncommenting `[auth.email.smtp]` or running `supabase config push`.
  - Tuning `email_sent = 2` or any other Auth rate limit.
  - Production alerting beyond "the scheduled job fails".
  - Any change to `src/app/auth/signin/route.ts` or `src/app/auth/confirm/route.ts`.
  - A Playwright spec that reads mail; `tests/e2e/auth.ts` explicitly refuses a mock of that flow.
- **Dependencies**: the local Supabase stack running (`npm run db:up`, Mailpit included) and the app serving on 3001. Both are environment prerequisites the monitor reports as `app-unreachable` rather than assuming.
- **Risk**: Low for application behaviour - no product code is touched, so sign-in cannot regress. The real risk is a monitor that passes falsely, addressed by §3.1's verdict table and by making `no-message` and `replay-accepted` reachable in tests.
- **Verification Condition**: `npm test`, `npm run typecheck`, `npm run lint`, `npm run test:api` all green, plus a live `npm run monitor:magic-link` exiting `0` and a deliberately broken run exiting `1` with `no-message`.

## 3. Acceptance Criteria

- [x] **AC-1**: A delivered magic link is parsed into its `token_hash` and `type`.
  - **Result**: PASS - `parseConfirmLink` runs over the exact template HTML, including the escaped `&amp;` separator, and over the plain-text part. Six tests cover the HTML-over-text preference, the `&amp;` decode, a non-56-hex lookalike, a wrong `type`, and a truncated link. Live: `ok parse token_hash pkce_c30... (61 chars)`.
- [x] **AC-2**: A message containing only unrelated links yields `link-unparseable`, never a false pass.
  - **Result**: PASS - a unit case feeds a body carrying only a tracker URL and asserts `verdict` returns `link-unparseable`; `parseConfirmLink` returns `null` for it. No live equivalent, by design: the only live body is a real magic-link message.
- [x] **AC-3**: A missing message yields `no-message`.
  - **Result**: PASS, both halves. Unit: `verdict` with `delivered: false` and `requestStatus: 200` returns `no-message`. Live (spec S5.1): `MONITOR_MAILPIT_URL=http://127.0.0.1:1 npm run monitor:magic-link` printed `FAIL  deliver   no message for synthetic+mwwjzns5-038cba37@ppl-fitness-tracker.test within 15000 ms`, then `FAIL magic-link round trip failed: no-message`, and exited **1**.
- [x] **AC-4**: A second redemption of the same link is detected as `replay-accepted`.
  - **Result**: PASS, both halves. Unit: three cases return `replay-accepted` - the replay lands with a session cookie, the replay lands on the success destination, and the replay returns an unproven status (fail-closed, so an unproven single-use is reported as a finding rather than assumed clean). Live: every green run printed `ok replay 303 -> http://localhost:3001/sign-in?error=link-invalid-or-expired`, i.e. the real second redemption was refused.
- [x] **AC-5**: The monitor completes a real round trip against the local stack.
  - **Result**: PASS - `npm run monitor:magic-link` exited **0** with all six phases and `PASS  magic-link round trip completed in 0.6 s`: `ok provision synthetic account ready`, `ok request POST /auth/signin answered 200`, `ok deliver message 6zjP8bYE3KWVxufL8Xvnnu arrived after 12 ms`, `ok parse token_hash pkce_c30... (61 chars)`, `ok redeem 303 -> / with session cookie`, `ok replay 303 -> .../sign-in?error=link-invalid-or-expired`. Note the `pkce_` prefix - see section 8.
- [x] **AC-6**: An HTTP 200 from sign-in alone never yields `ok`.
  - **Result**: PASS - the unit case `verdict` with `requestStatus: 200` and `delivered: false` returns `no-message`. This is the criterion the whole design exists for, because `src/app/auth/signin/route.ts:39` answers `{ ok: true }` unconditionally.
- [x] **AC-7**: More than 2 messages in one hour are all delivered locally.
  - **Result**: PASS - `npm run monitor:magic-link -- --volume 3` exited **0** after three complete rounds (three distinct recipients, three messages read, three redemptions, three refused replays) and printed `ok    volume    3/3 messages delivered and redeemed`. This shows the local stack does not enforce the production `email_sent = 2` cap, which is exactly why B2 stays open.
- [x] **AC-8**: The hourly workflow exists, is scheduled, and fails the job on a red run.
  - **Result**: PASS - `.github/workflows/magic-link-monitor.yml` read back: line 28 `- cron: '17 * * * *'`, line 29 `workflow_dispatch:`, lines 32-33 `permissions:` / `contents: read`. The monitor step runs under `set -o pipefail`, so a non-zero monitor exit fails the job, and the log upload is `if: always()` so a red run still leaves evidence.
- [x] **AC-9**: `email_sent = 2` is reported as an open owner action, not silently accepted.
  - **Result**: PASS - in `docs/STATE.md` section 5, the B2 row names raising `[auth.rate_limit] email_sent = 2` as owner action (c), alongside a provider account and a verified sending domain with SPF/DKIM, and states that the monitor is the instrument that will prove the change rather than a substitute for it. Section 7 item 3 carries the same split.
- [x] **AC-10**: No new dependency is added and no secret is printed.
  - **Result**: PASS - the `package.json` diff is one added line in the script map (`git diff --unified=0 package.json` shows exactly `+    "monitor:magic-link": ...`); `dependencies` and `devDependencies` are untouched. No monitor output line carries key material: the service-role value is only ever placed in a request header, and the printed identities are the recipient address, the phase name, the token prefix and the status codes. The workflow carries no JWT-shaped literal at all - it reads the keys from the stack it starts (section 8.2) - and the script creates its synthetic account with no password, so no credential is generated, stored or sent anywhere.

## 4. Execution Policy

- **Mode**: `Gated Mode`
- **TDD Enforcement Mode**: `enabled`
- **Batch Authorization**: one task, one commit. The records and the code land together (spec S0) because the governance validator rejects a Task Record whose PLAN link has no target.
- **Authorization Checkpoint Reference**: this record's Approval Boundary in section 1.
- **Soft Checkpoint**: after S5 (both live runs) and before S7 (the commit).
- **Hard Checkpoint**: at commit. Nothing beyond the Approval Boundary may be attempted without a new human decision.
- **Event-Driven Checkpoints**: any 429 from the sign-in limiter, any unexpected Mailpit API shape, or any need to point `MONITOR_BASE_URL` at a non-local origin.
- **Stop Conditions**: production credentials required; a schema or DNS change required; the monitor cannot distinguish a red run from a green one.
- **Host Timer Capability**: The host cannot mechanically enforce checkpoints or terminate the session; timing is recorded, never enforced.

## 5. State and Active Ownership

- **Execution State**: `awaiting_review`
- **Mapped `pk:tasks` Status**: `In Review`
- **Active Task Pointer**: `None`
- **Start Time**: 2026-11-25 18:05 UTC
- **Current Actor**: `Agent (DeepSeek Harness / lead)`
- **Next Action**: owner reviews the single commit on `main` and signs off; nothing else is authorized by this record.
- **Branch / Revision**: `main` at `0985c5bcf39022712c1a6b35c1b6da41fee074be`

### Transition History

| Previous State | New State | Timestamp | Actor | Reason | Supporting Evidence |
| --- | --- | --- | --- | --- | --- |
| None | planned | 2026-11-25 18:03 UTC | Agent | Level 2 ceremony opened for #16; Planning Record written | `docs/specs/2026-11-25-spec-smtp-synthetic-monitor.md` |
| planned | in_progress | 2026-11-25 18:05 UTC | Agent | Execution started at S1 | this record |
| in_progress | awaiting_review | 2026-11-26 09:05 UTC | Agent (DeepSeek Harness / lead) | S1-S7 complete: script, tests, package entry, workflow, both live proofs, STATE.md split, and the full verification lane - all green | section 6 Verification Evidence; section 3 AC results; section 8 |

## 6. Evidence and Completion Gate

- **Changed Files**: 8 files, 3 modified and 5 added. Added: `scripts/check-magic-link.ts` (663 lines), `tests/unit/scripts/check-magic-link.test.ts` (297 lines), `.github/workflows/magic-link-monitor.yml` (153 lines), `docs/specs/2026-11-25-spec-smtp-synthetic-monitor.md` (170 lines), `docs/tasks/2026-11-25-smtp-synthetic-monitor.md` (this record). Modified: `package.json` (one script line), `supabase/config.toml` (the redirect allow-list, see section 8.1), `docs/STATE.md` (§5 B2 row and §7 items 3 and 4). Not committed: `docs/reviews/2026-11-22-promptkit-v2-sync-branch.md`, which was already untracked before this task opened and is outside its scope.
- **Scope Change Records**: one, recorded rather than absorbed - `supabase/config.toml` is outside the original Execution Scope because section 8.1 measured a live defect that made the monitor permanently red. The change is one array entry plus its comment, it restores the behaviour the spec assumed (a link that reaches `/auth/confirm`), and it is inside the Approval Boundary's spirit: no product code, no rate limit, no SMTP configuration. The alternative - loosening the parser to accept a root-path link - would have hidden the defect the monitor exists to find.
- **Checkpoint Records**: soft checkpoint after S5, see section 4.
- **Handoff Records**: none.
- **Verification Evidence**: every command run on 2026-11-26 from the repository root, exit codes as observed. `npm run typecheck` -> **0** (`next typegen` plus `tsc --noEmit`). `npm run lint` -> **0** (`eslint --max-warnings=0`, no output). `npm test` -> **0**, 71 files / **741 passed**, zero skipped, with `tests/unit/scripts/check-magic-link.test.ts` at **38 tests**. `npm run test:api:preflight` -> **0**, all six environment checks green. `npm run test:api` -> **0**, 14 files / **84 passed**. `bash .promptkit/scripts/scan-staged-secrets.sh .` -> **0** after section 8.2 removed the four flagged literals. Live: `npm run monitor:magic-link` -> **0** (six phases, `PASS ... in 0.6 s`); `MONITOR_MAILPIT_URL=http://127.0.0.1:1 npm run monitor:magic-link` -> **1** with `no-message`; `npm run monitor:magic-link -- --volume 3` -> **0** with `3/3 messages delivered and redeemed`.
  One caveat recorded rather than hidden: the first two `test:api` attempts failed with `Next test server exited before readiness ... Another next dev server is already running` because a pre-existing dev server on 3001 (pid 417779) held the lock the suite needs to spawn its own. Stopping that server made the suite pass 84/84; it was restarted afterwards and the live monitor proofs were re-run against it, so the green live evidence above is from the restarted server, not the original process.
  After the section 8.2 change removed the flagged literals, every check that could be affected was re-run rather than assumed: `npx tsc --noEmit` **0**, `npx eslint --max-warnings=0` on both source files **0**, `npm test` **0** (71 files / **741 passed**), a live `npm run monitor:magic-link` **0** (six phases, `PASS ... in 1.3 s`), and `bash .promptkit/scripts/scan-staged-secrets.sh .` **0**. `npm run test:api` was not re-run after that change because the edit is confined to the monitor script's own request helper and touches no app code; it was green at **84/84** earlier the same day.
- **Behavior IDs**: `TASK-smtp-synthetic-monitor` - AC-1 to AC-10 above.
- **TDD Intent Register**: the pure core (link parsing, token extraction, message selection, the verdict table) was tested before the HTTP layer existed, per the record's TDD enforcement mode. The red verdicts were pinned first because a monitor that cannot return `no-message` or `replay-accepted` is decorative.
- **TDD Execution Evidence**: the first test run was 5 failed / 28 passed, and both failures were real defects the tests caught, not fixtures bent to fit the code: (1) the token fixture was 64 hex while a real token is 56, so `TOKEN_HASH_PATTERN` rejected it - the fixture was corrected and `expect(TOKEN_HASH).toHaveLength(56)` added; (2) `verdict()` was judging the confirm URL instead of where the redirect landed, so redeem and replay conclusions were about the wrong URL - fixed by adding `redeemLocation` / `replayLocation` to `MonitorFacts`. Second run: 38 passed.
- **CI Evidence**: not yet run - the workflow first fires on its own schedule (cron `17 * * * *`) or on a manual `workflow_dispatch`. The job's pass/fail path is verified by reading it back (AC-8) and by the local exit codes above; no Actions run of `magic-link-monitor.yml` exists at commit time, and this record does not claim one.
- **Review Evidence**: self-review only, and the record says so. The files were re-read against the spec's AC-1 to AC-10 after the green run; `npx eslint --max-warnings=0` and `tsc --noEmit` are clean on both new source files; no second reader has reviewed the script, the workflow or this record. Two defects found by the unit tests were fixed before the commit rather than after (see TDD Execution Evidence), and one live defect found by the monitor itself became the scope change in section 8.1.
- **Commit Evidence**: one commit on `main`, subject `feat(monitor): add the magic-link synthetic monitor and its hourly workflow`, carrying 8 files: the script, its 38-test suite, the workflow, the spec, this record, the `package.json` script line, the `supabase/config.toml` allow-list fix and the `docs/STATE.md` B2/§7 edits. Recorded in the commit it names, since this record travels inside it - a commit cannot cite its own SHA, so it is identified by subject, per the template commit-evidence rule.
- **Pull Request Evidence**: none - direct commit on `main` is the authorized path.
- **Release Evidence**: none - this task does not create `v1.0.0` (B8 remains open).
- **Blocker and Resume Condition**: B2 stays `OPEN` after this task. Resuming the production half requires an owner-supplied provider account, a sending domain with SPF and DKIM records, and an explicit rate-limit value - none of which the agent can supply.

## 7. Completion Gate

- **Completion State**: `awaiting_review`
- **Acceptance Results**: **AC-1 to AC-10 PASS**, each with a measured command in section 3. The three that matter most are the three that cannot be faked by a 200: AC-3 (a broken Mailpit URL exits **1** with `no-message`), AC-4 (the second use of a delivered link is rejected and never yields a session) and AC-5 (a genuine request -> deliver -> parse -> redeem round trip exits **0** in 0.6 s). AC-8 is a static reading rather than a run: no Actions execution of the workflow exists yet, and the record says so instead of implying one.
- **Changed-File Summary**: 8 paths - `scripts/check-magic-link.ts` (new, 663 lines), `tests/unit/scripts/check-magic-link.test.ts` (new, 297 lines, 38 tests), `.github/workflows/magic-link-monitor.yml` (new, 153 lines), `docs/specs/2026-11-25-spec-smtp-synthetic-monitor.md` (new, 170 lines), this record, `package.json` (+1 script line, no dependency change), `supabase/config.toml` (one allow-list entry plus its comment), `docs/STATE.md` (§5 B2 row split, §7 items 3 and 4).
- **Completion Exception**: none
- **Completion Decision and Timestamp**: 2026-11-26 09:35 UTC - work complete, verification green, landing as one commit on `main` and awaiting owner review. Deliberately **not** `completed`: the owner has not signed off, AC-8 has no Actions run behind it yet, and B2 stays open.

A task may be marked `completed` only after acceptance results, verification evidence, changed-file summary, and required commit evidence are linked. This record authorizes nothing beyond the Approval Boundary in section 1.

## 8. Findings Recorded During Execution

Two facts were measured during S5 that the Planning Record could not have known, and both changed an artifact rather than being explained away.

### 8.1 The delivered token is PKCE-shaped (`pkce_` + 56 hex), and that is correct

The first live run failed with `link-unparseable`. The delivered body was:

```text
HTML: <p><a href="http://127.0.0.1:3001?token_hash=pkce_0f80ef99...&amp;type=email">Sign in</a></p>
TEXT: Sign in ( http://127.0.0.1:3001?token_hash=pkce_0f80ef99...&type=email )
```

Two divergences from the spec, and only one of them was a defect:

- **The `pkce_` prefix is expected.** `node_modules/@supabase/ssr/dist/main/createServerClient.js` hardcodes `flowType: "pkce"` for every server client, so `signInWithOtp` always posts a `code_challenge` and GoTrue mints a PKCE-shaped token. Probe: `POST /auth/v1/verify` with body exactly `{ type: 'email', token_hash }` accepts a 61-character `pkce_` token and answers `200` with a session, so `src/app/auth/confirm/route.ts` needed no change. The parser was wrong, not the app: `TOKEN_HASH_PATTERN` is now `/^(?:pkce_)?[0-9a-f]{56}$/`, and the spec's 56-hex rows were corrected in place.
- **The root-path link was a real configuration defect.** `supabase/config.toml` listed only the `127.0.0.1` spelling in `additional_redirect_urls`, while CI and `playwright.config.ts` use the `localhost` spelling for `NEXT_PUBLIC_APP_URL`, from which `confirmUrl()` derives. GoTrue compares by exact string and silently degrades to `site_url` - which is the app root - so the link never reached `/auth/confirm` and Next middleware answered `307 -> /sign-in`. Proven by probe: with `redirect_to=http://localhost:3001/auth/confirm` the link came back as `http://127.0.0.1:3001?token_hash=...`, and with the `127.0.0.1` spelling it came back correct. Both spellings are now listed, with the reason in a comment.

The lesson is worth keeping: an HTTP 200 from `/auth/signin` plus a delivered message is still not a working link, and only following it and asserting a session cookie exposes a redirect that quietly never arrives. That is precisely what AC-5 and AC-6 were written for.

### 8.2 The staged-secret scan fired on four false positives, and the fix was to remove the literals rather than to argue with the scanner

`bash .promptkit/scripts/scan-staged-secrets.sh .` exited **1** on four findings. All four were benign, and all four were removed at the source instead of being waived:

- `.github/workflows/magic-link-monitor.yml` lines 53 and 57 (JWT-like pattern): the local anon key and the well-known local service-role key, pasted as `env:` literals the way `.github/workflows/test.yml:84` already does. Even though that precedence makes them provably public, a JWT-shaped literal in a new workflow reads as a leak and will read that way to every future reviewer. The values now come from the stack that was just started: an `Expose the local stack credentials` step runs `eval "$(npx supabase status -o env)"` and appends `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` to `$GITHUB_ENV`. It logs the URL and the two key lengths, never the keys. The `DATABASE_URL` fixtures stay, matching `test.yml`.
- `scripts/check-magic-link.ts` lines 387 and 390: the `apikey` header set from `config.serviceRoleKey` (a reference, no literal) and a generated one-off value passed as the admin-users body's password field. Both are gone as a side effect of a genuine simplification: the headers are built by a new `adminHeaders(serviceRoleKey)` helper, and the body is now `{ email, email_confirm: true }` with the password field dropped entirely. Probed before the change - `POST /auth/v1/admin/users` with `{ email, email_confirm: true }` and no password answers **200** - so the monitor now creates a passwordless synthetic account instead of inventing a throwaway secret it never uses. That is one fewer credential in the system, not merely a quieter diff.

Verification after the change: `npx tsc --noEmit` **0**, `npx eslint --max-warnings=0` on both files **0**, the 38 unit tests still pass, a live `npm run monitor:magic-link` is still green (six phases, `PASS ... in 1.3 s`, message `64PV5LNca2n08F0hwGLS6q` after 14 ms), and the re-run scan exits **0**.
