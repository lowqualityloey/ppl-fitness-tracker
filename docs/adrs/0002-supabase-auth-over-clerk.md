# Architectural Decision Record (ADR): Supabase Auth over Clerk

- **Status**: Accepted
- **Deciders**: Repository owner, Kiro
- **Date**: 2026-09-08
- **Technical Story**: `docs/specs/2026-09-08-spec-fullstack-migration.md` §7 decision 2

---

## Context and Problem Statement

The rebuild was requested with both Supabase and Clerk in the stack, plus magic-link sign-in. Both products provide authentication, so the two overlap: the only coherent split is Clerk owning identity while Supabase is reduced to Postgres plus Realtime.

That split is workable and widely used — Supabase ships a [first-party third-party-auth integration for Clerk](https://supabase.com/docs/guides/auth/third-party/clerk) — but it is not free. It requires adding a `role: "authenticated"` claim to Clerk session tokens before any RLS policy can read them, a mirror `users` table in Postgres because foreign keys cannot reference an external system, a webhook to keep that table in sync with Clerk, and a resolver function inside every RLS policy to translate Clerk's external subject claim into an internal UUID.

Supabase Auth issues magic links natively and its `auth.uid()` is directly usable in RLS with no claim plumbing.

---

## Decision Drivers

- Magic-link email sign-in is the required and only authentication method
- Row-level security must be expressible without a translation layer, per ADR-0003
- Tenancy unit in v1 is a single user; no organisations, teams, or coach relationships (spec §2 non-goals)
- Minimise the number of systems that can be independently down or out of sync
- Minimise operational surface for a solo maintainer

---

## Considered Options

1. **Clerk for identity + Supabase for data** — as originally requested
2. **Supabase Auth for both**
3. **Clerk for identity + Supabase Postgres accessed only via PostgREST** — sidesteps the RLS resolver problem by never using a direct connection

---

## Decision Outcome

**Chosen Option: Option 2 (Supabase Auth).**

The features Clerk would justify itself with — prebuilt component library, organisations, MFA, user management UI — either duplicate what a magic-link-only flow needs (a single email field) or serve non-goals explicitly excluded from v1. Meanwhile the integration surface it adds is entirely load-bearing: if the webhook fails, writes fail on a foreign key.

Because `profiles.id` can simply *be* `auth.users.id` under Supabase Auth, an entire category of design disappears rather than getting solved:

| Clerk design required | Supabase Auth |
| :--- | :--- |
| `users` mirror table with `clerk_user_id` unique key | `profiles.id` **is** `auth.users.id` |
| Svix-verified webhook for `user.created` / `user.deleted` | `AFTER INSERT` trigger, same transaction as signup |
| JIT upsert in `requireUser()` guarding against missed webhooks | Not applicable |
| Nightly reconciliation job against the Clerk API | Not applicable |
| `app.current_user_id()` resolver, marked `STABLE`, in every policy | `(SELECT auth.uid())` |
| `role: "authenticated"` custom claim configuration | Default |

The `STABLE` resolver function deserves specific mention. It was needed so Postgres would evaluate the claim-to-UUID lookup once per statement rather than once per row — a 17-row set query would otherwise do 17 lookups. Getting its volatility marker wrong is a subtle correctness bug (marking it `IMMUTABLE` would permit the planner to cache a value across statements). That whole hazard is now deleted, not mitigated.

Option 3 was rejected because abandoning the direct connection means abandoning Drizzle's type inference and migration tooling, which is a larger loss than the problem it solves.

### Positive Consequences

- One vendor, one dashboard, one bill, one status page
- Identity and data in the same Postgres instance, so signup and profile creation are one transaction — there is no network hop between them that can partially fail
- RLS policies read `user_id = (SELECT auth.uid())` with no indirection, making them short enough to review by eye
- Deletion cascades correctly and automatically from `auth.users` through the `profiles.id` foreign key
- Three FMEA rows from the Clerk design (missed webhook, mirror drift, claim misconfiguration) are eliminated rather than mitigated

### Negative Consequences & Trade-Offs

- **Supabase's default SMTP allows [2 messages per hour](https://supabase.com/docs/guides/auth/auth-smtp)** and sends from a shared generic address. On a magic-link-only app that is the entire front door, so this is a hard launch blocker.
  - *Mitigation*: custom SMTP (Resend / Postmark / SES) with a verified domain, SPF and DKIM, configured in M1 — not deferred to M4. Plus an hourly synthetic monitor completing a real sign-in round trip.
- **Identity is now coupled to the data vendor.** Every domain foreign key transitively depends on Supabase Auth owning `auth.users`. Migrating providers later means an Expand-Contract across the FK graph.
  - *Mitigation*: accepted rather than hedged. A single-user fitness tracker has no realistic provider-migration pressure, and the alternative — a mapping table plus a resolver function in every policy — is a permanent tax paid against a hypothetical. Documented in spec §4.6 as an accepted coupling so the cost is visible if it ever comes due.
- No prebuilt sign-in component; the magic-link form is hand-built.
  - *Mitigation*: it is one email input, one button, and one `/auth/confirm` handler. shadcn/ui supplies the form primitives.
- Losing Clerk closes the door on organisations/teams without a migration.
  - *Mitigation*: explicitly a non-goal in spec §2. If a coach or shared-programme feature is ever wanted, revisit this ADR rather than pre-building for it.

---

## Pros and Cons of the Options

### Option 1: Clerk + Supabase
- **Good**, because Clerk's prebuilt components and organisation primitives are genuinely strong
- **Good**, because identity is portable across data vendors
- **Bad**, because it needs a mirror table, a webhook, a JIT upsert, a reconciliation job, and a resolver function in every RLS policy
- **Bad**, because a webhook failure surfaces as a foreign key violation on a user's first write — a bad first-run experience with a non-obvious cause
- **Bad**, because it adds a second vendor for capabilities that v1 has ruled out of scope

### Option 2: Supabase Auth
- **Good**, because `auth.uid()` is directly comparable in RLS with no translation
- **Good**, because signup and profile creation share a transaction
- **Good**, because it removes three FMEA rows outright
- **Bad**, because the default email sender is unusable in production without custom SMTP
- **Bad**, because it couples identity to the data vendor

### Option 3: Clerk + PostgREST only
- **Good**, because RLS applies natively via the `authenticated` role with no direct-connection caveat
- **Bad**, because it forfeits Drizzle's type inference and migration story, which is the reason Drizzle is in the stack

---

## Implementation & Migration Notes

- M1: `@supabase/ssr` server and browser clients; middleware refreshing the session cookie
- M1: `handle_new_user()` trigger — `AFTER INSERT ON auth.users` → `INSERT INTO public.profiles`
- M1: `profiles.id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE`, written as raw SQL since Drizzle does not model the `auth` schema
- M1: custom SMTP configured and domain verified **before** the first real sign-in
- M1: `/auth/confirm` validates its `next` param against a relative-path allowlist — magic-link callbacks are a standard open-redirect sink
- No user data exists yet, so there is no identity migration to perform

---

## Links & References

- [Supabase custom SMTP and the 2 messages/hour default limit](https://supabase.com/docs/guides/auth/auth-smtp)
- [Supabase Auth rate limits](https://supabase.com/docs/guides/auth/rate-limits)
- [Supabase third-party auth with Clerk](https://supabase.com/docs/guides/auth/third-party/clerk) — the rejected integration path
- ADR-0003 (`0003-rls-defense-in-depth.md`) — the authorization model this decision simplifies
- Spec: `docs/specs/2026-09-08-spec-fullstack-migration.md` §4.2
