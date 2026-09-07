### Metadata
- **Related Spec**: `docs/specs/2026-09-08-spec-fullstack-migration.md` §5 (Security Audit, FMEA)
- **Architectural Decision (ADR)**: none directly — carried as an open risk in `docs/STATE.md` §5
- **Milestone**: M1: Contracts & Seams
- **Priority**: `#priority/p0` (Blocker — spec §5 and `STATE.md` both call this "a launch blocker, not polish")
- **Labels**: `area:auth`
- **Depends on**: M1-13

---

## User Story & Context

**As a** user trying to sign in
**I want** magic-link emails to actually arrive, reliably, at any volume the app sees
**So that** the sign-in flow — the *only* way into a magic-link-only app — doesn't silently cap out at Supabase's default 2 emails/hour from a shared generic sender.

Spec §5: "Email deliverability is a launch blocker, not a detail." The FMEA table rates this failure scenario **High probability / High severity** — higher than almost anything else in the matrix, because it blocks the entire front door, not a feature.

---

## Technical Scope & Invariants

### Files & Endpoints Touched
- Supabase project Auth → SMTP settings (Resend / Postmark / SES — pick one, verified domain)
- New: a scheduled job or external monitor (e.g. a cron-triggered script, or a third-party uptime service configured to hit a dedicated endpoint) that performs a real magic-link round trip hourly
- DNS: SPF, DKIM records for the sending domain

### Non-Negotiable Invariants
- [ ] **Never ship on Supabase's default SMTP sender** — this is stated as an absolute in spec §5, not a recommendation
- [ ] **Verified sending domain with SPF and DKIM** configured before any real (non-test) user account can be created
- [ ] **Hourly synthetic monitor** completes an actual round trip (request OTP → capture delivery → confirm receipt), alerting on delivery failure or bounce — not just "provider API returned 200," since that doesn't prove the email arrived
- [ ] Rate limits reviewed and explicitly tuned (not left at defaults) under the new provider, per spec §5's "Auth rate limits" callout

### Out of Scope
- The sign-in flow and `/auth/confirm` implementation itself (M1-13) — this task swaps the transport underneath an already-working flow
- Choosing between Resend/Postmark/SES on technical merit beyond "verified domain, SPF/DKIM supported" — any of the three named in the spec satisfies this task; pick one and move on rather than spiking the choice
- Production alerting infrastructure beyond what's needed for the synthetic monitor itself

---

## Implementation Tasks
- [ ] 1. Choose a provider (Resend, Postmark, or SES per spec §5) and create an account/project
- [ ] 2. Verify a sending domain; configure SPF and DKIM DNS records
- [ ] 3. Configure Supabase Auth → SMTP settings to use the new provider
- [ ] 4. Review and explicitly set Supabase's Auth rate limits (Authentication → Rate Limits) rather than leaving defaults
- [ ] 5. Build the hourly synthetic monitor: trigger a real `signInWithOtp`, capture the resulting email via the provider's API or a dedicated test inbox, extract and follow the link, assert success
- [ ] 6. Wire the monitor's failure case to an alert (even a simple one — a failed CI cron job notification is acceptable for M1; sophisticated alerting is not required)

---

## Acceptance Criteria

### Scenario 1: Happy path — real email delivery through the new provider
- **Given** the new SMTP provider is configured
- **When** a magic-link sign-in is requested
- **Then** the email arrives from the verified domain (not the Supabase shared sender), passing SPF/DKIM checks

### Scenario 2: Volume — the 2/hour cap is gone
- **Given** the new provider is active
- **When** more than 2 sign-in requests are made within one hour (from different test accounts, respecting the app's own rate limit from M1-13)
- **Then** all corresponding emails are delivered — this is the exact scenario the default sender fails

### Scenario 3: Synthetic monitor catches a real outage
- **Given** the monitor is running hourly
- **When** the SMTP provider is deliberately misconfigured (test only, then reverted) or a test run is forced to fail
- **Then** the monitor's alert fires — proving detection actually works, not just that the monitor script exists and returns 0

### Scenario 4: DNS is verifiable
- **Given** the domain configuration
- **When** SPF and DKIM records are queried via `dig`
- **Then** both resolve correctly and match the provider's required values

---

## Automated Verification Command
```bash
# Manual/scheduled — no single local command proves email deliverability.
# Verification is the synthetic monitor's own run log plus a manual dig check:
dig TXT <sending-domain> +short   # SPF
dig TXT <dkim-selector>._domainkey.<sending-domain> +short  # DKIM
```
