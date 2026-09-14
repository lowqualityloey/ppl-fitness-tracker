import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SyncResponseSchema } from '../../../lib/contracts/sync.js';
import { refusedSyncResponseBody, syncResponseBody } from '../../e2e/sync-fixtures.js';

/**
 * #105's mock-cannot-lie control.
 *
 * `tests/e2e/sync-fixtures.ts` exists because a browser spec once fulfilled `POST /api/sync` with
 * hand-written JSON that the contract had never accepted — a `state: { session: {…} }` key, where
 * the field that did exist was a whole session graph rather than an object wrapping one. The spec
 * passed while driving a UI through bytes the server cannot produce.
 *
 * The fix is a builder that parses every fixture through the contract. A builder is only a gate if
 * something proves it gates, so the assertions below inject the two failures it exists to prevent
 * and require a throw. Without this file the builder is a function that *claims* to validate and
 * is exercised only by the one call site that already happens to be correct — which is precisely
 * the arrangement that let the original fabrication through.
 */
describe('the e2e sync-response fixture is the contract, not a description of it', () => {
  it('builds bytes the response contract accepts, in the shape the route ships them', () => {
    const body = syncResponseBody({
      serverSeq: 4,
      applied: ['11111111-1111-4111-8111-111111111111'],
      rejected: [],
      clockSkewMs: 0,
    });

    expect(SyncResponseSchema.safeParse(JSON.parse(body)).success).toBe(true);
  });

  it('refuses the fabrication this builder replaced', () => {
    // `as never` is the point of the assertion, not an escape hatch: the compiler has to be
    // bypassed to write a field the contract no longer has, and the runtime check below is what
    // catches the version of the lie that *is* type-compatible (a renamed or restructured key).
    expect(() => syncResponseBody({
      serverSeq: 1,
      applied: [],
      rejected: [],
      clockSkewMs: 0,
      state: { session: { id: '22222222-2222-4222-8222-222222222222' } },
    } as never)).toThrow();
  });

  it('refuses a wrong-typed value, so strictness is not the only thing holding', () => {
    expect(() => syncResponseBody({
      serverSeq: '1',
      applied: [],
      rejected: [],
      clockSkewMs: 0,
    } as never)).toThrow();
  });

  it('refuses an invented reason carrier instead of letting a mock rename a field', () => {
    expect(() => syncResponseBody({
      serverSeq: 1,
      applied: [],
      rejected: [{ mutationId: '33333333-3333-4333-8333-333333333333', message: 'nope' }],
      clockSkewMs: 0,
    } as never)).toThrow();
  });

  it('names the refusal with a code the server really emits, in the envelope the route uses', () => {
    const mutationId = '44444444-4444-4444-8444-444444444444';
    const parsed = SyncResponseSchema.parse(JSON.parse(refusedSyncResponseBody(mutationId)));
    if (!parsed.ok) throw new Error('The refusal fixture is not a success envelope.');
    expect(parsed.data).toEqual({
      serverSeq: 1,
      applied: [],
      rejected: [{ mutationId, reason: 'CONFLICT' }],
      clockSkewMs: 0,
    });
  });
});

/*
 * The builder only gates the bodies that go through it, so this scans for the ones that do not.
 *
 * `clockSkewMs` is a required field of `SyncResponseData` and appears in no *request*, so its
 * presence in a spec's code means one thing: somebody is hand-authoring a sync response body
 * beside the contract instead of through it — the exact arrangement that let
 * `session-runner.spec.ts:174` ship a `state` field for months while the suite stayed green.
 *
 * Honest about its reach: this is a smell test with a named trigger, not a proof. A spec that
 * intercepted `POST /api/sync` and fulfilled it with a body missing `clockSkewMs` would fail the
 * *client's* read instead (and the specs would go red for that reason, not this one), and prose
 * about the field is stripped before scanning because writing about a mock is not writing a mock.
 * The proof half lives in the assertions above.
 */
describe('no e2e spec authors a sync response body beside the builder', () => {
  const E2E_DIR = new URL('../../e2e', import.meta.url).pathname;

  it('finds the specs it claims to have scanned', () => {
    // Counted, so the loop below cannot pass by having nothing to check.
    // 13 → 14: tests/e2e/csp.spec.ts (M4-24, #142) joined the battery.
    expect(readdirSync(E2E_DIR).filter((name) => name.endsWith('.spec.ts'))).toHaveLength(14);
  });

  it('never finds a hand-written sync body', () => {
    for (const name of readdirSync(E2E_DIR).filter((file) => file.endsWith('.spec.ts'))) {
      const code = readFileSync(join(E2E_DIR, name), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .split('\n')
        .filter((line) => !line.trim().startsWith('//'))
        .join('\n');
      expect(
        code,
        `${name} hand-writes a sync response body; build it through tests/e2e/sync-fixtures.ts ` +
        'so it is parsed by the contract it stands in for',
      ).not.toMatch(/\bclockSkewMs\b/);
    }
  });
});
