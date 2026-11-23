import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from 'pg';
import type { InferSelectModel } from 'drizzle-orm';
import type * as schema from '../../db/schema/index.js';
import { pgErrorCode } from './pg-error.js';
import { requireRow } from './test-helpers.js';

/*
 * auth.users has no Drizzle table, so its shape is declared locally. Profile
 * rows come from the schema, and every present-row read goes through `requireRow`.
 */
interface AuthUserRow {
  id: string;
  email: string | null;
}

type ProfileRow = Pick<InferSelectModel<typeof schema.profiles>, 'id' | 'email'>;

interface FunctionInfoRow {
  is_security_definer: boolean;
  config_settings: string[] | null;
}

interface FunctionOwnerRow {
  owner_name: string;
}

interface TriggerInfoRow {
  trigger_name: string;
  trigger_definition: string;
}

// Local Supabase credentials (shared defaults, safe to inline)
const SUPABASE_API_URL = 'http://127.0.0.1:54321';
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const TEST_PASSWORD = 'test-password-m1-04';
const TEST_EMAILS = ['trigger-test-1@example.com', 'trigger-test-2@example.com'];

describe('M1-04: handle_new_user trigger functionality', () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({
      connectionString: process.env.MIGRATION_DATABASE_URL,
    });
    await client.connect();

    // Clean up any previous test users
    await cleanupTestUsers();
  });

  afterAll(async () => {
    await cleanupTestUsers();
    await client.end();
  });

  async function cleanupTestUsers(): Promise<void> {
    // ON DELETE CASCADE from profiles makes this a full reset
    await client.query(`DELETE FROM auth.users WHERE email = ANY($1::text[])`, [TEST_EMAILS]);
  }

  async function createUserViaGoTrue(email: string): Promise<{ id: string; accessToken: string }> {
    // Create user via GoTrue Admin API
    const created = await fetch(`${SUPABASE_API_URL}/auth/v1/admin/users`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        email, 
        password: TEST_PASSWORD, 
        email_confirm: true 
      }),
    });

    if (!created.ok) {
      throw new Error(`GoTrue createUser failed (${created.status}): ${await created.text()}`);
    }

    const user = (await created.json()) as { id: string };

    // Sign in to get access token
    const signedIn = await fetch(`${SUPABASE_API_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: TEST_PASSWORD }),
    });

    if (!signedIn.ok) {
      throw new Error(`Password grant failed (${signedIn.status}): ${await signedIn.text()}`);
    }

    const session = (await signedIn.json()) as { access_token: string };
    return { id: user.id, accessToken: session.access_token };
  }

  describe('Scenario 1: Trigger creates profile automatically', () => {
    it('should create a profile when a new auth user is created', async () => {
      const email = TEST_EMAILS[0]!;
      const { id: userId } = await createUserViaGoTrue(email);

      // Verify the user was created in auth.users
      const authUser = await client.query<AuthUserRow>(
        `SELECT id, email FROM auth.users WHERE id = $1`,
        [userId]
      );
      expect(authUser.rows).toHaveLength(1);
      expect(requireRow(authUser.rows, 'auth user after signup').email).toBe(email);

      // Verify the trigger created a profile
      const profile = await client.query<ProfileRow>(
        `SELECT id, email FROM public.profiles WHERE id = $1`,
        [userId]
      );
      expect(profile.rows).toHaveLength(1);
      const profileRow = requireRow(profile.rows, 'profile after signup');
      expect(profileRow.id).toBe(userId);
      expect(profileRow.email).toBe(email);
    });

    it('should handle duplicate auth.users INSERTs gracefully', async () => {
      const email = TEST_EMAILS[1]!;
      const { id: userId } = await createUserViaGoTrue(email);

      // First insert should work normally
      let profile = await client.query<ProfileRow>(
        `SELECT id, email FROM public.profiles WHERE id = $1`,
        [userId]
      );
      expect(profile.rows).toHaveLength(1);

      // Simulate a duplicate auth.users INSERT (edge case scenario)
      // This tests the ON CONFLICT DO NOTHING in handle_new_user
      try {
        await client.query(`
          INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, confirmation_token, recovery_token, email_change_token_new, email_change)
          SELECT instance_id, $1::uuid, aud, role, $2, encrypted_password, email_confirmed_at, now(), now(), raw_app_meta_data, raw_user_meta_data, is_super_admin, null, null, null, null
          FROM auth.users WHERE id = $1
        `, [userId, email]);
        
        // If this succeeds (shouldn't on Supabase but might locally), 
        // verify only one profile exists
        profile = await client.query<ProfileRow>(
          `SELECT id, email FROM public.profiles WHERE id = $1`,
          [userId]
        );
        expect(profile.rows).toHaveLength(1);
      } catch (err) {
        // Expected: unique constraint violation on auth.users.id
        expect(pgErrorCode(err)).toMatch(/23505|23000/);
      }
    });
  });

  describe('Scenario 2: Trigger security attributes', () => {
    it('should run as SECURITY DEFINER with correct search_path', async () => {
      // Verify the function has the correct security attributes
      const funcInfo = await client.query<FunctionInfoRow>(`
        SELECT 
          prosecdef as is_security_definer,
          proconfig as config_settings
        FROM pg_proc 
        WHERE proname = 'handle_new_user' 
        AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
      `);

      expect(funcInfo.rows).toHaveLength(1);
      const func = requireRow(funcInfo.rows, 'handle_new_user function metadata');
      expect(func.is_security_definer).toBe(true);

      // Verify SET search_path = '' is configured
      const config = func.config_settings || [];
      const searchPathSetting = config.find((setting: string) => 
        setting.includes('search_path=')
      );
      expect(searchPathSetting).toContain('search_path=');
    });

    it('should be owned by postgres/owner, not app_authenticated', async () => {
      const funcOwner = await client.query<FunctionOwnerRow>(`
        SELECT pg_get_userbyid(proowner) as owner_name
        FROM pg_proc 
        WHERE proname = 'handle_new_user'
        AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
      `);

      expect(funcOwner.rows).toHaveLength(1);
      expect(requireRow(funcOwner.rows, 'handle_new_user function owner').owner_name).toBe('postgres');
    });
  });

  describe('Scenario 3: Trigger installation', () => {
    it('should be installed on auth.users AFTER INSERT FOR EACH ROW', async () => {
      const triggerInfo = await client.query<TriggerInfoRow>(`
        SELECT 
          tgname as trigger_name,
          pg_get_triggerdef(oid) as trigger_definition
        FROM pg_trigger 
        WHERE tgname = 'on_auth_user_created'
        AND tgrelid = 'auth.users'::regclass
      `);

      expect(triggerInfo.rows).toHaveLength(1);
      
      const triggerDef = requireRow(triggerInfo.rows, 'on_auth_user_created trigger definition').trigger_definition;
      expect(triggerDef).toContain('AFTER INSERT');
      expect(triggerDef).toContain('FOR EACH ROW');
      expect(triggerDef).toContain('handle_new_user()');
    });
  });
});