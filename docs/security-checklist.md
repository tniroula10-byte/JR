# Security Verification Checklist (`docs/security-checklist.md`)

This checklist tracks all mandatory security invariants from Sections 3, 5, and 13. Items are verified via automated tests (`tests/unit/`, `tests/e2e/`, `supabase/tests/`, and `scripts/verify-rls.ts`) and ticked off in Phase 11.

- [ ] **1. RLS Enabled on Every Table**: Every table in `public` has `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` with deny-by-default policies (enforced by CI check `npm run verify:rls`).
- [ ] **2. Customer Isolation**: Customer A cannot read, update, or subscribe to Customer B's profile, conversation, messages, offers, tickets, or notifications.
- [ ] **3. Structural Staff Anonymity**: No customer query, API response, or Realtime event ever exposes a staff member's `id`, `full_name`, `email`, or `avatar_path`. Staff messages always display as `"John Rambo Support"`.
- [ ] **4. Append-Only Ledgers**: `activity_events`, `audit_log`, `offer_events`, and `ticket_events` reject `UPDATE` and `DELETE` via database trigger for all roles (including `boss`).
- [ ] **5. Privilege & Flag Protection**: Customers and employees cannot change their own `role`, `status`, `invited_by`, `staff_profiles` flags, or performance metrics.
- [ ] **6. Invitation Rules Enforced**:
  - Boss can invite `customer` and `employee`.
  - Employee can invite `customer` only (attempts to invite `employee` or `boss` are rejected).
  - Customer cannot invite anyone.
  - Every invite records `invited_by`, `invitations`, `audit_log`, and `activity_events`.
- [ ] **7. Passwordless Invite-Only Auth**: Magic links use `shouldCreateUser: false`; uninvited emails cannot create accounts; login endpoint returns generic messages to prevent email enumeration.
- [ ] **8. Singleton Boss Guarantee**: Partial unique index `profiles_single_boss_idx` guarantees at most one `boss` row in `public.profiles`.
- [ ] **9. Service-Role Key Isolation**: `SUPABASE_SERVICE_ROLE_KEY` is restricted to `lib/supabase/admin.ts` (`import 'server-only'`) and `scripts/seed-boss.ts`, and never appears in `NEXT_PUBLIC_` or client bundles.
- [ ] **10. Triple Route Guards**: Protected routes are verified in `middleware.ts`, role server layouts, and PostgreSQL RLS/RPCs.
- [ ] **11. Immediate Suspension Enforcement**: Suspended users (`status = 'suspended'`) have sessions revoked and are rejected by `middleware.ts`, layouts, and `public.is_active()` RLS helper.
- [ ] **12. Strict CSP & Security Headers**: Configured in `next.config.mjs` / `middleware.ts`; zero uses of `dangerouslySetInnerHTML` across the codebase.
- [ ] **13. Rate Limiting Verified**: Login emails, offer submissions, ticket creation, and message sending are rate-limited.
- [ ] **14. Private Storage & Upload Validation**: Media buckets are private, served via short-lived signed URLs, and validate MIME type and file size before upload.
- [ ] **15. PWA Service Worker Cache Safety**: Service worker never caches authenticated API responses, RSC payloads, or Supabase queries (`NetworkOnly`).
