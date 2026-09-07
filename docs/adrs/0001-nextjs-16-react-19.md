# Architectural Decision Record (ADR): Framework Version — Next.js 16 + React 19 + TypeScript

- **Status**: Accepted
- **Deciders**: Repository owner, Kiro
- **Date**: 2026-09-08
- **Technical Story**: `docs/specs/2026-09-08-spec-fullstack-migration.md` §7 decision 1

---

## Context and Problem Statement

The full-stack rebuild was requested as "Next.js 14 + React 19 + TS". That combination does not exist. React 19 reached stable support in Next.js 15 — the [Next.js 15 upgrade guide](https://nextjs.org/docs/app/guides/upgrading/version-15) is where "Next.js 15 and React 19 are stable" first applies — and Next.js 14 predates it. Next.js 14 is additionally past end-of-life and no longer receives security releases.

A version had to be chosen before the project could be scaffolded, since it determines the App Router API surface, whether request APIs are async, and which shadcn/ui CLI channel applies.

---

## Decision Drivers

- React 19 is a hard requirement from the original request (Server Actions, `useOptimistic` for the optimistic set-tap UX in spec §4.4)
- Must be receiving security patches — this app will hold personal health-adjacent data
- shadcn/ui compatibility, since it is the specified component layer
- Minimise gratuitous novelty; the owner is migrating from vanilla JS and does not need bleeding-edge churn on top of that

---

## Considered Options

1. **Next.js 14 + React 18** — honour the requested Next version, drop React 19
2. **Next.js 15 + React 19** — minimum version that satisfies the React 19 requirement
3. **Next.js 16 + React 19** — current stable line

---

## Decision Outcome

**Chosen Option: Option 3 (Next.js 16 + React 19 + TypeScript strict).**

Option 1 was rejected outright: Next.js 14 is EOL, so it fails the security-patch driver regardless of the React question. Between 15 and 16, [Next.js 16 has been stable since October 2025](https://nextjs.org/blog/next-16) with several minor releases since, so it is no longer new. Starting a greenfield app on 15 means an upgrade is already owed on day one.

TypeScript in `strict` mode is non-negotiable per the `PROMPTKIT.md` guardrail on zero `any` and zero loose casting.

### Positive Consequences

- On a supported release line with no upgrade debt at project start
- Async request APIs and the current caching semantics learned once, correctly, rather than learned in 15 and relearned in 16
- shadcn/ui has [full React 19 and Tailwind v4 support](https://ui.shadcn.com/docs/react-19), so the component layer needs no canary channel or peer-dependency overrides
- Server Actions and `useOptimistic` available for the sub-50ms set-tap requirement

### Negative Consequences & Trade-Offs

- Next.js 16 carries breaking changes relative to 15 (async `params`/`searchParams`, Turbopack-by-default behaviour) which is a steeper first climb for someone arriving from vanilla JS.
  - *Mitigation*: M1 scaffolds from the official `create-next-app` template rather than hand-assembling config, so the defaults are correct without needing to understand every migration note first.
- Smaller volume of community tutorials targeting 16 than 15.
  - *Mitigation*: official docs are current for 16; the spec pins exact APIs used so there is no guesswork.

---

## Pros and Cons of the Options

### Option 1: Next.js 14 + React 18
- **Good**, because it matches the letter of the original request
- **Bad**, because Next.js 14 is EOL and receives no security releases
- **Bad**, because it drops React 19, which the same request also asked for — the two halves of the request are mutually exclusive

### Option 2: Next.js 15 + React 19
- **Good**, because it is the minimum viable version and the smallest breaking-change surface
- **Good**, because it has the largest body of current tutorial material
- **Bad**, because it starts a greenfield project one major version behind

### Option 3: Next.js 16 + React 19
- **Good**, because it is current, supported, and mature (multiple minors shipped)
- **Good**, because no upgrade is owed at project start
- **Bad**, because breaking changes vs 15 add initial learning load

---

## Implementation & Migration Notes

- M1 scaffolds via `create-next-app` with the App Router and TypeScript
- `tsconfig.json` — `strict: true`, and `noUncheckedIndexedAccess` on, given how much index-based array access the legacy set/exercise code relied on
- The existing Vite config, `package.json`, and the four static modules stay untouched until M4, so the old app remains servable throughout the migration

---

## Links & References

- [Next.js 15 upgrade guide — React 19 stable](https://nextjs.org/docs/app/guides/upgrading/version-15)
- [Next.js 16 release announcement](https://nextjs.org/blog/next-16)
- [shadcn/ui React 19 support](https://ui.shadcn.com/docs/react-19)
- Spec: `docs/specs/2026-09-08-spec-fullstack-migration.md`
