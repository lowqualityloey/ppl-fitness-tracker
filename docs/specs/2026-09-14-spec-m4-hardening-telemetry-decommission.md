# Technical Design Document (RFC): M4 — Hardening, Telemetry & Decommission (Retroactive)

- **Author**: Agent (DSH), with Owner decisions recorded in the Planning Record (§0) and §8
- **Status**: Grilled 2026-09-14 (§9) — **Owner sign-off complete 2026-09-14** (all 7 assumptions accepted; DECISION-m4-001/002/003 approved; 004 + DEFERRED-005 acknowledged; CSP ruled FILE — see §3.4/§9.3(1))
- **Created**: 2026-09-14
- **Target Release**: M4 of the full-stack migration (milestone #4)

**Parents**: `docs/specs/2026-09-08-spec-fullstack-migration.md` (master RFC: SLA table, FMEA register, §4.4–§4.6, §5), `docs/releases/2026-09-12-m3-exit-report-and-m4-handoff.md` (§3.1–§3.6), `docs/tasks/m4/README.md` (24 cards + 6 parked), `docs/STATE.md` §5/§7 (item 22 is the M4 start line), ADR-0001–0006.

> **Retroactive notice.** M4 was decomposed into cards on 2026-09-12 *before* this spec existed — a
> deliberate, recorded process deviation (`docs/tasks/m4/README.md` header; `docs/STATE.md` §7 item 22
> prescribes `pk:plan` first). Nine of 31 board items are already closed. This spec therefore does two
> jobs: (1) it is the architecture document for the remaining 22 items, and (2) it is the reconciliation
> record for what already shipped (§8), so that the decisions embedded in closed cards become citable
> planning provenance instead of tribal memory. Sections that describe shipped work are marked
> **[SHIPPED]**; nothing in §8 may be "re-decided" here — the owner decisions it records are locked.

---

## 0. Planning Record (PromptKit Adaptation)

<a id="PLAN-m4"></a>

### Planning Record Metadata

- **Planning Record ID [Required]**: `PLAN-m4`
- **Planning Depth [Required]**: `Full`
- **Owner [Required]**: `lowqualityloey` (project owner)
- **Record Status [Required]**: `ready` (ready for grill; not yet owner-signed)
- **Local Task Record Link [Required for Controlled Work]**: `[M4 board](../tasks/m4/README.md)`; per-card records `docs/tasks/m4/M4-00…M4-23*.md`
- **Workflow Links [Optional]**: `pk:plan` (this document), `pk:tasks` (already run 2026-09-12), `pk:grill` (pending, §7)

### Planning Inputs

- **Requested Outcome [Required]**: A production-hardened app — measurable performance verdicts against the master RFC's SLA table, an observability spine (structured logs, correlation ids, Sentry on both sides of the wire), product-truth features (measurements, analytics, export, offline shell), and the legacy vanilla-JS estate deleted without stranding a single byte of user data.
- **Observable Completion Condition [Required]**: Every M4 board item is closed with evidence or carries an owner-signed deferral comment; the §8.2 exit-gate table passes; `docs/STATE.md` records an M4 exit with the same ceremony as M3 (verification audit + exit report).
- **Scope Boundary [Required]**: **In**: `lib/` (contracts, sync engine, logger, rate limiter), `src/app/api/**` (new measurements/export/analytics routes, `GET /api/sessions` paging), `src/app/**` (client runner, SW registration, stretch timers, history/progress), `drizzle/` migrations (authorship model per #89), `ppl-workout-dashboard/` + three day folders + their READMEs (delete), `tests/**`, `next.config.ts` (headers, Sentry wizard). **Out**: auth model (GoTrue/RLS shape frozen except additive indexes), Supabase Realtime *implementation*, native app, dark mode, M5+ product ideas.
- **TDD Enforcement Proposal (Reference Only) [Optional]**: `disabled` — no `docs/tasks/m4/*` record sets the flag, so the default holds. The cards' "watched to fail first, captured in the PR" DoD law (board README) governs RED evidence instead; this proposal cannot and does not activate TDD enforcement.

### Full Planning

- **Explicit Non-Goals [Required in Full]**:
  - **Supabase Realtime implementation.** #112 is *ratified*: keep the 4 s poll, write ADR-0007. Widening RLS for a subscription channel is excluded unless ADR-0007's revisit trigger fires with telemetry evidence.
  - **Moving any SLA number.** Documented p95 200 ms, enforced ceiling 800 ms, 5 s propagation budget: this spec *reports and adjudicates*, never rewrites (STATE §7 item 21 protocol owns that).
  - **Production SMTP provider work.** #16 is `deferred` — an M4 *exit gate*, not an M4 work item (see DECISION-m4-004).
  - **New product surfaces** beyond the four truth features (#108/#109/#110/#111); no coach mode, no social features, no notifications.
  - **Re-litigating the seven ratified owner decisions** listed in §8.1.
- **Affected Behavioral Components [Required in Full]**: sync apply path (batch contention, outbox reporting), rate limiter (accepted as-is), polling loop, route handlers (auth hop shedding **[SHIPPED]** #125/PR #131), log/telemetry emission on every request, session runner UI (timers, SW install), history/progress screens (analytics), new API endpoints (measurements, export), legacy estate (deleted), CI gates (parity scan flipped, typed-row lint, ZWSP gate, hermetic unit layer).
- **Externally Visible Contracts [Required in Full]**: `body_measurements` table + upsert/list endpoints (new), `GET /api/export/v1` (new, versioned JSON), weekly-volume + streak analytics response (new), `?from=`/`?to=` on `GET /api/sessions` (additive), `SessionStatusSchema` producer path for `archived` (#76, new transition), rejection-with-message (#77, additive field), `SyncResponseData.state` (**dropped [SHIPPED]**, PR #116), Sentry DSN in client bundle (new exposure surface), service worker at `/sw.js` (new network-visible file).
- **Failure or Rollback Considerations [Required in Full]**: Every schema move is additive-then-expand (no contract phase inside M4 except the already-shipped `state` drop); legacy deletion is git-recoverable but `localStorage` keys are **not** — the import-then-delete ordering in §6 wave 3 is the only data-loss hazard on the board, and it is why #109 hard-precedes #103. SW mistakes are client-side-cache mistakes: versioned scope + build-id precache makes rollback = deploy. Sentry is one dependency pin, removable without schema fallout.
- **Verification Approach [Required in Full]**: Each card's AC already names its measurement instrument (load harness artifact, two-context propagation distribution, Lighthouse/axe gates, watched-to-fail RED captures). This spec adds one synthesis gate: the §8.2 exit table requires an *artifact per claim*, never a prose assertion, per the STATE item-21 discipline.

### Assumption Records

Seven card-level forks were settled by the Owner at decomposition time only as *directions* ("build it properly", "follow #109", etc.); the concrete shape below is this spec's provisional answer awaiting sign-off. All are `open`; each converts to `validated`/`accepted`/`rejected` in the §7 pass. **Pass completed 2026-09-14: all seven Accepted as written — per-record dates/caveats are in each status line.**

<a id="ASSUMPTION-m4-001"></a>
- **Assumption ID**: `ASSUMPTION-m4-001` · **Unanswered Decision**: Which body-measurement kinds exist, and their unit/value domains (#109)?
- **Provisional Answer**: kinds = `body_weight | body_fat_pct | neck_cm | waist_cm | chest_cm | hip_cm`; one `value: number` column reusing `WeightKgSchema` bounds (0–1000, multipleOf 0.01 — covers cm and % under one numeric ceiling); uniqueness `(user_id, measured_on, kind)`; upsert semantics (same key = correction).
- **Impact if Wrong**: wrong kind-set either strands legacy `userStats` fields at import time (the exact failure #109 exists to prevent) or forces a contract-phase migration later.
- **Validation Action**: diff the kind list against every field the legacy importer reads out of `userStats` *before* #109's RED test is written; Owner confirms list at sign-off.
- **Decision Owner**: lowqualityloey · **Status**: `accepted (Owner sign-off 2026-09-14 — as written; the per-kind diff against legacy userStats fields remains #109's mandatory first RED step)` · **Supporting Evidence**: `docs/releases/2026-09-12-m3-exit-report-and-m4-handoff.md` §3.4 · **Resolution Evidence**: `docs/design/2026-09-16-m4-20-body-measurements.md` §2 (F-1: whole-estate sweep — `userStats` read at `app.js:148`, zero writers, no kinds stranded) + §4 OC-1 (kinds ratified at six; no `height_cm`); shipped in `lib/contracts/measurements.ts`, pinned by `tests/unit/contracts/measurements.test.ts`

<a id="ASSUMPTION-m4-002"></a>
- **Assumption ID**: `ASSUMPTION-m4-002` · **Unanswered Decision**: What do "volume/streak" analytics compute from, given legacy `userStats` was never written by the new app (#108)?
- **Provisional Answer**: weekly volume = sum(weight×reps×sets) per completed session grouped ISO-week; streak = consecutive `local_date`s with ≥1 `completed` session; imported legacy rows count with `loadCoverage: null` → **excluded from volume** (no invented loads), **included in streak** (day-level truth only).
- **Impact if Wrong**: including legacy sessions in volume fabricates progress; excluding them from streaks under-reports a long-standing user. Both are user-visible trust calls.
- **Validation Action**: render both decisions explicitly in #108's UI copy; Owner reviews the progress screen before merge.
- **Decision Owner**: lowqualityloey · **Status**: `accepted (Owner sign-off 2026-09-14 — as written; #108 UI copy must still render both decisions explicitly)` · **Supporting Evidence**: `docs/tasks/m4/M4-19*.md` · **Resolution Evidence**: N/A - unresolved

<a id="ASSUMPTION-m4-003"></a>
- **Assumption ID**: `ASSUMPTION-m4-003` · **Unanswered Decision**: Export size bound and shape strategy — stream or single response (#110)?
- **Provisional Answer**: single bounded JSON response; hard cap 200 sessions per user (current realistic ceiling is orders lower); on cap breach the payload carries `truncated: true` + `oldestExcluded` date rather than failing. Versioned literal `"version": "v1"`.
- **Impact if Wrong**: a user who outgrows the cap gets a truncated "never hostage" artifact — the mitigation degrades silently.
- **Validation Action**: #110's AC asserts the truncated branch renders honestly in the UI; revisit in M5 with usage telemetry (#95 evidence stream).
- **Decision Owner**: lowqualityloey · **Status**: `accepted (Owner sign-off 2026-09-14 — as written; #110 AC asserts the truncated branch renders honestly in the UI; revisit cap in M5 with usage telemetry)` · **Supporting Evidence**: master RFC §6 (export mitigation line) · **Resolution Evidence**: N/A - unresolved

<a id="ASSUMPTION-m4-004"></a>
- **Assumption ID**: `ASSUMPTION-m4-004` · **Unanswered Decision**: SW activation and caching policy for the shell (#111)?
- **Provisional Answer**: `skipWaiting: false` (no mid-workout asset swap), precache keyed by build id, **never** cache any `/api` response or `IndexedDB`-backed outbox data; reload-offers-new-version via standard Next SW prompt affordance.
- **Impact if Wrong**: an eager `skipWaiting: true` can swap a runner's code underneath a live offline session — the exact state M3's outbox contract protects.
- **Validation Action**: #111's AC includes an airplane-mode reload test and a "deploy while mid-session, no swap" test.
- **Decision Owner**: lowqualityloey · **Status**: `accepted (Owner sign-off 2026-09-14 — as written; #111 AC keeps the airplane-mode reload and deploy-mid-session no-swap tests)` · **Supporting Evidence**: `docs/specs/2026-09-11-spec-m3-presentation.md` §4.3 outbox contract · **Resolution Evidence**: N/A - unresolved

<a id="ASSUMPTION-m4-005"></a>
- **Assumption ID**: `ASSUMPTION-m4-005` · **Unanswered Decision**: #78 tie-break rule for same-`updated_at` concurrent writes currently decided by random UUID.
- **Provisional Answer**: server apply order (`server_seq`) wins the tie deterministically; this **changes one sentence of master RFC §4.4(4)** and needs an explicit owner amendment, not a silent code change.
- **Impact if Wrong**: if Owner rejects, #78 must instead document the randomness as intended — but the tests still need *a* deterministic oracle.
- **Validation Action**: grill target (5) resolved: mechanism is an **ADR superseding the master-RFC sentence** (a spec does not amend another spec's contract text); Owner approves the mechanism + rule at sign-off, the ADR implements it. Numbering follows the §9.3 slot race rule.
- **Decision Owner**: lowqualityloey · **Status**: `accepted (Owner sign-off 2026-09-14 — rule (server_seq wins) AND mechanism (a new ADR supersedes the one master-RFC §4.4(4) sentence; a spec cannot amend its parent) both ratified. The ADR is still owed: number follows §9.3 slot-0007 race rule, first-merge-wins between #112 and #78. Until that ADR merges on main, #78 may not cite this record as authority to change conflict-resolution code)` · **Supporting Evidence**: `docs/specs/2026-09-08-spec-fullstack-migration.md` §4.4 · **Resolution Evidence**: N/A - unresolved

<a id="ASSUMPTION-m4-006"></a>
- **Assumption ID**: `ASSUMPTION-m4-006` · **Unanswered Decision**: Does `GET /api/sessions` gain date paging, and how does it coexist with the existing cursor (#82)?
- **Provisional Answer**: additive `?from=`/`?to=` (`YYYY-MM-DD`, inclusive, validated against `local_date`) combinable with the existing opaque cursor; no removal, no change to default ordering — strictly backwards-compatible.
- **Impact if Wrong**: none catastrophic — worst case the params are ignored client-side forever and #82 closes as "documented, unused".
- **Validation Action**: #82's contract test pins the four combinations (neither/both/either).
- **Decision Owner**: lowqualityloey · **Status**: `accepted (Owner sign-off 2026-09-14 — as written; #82's contract test must pin all four from/to × cursor combinations)` · **Supporting Evidence**: `lib/contracts/sessions.ts` (current cursor shape) · **Resolution Evidence**: N/A - unresolved

<a id="ASSUMPTION-m4-007"></a>
- **Assumption ID**: `ASSUMPTION-m4-007` · **Unanswered Decision**: How aggressively to parse thousands-grouped weight strings like `"2,000"` at the import boundary (#84)?
- **Provisional Answer**: accept exactly-3-digit groups only (`\d{1,3}(,\d{3})+` → strip commas), keeping the existing 0–1000 ceiling check *after* normalization (so `2,000` normalizes to 2000 then rejects at ceiling — parse fixes, ceiling stays honest).
- **Impact if Wrong**: over-eager grouping silently mistranscribes typo'd inputs the user meant as kg values; under-eager leaves #84 open.
- **Validation Action**: property test: normalized value must equal numeric parse for every accepted string form.
- **Decision Owner**: lowqualityloey · **Status**: `accepted (Owner sign-off 2026-09-14 — as written; property test (normalized == numeric parse) is the AC that makes it safe)` · **Supporting Evidence**: `lib/contracts/common.ts` `WeightKgSchema` · **Resolution Evidence**: N/A - unresolved

### Technology and Vendor Decision Records

<a id="DECISION-m4-001"></a>
#### Decision Record: `DECISION-m4-001`

- **Decision ID**: `DECISION-m4-001`
- **Decision Statement**: Adopt Sentry (`@sentry/nextjs`) as the error/crash telemetry sink for both client and server bundles (#95), or hand-roll an error-reporting endpoint.
- **Considered Options**: (a) `@sentry/nextjs` official wizard — auto-instrumentation, source maps, client+server in one package, matches the master RFC §6 line that already names Sentry; (b) hand-rolled `/api/report` + queue — zero deps but re-implements dedupe, fingerprinting, releases; (c) other APM (Datadog/GlitchTip) — pricing/self-host cost disproportionate to a single-user-scale personal app.
- **Selected Option(s)**: (a) `@sentry/nextjs`, pinned exactly (below). Pending Owner sign-off — status `proposed` because this was the card's direction, not a recorded owner acceptance of the *package and version*. **(Sign-off pass completed 2026-09-14 — the package and version are now the recorded acceptance; see Status line.)**
- **Rejected Option(s)**: (b) — #94 already gives us the log spine; re-rolling error aggregation is effort on the wrong axis. (c) — no evidence of need; rejected for cost/complexity, not capability.
- **Material Claim Links**: [CLAIM-DECISION-m4-001-001](#CLAIM-DECISION-m4-001-001), [CLAIM-DECISION-m4-001-002](#CLAIM-DECISION-m4-001-002)
- **Remaining Uncertainty**: [UNCERTAINTY-DECISION-m4-001-001](#UNCERTAINTY-DECISION-m4-001-001)
- **Decision Owner**: lowqualityloey · **Status**: `approved (Owner sign-off 2026-09-14 — pin @10.74.0, error-crash-sink-only scope, Next-16 -0 peer uncertainty closed by #95 observed-to-fire DoD; §9.3(1) CSP-before-#95 and DEFERRED-m4-005 no-tracing rules accepted as attached conditions)`

##### Version Selection Fields

- **Version Selection Context**: `Greenfield/no preference` (no Sentry exists in the repo today — CSP/telemetry grep confirms nothing shipped)
- **AI Recommendation**: `@sentry/nextjs@10.74.0` — registry `latest` at access date; 10.x is the current major line.
- **Selected Exact Version(s)**: `10.74.0` (pinned, not `^`-floated at adoption; bump cadence is a normal dependency PR)
- **Release Channel**: `stable`
- **Support/Lifecycle Status**: actively released (latest stable as of 2026-09-14); no EOL notice on 10.x in the registry metadata fetched.
- **Compatibility Constraints**: peer `next: "^13.2.0 || ^14.0 || ^15.0.0-rc.0 || ^16.0.0-0"` — the repo's Next 16 satisfies the `-0` prerelease-compat range **by declaration only**; engines `node >=18` (repo runs higher); license MIT.
- **Version Rationale**: newest stable at spec time, chosen so #95's "observed to fire" work happens against a supported line; the `-0` peer allowance is the *reason* for the accepted assumption, not a hidden hazard.
- **Exact-Version Evidence**: [CITATION-DECISION-m4-001-001](#CITATION-DECISION-m4-001-001), [CITATION-DECISION-m4-001-002](#CITATION-DECISION-m4-001-002)
- **Existing Version Baseline**: `Not applicable - greenfield or no existing pin`
- **Decision Owner Approval or Accepted Assumption**: **not yet recorded** — this is the open item the sign-off pass must close.
- **pk:spike or ADR Link**: None (candidate ADR-0008 "Sentry adoption" if Owner prefers a separate ADR; #95's DoD is evidence-in-PR otherwise)

<a id="CLAIM-DECISION-m4-001-001"></a>
#### Material Claim Record: `CLAIM-DECISION-m4-001-001`

- **Claim ID**: `CLAIM-DECISION-m4-001-001`
- **Decision Link**: [DECISION-m4-001](#DECISION-m4-001)
- **Material Claim**: `@sentry/nextjs@10.74.0` is the latest stable version on the npm registry, declares peer support for Next 16 via `^16.0.0-0`, engines `node >=18`, license MIT.
- **Citation or Uncertainty Link**: [CITATION-DECISION-m4-001-001](#CITATION-DECISION-m4-001-001)

<a id="CITATION-DECISION-m4-001-001"></a>
#### Citation Record: `CITATION-DECISION-m4-001-001`

- **Citation ID**: `CITATION-DECISION-m4-001-001`
- **Publisher**: npm, Inc. (package registry)
- **Document Title**: Registry metadata for `@sentry/nextjs` `latest`
- **Canonical URL**: https://registry.npmjs.org/@sentry/nextjs/latest
- **Access Date**: 2026-09-14
- **Supported Claim Link**: [CLAIM-DECISION-m4-001-001](#CLAIM-DECISION-m4-001-001)
- **Citation Status**: `verified`

<a id="CLAIM-DECISION-m4-001-002"></a>
#### Material Claim Record: `CLAIM-DECISION-m4-001-002`

- **Claim ID**: `CLAIM-DECISION-m4-001-002`
- **Decision Link**: [DECISION-m4-001](#DECISION-m4-001)
- **Material Claim**: Sentry (wizard + hosted error aggregation) is the intended telemetry sink for M4 per the master plan, independent of this spec.
- **Citation or Uncertainty Link**: [CITATION-DECISION-m4-001-002](#CITATION-DECISION-m4-001-002)

<a id="CITATION-DECISION-m4-001-002"></a>
#### Citation Record: `CITATION-DECISION-m4-001-002`

- **Citation ID**: `CITATION-DECISION-m4-001-002`
- **Publisher**: This project (master RFC)
- **Document Title**: Fullstack migration spec §6 (M4 line) and card #95
- **Canonical URL**: `docs/specs/2026-09-08-spec-fullstack-migration.md`
- **Access Date**: 2026-09-14
- **Supported Claim Link**: [CLAIM-DECISION-m4-001-002](#CLAIM-DECISION-m4-001-002)
- **Citation Status**: `verified`

<a id="UNCERTAINTY-DECISION-m4-001-001"></a>
#### Uncertainty Record: `UNCERTAINTY-DECISION-m4-001-001`

- **Uncertainty ID**: `UNCERTAINTY-DECISION-m4-001-001`
- **Affected Claim or Context**: `^16.0.0-0` declares *range membership* for Next 16; it is not a statement that every Next 16 runtime behavior (instrumentation hooks, edge/PPR interaction) is exercised by Sentry's CI at this exact pin.
- **Impact**: #95 could burn hours on a vendor incompatibility that the peer range claims to cover; a bad DSN/instrumentation bug shipped to the client is also a privacy surface.
- **Resolution Action**: `Proceed with an explicitly accepted assumption` — #95's own DoD ("observed to fire", client *and* server, watched in the Sentry UI) is the empirical closure of this uncertainty; if it fires, it's compatible.
- **Decision Owner**: lowqualityloey · **Status**: `open` · **Supporting Evidence**: `docs/tasks/m4/M4-06*.md` (#95 DoD)

<a id="DECISION-m4-002"></a>
#### Decision Record: `DECISION-m4-002`

- **Decision ID**: `DECISION-m4-002`
- **Decision Statement**: Structured logging implementation (#94): adopt a logging library or hand-roll a JSON logger seam?
- **Considered Options**: (a) hand-written `lib/logger` emitting JSON lines with `request_id`/`user_id`/`session_id` correlation fields; (b) `pino`; (c) `consola`.
- **Selected Option(s)**: (a) — a ~60-line seam: level + JSON serializer + correlation-context propagation. Rationale: the repo's hardening discipline treats the *correlation contract* as the product; a library buys rotation and transports nobody consumes here.
- **Rejected Option(s)**: (b), (c) — extra deps whose differentiators (transports, dev prettify) aren't requirements; both would still need the same custom correlation middleware, so they add weight without removing work.
- **Material Claim Links**: `None` — no external claim depends on it; correctness is verified by #94's own tests (parseable JSON, id propagation).
- **Remaining Uncertainty**: `None`
- **Decision Owner**: lowqualityloey · **Status**: `approved (Owner sign-off 2026-09-14 — zero-dep hand-written logger; #94 is unblocked on this record alone)` · **Version Selection Fields**: `Not applicable - no version selected` (zero new dependencies) · **pk:spike or ADR Link**: None

<a id="DECISION-m4-003"></a>
#### Decision Record: `DECISION-m4-003`

- **Decision ID**: `DECISION-m4-003`
- **Decision Statement**: Service-worker implementation for the offline shell (#111): library or hand-written?
- **Considered Options**: (a) hand-written `public/sw.js` — precache build-id manifest, network-first for navigation, never `/api`; (b) Workbox; (c) Serwist.
- **Selected Option(s)**: (a) — the required policy is 20-some lines once the build-id manifest exists (assumption [ASSUMPTION-m4-004](#ASSUMPTION-m4-004)); the deletion test says the libraries concentrate runtime-caching complexity we have forbidden ourselves from having.
- **Rejected Option(s)**: (b) — Workbox's value is route caching strategies this app explicitly must not do for `/api`; (c) — same, plus a build-plugin coupling to a bundler config (#99 tsconfig churn) we're trying to stabilize, not destabilize.
- **Material Claim Links**: `None` — decision rests on scope-of-need, not vendor facts.
- **Remaining Uncertainty**: `None` — residual risk (stale cache) is an accepted assumption, not an unverified claim: [ASSUMPTION-m4-004](#ASSUMPTION-m4-004).
- **Decision Owner**: lowqualityloey · **Status**: `approved (Owner sign-off 2026-09-14 — hand-written public/sw.js; stale-cache residual risk already accepted via ASSUMPTION-m4-004)` · **Version Selection Fields**: `Not applicable - no version selected` · **pk:spike or ADR Link**: None

<a id="DECISION-m4-004"></a>
#### Decision Record: `DECISION-m4-004`

- **Decision ID**: `DECISION-m4-004`
- **Decision Statement**: Production SMTP provider for magic-link deliverability (#16) — the app's front door.
- **Considered Options**: Resend, Postmark, SES, GoTrue-hosted SMTP with any provider.
- **Selected Option(s)**: `None` while status is `deferred`.
- **Rejected Option(s)**: `None` recorded yet.
- **Material Claim Links**: `None` — deliberately unresearched: this is a budget/account decision the Owner has kept on M1 as a deploy-blocking exit item; the board README states it "stays with the Owner". Picking a provider in a spec would be the AI-authority error this record exists to prevent.
- **Remaining Uncertainty**: none at claim level; the *gate* is the uncertainty — no deploy without it.
- **Decision Owner**: lowqualityloey · **Status**: `deferred (Owner acknowledged 2026-09-14 — M4 exit gate, not a work item; #16 stays the Owner account/budget call; deploy blocked until provider decision or explicit owner-signed deferral past M4)` · **Version Selection Fields**: `Not applicable - no version selected` · **pk:spike or ADR Link**: None

<a id="DEFERRED-m4-005"></a>
#### Decision Record: `DEFERRED-m4-005`

- **Decision ID**: `DEFERRED-m4-005`
- **Decision Statement**: Sentry browser tracing / field performance signal (transactions, HTTP/DB spans, Web Vitals via `tracesSampleRate`) — in-scope for #95 or not at all.
- **Considered Options**: (a) fold tracing into #95's `Sentry.init`; (b) defer with an explicit re-entry trigger; (c) reject permanently.
- **Selected Option(s)**: (b). #95 stays **error/crash-sink only**, exactly as M4-06's Out-of-scope line and `DECISION-m4-001`'s statement already read — this record makes that boundary an Owner-visible deferral instead of a spec-invisible assumption. Reasons, in weight order: (1) **n≈1** — tracing aggregates populations; a slow span on a single-user app is statistically indistinguishable from cold start, flaky radio, or a throttled background tab; (2) **measurement integrity** — auto-instrumented spans add overhead to `POST /api/sync`, the route whose #90/#92/#131 numbers everything downstream reads, and mixed-instrumentation comparability is precisely the failure STATE item 21 exists to prevent; (3) **uncertainty budget** — UNCERTAINTY-m4-001-001 accepts the Next-16 `-0` peer range at the *narrowest* observational surface; tracing multiplies the unproven surface for no error-sink benefit; (4) **PII surface** — spans carry full URLs; GoTrue magic-link tokens ride query strings (§5 redaction rule), so tracing needs its own scrubbing work, not a flag.
- **Rejected Option(s)**: (a) — reasons above; (c) — premature: §8's own warning that lab numbers "are not field data" is a real gap, and the *cheapest* future answer may be tracing, or may be runner-local last-N duration surfacing (the runner already owns the timings; no new product surface needed).
- **Re-entry Trigger**: post-M4, **and only if** a concrete field-performance question arises that the harness (#90), `lib/logger` (#94) and outbox depth/age (#96) cannot answer.
- **Material Claim Links**: reuses `DECISION-m4-001`'s registry citation for scope of the package; no new vendor claims asserted.
- **Remaining Uncertainty**: whether any field signal is ever needed — that is the deferred question itself.
- **Decision Owner**: lowqualityloey · **Status**: `deferred (Owner acknowledged 2026-09-14 — #95 is error/crash-sink-only; browser tracing deferred with re-entry trigger; a #95 PR setting tracesSampleRate > 0 is a scope violation per §9.3(6))` · **Version Selection Fields**: `Not applicable - no version selected` · **pk:spike or ADR Link**: None

---

## 1. Executive Summary & Problem Statement

M3 shipped a product that works — offline sessions, a draining outbox, an accessible runner — but it works **un-instrumented, un-measured, and beside a corpse**. There is no way to answer "did user X's sync fail at 14:02?" (no structured logs, no correlation ids, no error sink); the master RFC's headline SLA ("sync p95 200 ms @ 50 rps") has never been measured under any concurrency at all (the M3 numbers were sequential); and 13,734 lines of legacy vanilla-JS still sit in the tree as the de-facto migration crutch.

M4 is the milestone where the app stops being a demo: **evidence replaces assertion** (load harness, telemetry that fires, watched-to-fail RED captures), **product truth replaces apologetics** (body measurements built properly instead of "fields we couldn't recover", analytics from real sessions only, a versioned export that makes the user's data never hostage, true offline reload via a service worker), and **the legacy estate gets deleted** — but only *after* everything it holds has a first-class home, which is why ordering, not coding, is M4's dominant risk.

The engineering problem is epistemic, not architectural. When the cards were filed, every wave-2 verdict was a function of an artifact that did not exist yet — and the board has since partially answered: #90's harness ran (PR #126, verdict: 50 rps **undeliverable on this hardware**, best offered 43.6, `INCONCLUSIVE`) and #92 adjudicated the 200 ms promise by re-documenting the RFC row to *measured reality without moving the budget* (PR #133). The remaining epistemic work is therefore narrower and stricter than the original board implied: **#91** (60-mutation batch under concurrency) and **#112** (the ADR margin) must *read from the existing artifact*, and everything telemetry-shaped (#94/#95/#107) must land before #91's rerun so the numbers are diagnosable rather than merely recordable. Get that spine right and the verdict cards become bookkeeping; get it wrong and M4 "passes" on numbers nobody can believe — the exact failure STATE item 21 exists to prevent.

## 2. Goals and Explicit Non-Goals

### 2.1 Goals (in scope, measurable)

| # | Goal | Measurement method | Board items |
| :-- | :--- | :--- | :--- |
| **G-M4-1** | An honest, artifact-backed SLA verdict that **never moves a documented number outside the STATE item-21 protocol**. **[SHIPPED: #90 PR #126, #92 PR #133]** — harness exists, 50 rps verdict `INCONCLUSIVE` (best offered 43.6), RFC §3 row now "*documented, not enforced*" with measured sequential p95 ~203–413 ms against the enforced 800 ms ceiling. **Residual: #91** — the 60-mutation batch has still never been measured under concurrency. | Already-built instrument: `npm run perf:sync` (`scripts/perf-sync-load.ts`); #91 files its artifact beside `docs/perf/2026-09-12-m4-90-load-harness-design.md`. | #91 (#90/#92 closed) |
| **G-M4-2** | Any request traceable end-to-end: one correlation id from client tap → route log line → Sentry event, on both bundles, **observed to fire** (not "configured"). | #94 test asserts parseable JSON + id propagation; #95 DoD requires screenshots/events in the Sentry UI for seeded client *and* server errors. | #94, #95 |
| **G-M4-3** | The legacy estate (`ppl-workout-dashboard/`, three day folders, READMEs, `localStorage` keys, zero-JS build scripts) is deleted with **zero stranded user data**: measurements + analytics land first, parity scan is *flipped* (asserts absence). | #109/#108 merged before #103; flipped scan green in CI; #104 after #103. | #103, #104, #109 |
| **G-M4-4** | Reload with no network and no warm cache still renders the app shell. | Playwright `setOffline` + cold storage clear + reload assertion (#111 AC). | #111 |
| **G-M4-5** | The user can leave with everything: one authenticated request returns a versioned, complete, machine-readable copy of their data. | #110 contract tests incl. the truncated branch ([ASSUMPTION-m4-003](#ASSUMPTION-m4-003)). | #110 |
| **G-M4-6** | Test infrastructure stops lying: no `any`-typed row reads in security suites, hermetic unit layer, ZWSP accessible-name gate structural. **[SHIPPED: #80 PR #119, #97 PR #186, #100 PR #120]** — per-run fixture ids exist; typed row reads are in place (D7); contention was fenced by re-sizing spec clocks to measured durations, not retries. | CI evidence: gates pass on the merged tree. | #98, #101 (#80/#97/#100 closed) |
| **G-M4-7** | Every open board item closes with an owner-decidable artifact, and the exit gate (§8.2) passes or names its deferral. | M4 exit report mirroring the M3 one, checked against §8.2. | all |

### 2.2 Non-Goals

Exactly the Full-Planning non-goals in §0, restated for reviewers: no Realtime implementation, no SLA-number edits outside the STATE protocol, no SMTP provider work in-repo (#16 stays an Owner exit gate), no new product surfaces beyond measurements/analytics/export/SW, no dark mode, no auth-model changes, no re-decision of the seven ratified items in §8.1.

### 2.3 Success metrics that must not regress

`npm test`, `test:api`, `test:mutation` (exit 0), `check-set-config.sh`, `eslint --max-warnings=0`, the M3 Playwright suite, Lighthouse a11y 100 on the three scored routes, and the parity scan **until wave 4 flips it deliberately**. The #100 precedent (PR #120) binds the remaining suites: fence = give each spec a clock derived from its own declared waits/measured durations, never `retry: 2`.

## 3. Architecture & System Context

### 3.1 What M4 adds to the picture (delta on M3 §3.1)

```text
                        ┌────────────────────────── M4 additions ──────────────────────────┐
 client tap ──► runner ─┬─► SyncEngine ─► outbox ─► POST /api/sync ─► apply (server_seq)   │
                        │        │ request_id                                                 │
                        │        ▼                                                            │
                        │   lib/logger (JSON lines: request_id, user_id, session_id) ──► stdout/CI capture
                        │        ▼                                                            │
                        ├──► Sentry(client) ─┐                        Sentry(server) ◄─┐     │
                        │                    └──────────── one release/DSN ────────────┘     │
                        ▼                                                                    │
                  /sw.js  (precache build-id assets · shell-only · never /api)               │
   GET /api/export/v1 ◄── user owns data      body_measurements (new table, upsert by        │
   analytics = f(completed sessions)                             user,measured_on,kind)      │
                        └────────────────────────────────────────────────────────────────┘
 legacy estate: DELETED (wave 4, after #109 lands its replacement in wave 3)
```

### 3.2 Deep modules and seams (deletion test applied)

| Module / Seam | Public Interface | Complexity hidden | Status |
| :--- | :--- | :--- | :--- |
| **`lib/logger`** (#94) | `log.info(msg, ctx)`, `withContext({requestId})` | JSON shape, correlation propagation across the getUser hop, PII redaction rules | proposed |
| **`lib/measurements`** (#109) | `upsertMeasurement()`, `listRange()` | unique-key upsert semantics, legacy `userStats` import mapping | proposed |
| **`lib/export/v1`** (#110) | `buildExport(userId): ExportV1` | section assembly, cap/truncation math, version literal | proposed |
| **`public/sw.js`** (#111) | install/activate/fetch, build-id manifest | precache set derivation, activation policy, cache eviction | proposed |
| **load harness** (#90) | `npm run perf:sync` (`scripts/perf-sync-load.ts`) | offered-rate accounting incl. client backpressure ticks, per-user budget arithmetic (2 rps = 120/min), 429/5xx/fetch-error split, **self-flagging implausible zero-429 runs**, artifact emission to `docs/perf/` | **[SHIPPED]** PR #126 — M4's epistemic instrument; #91/#112 read from it, nobody re-invents it |
| **rate limiter** | unchanged interface | (already accepted **[SHIPPED]**: process-local + ADR, PR #135, `PROMPTKIT.md` §2) | closed |

### 3.3 Rejected alternatives, recorded so they are not re-litigated

- **Shared-store (Postgres/Redis) rate limiter** — rejected by ratified owner decision on #93; accepted process-local with an ADR (shipped, PR #135).
- **Outbox depth-only surfacing** — rejected by ratified decision #96: **depth *and* age** surface together (shipped, PR #137).
- **Keeping `SyncResponseData.state`** — rejected by ratified decision #105 (dropped, PR #116).
- **Realtime instead of polling** — rejected by ratified decision #112 (keep 4 s poll, ADR-0007 documents the margin and the revisit trigger).
- **Logging library** — rejected, DECISION-m4-002. **SW library** — rejected, DECISION-m4-003. **Hand-rolled error sink instead of Sentry** — rejected, DECISION-m4-001.
- **Streaming export (NDJSON/chunked)** — not adopted, [ASSUMPTION-m4-003](#ASSUMPTION-m4-003); revisit only if the cap is ever hit.

### 3.4 Known gap surfaced by this spec (NOT a silent scope-add)

The master RFC §5 security section lists CSP / `frame-ancestors`; a grep over `src/` finds **no CSP implementation** — and the §9 grill confirmed the RFC's premise ("current pages set `X-Frame-Options` via `meta http-equiv`") describes only the *legacy* estate, which wave 4 deletes; the Next app never had even the inert headers. **No M4 card covers CSP.** This spec does not quietly add the work — it flags CSP as **grill target #1** (§7): either a card gets filed (owner call), or the gap gets a written acceptance like #93's. New coupling found by the grill: **DECISION-m4-001 makes this time-sensitive** — a CSP added *after* #95 ships must not break Sentry ingest (`connect-src sentry.io`), so the rule set in §9.3 is: the CSP card-or-acceptance decision must be recorded **before #95 merges**, not merely before deploy. Same treatment for #76 (no API path produces `archived`) — the enum exists in the contract, the producer does not. **Owner ruling, §7 sign-off 2026-09-14: FILE.** CSP enters M4 as a new card (not yet created on the board); it must merge before or with #95, and its `connect-src` must already carry Sentry ingest.

---

## 4. Detailed Design & Contracts First

### 4.1 Contracts added or amended in M4 (Zod, written before implementation)

```typescript
// lib/contracts/measurements.ts — NEW (#109), kinds per ASSUMPTION-m4-001
export const MeasurementKindSchema = z.enum([
  'body_weight', 'body_fat_pct', 'neck_cm', 'waist_cm', 'chest_cm', 'hip_cm',
]);
export const MeasurementUpsertSchema = z.object({
  measuredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),   // local_date grammar, shared with sessions
  kind: MeasurementKindSchema,
  value: WeightKgSchema,                                  // reused: 0–1000, multipleOf 0.01
});
// POST /api/measurements  (upsert on (user_id, measuredOn, kind))
// GET  /api/measurements?from=&to=

// lib/contracts/export.ts — NEW (#110)
export const ExportV1Schema = z.object({
  version: z.literal('v1'),
  exportedAt: z.string().datetime(),
  user: z.object({ id: z.string().uuid(), joinedAt: z.string().datetime() }),
  sessions: z.array(SessionExportSchema),                 // ≤ 200, ASSUMPTION-m4-003
  measurements: z.array(MeasurementExportSchema),
  truncated: z.boolean(),
  oldestExcluded: z.string().nullable(),
});
// GET /api/export/v1 — auth: self only (RLS-scoped read, no admin surface)

// lib/contracts/analytics.ts — NEW (#108)
export const WeeklyVolumeSchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  volumeKg: z.number().min(0),
  loadCoverage: z.number().min(0).max(1).nullable(),       // null = imported/unknown-load
  sessionCount: z.number().int().min(0),
});
export const StreakSchema = z.object({ currentDays: z.number().int().min(0), longestDays: z.number().int().min(0) });

// lib/contracts/sync.ts — AMENDED
// #77: additive optional message on rejections (code stays the machine truth):
//   message: z.string().max(200).optional()
// #82: GET /api/sessions gains ?from=/?to= (ASSUMPTION-m4-006), cursor untouched.
// #76: POST /api/sessions/[id]/archive  → in_progress|completed → archived; SessionStatusSchema
//      already includes 'archived' — this adds the only producer, not a new value.
```

### 4.2 Migration plan (Expand-only, and the #89 authorship model **[SHIPPED]**)

- **Authorship model (#89 → PR #114, ADR-0006)**: hand-authored migrations are canonical (`0000`–`0007` on disk today; `supabase/migrations/meta/` is deleted); the model is enforced by deletion, not convention — **`db:generate` and `db:migrate` no longer exist as scripts** (STATE §7 item 23, reaffirmed by PR #114), `drizzle.config.ts` declares no `out:`, and `tests/unit/migration-authority.test.ts` fails CI if generation tooling is ever re-introduced. The grill caught this spec's original "generate only from a regenerated snapshot" phrasing as *too lenient* vs what shipped. Every later schema card inherits the invariant. #89's second half is **[SHIPPED]** in the same PR: `0007_auth_user_cascade.sql` adds the `auth.users → profiles` FK `ON DELETE CASCADE` — the cascade question is settled fact, not open design.
- `0008_body_measurements` (#109, expand): new table, `user_id` FK following the shipped `0007` cascade posture; unique `(user_id, measured_on, kind)`; no touch to existing tables. *Slot number is provisional — #109's PR must list `supabase/migrations/` at authoring time, not trust this document.*
- #76's archive transition: **no migration** — status is text-constrained in the contract layer, not an enum column (verified against schema at M2).
- **No contract phase inside M4** other than the already-shipped `state` field drop (response-shape only, PR #116). Rollback for every expansion = drop the new object; nothing reads it before wave 3.
- Legacy data import path: `userStats` → `body_measurements` one-time importer run (inside #109's PR, tested against a real exported localStorage blob), *then* #103 may delete. This ordering is the plan's single data-loss guardrail.

### 4.3 Request-id and telemetry plumbing (#94 → #95)

One `requestId` (`crypto.randomUUID`) is minted at the outermost edge (Next middleware or top of each route handler — #94's card picks the seam; constraint: **it must also exist on the 503-shed path shipped in PR #131** so shed load is diagnosable), logged by `lib/logger` on every structured line, attached to Sentry events via a scope tag, and echoed in no client response header unless CSP work (§3.4) settles first — telemetry never waits on the CSP decision, but the CSP decision must confirm it doesn't conflict with the `sentry.io` DSN transport.

---

## 5. Security, Privacy & Failure Modes (FMEA)

### 5.1 Security & multi-tenancy audit (M4 delta)

- **Tenancy**: new endpoints (measurements, export) are self-scoped via the same `requireUserContext()` + RLS posture as M3; export is the first endpoint that can read a user's *entire* dataset — its AC must include a cross-user probe (404/403, never a 200 with someone else's rows).
- **Secrets & PII**: Sentry DSN is public-by-design (client bundle) but **write-token hygiene**: only the public DSN may appear in env passthrough; `SENTRY_AUTH_TOKEN` stays build-CI-only (sourcemaps upload), never in `NEXT_PUBLIC_*`. Log lines: no magic-link tokens, no email addresses unredacted (GoTrue URLs carry tokens — redact query strings at the logger seam).
- **Input validation**: every new surface gets a Zod schema above; `measuredOn`/`from`/`to` reuse the local-date regex exactly once (shared helper in `lib/contracts/common.ts`), not re-typed per schema.
- **SW as network-visible file**: `/sw.js` scope must be root-served with correct MIME; no caching of authenticated JSON ever (m4-004 is a *security* constraint too, not just UX).

### 5.2 FMEA Resilience Matrix

| Failure Scenario | P / S | Detection | Mitigation / Fallback | Recovery |
| :--- | :--- | :--- | :--- | :--- |
| #103 ships before #109 → legacy `userStats` stranded (git can't restore *user* localStorage) | Low / **Critical** | Wave gate: #103 PR must link a merged #109 | Ordering is the control; flip parity scan asserts replacement exists, not just absence of old files | Impossible after the fact → the gate must never be waived |
| Load harness measures *throttling* as speed (limiter 120/min = 2 rps per user vs 50 rps offered) | Med / High | **[SHIPPED #90]:** the harness *cannot* disable the limiter — instead it accounts for it: per-user offered rate held near the budget via user fan-out, 429/5xx/fetch-error reported as separate populations (never folded into latency), and a run claiming zero 429s above 2 rps/user is **actively flagged as not-evidence** (`scripts/perf-sync-load.ts` limiter check) | #91/#112 must quote only *accepted-response* percentiles and state the offered per-user rate beside them | Any suspect run is relabeled, not deleted — `INCONCLUSIVE` is a legal, recorded verdict (it was used) |
| Contention flakes return under added load suites | Med / Med | #100 fence (per-run fixture ids from #80) | Root-cause or owner-signed quarantine comment — no blind retries (STATE 21) | Flake budget tracked in exit report |
| Sentry ingest down / DSN misconfigured → silent telemetry loss | Med / Low | #95 "observed to fire" test fails loudly at install time; post-launch: heartbeat error in weekly log review | Logs (#94) are the sink-independent spine — Sentry loss degrades, never blinds | Fix config; replay via manual probe |
| SW serves stale shell after deploy | Med / Med | build-id mismatch in precache + activate cleanup | `skipWaiting:false`; never `/api` (m4-004) | Next deploy rotates manifest; worst case user closes tab twice |
| Export cap silently truncates a heavy user's archive | Low / Med | `truncated: true` + `oldestExcluded` in payload and UI | ASSUMPTION-m4-003 honest-degradation branch | M5 streaming revisit with real usage data |
| Magic-link emails never delivered (#16) → app is a locked door at launch | High / **Critical** | §8.2 exit gate blocks deploy | Owner provider decision (DECISION-m4-004) | Not an M4 code path; exit gate only |
| ADR-0007 poll margin erodes after #91's contention data lands | Med / Low | #112's margin table (4 s floor vs 5 s budget) recomputed from **#91's runs on the #90 harness** | ADR states the revisit trigger numerically | Open M5 card with evidence; *no* in-M4 RLS change |

---

## 6. Conditional Implementation Milestones

`TDD Enforcement Mode` is `disabled` for every M4 card (no `docs/tasks/m4/*` record sets it; the spec's proposal in §0 is reference-only). Milestones below are dependency-ordered per the board README's waves — this spec **inherits that order unchanged** and adds only the planning obligations (record links) each wave consumes.

- [ ] **Wave 0 — foundations. [SHIPPED except #98–#99]** #89 **[SHIPPED]** (PR #114, ADR-0006 + `0007_auth_user_cascade` — locked invariant) · #80 **[SHIPPED]** (PR #119) · #97 typed rows **[SHIPPED]** (PR #186, `0b70190`) · #100 **[SHIPPED]** (PR #120) → remaining: #98/#99 hygiene. *Spec input consumed: §4.2 authorship model.*
- [ ] **Wave 1 — observability spine.** #94 (DECISION-m4-002 **approved 2026-09-14** — #94 is unblocked; id plumbing per §4.3 incl. the PR #131 shed path) → **CSP card (ruled FILE 2026-09-14 — creation owed; merge before or with #95, `connect-src` Sentry-aware)** → #95 (**gate**: DECISION-m4-001 **approved 2026-09-14**; closes UNCERTAINTY-m4-001-001 by observation; error/crash-sink-only per DEFERRED-m4-005) → #101. Deviation, recorded: #90 shipped *before* the spine (PR #126) — its artifact is diagnosable by its own accounting rather than by request ids; acceptable because no later card re-runs #90, they read from it.
- [ ] **Wave 2 — performance verdicts, read from #90's artifact.** **[SHIPPED: #92 PR #133, #93 PR #135]** Remaining: #91 (the only un-adjudicated perf card) → #112 ADR-0007 (ratified direction; the ADR text quotes #91's output, not a fresh instrument).
- [ ] **Wave 3 — product truth.** #105 **[SHIPPED]**, #96 **[SHIPPED]**, then #102/#106/#107 (blocked until #95 evidence), #108 (ASSUMPTION-m4-002), **#109 (ASSUMPTION-m4-001 validated first — hard precedence over #103)**, #110 (ASSUMPTION-m4-003). Parked truth cards land here: #76 (new archive producer per §4.1), #77 (additive `message`), #78 (**amendment gate**: ASSUMPTION-m4-005 changes a master-RFC sentence — owner sign-off *before* code), #82 (m4-006), #84 (m4-007).
- [ ] **Wave 4 — decommission.** #103 → #104 → #111 (ASSUMPTION-m4-004). *Gate: no #103 merge without a linked merged #109 (FMEA row 1, non-waivable).*
- [ ] **Exit.** §8.2 gate table adjudicated line-by-line; M4 exit report + verification audit mirror the M3 ceremony; `pk:checkpoint` updates STATE (not this document).

**Documentation/configuration/research work** (#99, #112's ADR, ADR-0008 if the Owner wants a Sentry ADR): exception verification path — acceptance = merged doc with the artifact links §8.2 demands; no RED/GREEN evidence required.

### Sign-off Readiness

This branch selection, the §0 task-record links, and each wave's consumed records are now in place. Nothing above authorizes implementation on its own — the owner decisions in §7 do.

---

## 7. Sign-off & Grilling Checklist

- [x] Architecture challenged via `pk:grill` (2026-09-14) — outcomes and amendments in §9. Targets: **(1)** CSP gap — resolved: decision-gate moved to *before #95 merges* (§3.4, §9.3); **(2)** #109→#103 gate strength — amended §9.3 (link is necessary, not sufficient); **(3)** limiter-disable in #90 — **voided** (shipped design needs no flag; §9.2); **(4)** `-0` peer range — upheld, stays with #95's DoD; **(5)** #78 amendment mechanism — resolved: ADR supersedes RFC prose, spec cannot (assumption m4-005 stays `open` for that ADR).
- [ ] Zero-downtime evolution verified: §4.2 is expand-only inside M4 (one new table; the one contract drop already shipped).
- [ ] Non-goals agreed (§0 Full Planning + §2.2).
- [ ] Ready for the **disabled Code Work** milestone path (per-card RED evidence comes from each card's "watched to fail, captured in PR" DoD, not from TDD enforcement).
- [x] **Owner sign-offs — COMPLETE 2026-09-14** (the retroactive debt this spec exists to collect): ASSUMPTION-m4-001…007 all accepted as written; DECISION-m4-001/002/003 approved (pin, logger, SW); DECISION-m4-004 + DEFERRED-m4-005 acknowledged; §3.4 gap ruling = **FILE** — CSP card to be created and merged before or with #95. Per-record outcomes live in each status line; the one *action* still owed is the card creation itself.

---

## 8. Retroactive Reconciliation Ledger

### 8.1 Ratified owner decisions — locked inputs, not re-openable here

| Card | Ratified decision | Shipped as |
| :--- | :--- | :--- |
| #93 | Accept process-local limiter + written ADR | PR #135; acceptance doc in `PROMPTKIT.md` §2 |
| #96 | Surface outbox depth **and age** | PR #137 |
| #105 | Drop `SyncResponseData.state`; honest e2e mock | PR #116 |
| #112 | Keep 4 s poll; decide by ADR-0007 | **Decided** — `docs/adrs/0007-realtime-declined-poll-floor-accepted.md` (2026-09-16) |
| #109 | Build body measurements **properly** (no apology field) | This spec's §4.1 + m4-001 are its shape |
| #103 | Follow #109, then delete legacy + flip parity scan | §6 wave-4 gate |
| #107 | No timer-persistence work until #94/#95 telemetry evidence exists | §6 wave 3 block |

### 8.2 M4 exit-gate table (the §0 observable-completion-condition, itemized)

| Gate | Passes when | Evidence required |
| :--- | :--- | :--- |
| Load verdict | **#90/#92 [SHIPPED]** (PRs #126/#133 — artifact + re-documented RFC row exist); **#91** closes against the same harness | `docs/perf/` files, accepted-response percentiles, stated per-user offered rate |
| Telemetry alive | #95 events observed client+server | Sentry UI evidence in PR |
| Zero stranded bytes | #109 merged before #103; import exercised on real `userStats` blob | linked PRs; importer test fixture |
| Offline shell | #111 AC incl. cold-cache airplane reload + no-swap-mid-session | Playwright run in PR |
| Data never hostage | #110 v1 endpoint + truncated-branch UI | contract tests |
| Infra honesty | #97/#98/#101 gates green on merged tree (**#80/#100 [SHIPPED]**, PRs #119/#120) | CI links |
| ADR trail | ADR-0007 (+0008) numbered from 0006 — **slot-0007 race rule (§9.3)**: whichever of #112/#78 merges its ADR first takes the number | merged `docs/adrs/` |
| **SMTP (#16)** | **Owner-provider decision made OR explicit owner-signed deferral past M4** | STATE §7 comment — deploy blocker either way |
| Board honesty | every open item closed-with-artifact or deferred-with-comment | milestone #4 listing |

### 8.3 Shipped-work ledger (board + off-board; PR numbers verified against `git log --merges`)

| Card | PR | What actually landed |
| :--- | :--- | :--- |
| #105 | #116 | `SyncResponseData.state` dropped; honest e2e mock |
| #89 | #114 | Authorship model + ADR-0006 **+** `0007_auth_user_cascade.sql` (the "second half" — auth→profiles FK `ON DELETE CASCADE` — shipped here, not pending) |
| #80 | #119 | Per-run fixture row identities in API seeding |
| #100 | #120 | Contention fenced by measured-duration spec clocks (incl. GoTrue failure-text fix) — no retries added |
| #121 (off-board) | #129 | G-M3-2 paint gate: 100 taps, ≥60 samples, `aboveP95` degeneracy guard — #91's UI-side inputs must use this instrument |
| #90 | #126 | Load harness + design doc; verdict `INCONCLUSIVE` at 50 rps (best offered 43.6) on 4-core hardware |
| #125 (off-board) | #131 | Shed the `getUser()` hop under pressure → 503 `SERVICE_UNAVAILABLE` + `Retry-After`. Merged *after* #90 — so **#91's runs are the first measurement of the combined shed+contention picture**; §4.3's request-id-on-shed-path requirement applies to them |
| #92 | #133 | RFC §3 row re-documented: 200 ms @ 50 rps = "*documented, not enforced*"; measured sequential p95 ~203–413 ms (runs: 272.8 / 364.5–413.9 / 222.0); enforced ceiling p95 < 800 ms holds; cost attributed to auth path (2 × `getUser()` + per-user tx, ADR-0003). The 200 ms promise is now **adjudicated** — no longer un-adjudicated |
| #93 | #135 | Process-local limiter acceptance doc in `PROMPTKIT.md` §2 |
| #96 | #137 | Outbox depth **and age** surfaced |

## 9. Grilling Outcomes & Amendments (2026-09-14, `pk:grill`)

Method note: this grill attacked the spec **against primary sources** (milestone API, `git log --merges`, `supabase/migrations/`, `scripts/perf-sync-load.ts`, `lib/auth/rate-limit.ts`, RFC §5 grep, `src/` grep) rather than against memory — which is how a retroactive document must be challenged, since its author's model of the board is itself a secondary source.

### 9.1 Severe — the draft contradicted the board it was reconciling *(three findings, all amended)*

1. **Wrong tense on four closed cards.** The draft's §1/§2.1/§3.2/§5.2/§6 treated #90, #92, #80, #100 as future work ("harness proposed", "verdict pending", "both limiter modes"). `gh api milestones/4` says otherwise: closed at 22 open / 9 closed, with PRs #126/#133/#119/#120. Amended in place; §8.3 is now a PR-verified ledger. **Standing lesson for retroactive specs: query the board before drafting goals, not after.**
2. **Migration-slot collision the spec itself would have caused.** §4.2 originally assigned `0007` to `body_measurements` — `0007_auth_user_cascade.sql` has existed since PR #114. The amended text pins the *rule* (list the directory at authoring time; this document's number is provisional) above the *number*, because ADR-0006 exists precisely to stop stale snapshots from dictating schema.
3. **PR misattribution.** #89 was credited to PR #133, which is #92's merge. Every number in §8.3 was re-derived from `git log --merges` output, not from the card text.
4. *(Found post-grill during `pk:checkpoint`, same audit method — §4.2 amended.)* The authorship invariant is enforced by **deletion**, not by a "regenerate-then-review" workflow: `db:generate`/`db:migrate` scripts no longer exist, `supabase/migrations/meta/` is removed, and `tests/unit/migration-authority.test.ts` fails CI on re-introduction. The spec's original leniency would have invited exactly the tooling the guard test forbids.

### 9.2 Moderate — fabricated mechanisms and stale framing *(amended)*

- **The limiter-disable env flag did not exist and was not needed.** FMEA row 2 prescribed a mechanism the shipped harness deliberately rejected: `scripts/perf-sync-load.ts` instead accounts for the budget (429s kept out of latency samples, per-user offered rate printed, implausible zero-429 runs *self-flagged as not-evidence*). The grill conceded the shipped design is stronger than the spec's proposal; grill target (3) is **voided**.
- **#90 shipped before the #94 spine** — a board-README dependency violation in reality. Not re-litigated (its `INCONCLUSIVE` verdict is exactly the artifact honesty the spine was meant to protect); recorded in §6 as an accepted deviation, with the derived rule: *nobody re-runs #90; #91 and #112 read from it.*
- **§1's epistemic framing half-collapsed mid-draft** ("artifact that doesn't exist yet" — it existed). Rewritten: the remaining epistemic risk is narrower — #91 reading the harness correctly, and telemetry landing first so its rerun is diagnosable.

### 9.3 Open-target resolutions

- **(1) CSP.** The RFC §5 premise ("current pages set inert `meta http-equiv` headers") is *legacy-only* — `grep http-equiv src/` is empty; the Next app ships **zero** clickjacking protection and never had. File-vs-accept remains the Owner's call, but #95 makes it time-boxed: **the CSP decision must be recorded before #95 merges** (§3.4), because a later CSP must already carry `connect-src` for Sentry ingest, and retrofitting one under deadline is how `'unsafe-inline'` sneakily returns. **RESOLVED 2026-09-14 — Owner ruled FILE: a CSP card enters the M4 board (creation still owed, §9.3(1)→§7 note), merging before or with #95, with `connect-src` Sentry-aware from its first line.**
- **(2) #109→#103 gate.** A PR link is necessary but not sufficient — links rot in review. Amendment: the flip of the parity scan must *itself* be the enforcement, i.e. #103 lands as inversion-first (scan asserts replacement exists → goes red until #109's measurements/analytics are merged), so CI, not a reviewer's memory, holds the non-waivable gate.
- **(4) Sentry `-0` peer range.** Upheld as `proceed-with-accepted-assumption`: #95's observed-to-fire DoD *is* the empirical test of Next 16 runtime compatibility; no `pk:spike` spend. One addition from the grill's CSP pass: #95's PR body must note the §9.3(1) ordering so the two decisions can't be made blind to each other.
- **(5) #78 mechanism.** A technical spec amending a parent spec's contract prose was rejected — ADR supersedes. **Slot race rule** (also in §8.2): both #112 and #78 want ADR-0007; first merge takes the number, second takes 0008; neither may renumber the other.
- **(6) Tracing boundary (post-grill addition, 2026-09-14).** #95 must **not** enable browser tracing under cover of "Sentry is configured": the sink is errors-only per M4-06's scope, and the tracing question now has a durable deferral with a re-entry trigger — [DEFERRED-m4-005](#DEFERRED-m4-005). A #95 PR that sets `tracesSampleRate` above 0 is a scope violation, not an implementation detail.

### 9.4 What survived the grill unchanged

§4.1 contracts (all field-level claims re-verified against `lib/contracts/*` and the status-column question already resolved at M2), DECISION-m4-002/003/004, ASSUMPTION-m4-002/003/004/006/007, §0 non-goals, §5.1 security delta, §8.1's seven locked items.

### 9.5 Ready

The document is now internally consistent with the board at 22 open / 9 closed. Remaining authority is exactly the §7 Owner sign-off list — nothing in this spec authorizes the next merge without it. **(Amended same day: the §7 pass is COMPLETE — 13/13 ruled; the only owed action it produced is creating the CSP card (ruling FILE), which must merge before or with #95. #94 is authorized to start: its sole consumed record, DECISION-m4-002, is approved.)**

*End of spec — status `grilled + signed-off (retroactive)`. §7 sign-off pass completed 2026-09-14; the only owed action it produced is creation of the CSP card (ruling: FILE). First implementable card: #94.*
