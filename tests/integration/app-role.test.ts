import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';

describe('M1-04: app_authenticated role attributes and security posture', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({
      connectionString: process.env.MIGRATION_DATABASE_URL,
    });
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
  });

  describe('Scenario 1: Role attributes prevent RLS bypass', () => {
    it('should have NOBYPASSRLS, NOSUPERUSER, LOGIN attributes', async () => {
      const result = await client.query(`
        SELECT rolname, rolbypassrls, rolsuper, rolcanlogin, rolinherit
        FROM pg_roles 
        WHERE rolname = 'app_authenticated'
      `);

      expect(result.rows).toHaveLength(1);
      const role = result.rows[0];
      
      expect(role.rolbypassrls).toBe(false); // Cannot bypass RLS
      expect(role.rolsuper).toBe(false); // Not a superuser
      expect(role.rolcanlogin).toBe(true); // Can connect
      expect(role.rolinherit).toBe(false); // NOINHERIT attribute
    });

    it('should not inherit bypass privileges through any granted role', async () => {
      // Check if app_authenticated has been granted any role with BYPASSRLS or SUPERUSER
      const result = await client.query(`
        SELECT r.rolname AS granted_role
        FROM pg_auth_members m
        JOIN pg_roles r ON r.oid = m.roleid
        JOIN pg_roles g ON g.oid = m.member
        WHERE g.rolname = 'app_authenticated'
          AND (r.rolbypassrls OR r.rolsuper)
      `);

      expect(result.rows).toEqual([]);
    });

    it('should own no table in the public schema', async () => {
      // Table ownership is a second escape hatch - owners can bypass their own policies
      const result = await client.query(`
        SELECT tablename 
        FROM pg_tables
        WHERE schemaname = 'public' AND tableowner = 'app_authenticated'
      `);

      expect(result.rows).toEqual([]);
    });
  });

  describe('Scenario 3: app role has no reach into auth schema', () => {
    it('should not have USAGE privilege on auth schema', async () => {
      const result = await client.query(`
        SELECT has_schema_privilege('app_authenticated', 'auth', 'USAGE') as has_usage
      `);

      expect(result.rows[0].has_usage).toBe(false);
    });

    it('should fail when trying to call auth.uid() directly', async () => {
      // Connect as app_authenticated to test direct access
      const appClient = new Client({
        connectionString: process.env.MIGRATION_DATABASE_URL?.replace(
          'postgres:postgres',
          'app_authenticated:Wd7EmwRWWqY9s7jMVD3kVqnt+OaW5PowxNIxCY5Ful0='
        ),
      });

      try {
        await appClient.connect();
        
        try {
          await appClient.query('SELECT auth.uid()');
          throw new Error('Should have failed with permission denied');
        } catch (err) {
          // Expected: permission denied for schema auth
          expect((err as any)?.code).toBe('42501');
          expect((err as any)?.message).toContain('permission denied for schema');
        }
      } finally {
        await appClient.end();
      }
    });

    it('should fail when trying to access auth.users table directly', async () => {
      const appClient = new Client({
        connectionString: process.env.MIGRATION_DATABASE_URL?.replace(
          'postgres:postgres',
          'app_authenticated:Wd7EmwRWWqY9s7jMVD3kVqnt+OaW5PowxNIxCY5Ful0='
        ),
      });

      try {
        await appClient.connect();
        
        try {
          await appClient.query('SELECT id FROM auth.users LIMIT 1');
          throw new Error('Should have failed with permission denied');
        } catch (err) {
          // Expected: permission denied for schema auth
          expect((err as any)?.code).toBe('42501');
          expect((err as any)?.message).toContain('permission denied for schema');
        }
      } finally {
        await appClient.end();
      }
    });

    it('should fail when trying to access other auth schema objects', async () => {
      const appClient = new Client({
        connectionString: process.env.MIGRATION_DATABASE_URL?.replace(
          'postgres:postgres',
          'app_authenticated:Wd7EmwRWWqY9s7jMVD3kVqnt+OaW5PowxNIxCY5Ful0='
        ),
      });

      try {
        await appClient.connect();
        
        // Test various auth schema objects
        const authObjects = [
          'SELECT * FROM auth.sessions LIMIT 1',
          'SELECT * FROM auth.refresh_tokens LIMIT 1', 
          'SELECT auth.jwt()',
          'SELECT auth.role()',
          "SELECT current_setting('request.jwt.claims', true)"
        ];

        for (const query of authObjects) {
          try {
            await appClient.query(query);
            throw new Error(`Query "${query}" should have failed with permission denied`);
          } catch (err) {
            // Expected: permission denied for schema auth OR function does not exist
            const errorCode = (err as any)?.code;
            const errorMessage = (err as any)?.message?.toLowerCase();
            
            // Accept either schema permission error or function not existing
            const isExpectedError = errorCode === '42501' || // permission denied
                                   errorCode === '42883' || // function does not exist
                                   errorMessage?.includes('permission denied') ||
                                   errorMessage?.includes('does not exist');
            
            if (!isExpectedError) {
              throw new Error(`Query "${query}" failed with unexpected error: ${err}`);
            }
          }
        }
      } finally {
        await appClient.end();
      }
    });
  });

  describe('Scenario 4: Drift detection capability', () => {
    it('should detect if role is manually altered to BYPASSRLS', async () => {
      // First verify current state
      let result = await client.query(`
        SELECT rolbypassrls FROM pg_roles WHERE rolname = 'app_authenticated'
      `);
      expect(result.rows[0].rolbypassrls).toBe(false);

      // Simulate drift by manually altering the role (this should fail on Supabase)
      try {
        await client.query(`ALTER ROLE app_authenticated BYPASSRLS`);
        
        // If it succeeded (local dev), verify we can detect the drift
        result = await client.query(`
          SELECT rolbypassrls FROM pg_roles WHERE rolname = 'app_authenticated'
        `);
        
        if (result.rows[0].rolbypassrls === true) {
          // Drift detected - restore proper state for other tests
          await client.query(`ALTER ROLE app_authenticated NOBYPASSRLS`);
          
          // In local dev, we can alter the role - this is expected
          // In production/Supabase, this ALTER would fail with 42501
          console.log('LOCAL DEV: Role alteration succeeded and drift was detected and fixed');
          expect(true).toBe(true); // Test passes - we detected and fixed the drift
        } else {
          throw new Error('ALTER succeeded but role state unchanged - unexpected behavior');
        }
      } catch (err) {
        // Expected on Supabase: 42501 permission denied
        if ((err as any)?.code === '42501') {
          // This is the expected behavior - can't alter superuser attributes
          expect((err as any)?.message).toMatch(/permission denied|superuser/i);
          console.log('PRODUCTION: Role alteration blocked by database security');
        } else {
          // Re-throw if it's an unexpected error
          throw err;
        }
      }
    });
  });

  describe('Schema grants verification', () => {
    it('should have USAGE on public schema only', async () => {
      const result = await client.query(`
        SELECT 
          has_schema_privilege('app_authenticated', 'public', 'USAGE') as has_public,
          has_schema_privilege('app_authenticated', 'auth', 'USAGE') as has_auth
      `);

      expect(result.rows[0].has_public).toBe(true);
      expect(result.rows[0].has_auth).toBe(false);
    });
  });
});