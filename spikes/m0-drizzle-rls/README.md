# M0 spike sandbox — Drizzle + Postgres RLS

Throwaway harness backing `docs/spikes/2026-09-08-drizzle-rls-enforcement.md`.
It is not the application. It exists to answer one question before M1 commits a
schema: **does Postgres RLS actually enforce tenant isolation when queries go
through Drizzle?**

Nothing here is meant to be imported by the target app. The parts worth carrying
forward are called out in the write-up under "What M1 must adopt".

## Run it

Requires Docker and Node ≥ 20.9. From this directory:

```bash
npm install
npm run db:up      # supabase local stack, minus the services this spike ignores
npm run db:setup   # apply sql/001-setup.sql, seed two real GoTrue users
npm test           # 32 assertions
npm run mutate     # break each control, confirm the suite goes red, restore
npm run db:down    # stop containers
```

`npm run inspect` dumps the baseline facts about the stock image (role
attributes, `auth.uid()` body) that the spike's conclusions rest on.

## Layout

| Path | Purpose |
| :--- | :--- |
| `sql/001-setup.sql` | Role, two tables, RLS, eight policies, `handle_new_user`. Idempotent. Comments record the measured surprises. |
| `src/db.ts` | The three DSNs, and `withUser` / `withUserHardened` / `withUserLeaky`. |
| `src/setup-db.ts` | Seeds two users through the GoTrue Admin API and uses their real JWT payloads as claims. |
| `tests/01-non-vacuity` | Proves the harness can fail: role has no bypass, owns nothing, and is really the role under test. |
| `tests/02-isolation` | The core question. Cross-user read, write, update, delete, insert. |
| `tests/03-drift` | `pg_tables` drift detector, proven against a deliberately unprotected table. |
| `tests/04-claims-leak` | `set_config` `is_local`, with the wrong version run first as a negative control. |
| `tests/05-pooler` | Same assertions through supavisor in transaction pooling mode. |
| `scripts/mutation-check.ts` | Removes each control and requires the suite to notice. |

## Caveats

- Credentials in `src/db.ts` and `sql/001-setup.sql` are local Supabase dev
  defaults and a throwaway role password. They are public by design and must not
  be reused anywhere real.
- `sql/001-setup.sql` creates `public.unprotected_future_table` **on purpose**,
  with no RLS. It is the fixture the drift detector fires on. Do not copy it.
