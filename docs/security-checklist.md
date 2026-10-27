# Security Verification Checklist (`docs/security-checklist.md`)

This checklist tracks all mandatory security invariants from Sections 3, 5, and 13. All 15 items have been verified via automated tests (`tests/unit/`, `tests/e2e/`, `supabase/tests/`, and `scripts/verify-rls.ts`) and ticked off in Phase 11.

- [x] **1. RLS Enabled on Every Table**: Every table in `public` (all 25 tables) has `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` with deny-by-default policies (enforced by CI check `npm run verify:rls` and `supabase/migrations/00001_schema_and_rls.sql`).
- [x] **2. Customer Isolation**: Customer A cannot read, update, or subscribe to Customer B's profile, conversation, messages, offers, tickets, or notifications (`tests/unit/security-permissions-phases2-10.test.ts` and `supabase/tests/rls_isolation.test.sql`).
- [x] **3. Structural Staff Anonymity**: No customer query, API response, or Realtime event ever exposes a staff member's `id`, `full_name`, `email`, or `avatar_path`. Staff messages always display as `"John Rambo Support"`, while real employee attribution lives exclusively in `public.message_attribution` and `public.ticket_message_attribution` (`tests/unit/security-permissions-phases2-10.test.ts` & `tests/e2e/full-suite.spec.ts`).
- [x] **4. Append-Only Ledgers**: `activity_events`, `audit_log`, `offer_events`, and `ticket_events` reject `UPDATE` and `DELETE` via database trigger `public.prevent_mutation_on_append_only()` for all roles, including `boss` (`supabase/migrations/00001_schema_and_rls.sql`, `supabase/tests/rls_isolation.test.sql`).
- [x] **5. Privilege & Flag Protection**: Customers and employees cannot change their own `role`, `status`, `invited_by`, `staff_profiles` flags, or performance metrics (`public.protect_profile_sensitive_columns()` trigger and `tests/unit/security-permissions-phases2-10.test.ts`).
- [x] **6. Invitation Rules Enforced**:
  - Boss can invite `customer` and `employee`.
  - Employee can invite `customer` only (attempts to invite `employee` or `boss` are rejected).
  - Customer cannot invite anyone.
  - Every invite records `invited_by`, `invitations`, `audit_log`, and `activity_events` (`tests/unit/security-permissions-phases2-10.test.ts`).
- [x] **7. Passwordless Invite-Only Auth**: Magic links use `shouldCreateUser: false`; uninvited emails cannot create accounts; login endpoint returns generic messages to prevent email enumeration (`actions/index.ts`, `lib/data/mock/index.ts`, `lib/data/supabase/index.ts`, `tests/unit/security-permissions-phases2-10.test.ts`).
- [x] **8. Singleton Boss Guarantee**: Partial unique index `profiles_single_boss_idx` guarantees at most one `boss` row in `public.profiles`, verified by `npm run seed:boss` (`scripts/seed-boss.ts` and `supabase/migrations/00001_schema_and_rls.sql`).
- [x] **9. Service-Role Key Isolation**: `SUPABASE_SERVICE_ROLE_KEY` is restricted to `lib/supabase/admin.ts` (`import 'server-only'`) and `scripts/seed-boss.ts`, and never appears in `NEXT_PUBLIC_` or client bundles (`npm run lint` via `scripts/lint-check.mjs`).
- [x] **10. Triple Route Guards**: Protected routes are verified in `middleware.ts`, role server layouts (`app/(customer)/layout.tsx`, `app/(employee)/layout.tsx`, `app/(boss)/layout.tsx`), and PostgreSQL RLS/RPCs (`tests/e2e/full-suite.spec.ts`).
- [x] **11. Immediate Suspension Enforcement**: Suspended users (`status = 'suspended'`) have sessions revoked and are rejected by `middleware.ts`, layouts, and `public.is_active()` RLS helper (`tests/unit/security-permissions-phases2-10.test.ts`).
- [x] **12. Strict CSP & Security Headers**: Configured in `next.config.mjs`; zero uses of `dangerouslySetInnerHTML` across the codebase (`npm run lint` via `scripts/lint-check.mjs`).
- [x] **13. Rate Limiting Verified**: Login emails (`5/15m`), offer submissions (`10/1m`), ticket creation (`5/10m`), and message sending (`30/1m`) are rate-limited (`lib/rate-limit.ts` and `tests/unit/security-permissions-phases2-10.test.ts`).
- [x] **14. Private Storage & Upload Validation**: Media buckets (`product-media`, `story-media`, `chat-attachments`, `avatars`) are private, served via short-lived signed URLs, and validate MIME type and file size before upload (`supabase/migrations/00002_storage_buckets.sql`, `lib/storage.ts`, and `tests/unit/security-permissions-phases2-10.test.ts`).
- [x] **15. PWA Service Worker Cache Safety**: Service worker (`app/sw.ts` and `public/sw.js`) never caches authenticated API responses, RSC payloads, or Supabase queries (`NetworkOnly`), verified by `tests/e2e/full-suite.spec.ts`.
