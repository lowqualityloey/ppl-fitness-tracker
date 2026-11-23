# Security Code Review Checklist

## M1-11: Database Security - JWT Claims & GUC Hazards

### ❌ BANNED PATTERNS - Never Allow in Production Code

1. **Direct `set_config` calls outside `lib/db/with-user.ts`**
   ```typescript
   // ❌ BANNED - Direct GUC manipulation
   await db.execute(sql`SELECT set_config('request.jwt.claims', '${claims}', true)`);
   await db.execute(sql`SELECT set_config('request.jwt.claim.sub', '${userId}', false)`);
   ```

2. **Session-scoped (`is_local = false`) JWT claims**
   ```typescript
   // ❌ BANNED - Creates cross-request leakage
   await db.execute(sql`SELECT set_config('request.jwt.claims', '${claims}', false)`);
   ```

3. **Custom withUser variants or bypasses**
   ```typescript
   // ❌ BANNED - Reinventing security-critical code
   function myCustomWithUser(db, claims, callback) { /* ... */ }
   function withUserLeaky(db, claims, callback) { /* ... */ }
   ```

### ✅ REQUIRED PATTERNS - Always Use These

1. **All database operations with user context MUST use `withUser()`**
   ```typescript
   // ✅ CORRECT - Uses hardened helper
   import { withUser } from '../lib/db/with-user.js';
   
   const rows = await withUser(db, jwtClaims, (tx) =>
     tx.select().from(schema.workoutSessions)
   );
   ```

2. **JWT claims MUST come from authenticated sources**
   ```typescript
   // ✅ CORRECT - From Supabase auth
   const { data: { user } } = await supabase.auth.getUser();
   const claims = { sub: user.id, role: user.role, email: user.email };
   ```

### 🔍 Review Checklist

When reviewing PRs, verify:

- [ ] **No direct `set_config` calls** outside `lib/db/with-user.ts`
- [ ] **All user-scoped queries** use `withUser()` helper  
- [ ] **No custom withUser variants** or security bypasses
- [ ] **No session-scoped GUCs** (`is_local = false`)
- [ ] **JWT claims from trusted sources** (Supabase auth, not user input)
- [ ] **Test coverage** for multi-user isolation scenarios
- [ ] **ESLint passes** with no `no-restricted-syntax` violations

### 🚨 Amendment A1.1: Legacy GUC Hazard

**The Hazard**: Supabase's `auth.uid()` checks `request.jwt.claim.sub` before `request.jwt.claims`. Session-scoped values persist across transactions and can override transaction-local claims.

**The Fix**: `withUser()` uses two-statement GUC ordering:
1. `SELECT set_config('request.jwt.claim.sub', '', true)` - Blank legacy GUC
2. `SELECT set_config('request.jwt.claims', '${claims}', true)` - Set new claims

This ordering ensures the legacy path is neutralized before setting claims.

### 📋 Manual Testing Steps

For security-critical changes:

1. **Isolation Test**: Different users on same connection should see only own data
2. **Stale Claims Test**: Session-scoped claims shouldn't leak between requests  
3. **Rollback Test**: Transaction failures should clean up claims properly
4. **Pooling Test**: Connection pooling shouldn't cause cross-contamination

### 🔧 Enforcement Tools

- **ESLint Rule**: `no-restricted-syntax` bans direct `set_config` calls
- **Integration Tests**: `tests/integration/with-user.test.ts` - regression tests for GUC hazard
  (moved out of `tests/unit/` when D2 closed; the unit layer is hermetic and
  `tests/unit/infra/hermetic-unit-layer.test.ts` enforces it), and
  `tests/integration/tenancy.test.ts` - multi-user isolation

### 🆘 Incident Response

If GUC hazard is suspected in production:

1. **Immediate**: Check audit logs for cross-user data access
2. **Short-term**: Deploy emergency fix forcing all queries through `withUser()`  
3. **Long-term**: Add monitoring for JWT claim inconsistencies
4. **Post-mortem**: Update this checklist with lessons learned