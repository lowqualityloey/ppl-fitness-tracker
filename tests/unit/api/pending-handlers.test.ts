import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PENDING_ROUTES, type PendingRouteKey } from '../../integration/api/pending-handlers.js';

/**
 * Anti-rot gate for the declared-pending registry.
 *
 * A skip that outlives the work it was waiting for is worse than a red test: it looks
 * like coverage and produces nothing. This suite fails the moment a pending entry's
 * route surface appears, forcing the implementer to delete the entry and let the real
 * spec run.
 *
 * Runs offline — no database, no server. This is the only reason the registry is
 * allowed to be a plain map rather than a self-verifying abstraction.
 */
describe('declared-pending API route registry', () => {
  const keys = Object.keys(PENDING_ROUTES) as PendingRouteKey[];

  it('has at least one entry, or this file should be deleted with the registry', () => {
    expect(keys.length).toBeGreaterThan(0);
  });

  it.each(keys)('%s still has no route surface on disk', (key) => {
    const entry = PENDING_ROUTES[key];
    expect(
      existsSync(entry.handlerPath),
      `${key} is marked pending for ${entry.issue}, but ${entry.handlerPath} now exists. ` +
        'Delete this entry from tests/integration/api/pending-handlers.ts so its specs run.',
    ).toBe(false);
  });

  it.each(keys)('%s names an issue and a reason', (key) => {
    const entry = PENDING_ROUTES[key];
    expect(entry.issue).toMatch(/^#\d+$/);
    expect(entry.reason.length).toBeGreaterThan(15);
    expect(entry.handlerPath.startsWith('src/app/')).toBe(true);
  });

  it('does not mark the shipped M2 routes pending', () => {
    // These handlers exist and their suites are the reason CI runs the API layer at
    // all. If one ever appears in the registry, the gate has been switched off.
    const shipped = ['src/app/api/sessions', 'src/app/api/sync'];
    for (const route of shipped) {
      expect(existsSync(route), `${route} must stay covered, never pending`).toBe(true);
      expect(keys.filter((k) => PENDING_ROUTES[k].handlerPath === route)).toHaveLength(0);
    }
  });
});
