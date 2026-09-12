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
