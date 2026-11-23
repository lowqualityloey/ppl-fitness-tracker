import { describe, expect, it } from 'vitest';
import {
  checkHostedRotation,
  isLoopbackHost,
} from '../../../scripts/check-hosted-rotation.js';

/** A fake fixture; the real value lives only in migration 0001. */
const FIXTURE = 'fixture-password-not-a-real-secret';

describe('hosted app-role rotation guard', () => {
  it('accepts a loopback DATABASE_URL carrying the fixture', () => {
    expect(
      checkHostedRotation(
        `postgresql://app_authenticated.pooler-dev:${FIXTURE}@127.0.0.1:54329/postgres`,
        FIXTURE,
      ),
    ).toEqual({ status: 'local' });
    expect(isLoopbackHost('localhost')).toBe(true);
    expect(isLoopbackHost('::1')).toBe(true);
    expect(isLoopbackHost('[::1]')).toBe(true);
  });

  it('rejects a hosted DATABASE_URL still carrying the fixture', () => {
    expect(
      checkHostedRotation(
        `postgresql://app_authenticated:${FIXTURE}@db.example.supabase.co:5432/postgres`,
        FIXTURE,
      ),
    ).toEqual({ status: 'fixture' });
    expect(isLoopbackHost('db.example.supabase.co')).toBe(false);
  });

  it('accepts a hosted DATABASE_URL with a rotated password', () => {
    expect(
      checkHostedRotation(
        'postgresql://app_authenticated:rotated-password@db.example.supabase.co:5432/postgres',
        FIXTURE,
      ),
    ).toEqual({ status: 'rotated' });
  });

  it('rejects missing credentials and malformed URLs without reading them', () => {
    expect(checkHostedRotation(undefined, FIXTURE)).toEqual({ status: 'missing-url' });
    expect(checkHostedRotation('postgresql://app_authenticated@db.example.supabase.co/db', FIXTURE)).toEqual({
      status: 'missing-password',
    });
    expect(checkHostedRotation('not a URL', FIXTURE)).toEqual({ status: 'invalid-url' });
    expect(checkHostedRotation('postgresql://app_authenticated:pw@db.example.supabase.co/db', undefined)).toEqual({
      status: 'missing-fixture',
    });
  });
});
