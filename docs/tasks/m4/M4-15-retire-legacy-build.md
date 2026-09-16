> **M4-15** · Decommission · `#priority/p2` · Derived from: handoff §3.3 ("`npm run build` (legacy Vite) emits zero JavaScript and `dist/` is inert — its removal retires the footgun documented in PROMPTKIT §2"); `PROMPTKIT.md` §2 "Known broken"; `docs/STATE.md` §5 ("Not being fixed — the legacy app is decommissioned in M4").

## Intent
As anyone typing `npm run build`, I want that command to **mean the real build** — an exit-0 command that produces a dead `dist/` is a decoy gate, the exact failure mode this repo's earned rules are about.

## Scope
- After M4-14 removes the legacy pages: rewire or remove `dev`/`build`/`preview`. Preferred: `npm run build` → `next build`, `npm run dev` → the Next dev server (decide the port question — 3000 becomes free; changing the port is a spec-surface decision recorded here, including `playwright.config.ts`, `tests/e2e/*` base URLs, GoTrue redirect config, and CI).
- Delete `dist/`, `vite.config` remnants, and now-unused devDependencies if the sweep is clean (npm, per PROMPTKIT §3).
- Update `PROMPTKIT.md` §3's Legacy-commands section and §2's known-broken note; any CI workflow step that referenced the legacy build.

## Out of scope
Legacy module deletion itself (M4-14 — this card is sequenced behind it).

## Acceptance criteria
```gherkin
Scenario: build builds
  Given the rewired scripts
  When npm run build runs from a clean checkout
  Then real .next output appears and `npm run start` serves the app — and the command table in PROMPTKIT §3 matches exactly

Scenario: The zero-JS footgun is dead, not sleeping
  When git ls-files and node_modules are examined
  Then no `vite build` remains on any script path (test tooling that legitimately uses vite — Vitest — is unaffected and says so)

Scenario: Port decision is recorded
  Given any port change
  When the card closes
  Then e2e configs, README/dev docs, and the local GoTrue magic-link template all point at the new truth, with the E2E battery green against it
```

## Automated Verification
```bash
npm ci && npm run build && (npm run start & sleep 5; curl -sf localhost:<port>/ -o /dev/null; kill %1)
npm run test:api:preflight && npm test && npm run test:api && npx playwright test
```

## Definition of done
"Legacy build" exists only in git history; a green `npm run build` finally means a green app build, provable by serving it.

## Dependencies
- Blocked by: M4-14.

## Record — implemented 2026-09-16 (branch `feat/m4-15-retire-legacy-build`; written pre-merge, CI is the arbiter)

**Shape decision — rewire, not drop.** STATE §7 item 36 summarized this card as "drop
`dev`/`build`/`preview`", but the card's own AC-1 is Given **the rewired scripts** … Then `npm run start`
serves the app — unsatisfiable if the names merely vanish. The card is the authority; item 36's
concern (nothing vite-reachable survives, and the deploy pin never points at a dead name) is met
a different way: the legacy scripts were **replaced** and the transitional `next:*` aliases — which
existed only to dodge the legacy names — were **retired**, so `dev`/`build`/`start` are the single
canonical set and `preview` is gone (vite-preview's job belongs to `start`). `vercel.json`'s
`buildCommand` flipped to `npm run build` **in the same commit** as the rename, per the pin #103
handed over; no commit in this branch's history has Vercel pointing at a name that doesn't resolve.

**Port decision (AC-3), recorded as the scope demands: stay on 3001.** No port change was made, so
`playwright.config.ts`, the CI env, `supabase/config.toml`, and `.env.example` keep their one truth;
3000 stays vacant rather than becoming a second. `supabase/config.toml`'s stale "legacy Vite app
remains on 3000" comment was corrected in passing.

**Build is the whole chain**: `build` = `next build && tsx scripts/build-sw-manifest.ts` — what
#111 chained into `next:build` (its design §"one line") moved up with the name, so the sw
BUILD_VERSION stamp is present wherever "the real build" runs, including the e2e webServer.

**AC evidence:**
- *AC-1, build builds*: from `npm ci` on this branch — `npm run build` printed the 19-route `ƒ`
  table and `[sw-manifest] version dd59166778a3: 21 precache URLs`; `npm run start` served :3001
  (`curl -sf` exit 0, `/` → 307 to sign-in as expected unauthenticated). The command table in
  PROMPTKIT §3 was rewritten to match this branch's `package.json`, verified by re-grep (zero live
  `next:*`/vite references outside dated history).
- *AC-2, footgun dead not sleeping*: new unit guard `tests/unit/infra/legacy-build-scripts.test.ts`
  (CI-executed, same package.json-scan shape as ADR-0006's drizzle-kit gate; `\bvite\b` keeps
  `vitest` legal by construction) — **watched RED first**: 3 failed / 1 passed on the pre-rewire
  scripts, 4/4 green after. `npm ls vite`: vite@7.3.6 exists **only** as vitest's own dependency,
  which is the "unaffected and says so" leg; `git ls-files dist vite.config.js` → 0; `dist/`
  deleted and removed from `.gitignore`.
- *AC-3, port recorded*: no change, so nothing to repoint; decision above, and the e2e battery ran
  green against the unchanged 3001 truth.

**Gates on this head (measured, this pass):** typecheck 0 · lint 0 (`--max-warnings=0`) ·
`npm test` **65 files / 623** · `test:api` **13 files / 81** · full e2e battery **81/81 in 4.2 m**,
booted through the renamed webServer command (`npm run build && npm run start`) — the battery is
itself AC-1 evidence. `public/sw.js` BUILD_VERSION re-stamps from local builds were discarded before
staging (harness discipline, #160/#161 convention).

**Post-merge addendum (this card's caveat discharged):** PR **#162** merged the branch into `main`
as `b7fb2e3` (squash, 2026-09-16T04:31:29Z; the plain `Closes #104` on the body's first line closed
the issue at 04:31:30Z, API-read). **CI arbiter: `test` PASS 15m49s + Vercel PASS** — the Vercel
green is the decisive one: it is the first deploy that built through the flipped `buildCommand`, so
the "never one-sided" claim is proven on Vercel's own runner, not merely asserted in this file.
All three ACs are green on `main`. Board after merge: milestone #4 open=13 / closed=20; G-M4-3's
"#104 after #103" discharged — the legacy decommission is complete.
