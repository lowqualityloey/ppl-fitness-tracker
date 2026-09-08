import { describe, expect, it } from 'vitest';
import {
  assertUserContext,
  createVerifiedUserContext,
} from '../../../lib/db/auth-context.js';

describe('verified database auth context', () => {
  it('derives RLS claims from a verified Supabase user', () => {
    expect(createVerifiedUserContext({
      id: '11111111-1111-4111-8111-111111111111',
      email: 'user@example.com',
    })).toEqual({
      userId: '11111111-1111-4111-8111-111111111111',
      claims: {
        sub: '11111111-1111-4111-8111-111111111111',
        role: 'authenticated',
        aud: 'authenticated',
        email: 'user@example.com',
      },
    });
  });

  it('rejects a repository context whose claims identify another user', () => {
    expect(() => assertUserContext(
      '11111111-1111-4111-8111-111111111111',
      { sub: '22222222-2222-4222-8222-222222222222', role: 'authenticated' },
    )).toThrow('does not match');
  });
});
